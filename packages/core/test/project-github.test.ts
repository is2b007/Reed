import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ReedProject,
  checkpointProjectGit,
  connectProjectGitHub,
  connectProjectGitHubRepository,
  createProjectGitBranch,
  createProjectGitHubPullRequest,
  createProjectGitHubRepository,
  exportProjectJson,
  initializeProjectGit,
  inspectProjectGitHub,
  mergeProjectGitHubPullRequest,
  pushProjectGitHub,
  reviewProjectGitHubPullRequest,
  setProjectGitRemote,
} from "../src/index.js";

const roots: string[] = [];
const originalGitHubPath = process.env.REED_GH_PATH;
const originalGitHubLog = process.env.REED_FAKE_GH_LOG;
const gitAvailable = (() => { try { execFileSync("git", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();

async function installFakeGitHub(root: string): Promise<string> {
  const fakeGitHub = path.join(root, "fake-gh");
  const log = path.join(root, "fake-gh.log");
  await writeFile(fakeGitHub, `#!/bin/sh
printf '%s\\n' "$*" >> "$REED_FAKE_GH_LOG"
printf 'browser=%s\\n' "$GH_BROWSER" >> "$REED_FAKE_GH_LOG"
if [ "$1" = "--version" ]; then
  echo "gh version 2.93.0"
elif [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo '{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"reed-writer","gitProtocol":"https"}]}}'
elif [ "$1" = "auth" ] && { [ "$2" = "login" ] || [ "$2" = "setup-git" ]; }; then
  exit 0
elif [ "$1" = "repo" ] && [ "$2" = "create" ]; then
  /usr/bin/git remote add origin https://github.com/reed-team/story.git
elif [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  echo '{"nameWithOwner":"reed-team/story","url":"https://github.com/reed-team/story","defaultBranchRef":{"name":"main"}}'
elif [ "$1" = "pr" ] && [ "$2" = "list" ]; then
  echo '[{"number":12,"title":"Review harbour arrival","url":"https://github.com/reed-team/story/pull/12","author":{"login":"writer-two"},"headRefName":"story/harbour","baseRefName":"main","isDraft":false,"mergeStateStatus":"CLEAN","reviewDecision":"REVIEW_REQUIRED","statusCheckRollup":[{"status":"COMPLETED","conclusion":"SUCCESS"}],"updatedAt":"2026-07-18T00:00:00Z"}]'
elif [ "$1" = "pr" ] && { [ "$2" = "create" ] || [ "$2" = "review" ] || [ "$2" = "merge" ]; }; then
  exit 0
else
  echo "Unexpected fake gh command: $*" >&2
  exit 2
fi
`, "utf8");
  await chmod(fakeGitHub, 0o755);
  process.env.REED_GH_PATH = fakeGitHub;
  process.env.REED_FAKE_GH_LOG = log;
  return log;
}

async function installExpiredGitHub(root: string): Promise<void> {
  const fakeGitHub = path.join(root, "expired-gh");
  await writeFile(fakeGitHub, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "gh version 2.93.0"
  exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo '{"hosts":{"github.com":[{"state":"failure","active":true,"host":"github.com","login":"reed-writer","error":"The token in default is invalid."}]}}'
  exit 1
fi
exit 2
`, "utf8");
  await chmod(fakeGitHub, 0o755);
  process.env.REED_GH_PATH = fakeGitHub;
}

async function installFailedGitHub(root: string): Promise<void> {
  const fakeGitHub = path.join(root, "failed-gh");
  await writeFile(fakeGitHub, `#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "login" ]; then
  echo "browser authentication was denied" >&2
  exit 1
fi
exit 2
`, "utf8");
  await chmod(fakeGitHub, 0o755);
  process.env.REED_GH_PATH = fakeGitHub;
}

afterEach(async () => {
  if (originalGitHubPath === undefined) delete process.env.REED_GH_PATH; else process.env.REED_GH_PATH = originalGitHubPath;
  if (originalGitHubLog === undefined) delete process.env.REED_FAKE_GH_LOG; else process.env.REED_FAKE_GH_LOG = originalGitHubLog;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.runIf(gitAvailable)("in-app GitHub integration", () => {
  it("reports an expired system credential as signed out without losing the account name", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-github-expired-test-"));
    roots.push(root);
    await installExpiredGitHub(root);

    expect(await inspectProjectGitHub(root)).toMatchObject({
      state: "signed-out",
      username: "reed-writer",
      repository: null,
      message: "The saved GitHub sign-in has expired. Connect again from Reed.",
    });
  });

  it("preserves the actionable GitHub login failure instead of returning a generic IPC error", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-github-failed-login-test-"));
    roots.push(root);
    await installFailedGitHub(root);

    await expect(connectProjectGitHub(root)).rejects.toThrow("GitHub sign-in did not complete: browser authentication was denied");
  });

  it("inspects, reviews, and merges pull requests through the configured GitHub process", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-github-test-"));
    roots.push(root);
    const log = await installFakeGitHub(root);

    const project = await ReedProject.create(root, { name: "Team Story", slug: "team-story", languages: ["en"], defaultLanguage: "en" });
    try {
      await exportProjectJson(project);
      await initializeProjectGit(root);
      await checkpointProjectGit(root, "Initial story");
      await setProjectGitRemote(root, "git@github.com:reed-team/story.git");

      const status = await inspectProjectGitHub(root);
      expect(status).toMatchObject({ state: "connected", username: "reed-writer", repository: "reed-team/story", defaultBranch: "main" });
      expect(status.pullRequests).toContainEqual(expect.objectContaining({ number: 12, author: "writer-two", checkState: "passing", mergeState: "clean" }));

      await reviewProjectGitHubPullRequest(root, { number: 12, action: "approve", body: "Dialogue review passed." });
      await mergeProjectGitHubPullRequest(root, 12, "squash");
      const commands = await readFile(log, "utf8");
      expect(commands).toContain("pr review 12 --repo reed-team/story --approve --body Dialogue review passed.");
      expect(commands).toContain("pr merge 12 --repo reed-team/story --squash");
    } finally {
      project.close();
    }
  });

  it("connects an account and repository without Terminal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-github-connect-test-"));
    roots.push(root);
    const log = await installFakeGitHub(root);
    const project = await ReedProject.create(root, { name: "Connected Story", slug: "connected-story", languages: ["en"], defaultLanguage: "en" });
    try {
      await exportProjectJson(project);
      await initializeProjectGit(root);
      await checkpointProjectGit(root, "Initial story");
      expect(await connectProjectGitHub(root)).toMatchObject({ state: "connected", username: "reed-writer", repository: null });
      expect(await connectProjectGitHubRepository(root, "reed-team/story")).toMatchObject({ state: "connected", repository: "reed-team/story" });

      const commands = await readFile(log, "utf8");
      expect(commands).toContain("auth login --hostname github.com --git-protocol https --web --clipboard --skip-ssh-key");
      if (process.platform === "darwin") expect(commands).toContain("browser=/usr/bin/open");
      expect(commands).toContain("auth setup-git --hostname github.com");
      expect(commands).toContain("repo view reed-team/story --json nameWithOwner");
    } finally {
      project.close();
    }
  });

  it("creates a repository through GitHub tooling", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-github-create-test-"));
    roots.push(root);
    const log = await installFakeGitHub(root);
    const project = await ReedProject.create(root, { name: "Created Story", slug: "created-story", languages: ["en"], defaultLanguage: "en" });
    try {
      await exportProjectJson(project);
      await initializeProjectGit(root);
      await checkpointProjectGit(root, "Initial story");
      expect(await createProjectGitHubRepository(root, { name: "story", description: "A local-first dialogue project", visibility: "private" })).toMatchObject({ state: "connected", repository: "reed-team/story" });

      const commands = await readFile(log, "utf8");
      expect(commands).toContain("repo create story --private --source");
      expect(commands).toContain("--remote origin --push --description A local-first dialogue project");
    } finally {
      project.close();
    }
  });

  it("pushes and opens a pull request against a local Git fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-github-publish-test-"));
    const remoteRoot = await mkdtemp(path.join(os.tmpdir(), "reed-github-remote-test-"));
    roots.push(root, remoteRoot);
    const log = await installFakeGitHub(root);
    execFileSync("git", ["init", "--bare", remoteRoot], { stdio: "ignore" });
    const project = await ReedProject.create(root, { name: "Publish Story", slug: "publish-story", languages: ["en"], defaultLanguage: "en" });
    try {
      await exportProjectJson(project);
      await initializeProjectGit(root);
      await checkpointProjectGit(root, "Initial story");
      await setProjectGitRemote(root, "https://github.com/reed-team/story.git");
      execFileSync("git", ["remote", "set-url", "--push", "origin", `file://${remoteRoot}`], { cwd: root });
      expect((await pushProjectGitHub(root)).upstream).toBe("origin/main");
      await createProjectGitBranch(root, "story/publish");
      await writeFile(path.join(root, "review-notes.md"), "Review the new dialogue branch.\n", "utf8");
      await exportProjectJson(project);
      await checkpointProjectGit(root, "Prepare story review");
      await createProjectGitHubPullRequest(root, { baseBranch: "main", title: "Review story branch", body: "Ready for dialogue review." });

      const commands = await readFile(log, "utf8");
      expect(commands).toContain("pr create --repo reed-team/story --base main --head story/publish --title Review story branch --body Ready for dialogue review.");
    } finally {
      project.close();
    }
  });
});
