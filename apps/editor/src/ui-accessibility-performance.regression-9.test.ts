import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("editor accessibility and performance regressions", () => {
  it("uses native modal dialogs with focus restoration", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const modal = source.slice(source.indexOf("function ModalDialog"), source.indexOf("function PromptDialog"));

    expect(modal).toContain("dialog.showModal()");
    expect(modal).toContain("returnFocusRef");
    expect(modal).toContain("target?.isConnected");
    expect(modal).toContain("onCancel=");
    expect(source).not.toContain('className="prompt-backdrop"');
    expect(modal).not.toContain('role="dialog"');
  });

  it("keeps menu focus visible and labels compact language controls", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const buttons = source.match(/<button\b/g) ?? [];
    const typedButtons = source.match(/<button\b[^>]*\btype=/g) ?? [];

    expect(source).toContain("workspaceMenuTriggerRef.current?.focus()");
    expect(source).toContain("hidden={!workspaceMenuOpen}");
    expect(source).toContain("workspaceMenuFocusIndex === itemIndex");
    expect(source).toContain('aria-label="Primary language"');
    expect(source).toContain('aria-label="Reference language"');
    expect(source).toContain('className={`status-indicator status-${node.lineStatus}`}');
    expect(typedButtons).toHaveLength(buttons.length);
  });

  it("loads the target graph before resolving a validation jump", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const jump = source.slice(source.indexOf("const jumpIssue"), source.indexOf("const doSearch"));

    expect(jump).toContain("await loadConversation(targetConversationId)");
    expect(jump).toContain("targetGraph?.nodes.find");
    expect(jump).not.toContain("setTimeout");
  });

  it("indexes graph nodes and outgoing links once per graph snapshot", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const workspace = source.slice(source.indexOf("function GraphWorkspace"), source.indexOf("function ConversationEditor"));

    expect(workspace).toContain("const nodeById = useMemo");
    expect(workspace).toContain("const linksByOrigin = useMemo");
    expect(workspace).toContain("linksByOrigin.get(origin)");
    expect(workspace).not.toContain("graph.links.filter((link) => link.originNodeId === origin)");
    expect(workspace).toContain("proOptions={{ hideAttribution: true }}");
  });

  it("keeps repeated keyboard controls immediate while preserving tactile press feedback", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");

    expect(source).toContain("suppressPanelMotionOnce");
    expect(source).toContain('panelMotionInstant ? "panel-motion-instant" : ""');
    expect(source).not.toContain('classList.add("panel-motion-instant")');
    expect(styles).toContain('button:not(:disabled):active { scale:.96; }');
    expect(styles).toContain(".app-shell.panel-motion-instant");
    expect(styles).not.toContain("transition:grid-template-columns");
    expect(styles).not.toContain("transition:opacity 120ms");
  });
});
