import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReedProject } from "../src/index.js";

const openProjects: ReedProject[] = [];

afterEach(() => {
  while (openProjects.length > 0) openProjects.pop()?.close();
});

describe("dialogue node allocation", () => {
  // QA regression: ISSUE-002, reproduced through simultaneous add-node calls on 2026-07-15.
  it("allocates distinct entry IDs and versions to concurrent nodes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-node-concurrency-"));
    const first = await ReedProject.create(root, {
      name: "Concurrent Story", slug: "concurrent-story", languages: ["en"], defaultLanguage: "en",
    });
    const scene = (await first.createScene({ name: "Harbour", slug: "harbour" })).value;
    const conversation = (await first.createConversation({ sceneId: scene.id, title: "Arrival" })).value;
    const second = await ReedProject.open(root);
    openProjects.push(first, second);

    const created = await Promise.all([
      first.addNode({ conversationId: conversation.id, text: "First writer" }),
      second.addNode({ conversationId: conversation.id, text: "Second writer" }),
    ]);

    expect(created.map((result) => result.value.entryNumericId).sort((a, b) => a - b)).toEqual([1, 2]);
    expect(first.getConversation(conversation.id).version).toBe(3);
    expect(first.getChanges().filter((change) => change.aggregateType === "conversation").map((change) => [change.baseVersion, change.newVersion]))
      .toEqual([[1, 2], [2, 3]]);
  });
});
