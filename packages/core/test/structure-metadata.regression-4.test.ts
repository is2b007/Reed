import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ReedProject } from "../src/index.js";

// Regression: .gstack/qa-reports/qa-report-reed-electron-2026-07-17.md, ISSUE-004.
describe("story structure metadata", () => {
  it("updates scene and conversation metadata through versioned mutations", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-structure-metadata-"));
    const project = await ReedProject.create(root, { name: "Test Story", slug: "test-story", languages: ["en", "el"], defaultLanguage: "en" });
    try {
      const createdScene = await project.createScene({ name: "Harbour", slug: "harbour" });
      const prefix = createdScene.value.lineIdPrefix;
      const updatedScene = await project.updateScene({ id: createdScene.value.id, name: "Old Harbour", beatRef: "Vault/Act 1/Arrival", sortOrder: 4, expectedVersion: createdScene.version });

      expect(updatedScene.value).toMatchObject({ name: "Old Harbour", beatRef: "Vault/Act 1/Arrival", sortOrder: 4, lineIdPrefix: prefix });

      const createdConversation = await project.createConversation({ sceneId: createdScene.value.id, title: "Arrival", expectedVersion: updatedScene.version });
      const updatedConversation = await project.updateConversation({ id: createdConversation.value.id, title: "First Arrival", description: "Eleni meets the traveller.", expectedVersion: createdConversation.value.version });

      expect(updatedConversation.value).toMatchObject({ title: "First Arrival", description: "Eleni meets the traveller.", version: 2 });
      expect(project.getChanges().map((change) => change.operation)).toEqual(expect.arrayContaining(["scene.update", "conversation.update"]));
    } finally {
      project.close();
    }
  });
});
