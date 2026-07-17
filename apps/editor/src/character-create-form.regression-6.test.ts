import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Regression: creating a character must expose the same metadata as editing one.
describe("complete character creation", () => {
  it("uses one shared full-detail form instead of the single-name prompt", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const characters = source.slice(source.indexOf("function Characters"), source.indexOf("function Validation"));

    expect(source).toContain("function CharacterCreateDialog");
    expect(source).toContain("function CharacterFields");
    expect(source).toContain("Add character details");
    expect(source).toMatch(/mutate\("upsertCharacter", \{[\s\S]*?name,[\s\S]*?displayNames,[\s\S]*?isPlayer,[\s\S]*?description,[\s\S]*?actorNotes,[\s\S]*?voiceNotes/);
    expect(characters).not.toContain('prompt({ title: "Add character"');
  });
});
