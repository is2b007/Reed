import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("graph node interactions", () => {
  it("applies controlled node changes during a drag before persisting on drag stop", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const workspace = source.slice(
      source.indexOf("function GraphWorkspace"),
      source.indexOf("function BeatMap"),
    );

    expect(workspace).toContain("useNodesState<CardNode>");
    expect(workspace).toContain("onNodesChange={onNodesChange}");
    expect(workspace).toContain("onNodeDragStop=");
  });
});
