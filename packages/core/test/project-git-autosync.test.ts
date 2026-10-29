import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ReedProject,
  autoSyncCheckpointName,
  autoSyncProjectGit,
  exportProjectJson,
  initializeProjectGit,
  setProjectGitRemote,
} from "../src/index.js";

const roots: string[] = [];
const gitAvailable = (() => {
  try { execFileSync("git", ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
})();
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { cwd, encoding: "utf8" }).trim();

async function temporary(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.runIf(gitAvailable)("automatic Git sync", () => {
  it("names autosave checkpoints by UTC minute", () => {
    expect(autoSyncCheckpointName(new Date("2026-10-29T23:07:45Z"))).toBe("Autosave 2026-10-29 23:07 UTC");
  });

  it("leaves projects without local history alone", async () => {
    const root = await temporary("reed-autosync-off-");
    const project = await ReedProject.create(root, { name: "Off", slug: "off", languages: ["en"], defaultLanguage: "en" });
    try {
      await exportProjectJson(project);
      const result = await autoSyncProjectGit(root, { push: true });
      expect(result).toMatchObject({ outcome: "not-initialized", committed: false, pushed: false });
    } finally { project.close(); }
  });

  it("commits locally, pushes to origin, and never overwrites newer remote work", async () => {
    const root = await temporary("reed-autosync-");
    const remote = await temporary("reed-autosync-remote-");
    git(remote, "init", "--bare", "--initial-branch=main", ".");
    const project = await ReedProject.create(root, { name: "Harbour", slug: "harbour", languages: ["en"], defaultLanguage: "en" });
    try {
      await exportProjectJson(project);
      await initializeProjectGit(root);

      const local = await autoSyncProjectGit(root, { push: true, now: new Date("2026-10-29T10:00:00Z") });
      expect(local).toMatchObject({ outcome: "local-only", committed: true, pushed: false });
      expect(local.status.commits[0]?.summary).toBe("Autosave 2026-10-29 10:00 UTC");

      await setProjectGitRemote(root, remote);
      const firstPush = await autoSyncProjectGit(root, { push: true });
      expect(firstPush).toMatchObject({ outcome: "pushed", pushed: true });
      expect(git(remote, "rev-parse", "main")).toBe(git(root, "rev-parse", "HEAD"));

      expect(await autoSyncProjectGit(root, { push: true })).toMatchObject({ outcome: "current", committed: false, pushed: false });

      await writeFile(path.join(root, "notes.md"), "A beat\n", "utf8");
      expect(await autoSyncProjectGit(root, { push: false })).toMatchObject({ outcome: "committed", committed: true, pushed: false });
      expect(await autoSyncProjectGit(root, { push: true })).toMatchObject({ outcome: "pushed", pushed: true });

      const other = await temporary("reed-autosync-other-");
      git(other, "clone", remote, ".");
      await writeFile(path.join(other, "other.md"), "From another device\n", "utf8");
      git(other, "add", "other.md");
      git(other, "commit", "-m", "Other device");
      git(other, "push", "origin", "main");
      const remoteHead = git(remote, "rev-parse", "main");

      await writeFile(path.join(root, "notes.md"), "A second beat\n", "utf8");
      const blocked = await autoSyncProjectGit(root, { push: true });
      expect(blocked).toMatchObject({ outcome: "remote-ahead", committed: true, pushed: false });
      expect(git(remote, "rev-parse", "main")).toBe(remoteHead);
    } finally { project.close(); }
  });

  it("keeps the local checkpoint when the remote is unreachable", async () => {
    const root = await temporary("reed-autosync-offline-");
    const project = await ReedProject.create(root, { name: "Offline", slug: "offline", languages: ["en"], defaultLanguage: "en" });
    try {
      await exportProjectJson(project);
      await initializeProjectGit(root);
      await setProjectGitRemote(root, path.join(root, "missing-remote.git"));
      const result = await autoSyncProjectGit(root, { push: true });
      expect(result).toMatchObject({ outcome: "offline", committed: true, pushed: false });
      expect(result.status.clean).toBe(true);
    } finally { project.close(); }
  });
});
