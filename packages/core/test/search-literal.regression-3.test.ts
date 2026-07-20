import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReedProject } from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("literal local search", () => {
  it("treats punctuation as story text and also finds Line IDs and tags", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-search-test-"));
    roots.push(root);
    const project = await ReedProject.create(root, { name: "Search", slug: "search", languages: ["en"], defaultLanguage: "en" });
    try {
      const scene = (await project.createScene({ name: "Gate", slug: "gate" })).value;
      const conversation = (await project.createConversation({ sceneId: scene.id, title: "At the gate" })).value;
      const line = (await project.addNode({ conversationId: conversation.id, text: "An autosave-check near the quay" })).value;
      await project.updateNode({ lineId: line.lineId, tags: ["chapter-one"] });

      expect(project.find("autosave-check")).toContainEqual(expect.objectContaining({ lineId: line.lineId }));
      expect(project.findLines({ query: line.lineId })).toContainEqual(expect.objectContaining({ lineId: line.lineId }));
      expect(project.findLines({ query: "chapter-one" })).toContainEqual(expect.objectContaining({ lineId: line.lineId }));
      expect(() => project.find("---")).not.toThrow();
    } finally {
      project.close();
    }
  });
});
