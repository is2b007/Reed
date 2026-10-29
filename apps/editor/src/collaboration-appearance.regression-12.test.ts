import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("collaboration and appearance regressions", () => {
  it("keeps GitHub optional and manages explicit remote actions inside Reed", async () => {
    const app = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const main = await readFile(new URL("./main.ts", import.meta.url), "utf8");
    const git = await readFile(new URL("../../../packages/core/src/project-git.ts", import.meta.url), "utf8");
    const forge = await readFile(new URL("../forge.config.ts", import.meta.url), "utf8");

    expect(app).toContain("function GitHubPanel");
    expect(app).toContain("Check GitHub connection");
    expect(app).toContain("Enabled for this project");
    expect(app).toContain("Push and open PR");
    expect(app).toContain("Merge on GitHub");
    expect(app).toContain("never force-pushes or overwrites newer remote work");
    expect(main).toContain('ipcMain.handle("reed:github-status"');
    expect(main).toContain('pullRequestProvider === "github" ? inspectProjectGitHub');
    expect(git).toContain("GH_PROMPT_DISABLED");
    expect(git).toContain("GH_NO_UPDATE_NOTIFIER");
    expect(forge).toContain("extraResource: githubCliSource");
    expect(main).toContain("shell.openExternal(githubDeviceUrl)");
    expect(main).not.toContain('execFileAsync("/usr/bin/open"');
  });

  it("provides persisted Automatic, Light, and Dark themes in native and in-app settings", async () => {
    const app = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const main = await readFile(new URL("./main.ts", import.meta.url), "utf8");
    const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");

    expect(main).toContain("nativeTheme.themeSource = preference");
    expect(main).toContain('label: "Automatic"');
    expect(main).toContain('label: "Light"');
    expect(main).toContain('label: "Dark"');
    expect(main).toContain('sendMenuCommand({ type: "preferences" })');
    expect(app).toContain("function PreferencesDialog");
    expect(app).toContain("onAppearanceChanged");
    expect(styles).toContain(':root[data-theme="light"]');
    expect(styles).toContain("color-scheme:light");
  });

  it("can capture responsive non-canvas workspaces in packaged-app QA", async () => {
    const main = await readFile(new URL("./main.ts", import.meta.url), "utf8");

    expect(main).toContain('"--screenshot-workspace"');
    expect(main).toContain('"--screenshot-width"');
    expect(main).toContain('"--screenshot-height"');
    expect(main).toContain('"--screenshot-action"');
    expect(main).toContain('requested === "save" || requested === "github-status"');
    expect(main).toContain('button.save-indicator');
    expect(main).toContain('candidate.textContent?.trim() === "Check connection"');
    expect(main).toContain('sendMenuCommand({ type: "workspace", workspace: screenshotWorkspace })');
  });
});
