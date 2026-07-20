import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("voice production and quick history handoff", () => {
  it("preflights language, actor, and recording readiness before voice export", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const production = source.slice(source.indexOf("function Production"), source.indexOf("function ProjectHistory"));

    expect(production).toContain("Recording language");
    expect(production).toContain("Actor packet");
    expect(production).toContain("Ready to record");
    expect(production).toContain("Pickups only");
    expect(production).toContain("Reed will not substitute another language in an actor script");
    expect(production).toContain("characterIds");
    expect(production).toContain("lineStatuses");
    expect(production).toContain("voiceStatuses");
  });

  it("turns Saved into an explicit local history and GitHub sync hub", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const main = await readFile(new URL("./main.ts", import.meta.url), "utf8");
    const saveControl = source.slice(source.indexOf("function SaveIndicator"), source.indexOf("function focusGraphNodeWhenReady"));

    expect(saveControl).toContain("Saved locally");
    expect(saveControl).toContain("not checkpointed");
    expect(saveControl).toContain("Set up local history");
    expect(saveControl).toContain("Create checkpoint");
    expect(saveControl).toContain("GitHub sync");
    expect(saveControl).toContain("Set up GitHub sync");
    expect(saveControl).toContain("Check connection");
    expect(saveControl).toContain("Reconnect GitHub");
    expect(saveControl).toContain("Code copied · finish in browser…");
    expect(saveControl).toContain("Paste the code there if asked");
    expect(saveControl).toContain("Connect repository");
    expect(saveControl).toContain("Check for updates");
    expect(saveControl).toContain("Push to GitHub");
    expect(saveControl).toContain("Checkpoint & push");
    expect(saveControl).toContain("Everything is up to date");
    expect(saveControl).toContain("ready to push");
    expect(saveControl).toContain("available on GitHub");
    expect(saveControl).toContain("Full GitHub &amp; PR workspace");
    expect(saveControl).toContain('pullRequestProvider: "github"');
    expect(saveControl).toContain("getProjectGitHubStatus");
    expect(saveControl).toContain("fetchProjectGitHub");
    expect(saveControl).toContain("pushProjectGitHub");
    expect(saveControl).toContain("Nothing has contacted GitHub yet");
    expect(saveControl).toContain('if (next.state === "connected") setNotice(success)');
    expect(saveControl).not.toMatch(/setInterval|XMLHttpRequest|WebSocket/);
    expect(main).toContain("throw new Error(ipcErrorMessage(error))");
    expect(main).toContain("shell.openExternal(githubDeviceUrl)");
    expect(main).not.toContain('execFileAsync("/usr/bin/open"');
    expect(main).toContain("if (githubConnection) return githubConnection");
    expect(main).toContain('process.env.REED_GH_BROWSER = "/usr/bin/true"');
    expect(main).toContain("return await connectGitHubFromEditor()");
  });

  it("shares GitHub connection state between History and the Saved popover", async () => {
    const source = await readFile(new URL("./app.tsx", import.meta.url), "utf8");
    const editor = source.slice(source.indexOf("function EditorApp"), source.indexOf("export function App"));

    expect(editor).toContain("const [githubStatus, setGitHubStatus]");
    expect(editor).toContain("github={githubStatus}");
    expect(editor).toContain("onGitHub={setGitHubStatus}");
    expect(source).not.toContain("const [github, setGitHub] = useState<ProjectGitHubStatus | null>(null)");
  });
});
