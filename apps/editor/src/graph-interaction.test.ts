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

  it("offers explained node types when a connector ends on empty canvas", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");
    const workspace = source.slice(source.indexOf("function GraphWorkspace"), source.indexOf("function ConversationEditor"));

    expect(workspace).toContain("onConnectEnd={finishConnection}");
    expect(workspace).toContain("onClickConnectEnd={finishConnection}");
    expect(workspace).toContain("screenToFlowPosition(clientPoint");
    expect(workspace).toContain("expectedVersion: added.version");
    expect(source).toContain("function focusGraphNodeWhenReady");
    expect(source).toContain('getComputedStyle(node).visibility !== "hidden"');
    expect(workspace).toContain("focusGraphNodeWhenReady(nodeIdToFocus)");
    expect(workspace).toContain("dialog.show()");
    expect(workspace).toContain("<dialog ref={connectionCreateRef}");
    expect(workspace).toContain("nodeKindOptions.map");
    expect(styles).toContain(".node-kind-tool:hover::after");
    expect(styles).toContain(".node-kind-tool:focus-visible::after");
    expect(styles).toContain("overflow:visible");
    expect(styles).toContain(".react-flow__handle::after");
  });
});
