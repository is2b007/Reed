import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Regression: .gstack/qa-reports/qa-report-reed-electron-2026-07-17.md, ISSUE-004.
describe("story structure metadata authoring", () => {
  it("exposes scene and conversation metadata editors in the Beat map", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");

    expect(source).toContain("function SceneEditor");
    expect(source).toContain("function ConversationEditor");
    expect(source).toContain('mutate("updateScene"');
    expect(source).toContain('mutate("updateConversation"');
  });
});
