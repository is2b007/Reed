import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GAME_EXPORT_FORMATS, ReedProject, exportGameData } from "../src/index.js";

const projects: ReedProject[] = [];

afterEach(() => {
  while (projects.length) projects.pop()?.close();
});

async function fixture(): Promise<{ root: string; project: ReedProject; lineId: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "reed-game-export-"));
  const project = await ReedProject.create(root, {
    name: "Λιμάνι",
    slug: "harbour",
    languages: ["en", "el", "ja", "pt-BR"],
    defaultLanguage: "en",
  });
  projects.push(project);
  const character = (await project.upsertCharacter({ name: "Eleni", displayNames: {}, description: "", actorNotes: "", voiceNotes: "" })).value;
  const scene = (await project.createScene({ name: "Old Harbour", slug: "old-harbour" })).value;
  const conversation = (await project.createConversation({ sceneId: scene.id, title: "Arrival" })).value;
  const line = (await project.addNode({
    conversationId: conversation.id,
    kind: "choice",
    speakerCharacterId: character.id,
    text: "Enter the gate?",
    menuText: "Enter",
    contextComment: "A guarded invitation",
    tags: ["arrival"],
    isTerminal: true,
  })).value;
  await project.setNodeText({ lineId: line.lineId, language: "el", text: "Να περάσω την πύλη;", menuText: "Πέρασε" });
  await project.setNodeText({ lineId: line.lineId, language: "ja", text: "門に入りますか？", menuText: "入る" });
  await project.setNodeText({ lineId: line.lineId, language: "pt-BR", text: "Entrar pelo portão?", menuText: "Entrar" });
  return { root, project, lineId: line.lineId };
}

describe("game localization exports", () => {
  it("writes every supported format with deterministic permanent keys", async () => {
    const { project, lineId } = await fixture();
    const outputs = [];
    for (const format of GAME_EXPORT_FORMATS) outputs.push(await exportGameData(project, { format }));

    expect(outputs.every((output) => output.entryCount === 1 && output.filePaths.length > 0)).toBe(true);
    const unity = outputs.find((output) => output.format === "unity-localization");
    const unityCsv = await readFile(unity?.filePaths[0] ?? "", "utf8");
    expect(unityCsv).toContain('"Key","Id","Shared Comments"');
    expect(unityCsv).toContain(`"${lineId}.menu"`);
    expect(unityCsv).toContain("Να περάσω την πύλη;");

    const godot = outputs.find((output) => output.format === "godot");
    const godotCsv = await readFile(godot?.filePaths[0] ?? "", "utf8");
    expect(godotCsv).toContain('"keys","en","el","ja","pt_BR"');

    const unreal = outputs.find((output) => output.format === "unreal-string-table");
    expect(unreal?.filePaths).toHaveLength(4);
    expect(await readFile(unreal?.filePaths.find((file) => file.includes("pt-BR")) ?? "", "utf8")).toContain("Entrar pelo portão?");

    const yarn = outputs.find((output) => output.format === "yarn-spinner");
    expect(await readFile(yarn?.filePaths.find((file) => file.includes(".ja.")) ?? "", "utf8")).toContain(`"line:${lineId}"`);

    const gettext = outputs.find((output) => output.format === "gettext");
    expect(await readFile(gettext?.filePaths.find((file) => file.includes(".el.")) ?? "", "utf8")).toContain('msgstr "Να περάσω την πύλη;"');

    const xliff = outputs.find((output) => output.format === "xliff-2.0");
    expect(await readFile(xliff?.filePaths.find((file) => file.includes(".ja.")) ?? "", "utf8")).toContain("<target>門に入りますか？</target>");
  });

  it("supports target-only file selection while retaining the source text", async () => {
    const { project } = await fixture();
    const output = await exportGameData(project, { format: "xliff-2.0", languages: ["el"] });
    expect(output.languages).toEqual(["el"]);
    expect(output.filePaths).toHaveLength(1);
    const contents = await readFile(output.filePaths[0] ?? "", "utf8");
    expect(contents).toContain('srcLang="en" trgLang="el"');
    expect(contents).toContain("<source>Enter the gate?</source>");
  });
});
