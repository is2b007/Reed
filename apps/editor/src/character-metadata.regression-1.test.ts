import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Regression: .gstack/qa-reports/qa-report-reed-electron-2026-07-17.md, ISSUE-001.
describe("character metadata authoring", () => {
  it("provides an editor that saves the complete character record", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");

    expect(source).toContain("function CharacterEditor");
    expect(source).toContain("Character description");
    expect(source).toContain("Actor direction");
    expect(source).toContain("Voice notes");
    expect(source).toMatch(/mutate\("upsertCharacter", \{[\s\S]*?id: character\.id,[\s\S]*?description,[\s\S]*?actorNotes,[\s\S]*?voiceNotes/);
  });
});
