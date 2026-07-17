import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Regression: graph selection and deletion must behave like a desktop canvas.
describe("graph multi-selection and deletion", () => {
  it("supports drag-box selection and confirms selected nodes before deleting them", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const workspace = source.slice(source.indexOf("function GraphWorkspace"), source.indexOf("function ConversationEditor"));

    expect(source).toContain("SelectionMode");
    expect(workspace).toContain("selectionOnDrag");
    expect(workspace).toContain("selectionMode={SelectionMode.Partial}");
    expect(workspace).toContain("panOnDrag={[1, 2]}");
    expect(workspace).toContain('deleteKeyCode={["Backspace", "Delete"]}');
    expect(workspace).toContain("onBeforeDelete=");
    expect(workspace).toContain("Delete selected");
    expect(workspace).toMatch(/confirmation: record\.lineId/);
  });

  it("does not require typing a Line ID from the inspector", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const inspector = source.slice(source.indexOf("function InspectorForm"), source.indexOf("function GraphWorkspace"));

    expect(inspector).not.toContain("requiredValue: node.lineId");
    expect(inspector).toContain("window.confirm");
    expect(inspector).toContain("confirmation: node.lineId");
  });
});
