import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  ConcurrencyError,
  GuardrailError,
  ReedProject,
  exportProjectJson,
  exportPixelCrushers,
  exportVoicePackage,
  serializeProject,
  validateProject,
} from "../src/index.js";

const openProjects: ReedProject[] = [];

async function createProject(languages = ["en", "el"]): Promise<{ root: string; project: ReedProject }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "reed-test-"));
  const project = await ReedProject.create(root, { name: "Test Story", slug: "test-story", languages, defaultLanguage: "en" });
  openProjects.push(project);
  return { root, project };
}

async function createConversation(project: ReedProject) {
  const scene = (await project.createScene({ name: "Arrival", slug: "arrival" })).value;
  return (await project.createConversation({ sceneId: scene.id, title: "First meeting" })).value;
}

afterEach(() => {
  while (openProjects.length > 0) openProjects.pop()?.close();
});

describe("ReedProject", () => {
  it("allocates stable Line IDs and persistent numeric IDs", async () => {
    const { root, project } = await createProject();
    const level = (await project.createLevel({ name: "Chapter One" })).value;
    const scene = (await project.createScene({ name: "Old Harbour", slug: "old-harbour", levelId: level.id })).value;
    const first = (await project.createConversation({ sceneId: scene.id, title: "Dockside" })).value;
    const second = (await project.createConversation({ sceneId: scene.id, title: "Warehouse" })).value;
    const line = (await project.addNode({ conversationId: first.id, text: "You made it." })).value;

    expect(first.numericId).toBe(1);
    expect(second.numericId).toBe(2);
    expect(first.nodes[0]?.entryNumericId).toBe(0);
    expect(line.entryNumericId).toBe(1);
    expect(line.lineId).toMatch(/^old-harbour-[a-f0-9]{10}$/);

    const lineId = line.lineId;
    project.close();
    const reopened = await ReedProject.open(root);
    openProjects.push(reopened);
    expect(reopened.getConversation(first.id).nodes.find((node) => node.id === line.id)?.lineId).toBe(lineId);
  });

  it("returns the mutation diff for stale writes across connections", async () => {
    const { root, project } = await createProject();
    const conversation = await createConversation(project);
    const second = await ReedProject.open(root);
    openProjects.push(second);

    await project.addNode({ conversationId: conversation.id, text: "First", expectedVersion: conversation.version });
    await expect(second.addNode({ conversationId: conversation.id, text: "Stale", expectedVersion: conversation.version }))
      .rejects.toMatchObject({
        code: "STALE_VERSION",
        currentVersion: 2,
        changesSinceExpected: [expect.objectContaining({ operation: "node.create", baseVersion: 1, newVersion: 2 })],
      } satisfies Partial<ConcurrencyError>);
  });

  it("enforces human finalization and reopens final text as rework", async () => {
    const { project } = await createProject(["en"]);
    const conversation = await createConversation(project);
    const line = (await project.addNode({ conversationId: conversation.id, text: "Draft" })).value;

    await expect(project.setLineStatus({ lineId: line.lineId, status: "edited", source: "agent" })).rejects.toBeInstanceOf(GuardrailError);
    await expect(project.setLineStatus({ lineId: line.lineId, status: "final" })).rejects.toBeInstanceOf(GuardrailError);
    await project.setLineStatus({ lineId: line.lineId, status: "final", force: true });
    await expect(project.setNodeText({ lineId: line.lineId, language: "en", text: "Changed" })).rejects.toBeInstanceOf(GuardrailError);
    await expect(project.setNodeText({ lineId: line.lineId, language: "en", text: "Agent", source: "agent", force: true })).rejects.toBeInstanceOf(GuardrailError);
    const changed = await project.setNodeText({ lineId: line.lineId, language: "en", text: "Changed", force: true });
    expect(changed.value.lineStatus).toBe("rework");
  });

  it("marks recorded voice for rework when its dialogue changes", async () => {
    const { project } = await createProject(["en"]);
    const conversation = await createConversation(project);
    const line = (await project.addNode({ conversationId: conversation.id, text: "Original" })).value;
    await project.setVoiceStatus({ lineId: line.lineId, status: "recorded" });
    const changed = await project.setNodeText({ lineId: line.lineId, language: "en", text: "Revision" });
    expect(changed.value.voiceStatus).toBe("rework");
  });

  it("links from start, validates missing translations, and searches locally", async () => {
    const { project } = await createProject();
    const conversation = await createConversation(project);
    const start = conversation.nodes[0];
    if (!start) throw new Error("missing start node");
    const line = (await project.addNode({ conversationId: conversation.id, text: "A searchable lantern", isTerminal: true })).value;
    await project.linkNodes({ originNodeId: start.id, destinationNodeId: line.id });

    const report = validateProject(project);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "MISSING_TRANSLATION", lineId: line.lineId, language: "el" }));
    expect(report.issues.some((issue) => issue.code === "UNREACHABLE_NODE")).toBe(false);
    expect(project.find("lantern")).toContainEqual(expect.objectContaining({ lineId: line.lineId, language: "en" }));
  });

  it("exports deterministic bytes and creates valid SQLite backups", async () => {
    const { root, project } = await createProject(["en"]);
    const conversation = await createConversation(project);
    await project.addNode({ conversationId: conversation.id, text: "Keep this safe", isTerminal: true });

    expect(serializeProject(project)).toBe(serializeProject(project));
    const target = await exportProjectJson(project);
    expect(await readFile(target, "utf8")).toBe(serializeProject(project));

    const backup = await project.createBackup("named", "Milestone one");
    const copy = new Database(backup.filePath, { readonly: true });
    try {
      expect(copy.pragma("integrity_check", { simple: true })).toBe("ok");
      expect((copy.prepare("SELECT COUNT(*) AS count FROM dialogue_nodes").get() as { count: number }).count).toBeGreaterThan(0);
    } finally {
      copy.close();
    }
    expect(target).toBe(path.join(root, "exports", "reed-project.json"));
  });

  it("exports Pixel Crushers IDs, localized fields, and Unicode voice handoff files", async () => {
    const { project } = await createProject();
    const character = (await project.upsertCharacter({
      name: "Ελένη", displayNames: { en: "Eleni", el: "Ελένη" }, isPlayer: false,
      portraitPath: null, description: "Οδηγός", actorNotes: "Quiet confidence", voiceNotes: "Natural room tone",
    })).value;
    await project.declareVariable({ name: "MetEleni", type: "boolean", initialValue: false });
    const conversation = await createConversation(project);
    const start = conversation.nodes[0];
    if (!start) throw new Error("missing start");
    const line = (await project.addNode({ conversationId: conversation.id, speakerCharacterId: character.id, text: "Welcome to the harbour.", isTerminal: true })).value;
    await project.setNodeText({ lineId: line.lineId, language: "el", text: "Καλώς ήρθες στο λιμάνι." });
    await project.updateNode({ lineId: line.lineId, contextComment: "First meeting", voiceComment: "Warm, guarded", tags: ["arrival"], force: false });
    await project.linkNodes({ originNodeId: start.id, destinationNodeId: line.id, priority: 0, force: false });

    const exported = await exportPixelCrushers(project);
    const database = JSON.parse(await readFile(exported.outputs[0]?.filePath ?? "", "utf8")) as {
      description: string; actors: Array<{ id: number }>; conversations: Array<{ id: number; dialogueEntries: Array<{ id: number; fields: Array<{ title: string; value: string }>; outgoingLinks: unknown[] }> }>;
    };
    expect(database.description).toContain("GENERATED — DO NOT HAND-EDIT");
    expect(database.actors[0]?.id).toBe(character.numericId);
    expect(database.conversations[0]?.id).toBe(conversation.numericId);
    expect(database.conversations[0]?.dialogueEntries.find((entry) => entry.id === line.entryNumericId)?.fields)
      .toContainEqual(expect.objectContaining({ title: "el", value: "Καλώς ήρθες στο λιμάνι." }));

    const voice = await exportVoicePackage(project, { language: "el" });
    expect((await readFile(voice.pdfPath)).subarray(0, 4).toString()).toBe("%PDF");
    expect((await readFile(voice.xlsxPath)).subarray(0, 2).toString()).toBe("PK");
    expect(await readFile(voice.csvPath, "utf8")).toContain("Καλώς ήρθες στο λιμάνι.");
  });

  it("imports auto-laid-out agent graphs and records review baselines", async () => {
    const { project } = await createProject(["en"]);
    const scene = (await project.createScene({ name: "Gate", slug: "gate" })).value;
    const graph = await project.importConversation({
      sceneId: scene.id, title: "At the gate", source: "agent",
      nodes: [
        { key: "ask", kind: "choice", texts: { en: "Ask to enter" }, menuTexts: {}, sequence: "", conditions: "", userScript: "", tags: [], isTerminal: false },
        { key: "reply", kind: "line", texts: { en: "Not tonight." }, menuTexts: {}, sequence: "", conditions: "", userScript: "", tags: [], isTerminal: true },
      ],
      links: [{ originKey: "ask", destinationKey: "reply", priority: 0 }],
    });
    expect(graph.nodes.filter((node) => node.kind !== "start").every((node) => node.lineStatus === "draft")).toBe(true);
    expect(graph.nodes.find((node) => node.kind === "line")?.x).toBeGreaterThan(0);
    expect(project.getReviewDiff().length).toBeGreaterThan(0);
    const review = await project.approveReview("Gate approved");
    expect(review.mutationSequence).toBeGreaterThan(0);
    expect(project.getReviewDiff()).toEqual([]);
  });

  it("rejects overlapping Pixel Crushers Base ID ranges", async () => {
    const { project } = await createProject();
    await expect(project.createPartition({ name: "Collision", scopeType: "project", scopeId: null, baseId: 50, rangeSize: 100, exportOrder: 1 }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    const partition = await project.createPartition({ name: "Chapter two", scopeType: "project", scopeId: null, baseId: 1_000_000, rangeSize: 100_000, exportOrder: 1 });
    expect(partition.value.baseId).toBe(1_000_000);
  });
});
