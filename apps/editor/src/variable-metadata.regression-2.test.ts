import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Regression: .gstack/qa-reports/qa-report-reed-electron-2026-07-17.md, ISSUE-002.
describe("variable metadata authoring", () => {
  it("provides an editor for the declared type, initial value, and description", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");

    expect(source).toContain("function VariableEditor");
    expect(source).toContain("Variable description");
    expect(source).toContain("Initial value");
    expect(source).toMatch(/mutate\("declareVariable", \{[\s\S]*?name: variable\.name,[\s\S]*?type,[\s\S]*?initialValue: parsedInitialValue,[\s\S]*?description/);
  });
});
