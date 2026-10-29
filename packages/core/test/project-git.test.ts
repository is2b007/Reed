import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ReedProject,
  checkpointProjectGit,
  exportProjectJson,
  initializeProjectGit,
  inspectProjectGit,
  setProjectGitRemote,
} from "../src/index.js";

const roots: string[] = [];
const gitAvailable = (() => {
  try { execFileSync("git", ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
})();

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.runIf(gitAvailable)("local project Git history", () => {
  it("initializes, checkpoints all project files, and never contacts a remote", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-git-test-"));
    roots.push(root);
    const project = await ReedProject.create(root, { name: "Το Πράσινο Λιμάνι", slug: "green-harbour", languages: ["en", "el", "it"], defaultLanguage: "en" });
    try {
      await writeFile(path.join(root, "story-notes.md"), "# Story notes\n", "utf8");
      await exportProjectJson(project);
      const initialized = await initializeProjectGit(root);
      expect(initialized).toMatchObject({ available: true, initialized: true, branch: "main" });

      const first = await checkpointProjectGit(root, "Initial story");
      expect(first.created).toBe(true);
      expect(first.status.clean).toBe(true);
      expect(first.status.commits[0]?.summary).toBe("Initial story");
      expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(".reed/");

      await writeFile(path.join(root, "story-notes.md"), "# Story notes\nA new beat.\n", "utf8");
      const dirty = await inspectProjectGit(root);
      expect(dirty.clean).toBe(false);
      expect(dirty.changes).toContainEqual(expect.objectContaining({ path: "story-notes.md" }));
      const second = await checkpointProjectGit(root, "Add second beat");
      expect(second.status.clean).toBe(true);
      expect(second.status.commits).toHaveLength(2);

      const remote = await setProjectGitRemote(root, "https://secret-token@example.com/team/story.git");
      expect(remote.remote).toBe("https://••••@example.com/team/story.git");
      expect(remote.pushCommand).toContain("push -u origin 'main'");
    } finally {
      project.close();
    }
  });
});

describe.runIf(gitAvailable)("project Git safety", () => {
  it("credits the writer's Git identity and rejects option-like remotes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-git-identity-"));
    roots.push(root);
    const project = await ReedProject.create(root, { name: "Identity", slug: "identity-story", languages: ["en"], defaultLanguage: "en" });
    try {
      await exportProjectJson(project);
      await initializeProjectGit(root);
      execFileSync("git", ["config", "user.name", "Ada Writer"], { cwd: root });
      execFileSync("git", ["config", "user.email", "ada@example.com"], { cwd: root });
      const checkpoint = await checkpointProjectGit(root, "First draft");
      expect(checkpoint.commit?.author).toBe("Ada Writer");
      await expect(setProjectGitRemote(root, "--upload-pack=touch /tmp/x")).rejects.toThrow(/cannot be Git options/u);
      await expect(setProjectGitRemote(root, "ext::sh -c touch% /tmp/x")).rejects.toThrow(/cannot be Git options/u);
    } finally {
      project.close();
    }
  });
});
