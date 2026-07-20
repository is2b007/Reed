import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ReedProject,
  checkpointProjectGit,
  createProjectGitBranch,
  createProjectPullRequestHandoff,
  exportProjectJson,
  initializeProjectGit,
  setProjectGitRemote,
} from "../src/index.js";

const roots: string[] = [];
const gitAvailable = (() => { try { execFileSync("git", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.runIf(gitAvailable)("offline pull request handoff", () => {
  it("creates a local branch and prepares inert GitHub CLI commands", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-pr-test-"));
    roots.push(root);
    const project = await ReedProject.create(root, { name: "Team Story", slug: "team-story", languages: ["en"], defaultLanguage: "en" });
    try {
      await exportProjectJson(project);
      await initializeProjectGit(root);
      await checkpointProjectGit(root, "Initial story");
      await setProjectGitRemote(root, "git@github.com:reed-team/team-story.git");
      const branch = await createProjectGitBranch(root, "story/harbour-arrival");
      expect(branch).toMatchObject({ branch: "story/harbour-arrival", githubRepository: "reed-team/team-story" });

      await writeFile(path.join(root, "review-notes.md"), "Review the harbour arrival.\n", "utf8");
      await checkpointProjectGit(root, "Draft harbour arrival");
      const handoff = await createProjectPullRequestHandoff(root, {
        baseBranch: "main",
        title: "Review harbour arrival",
        body: "English and Greek dialogue ready for review.",
        pullRequestNumber: 42,
      });

      expect(handoff).toMatchObject({ repository: "reed-team/team-story", branch: "story/harbour-arrival", baseBranch: "main", ahead: 1 });
      expect(handoff.publishCommand).toContain("git -C");
      expect(handoff.createCommand).toContain("gh pr create");
      expect(handoff.mergeCommand).toContain("gh pr merge 42");
      expect(handoff.changedFiles).toContain("review-notes.md");
    } finally { project.close(); }
  });
});
