import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReedProject } from "../src/index.js";

const openProjects: ReedProject[] = [];

afterEach(() => {
  while (openProjects.length > 0) openProjects.pop()?.close();
});

describe("project mutation serialization", () => {
  // QA regression: ISSUE-001, reproduced through two simultaneous CLI writers on 2026-07-15.
  it("preserves a unique project version for every concurrent mutation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-project-concurrency-"));
    const first = await ReedProject.create(root, {
      name: "Concurrent Story", slug: "concurrent-story", languages: ["en"], defaultLanguage: "en",
    });
    const second = await ReedProject.open(root);
    openProjects.push(first, second);

    await Promise.all([
      first.upsertCharacter({
        name: "Mara", displayNames: { en: "Mara" }, isPlayer: false, portraitPath: null,
        description: "", actorNotes: "", voiceNotes: "",
      }),
      second.declareVariable({ name: "MetMara", type: "boolean", initialValue: false }),
    ]);

    expect(first.getProject().version).toBe(3);
    expect(first.getChanges().filter((change) => change.aggregateType === "project").map((change) => [change.baseVersion, change.newVersion]))
      .toEqual([[1, 2], [2, 3]]);
    expect(first.listCharacters()).toHaveLength(1);
    expect(first.listVariables()).toHaveLength(1);
  });
});
