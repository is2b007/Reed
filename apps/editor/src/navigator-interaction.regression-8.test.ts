import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Regression: desktop panel controls must produce a visible layout change and
// tree disclosure affordances must be backed by real, keyboard-reachable controls.
describe("project navigator interactions", () => {
  it("connects navigator state to the desktop shell and keeps its toggle visible", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");

    expect(source).toContain('navigatorOpen ? "navigator-open" : "navigator-closed"');
    expect(styles).toMatch(/@media\s*\(min-width:901px\)[\s\S]*\.app-shell\.navigator-closed/);
    expect(styles).toMatch(/\.compact-panel-actions\s*\{[^}]*display:flex/);
  });

  it("uses real disclosure buttons for levels and scenes", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const navigator = source.slice(source.indexOf("function Navigator"), source.indexOf("function Inspector"));

    expect(navigator).toContain('className="tree-heading level"');
    expect(navigator).toContain('className="tree-disclosure"');
    expect(navigator).toContain("aria-expanded");
    expect(navigator).not.toContain('<div className="tree-heading">⌄');
  });
});
