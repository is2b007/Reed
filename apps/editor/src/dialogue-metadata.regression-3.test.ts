import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Regression: .gstack/qa-reports/qa-report-reed-electron-2026-07-17.md, ISSUE-003.
describe("dialogue metadata authoring", () => {
  it("exposes menu labels, native verification, and voice status in the line inspector", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");

    expect(source).toContain("Menu label");
    expect(source).toContain("Translation verification");
    expect(source).toContain("Voice status");
    expect(source).toContain('mutate("setVoiceStatus"');
    expect(source).toMatch(/mutate\("setNodeText", \{[\s\S]*?menuText:[\s\S]*?verificationStatus:/);
  });
});
