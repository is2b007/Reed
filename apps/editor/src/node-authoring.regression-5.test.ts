import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Regression: .gstack/qa-reports/qa-report-reed-electron-2026-07-17.md, ISSUE-005.
describe("complete line metadata authoring", () => {
  it("exposes every production field already supported by updateNode", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");

    expect(source).toContain("Listener");
    expect(source).toContain("Subtitle mode");
    expect(source).toContain("Deliberate endpoint");
    expect(source).toContain("Authored context path");
    expect(source).toContain("Pronunciation guide");
    expect(source).toMatch(/updateNode[\s\S]*?listenerCharacterId/);
    expect(source).toMatch(/updateNode[\s\S]*?subtitleOverride/);
    expect(source).toMatch(/updateNode[\s\S]*?isTerminal/);
    expect(source).toMatch(/updateNode[\s\S]*?contextPath/);
    expect(source).toMatch(/updateNode[\s\S]*?pronunciation/);
  });
});
