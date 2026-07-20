import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("export, history, and autosave regressions", () => {
  it("keeps export feedback human-readable and validation-aware", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const production = source.slice(source.indexOf("function Production"), source.indexOf("function ProjectHistory"));

    expect(production).toContain("Unity / Pixel Crushers");
    expect(production).toContain("Voice production");
    expect(production).toContain("Story source & reading");
    expect(production).toContain("Show in Finder");
    expect(production).toContain('role={feedback.status === "error" ? "alert" : "status"}');
    expect(production).toContain('disabled={blocked || feedback?.status === "working"}');
    expect(production).not.toContain("JSON.stringify(await window.reed.export");
  });

  it("keeps remote Git optional and exposes only explicit in-app actions", async () => {
    const renderer = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const main = await readFile(new URL("./main.ts", import.meta.url), "utf8");
    const history = renderer.slice(renderer.indexOf("function GitHubPanel"), renderer.indexOf("function ReadConversation"));

    expect(history).toContain("GitHub is off");
    expect(history).toContain("Check GitHub connection");
    expect(history).toContain("No background fetches");
    expect(history).toContain("Check for updates");
    expect(history).toContain("Push to GitHub");
    expect(main).toContain('ipcMain.handle("reed:git-checkpoint"');
    expect(main).toContain('ipcMain.handle("reed:github-push"');
    expect(main).toContain('pullRequestProvider === "github" ? inspectProjectGitHub');
    expect(main).not.toContain('execFile("git"');
  });

  it("shows a live save state and autosaves inspector drafts on section exit", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const preload = await readFile(new URL("./preload.ts", import.meta.url), "utf8");

    expect(source).toContain("function SaveIndicator");
    expect(source).toContain('role="status" aria-live="polite"');
    expect(source).toContain("Saves after a short pause or when you leave this section");
    expect(source).toContain("latestDraftRef");
    expect(source).toContain("void onSaveRef.current(draft)");
    expect(source).toContain('setSaveState({ status: "dirty" })');
    expect(preload).toContain('emitSaveState({ status: "saving" })');
    expect(preload).toContain('emitSaveState({ status: "saved"');
    expect(source).not.toContain(">Save version</button>");
  });
});
