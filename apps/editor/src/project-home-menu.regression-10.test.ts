import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("project home and native menu regressions", () => {
  it("provides a Mac application menu with project lifecycle commands", async () => {
    const source = await readFile(new URL("./main.ts", import.meta.url), "utf8");

    expect(source).toContain("Menu.setApplicationMenu(Menu.buildFromTemplate");
    expect(source).toContain('label: "New Project…"');
    expect(source).toContain('label: "Open Project…"');
    expect(source).toContain('label: "Open Recent"');
    expect(source).toContain('label: "Project Home"');
    expect(source).toContain('label: "Project Settings…"');
    expect(source).toContain('accelerator: "CommandOrControl+,"');
    expect(source).toContain('role: "services"');
    expect(source).toContain('role: "hideOthers"');
    expect(source).toContain('role: "quit"');
  });

  it("keeps an open project available while showing local recent projects", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const home = source.slice(source.indexOf("function ProjectHome"), source.indexOf("function ProjectSettingsDialog"));

    expect(home).toContain('className="current-project"');
    expect(home).toContain("Continue editing");
    expect(home).toContain('className="recent-project-list"');
    expect(home).toContain("window.reed.openProject(root)");
    expect(home).toContain("window.reed.forgetRecentProject(root)");
    expect(source).toContain("setHomeVisible(true)");
    expect(source).toContain("current={state}");
  });

  it("uses icon-led project actions and a direct three-state appearance cycle", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");

    expect(source).toContain("function HomeActionIcon");
    expect(source).toContain("function AppearanceCycleIcon");
    expect(source).toContain("nextAppearancePreference(appearance.preference)");
    expect(source).toContain("Appearance: ${appearanceLabel}. Switch to ${nextAppearanceLabel}.");
    expect(source).toContain('aria-controls="new-project-form"');
    expect(styles).toContain(".appearance-cycle-icon svg.active");
    expect(styles).toContain('.home-action-new[aria-expanded="true"]');
  });

  it("edits project identity through the versioned core mutation", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const settings = source.slice(source.indexOf("function ProjectSettingsDialog"), source.indexOf("function Navigator"));

    expect(settings).toContain('mutate("updateProject"');
    expect(settings).toContain("expectedVersion: project.version");
    expect(settings).toContain("Enabled languages");
    expect(settings).toContain("Default writing language");
    expect(settings).toContain("Project location");
  });

  it("shows workspace icons, stable speaker accents, and variable context", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");

    expect(source).toContain("function WorkspaceIcon");
    expect(source).toContain('<WorkspaceIcon workspace={item.id} />');
    expect(source).toContain('"--speaker-accent": data.speakerAccent');
    expect(source).toContain("speakerAccent(character.numericId)");
    expect(source).toContain("function Variables");
    expect(source).toContain("conditionVariableNames(node.conditions)");
    expect(source).toContain("variableInitialValueLabel(variable.type, variable.initialValue)");
  });
});
