import { execFile } from "node:child_process";
import { access, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { GitBranchNameSchema } from "@reed/schema";
import { ConflictError, ReedError } from "./errors.js";

const execFileAsync = promisify(execFile);
const reedGitignoreBlock = `# Reed local database and generated handoff files\n.reed/\n.DS_Store\nexports/*\n!exports/reed-project.json\n`;

export interface ProjectGitChange {
  status: string;
  path: string;
}

export interface ProjectGitCommit {
  id: string;
  shortId: string;
  summary: string;
  author: string;
  createdAt: string;
}

export interface ProjectGitStatus {
  available: boolean;
  initialized: boolean;
  nestedInRepository: boolean;
  repositoryRoot: string | null;
  branch: string | null;
  branches: string[];
  clean: boolean;
  changes: ProjectGitChange[];
  commits: ProjectGitCommit[];
  remote: string | null;
  githubRepository: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  pushCommand: string | null;
  message: string;
}

export type ProjectGitHubConnectionState = "disabled" | "tool-missing" | "signed-out" | "connected" | "offline" | "error";
export type ProjectGitHubCheckState = "none" | "pending" | "passing" | "failing";

export interface ProjectGitHubPullRequest {
  number: number;
  title: string;
  url: string;
  author: string;
  headBranch: string;
  baseBranch: string;
  draft: boolean;
  mergeState: string;
  reviewDecision: string;
  checkState: ProjectGitHubCheckState;
  updatedAt: string;
}

export interface ProjectGitHubStatus {
  state: ProjectGitHubConnectionState;
  username: string | null;
  repository: string | null;
  repositoryUrl: string | null;
  defaultBranch: string | null;
  pullRequests: ProjectGitHubPullRequest[];
  message: string;
}

export interface CreateProjectGitHubRepositoryInput {
  name: string;
  description?: string;
  visibility: "private" | "public" | "internal";
}

export interface CreateProjectGitHubPullRequestInput {
  baseBranch: string;
  title: string;
  body?: string;
  draft?: boolean;
}

export interface ReviewProjectGitHubPullRequestInput {
  number: number;
  action: "approve" | "comment" | "request-changes";
  body?: string;
}

export interface ProjectPullRequestHandoff {
  repository: string;
  branch: string;
  baseBranch: string;
  ahead: number;
  behind: number;
  changedFiles: string[];
  publishCommand: string;
  createCommand: string;
  listCommand: string;
  viewCommand: string | null;
  mergeCommand: string | null;
}

export interface ProjectPullRequestHandoffInput {
  baseBranch: string;
  title: string;
  body?: string;
  pullRequestNumber?: number;
}

export type ProjectGitAutoSyncOutcome = "unavailable" | "not-initialized" | "current" | "committed" | "pushed" | "local-only" | "remote-ahead" | "offline" | "push-failed";

export interface ProjectGitAutoSyncResult {
  outcome: ProjectGitAutoSyncOutcome;
  committed: boolean;
  pushed: boolean;
  message: string;
  status: ProjectGitStatus;
}

export interface ProjectGitCheckpointResult {
  created: boolean;
  commit: ProjectGitCommit | null;
  status: ProjectGitStatus;
}

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | string | null;
}

async function runGit(root: string, args: string[], options: { timeout?: number } = {}): Promise<GitResult> {
  try {
    const result = await execFileAsync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      ...(options.timeout ? { timeout: options.timeout } : {}),
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const value = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
    return { ok: false, stdout: value.stdout ?? "", stderr: value.stderr ?? "", code: value.code ?? null };
  }
}

async function runGitHub(root: string, args: string[], options: { interactive?: boolean; timeout?: number } = {}): Promise<GitResult> {
  const executable = process.env.REED_GH_PATH?.trim() || "gh";
  try {
    const result = await execFileAsync(executable, args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: options.timeout ?? 60_000,
      env: {
        ...process.env,
        GH_NO_UPDATE_NOTIFIER: "1",
        GH_PAGER: "cat",
        GH_SPINNER_DISABLED: "1",
        NO_COLOR: "1",
        ...(options.interactive && process.platform === "darwin" ? { GH_BROWSER: process.env.REED_GH_BROWSER?.trim() || "/usr/bin/open" } : {}),
        ...(options.interactive ? {} : { GH_PROMPT_DISABLED: "1" }),
      },
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const value = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
    return { ok: false, stdout: value.stdout ?? "", stderr: value.stderr ?? "", code: value.code ?? null };
  }
}

async function canonicalPath(value: string): Promise<string> {
  try { return await realpath(value); } catch { return path.resolve(value); }
}

function cleanOutput(value: string): string {
  return value.trim().replace(/\r/g, "");
}

function githubError(result: GitResult): string {
  return cleanOutput(result.stderr || result.stdout).replace(/https?:\/\/[^\s@]+@/gu, "https://••••@");
}

function githubAuthenticationFailure(result: GitResult): string {
  const detail = githubError(result)
    .replace(/!?\s*One-time code \([A-Z0-9-]+\) copied to clipboard/giu, "")
    .replace(/Open this URL to continue in your web browser:\s*https:\/\/github\.com\/login\/device/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (/context deadline exceeded|timed? out/iu.test(detail)) {
    return "GitHub sign-in timed out. Try again and finish the browser step within ten minutes.";
  }
  if (detail) return `GitHub sign-in did not complete: ${detail}`;
  return "GitHub sign-in was canceled or did not finish. Try again, then paste the copied one-time code into the GitHub page.";
}

function isOfflineGitHubError(value: string): boolean {
  return /could not resolve host|dial tcp|lookup .* no such host|network is unreachable|connection (?:timed out|refused)|no route to host/iu.test(value);
}

function positivePullRequestNumber(value: number): number {
  if (!Number.isInteger(value) || value <= 0) throw new ConflictError("Pull request number must be a positive integer");
  return value;
}

function safeRemoteDisplay(value: string): string {
  return value.replace(/:\/\/([^/@\s]+)@/u, "://••••@");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function githubRepository(remote: string): string | null {
  const scp = remote.match(/^git@github\.com:([^/\s]+)\/(.+)$/u);
  let candidate = scp ? `${scp[1]}/${scp[2]}` : null;
  if (!candidate) {
    try {
      const url = new URL(remote);
      if (url.hostname.toLowerCase() !== "github.com") return null;
      candidate = url.pathname.replace(/^\/+/, "");
    } catch { return null; }
  }
  candidate = candidate.replace(/\.git$/u, "").replace(/\/+$/u, "");
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(candidate) ? candidate : null;
}

function repositoryInput(value: string): { repository: string; remote: string } {
  const trimmed = value.trim();
  const direct = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.][A-Za-z0-9_.-]*$/u.test(trimmed) ? trimmed : null;
  const repository = direct ?? githubRepository(trimmed);
  if (!repository || trimmed.length > 2_000 || /[\r\n\0]/u.test(trimmed)) {
    throw new ConflictError("Enter a GitHub repository as owner/name or a github.com URL");
  }
  return { repository, remote: direct ? `https://github.com/${repository}.git` : trimmed };
}

function pullRequestCheckState(value: unknown): ProjectGitHubCheckState {
  if (!Array.isArray(value) || value.length === 0) return "none";
  let pending = false;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const conclusion = String(record.conclusion ?? record.state ?? "").toUpperCase();
    const status = String(record.status ?? "").toUpperCase();
    if (["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(conclusion)) return "failing";
    if (!conclusion || (status && status !== "COMPLETED")) pending = true;
  }
  return pending ? "pending" : "passing";
}

function parseGitHubPullRequests(value: unknown): ProjectGitHubPullRequest[] {
  if (!Array.isArray(value)) return [];
  const pullRequests: ProjectGitHubPullRequest[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const number = Number(record.number);
    if (!Number.isInteger(number) || number <= 0) continue;
    const author = record.author && typeof record.author === "object" ? String((record.author as Record<string, unknown>).login ?? "") : "";
    pullRequests.push({
      number,
      title: String(record.title ?? "Untitled pull request"),
      url: String(record.url ?? ""),
      author,
      headBranch: String(record.headRefName ?? ""),
      baseBranch: String(record.baseRefName ?? ""),
      draft: Boolean(record.isDraft),
      mergeState: String(record.mergeStateStatus ?? "UNKNOWN").toLowerCase(),
      reviewDecision: String(record.reviewDecision ?? "").toLowerCase(),
      checkState: pullRequestCheckState(record.statusCheckRollup),
      updatedAt: String(record.updatedAt ?? ""),
    });
  }
  return pullRequests;
}

async function ensureGitAvailable(root: string): Promise<void> {
  const version = await runGit(root, ["--version"]);
  if (!version.ok) throw new ReedError("Git is not available on this Mac", "GIT_UNAVAILABLE", { root });
}

async function ensureReedGitignore(root: string): Promise<void> {
  const file = path.join(root, ".gitignore");
  let current = "";
  try { current = await readFile(file, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const missing = reedGitignoreBlock.split("\n").filter(Boolean).filter((line) => !current.split(/\r?\n/u).includes(line));
  if (missing.length === 0) return;
  const next = `${current}${current.length > 0 && !current.endsWith("\n") ? "\n" : ""}${current.length > 0 ? "\n" : ""}${missing.join("\n")}\n`;
  const temporary = `${file}.reed-tmp`;
  await writeFile(temporary, next, "utf8");
  await rename(temporary, file);
}

function parseChanges(stdout: string): ProjectGitChange[] {
  const changes: ProjectGitChange[] = [];
  for (const line of stdout.replace(/\r/g, "").trimEnd().split("\n")) {
    if (line.length < 4) continue;
    changes.push({ status: line.slice(0, 2).trim() || "?", path: line.slice(3).replace(/^"|"$/g, "") });
  }
  return changes;
}

function parseCommits(stdout: string): ProjectGitCommit[] {
  const commits: ProjectGitCommit[] = [];
  for (const line of cleanOutput(stdout).split("\n")) {
    if (!line) continue;
    const [id, shortId, createdAt, author, ...summary] = line.split("\u001f");
    if (id && shortId && createdAt && author) commits.push({ id, shortId, createdAt, author, summary: summary.join("\u001f") });
  }
  return commits;
}

export async function inspectProjectGit(root: string): Promise<ProjectGitStatus> {
  const projectRoot = await canonicalPath(root);
  const version = await runGit(projectRoot, ["--version"]);
  if (!version.ok) return {
    available: false, initialized: false, nestedInRepository: false, repositoryRoot: null, branch: null,
    branches: [], clean: true, changes: [], commits: [], remote: null, githubRepository: null,
    upstream: null, ahead: 0, behind: 0, pushCommand: null,
    message: "Git is not available. Install Apple Command Line Tools to enable local history.",
  };

  const topLevel = await runGit(projectRoot, ["rev-parse", "--show-toplevel"]);
  const repositoryRoot = topLevel.ok ? await canonicalPath(cleanOutput(topLevel.stdout)) : null;
  const initialized = repositoryRoot === projectRoot;
  const nestedInRepository = Boolean(repositoryRoot && !initialized);
  if (!initialized) return {
    available: true, initialized: false, nestedInRepository, repositoryRoot, branch: null,
    branches: [], clean: true, changes: [], commits: [], remote: null, githubRepository: null,
    upstream: null, ahead: 0, behind: 0, pushCommand: null,
    message: nestedInRepository ? "This project is inside a different Git repository. Reed can create isolated local history here." : "Local Git history has not been initialized.",
  };

  const [branchResult, branchesResult, statusResult, logResult, remoteResult, upstreamResult, divergenceResult] = await Promise.all([
    runGit(projectRoot, ["branch", "--show-current"]),
    runGit(projectRoot, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]),
    runGit(projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"]),
    runGit(projectRoot, ["log", "-20", "--format=%H%x1f%h%x1f%aI%x1f%an%x1f%s"]),
    runGit(projectRoot, ["remote", "get-url", "origin"]),
    runGit(projectRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    runGit(projectRoot, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]),
  ]);
  const branch = cleanOutput(branchResult.stdout) || "main";
  const changes = parseChanges(statusResult.stdout);
  const rawRemote = remoteResult.ok ? cleanOutput(remoteResult.stdout) : null;
  const remote = rawRemote ? safeRemoteDisplay(rawRemote) : null;
  const [ahead = 0, behind = 0] = divergenceResult.ok ? cleanOutput(divergenceResult.stdout).split(/\s+/u).map(Number) : [0, 0];
  return {
    available: true, initialized: true, nestedInRepository: false, repositoryRoot: projectRoot, branch,
    branches: branchesResult.ok ? cleanOutput(branchesResult.stdout).split("\n").filter(Boolean) : [branch],
    clean: changes.length === 0, changes, commits: logResult.ok ? parseCommits(logResult.stdout) : [], remote,
    githubRepository: rawRemote ? githubRepository(rawRemote) : null,
    upstream: upstreamResult.ok ? cleanOutput(upstreamResult.stdout) : null,
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
    pushCommand: remote ? `git -C ${shellQuote(projectRoot)} push -u origin ${shellQuote(branch)}` : null,
    message: changes.length === 0 ? "Story checkpoint is up to date." : `${changes.length} local ${changes.length === 1 ? "change" : "changes"} ready for a checkpoint.`,
  };
}

export function disabledProjectGitHubStatus(): ProjectGitHubStatus {
  return {
    state: "disabled", username: null, repository: null, repositoryUrl: null,
    defaultBranch: null, pullRequests: [], message: "GitHub is off for this project. Reed remains fully offline.",
  };
}

export async function inspectProjectGitHub(root: string): Promise<ProjectGitHubStatus> {
  const projectRoot = await canonicalPath(root);
  const version = await runGitHub(projectRoot, ["--version"]);
  if (!version.ok && version.code === "ENOENT") return {
    state: "tool-missing", username: null, repository: null, repositoryUrl: null,
    defaultBranch: null, pullRequests: [], message: "GitHub support is not installed with this Reed build.",
  };
  if (!version.ok) return {
    state: "error", username: null, repository: null, repositoryUrl: null,
    defaultBranch: null, pullRequests: [], message: githubError(version) || "GitHub support could not start.",
  };

  const authentication = await runGitHub(projectRoot, ["auth", "status", "--hostname", "github.com", "--active", "--json", "hosts"]);
  let auth: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(cleanOutput(authentication.stdout) || "{}") as { hosts?: Record<string, unknown> };
    const accounts = parsed.hosts?.["github.com"];
    if (Array.isArray(accounts)) auth = (accounts.find((account) => account && typeof account === "object" && Boolean((account as Record<string, unknown>).active)) ?? accounts[0]) as Record<string, unknown> | null;
  } catch { auth = null; }
  const authError = String(auth?.error ?? githubError(authentication));
  if (!auth) return {
    state: "signed-out", username: null, repository: null, repositoryUrl: null,
    defaultBranch: null, pullRequests: [], message: "Connect a GitHub account to publish and review this project from Reed.",
  };
  if (String(auth.state ?? "") !== "success") return {
    state: isOfflineGitHubError(authError) ? "offline" : "signed-out",
    username: auth.login ? String(auth.login) : null,
    repository: null, repositoryUrl: null, defaultBranch: null, pullRequests: [],
    message: isOfflineGitHubError(authError) ? "GitHub is unreachable. Local editing and checkpoints still work offline." : "The saved GitHub sign-in has expired. Connect again from Reed.",
  };

  const gitStatus = await inspectProjectGit(projectRoot);
  const repository = gitStatus.githubRepository;
  const username = auth.login ? String(auth.login) : null;
  if (!repository) return {
    state: "connected", username, repository: null, repositoryUrl: null,
    defaultBranch: null, pullRequests: [], message: "GitHub is connected. Create or connect a repository for this project.",
  };

  const [repositoryResult, pullRequestsResult] = await Promise.all([
    runGitHub(projectRoot, ["repo", "view", repository, "--json", "nameWithOwner,url,defaultBranchRef"]),
    runGitHub(projectRoot, ["pr", "list", "--repo", repository, "--state", "open", "--limit", "50", "--json", "number,title,url,author,headRefName,baseRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup,updatedAt"]),
  ]);
  if (!repositoryResult.ok || !pullRequestsResult.ok) {
    const detail = githubError(!repositoryResult.ok ? repositoryResult : pullRequestsResult);
    return {
      state: isOfflineGitHubError(detail) ? "offline" : "error", username, repository,
      repositoryUrl: `https://github.com/${repository}`, defaultBranch: null, pullRequests: [],
      message: isOfflineGitHubError(detail) ? "GitHub is unreachable. Local editing and checkpoints still work offline." : detail || "The GitHub repository could not be inspected.",
    };
  }
  try {
    const repositoryJson = JSON.parse(cleanOutput(repositoryResult.stdout)) as { nameWithOwner?: string; url?: string; defaultBranchRef?: { name?: string } };
    return {
      state: "connected", username, repository: repositoryJson.nameWithOwner ?? repository,
      repositoryUrl: repositoryJson.url ?? `https://github.com/${repository}`,
      defaultBranch: repositoryJson.defaultBranchRef?.name ?? null,
      pullRequests: parseGitHubPullRequests(JSON.parse(cleanOutput(pullRequestsResult.stdout) || "[]")),
      message: "GitHub is connected. Network access occurs only when you press a GitHub action.",
    };
  } catch {
    return {
      state: "error", username, repository, repositoryUrl: `https://github.com/${repository}`,
      defaultBranch: null, pullRequests: [], message: "GitHub returned an unreadable response.",
    };
  }
}

export async function connectProjectGitHub(root: string): Promise<ProjectGitHubStatus> {
  const projectRoot = await canonicalPath(root);
  const result = await runGitHub(projectRoot, [
    "auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--clipboard", "--skip-ssh-key",
  ], { interactive: true, timeout: 10 * 60_000 });
  if (!result.ok) throw new ReedError(githubAuthenticationFailure(result), "GITHUB_AUTH_FAILED", { detail: githubError(result), code: result.code });
  const setup = await runGitHub(projectRoot, ["auth", "setup-git", "--hostname", "github.com"]);
  if (!setup.ok) throw new ReedError("GitHub connected, but Git credentials could not be configured", "GITHUB_GIT_AUTH_FAILED", { detail: githubError(setup) });
  return inspectProjectGitHub(projectRoot);
}

async function requireGitHubRepository(root: string): Promise<{ projectRoot: string; repository: string; status: ProjectGitStatus }> {
  const projectRoot = await canonicalPath(root);
  const status = await inspectProjectGit(projectRoot);
  if (!status.initialized || !status.branch) throw new ConflictError("Initialize local history before using GitHub");
  if (!status.githubRepository) throw new ConflictError("Create or connect a github.com repository first");
  return { projectRoot, repository: status.githubRepository, status };
}

export async function createProjectGitHubRepository(root: string, input: CreateProjectGitHubRepositoryInput): Promise<ProjectGitHubStatus> {
  const projectRoot = await canonicalPath(root);
  const status = await inspectProjectGit(projectRoot);
  if (!status.initialized || status.commits.length === 0) throw new ConflictError("Create the first local checkpoint before creating a GitHub repository");
  if (!status.clean) throw new ConflictError("Checkpoint local changes before creating a GitHub repository", { changes: status.changes });
  if (status.remote) throw new ConflictError("This project already has an origin remote", { remote: status.remote });
  const name = input.name.trim();
  if (!/^(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)?[A-Za-z0-9_.][A-Za-z0-9_.-]*$/u.test(name) || name.length > 200) throw new ConflictError("Repository names must be owner/name or a valid GitHub repository name");
  const description = input.description?.trim() ?? "";
  if (description.length > 350 || /[\r\n\0]/u.test(description)) throw new ConflictError("Repository descriptions must be one line and at most 350 characters");
  if (!["private", "public", "internal"].includes(input.visibility)) throw new ConflictError("Choose private, public, or internal repository visibility");
  const args = ["repo", "create", name, `--${input.visibility}`, "--source", projectRoot, "--remote", "origin", "--push"];
  if (description) args.push("--description", description);
  const created = await runGitHub(projectRoot, args, { timeout: 5 * 60_000 });
  if (!created.ok) throw new ReedError("Could not create the GitHub repository", "GITHUB_REPOSITORY_CREATE_FAILED", { detail: githubError(created) });
  return inspectProjectGitHub(projectRoot);
}

export async function connectProjectGitHubRepository(root: string, value: string): Promise<ProjectGitHubStatus> {
  const projectRoot = await canonicalPath(root);
  const { repository, remote } = repositoryInput(value);
  const checked = await runGitHub(projectRoot, ["repo", "view", repository, "--json", "nameWithOwner"], { timeout: 60_000 });
  if (!checked.ok) throw new ReedError("Could not connect to that GitHub repository", "GITHUB_REPOSITORY_CONNECT_FAILED", { detail: githubError(checked) });
  await setProjectGitRemote(projectRoot, remote);
  return inspectProjectGitHub(projectRoot);
}

export async function fetchProjectGitHub(root: string): Promise<ProjectGitStatus> {
  const { projectRoot } = await requireGitHubRepository(root);
  const fetched = await runGit(projectRoot, ["fetch", "--prune", "origin"]);
  if (!fetched.ok) throw new ReedError("Could not fetch GitHub branches", "GITHUB_FETCH_FAILED", { detail: cleanOutput(fetched.stderr) });
  return inspectProjectGit(projectRoot);
}

export async function pushProjectGitHub(root: string): Promise<ProjectGitStatus> {
  const { projectRoot, status } = await requireGitHubRepository(root);
  if (!status.clean) throw new ConflictError("Create a checkpoint before pushing to GitHub", { changes: status.changes });
  if (status.behind > 0) throw new ConflictError("The remote branch has newer checkpoints. Fetch and review them before pushing.", { behind: status.behind });
  const pushed = await runGit(projectRoot, ["push", "--set-upstream", "origin", status.branch ?? "main"]);
  if (!pushed.ok) throw new ReedError("Could not push the story branch to GitHub", "GITHUB_PUSH_FAILED", { detail: cleanOutput(pushed.stderr) });
  return inspectProjectGit(projectRoot);
}

export async function createProjectGitHubPullRequest(root: string, input: CreateProjectGitHubPullRequestInput): Promise<ProjectGitHubStatus> {
  const { projectRoot, repository, status } = await requireGitHubRepository(root);
  const baseBranch = GitBranchNameSchema.parse(input.baseBranch);
  const title = input.title.trim();
  const body = input.body?.trim() ?? "";
  if (!title || title.length > 256 || /[\r\n\0]/u.test(title)) throw new ConflictError("Pull request titles must be one line and at most 256 characters");
  if (body.length > 20_000 || body.includes("\0")) throw new ConflictError("Pull request descriptions must be at most 20,000 characters");
  if (!status.clean) throw new ConflictError("Create a checkpoint before opening a pull request", { changes: status.changes });
  if (status.branch === baseBranch) throw new ConflictError("Start a story branch before opening a pull request", { branch: status.branch, baseBranch });
  await pushProjectGitHub(projectRoot);
  const args = ["pr", "create", "--repo", repository, "--base", baseBranch, "--head", status.branch ?? "", "--title", title, "--body", body];
  if (input.draft) args.push("--draft");
  const created = await runGitHub(projectRoot, args, { timeout: 2 * 60_000 });
  if (!created.ok) throw new ReedError("Could not create the GitHub pull request", "GITHUB_PULL_REQUEST_CREATE_FAILED", { detail: githubError(created) });
  return inspectProjectGitHub(projectRoot);
}

export async function reviewProjectGitHubPullRequest(root: string, input: ReviewProjectGitHubPullRequestInput): Promise<ProjectGitHubStatus> {
  const { projectRoot, repository } = await requireGitHubRepository(root);
  const number = positivePullRequestNumber(input.number);
  const body = input.body?.trim() ?? "";
  if (body.length > 20_000 || body.includes("\0")) throw new ConflictError("Review comments must be at most 20,000 characters");
  if ((input.action === "comment" || input.action === "request-changes") && !body) throw new ConflictError("Add a review comment before submitting this review");
  const flag = input.action === "approve" ? "--approve" : input.action === "request-changes" ? "--request-changes" : "--comment";
  const args = ["pr", "review", String(number), "--repo", repository, flag];
  if (body) args.push("--body", body);
  const reviewed = await runGitHub(projectRoot, args);
  if (!reviewed.ok) throw new ReedError("Could not submit the GitHub review", "GITHUB_PULL_REQUEST_REVIEW_FAILED", { detail: githubError(reviewed) });
  return inspectProjectGitHub(projectRoot);
}

export async function mergeProjectGitHubPullRequest(root: string, numberValue: number, strategy: "merge" | "squash" | "rebase" = "squash"): Promise<ProjectGitHubStatus> {
  const { projectRoot, repository } = await requireGitHubRepository(root);
  const number = positivePullRequestNumber(numberValue);
  if (!["merge", "squash", "rebase"].includes(strategy)) throw new ConflictError("Choose merge, squash, or rebase", { strategy });
  const merged = await runGitHub(projectRoot, ["pr", "merge", String(number), "--repo", repository, `--${strategy}`], { timeout: 2 * 60_000 });
  if (!merged.ok) throw new ReedError("Could not merge the GitHub pull request", "GITHUB_PULL_REQUEST_MERGE_FAILED", { detail: githubError(merged) });
  return inspectProjectGitHub(projectRoot);
}

export async function createProjectGitBranch(root: string, rawName: string): Promise<ProjectGitStatus> {
  const projectRoot = await canonicalPath(root);
  const name = GitBranchNameSchema.parse(rawName);
  const status = await inspectProjectGit(projectRoot);
  if (!status.initialized) throw new ConflictError("Initialize local Git history before creating a branch", { root: projectRoot });
  if (!status.clean) throw new ConflictError("Create a checkpoint before starting a branch", { changes: status.changes });
  const existing = await runGit(projectRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`]);
  if (existing.ok) throw new ConflictError("A local branch with this name already exists", { branch: name });
  const created = await runGit(projectRoot, ["-c", "core.hooksPath=/dev/null", "switch", "-c", name]);
  if (!created.ok) throw new ReedError("Could not create the local story branch", "GIT_BRANCH_FAILED", { stderr: cleanOutput(created.stderr) });
  return inspectProjectGit(projectRoot);
}

export async function createProjectPullRequestHandoff(root: string, input: ProjectPullRequestHandoffInput): Promise<ProjectPullRequestHandoff> {
  const projectRoot = await canonicalPath(root);
  const baseBranch = GitBranchNameSchema.parse(input.baseBranch);
  const title = input.title.trim();
  const body = input.body?.trim() ?? "";
  if (!title || title.length > 256 || /[\r\n\0]/u.test(title)) throw new ConflictError("Pull request titles must be one line and at most 256 characters");
  if (body.length > 20_000 || body.includes("\0")) throw new ConflictError("Pull request descriptions must be at most 20,000 characters");
  if (input.pullRequestNumber !== undefined && (!Number.isInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0)) throw new ConflictError("Pull request number must be a positive integer");
  const status = await inspectProjectGit(projectRoot);
  if (!status.initialized || !status.branch) throw new ConflictError("Initialize local Git history before preparing a pull request");
  if (!status.clean) throw new ConflictError("Create a checkpoint before preparing a pull request", { changes: status.changes });
  if (status.branch === baseBranch) throw new ConflictError("Start a story branch before preparing a pull request", { branch: status.branch, baseBranch });
  const rawRemoteResult = await runGit(projectRoot, ["remote", "get-url", "origin"]);
  const repository = rawRemoteResult.ok ? githubRepository(cleanOutput(rawRemoteResult.stdout)) : null;
  if (!repository) throw new ConflictError("Configure a github.com origin before preparing a GitHub pull request");
  const baseExists = await runGit(projectRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${baseBranch}`]);
  if (!baseExists.ok) throw new ConflictError("The configured base branch does not exist locally", { baseBranch, branches: status.branches });
  const comparison = await runGit(projectRoot, ["rev-list", "--left-right", "--count", `${baseBranch}...${status.branch}`]);
  if (!comparison.ok) throw new ReedError("Could not compare the story branch with its base", "GIT_COMPARE_FAILED", { stderr: cleanOutput(comparison.stderr) });
  const [behind = 0, ahead = 0] = cleanOutput(comparison.stdout).split(/\s+/u).map(Number);
  if (ahead === 0) throw new ConflictError("This branch has no checkpoints to propose", { branch: status.branch, baseBranch });
  const diff = await runGit(projectRoot, ["diff", "--name-only", `${baseBranch}...${status.branch}`]);
  const repositoryArgs = `--repo ${shellQuote(repository)}`;
  const number = input.pullRequestNumber;
  return {
    repository,
    branch: status.branch,
    baseBranch,
    ahead,
    behind,
    changedFiles: diff.ok ? cleanOutput(diff.stdout).split("\n").filter(Boolean) : [],
    publishCommand: status.pushCommand ?? `git -C ${shellQuote(projectRoot)} push -u origin ${shellQuote(status.branch)}`,
    createCommand: `gh pr create ${repositoryArgs} --base ${shellQuote(baseBranch)} --head ${shellQuote(status.branch)} --title ${shellQuote(title)} --body ${shellQuote(body)}`,
    listCommand: `gh pr list ${repositoryArgs} --base ${shellQuote(baseBranch)}`,
    viewCommand: number ? `gh pr view ${number} ${repositoryArgs} --web` : null,
    mergeCommand: number ? `gh pr merge ${number} ${repositoryArgs} --merge --delete-branch` : null,
  };
}

export async function initializeProjectGit(root: string): Promise<ProjectGitStatus> {
  const projectRoot = await canonicalPath(root);
  await ensureGitAvailable(projectRoot);
  await mkdir(projectRoot, { recursive: true });
  const existing = await inspectProjectGit(projectRoot);
  if (!existing.initialized) {
    const initialized = await runGit(projectRoot, ["-c", "core.hooksPath=/dev/null", "init", "--initial-branch=main", "."]);
    if (!initialized.ok) throw new ReedError("Could not initialize local Git history", "GIT_INIT_FAILED", { stderr: cleanOutput(initialized.stderr) });
  }
  await ensureReedGitignore(projectRoot);
  return inspectProjectGit(projectRoot);
}

export async function checkpointProjectGit(root: string, message: string): Promise<ProjectGitCheckpointResult> {
  const projectRoot = await canonicalPath(root);
  const status = await inspectProjectGit(projectRoot);
  if (!status.available) throw new ReedError(status.message, "GIT_UNAVAILABLE", { root: projectRoot });
  if (!status.initialized) throw new ConflictError("Initialize local Git history before creating a checkpoint", { root: projectRoot });
  const summary = message.trim();
  if (!summary) throw new ConflictError("A checkpoint name is required");
  if (summary.length > 200 || /[\r\n\0]/u.test(summary)) throw new ConflictError("Checkpoint names must be one line and at most 200 characters");
  await access(path.join(projectRoot, "exports", "reed-project.json"));
  await ensureReedGitignore(projectRoot);
  const addedProject = await runGit(projectRoot, ["-c", "core.hooksPath=/dev/null", "add", "-A", "--", "."]);
  const addedStory = await runGit(projectRoot, ["-c", "core.hooksPath=/dev/null", "add", "-f", "--", "exports/reed-project.json"]);
  if (!addedProject.ok || !addedStory.ok) throw new ReedError("Could not stage the local story checkpoint", "GIT_STAGE_FAILED", { stderr: cleanOutput(`${addedProject.stderr}\n${addedStory.stderr}`) });
  const staged = await runGit(projectRoot, ["diff", "--cached", "--quiet", "--exit-code"]);
  if (staged.ok) return { created: false, commit: null, status: await inspectProjectGit(projectRoot) };
  if (staged.code !== 1) throw new ReedError("Could not inspect the staged story checkpoint", "GIT_STATUS_FAILED", { stderr: cleanOutput(staged.stderr) });
  // Attribute checkpoints to the writer's own Git identity when one is configured, so pushed commits
  // link to their GitHub account; fall back to a local placeholder only when Git has no identity.
  const [configuredName, configuredEmail] = await Promise.all([
    runGit(projectRoot, ["config", "--get", "user.name"]),
    runGit(projectRoot, ["config", "--get", "user.email"]),
  ]);
  const identity = configuredName.ok && cleanOutput(configuredName.stdout) && configuredEmail.ok && cleanOutput(configuredEmail.stdout)
    ? []
    : ["-c", "user.name=Reed Local History", "-c", "user.email=history@reed.local"];
  const committed = await runGit(projectRoot, [
    "-c", "core.hooksPath=/dev/null", ...identity,
    "commit", "--no-gpg-sign", "-m", summary,
  ]);
  if (!committed.ok) throw new ReedError("Could not create the local story checkpoint", "GIT_COMMIT_FAILED", { stderr: cleanOutput(committed.stderr) });
  const next = await inspectProjectGit(projectRoot);
  return { created: true, commit: next.commits[0] ?? null, status: next };
}

export async function setProjectGitRemote(root: string, url: string | null): Promise<ProjectGitStatus> {
  const projectRoot = await canonicalPath(root);
  const status = await inspectProjectGit(projectRoot);
  if (!status.initialized) throw new ConflictError("Initialize local Git history before configuring a remote", { root: projectRoot });
  const value = url?.trim() ?? "";
  if (value.length > 2_000 || /[\r\n\0]/u.test(value)) throw new ConflictError("Remote URLs must be one line and at most 2,000 characters");
  if (value.startsWith("-") || /^(?:ext|fd)::/iu.test(value)) throw new ConflictError("Remote URLs cannot be Git options or command transports", { remote: value });
  const existing = await runGit(projectRoot, ["remote", "get-url", "origin"]);
  const result = value
    ? await runGit(projectRoot, ["remote", existing.ok ? "set-url" : "add", "origin", value])
    : existing.ok ? await runGit(projectRoot, ["remote", "remove", "origin"]) : { ok: true, stdout: "", stderr: "", code: 0 };
  if (!result.ok) throw new ReedError("Could not update the local Git remote", "GIT_REMOTE_FAILED", { stderr: cleanOutput(result.stderr) });
  return inspectProjectGit(projectRoot);
}

const autoSyncNetworkTimeout = 60_000;

export function autoSyncCheckpointName(now = new Date()): string {
  return `Autosave ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * Commits any pending story changes, then publishes them to origin when one is configured.
 * Never force-pushes, merges, or touches the working tree when the remote has newer commits.
 */
export async function autoSyncProjectGit(root: string, options: { push: boolean; now?: Date }): Promise<ProjectGitAutoSyncResult> {
  const projectRoot = await canonicalPath(root);
  const initial = await inspectProjectGit(projectRoot);
  if (!initial.available) return { outcome: "unavailable", committed: false, pushed: false, message: initial.message, status: initial };
  if (!initial.initialized) return { outcome: "not-initialized", committed: false, pushed: false, message: "Local history is off for this project.", status: initial };
  const checkpoint = initial.clean
    ? { created: false, status: initial }
    : await checkpointProjectGit(projectRoot, autoSyncCheckpointName(options.now));
  const committed = checkpoint.created;
  let status = checkpoint.status;
  const result = (outcome: ProjectGitAutoSyncOutcome, message: string, pushed = false): ProjectGitAutoSyncResult => ({ outcome, committed, pushed, message, status });
  if (!status.remote) return result("local-only", committed ? "Autosaved a local checkpoint. Add a remote to push automatically." : "Local history is up to date.");
  if (!options.push) return result(committed ? "committed" : "current", committed ? "Autosaved a local checkpoint." : "Local history is up to date.");
  const fetched = await runGit(projectRoot, ["fetch", "--quiet", "origin"], { timeout: autoSyncNetworkTimeout });
  if (!fetched.ok) return result("offline", "Could not reach the remote. Reed will try again later.");
  status = await inspectProjectGit(projectRoot);
  const branch = status.branch ?? "main";
  const remoteBranch = await runGit(projectRoot, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`]);
  if (remoteBranch.ok && !status.upstream) {
    const behind = await runGit(projectRoot, ["rev-list", "--count", `HEAD..origin/${branch}`]);
    if (!behind.ok || Number(cleanOutput(behind.stdout)) > 0) return result("remote-ahead", `The remote ${branch} branch has commits this Mac does not. Review them in History before pushing.`);
  }
  if (status.behind > 0) return result("remote-ahead", `The remote has ${status.behind} newer ${status.behind === 1 ? "checkpoint" : "checkpoints"}. Review them in History; Reed will not overwrite them.`);
  if (status.upstream && status.ahead === 0) return result(committed ? "committed" : "current", committed ? "Autosaved a checkpoint." : "Everything is pushed.");
  const pushed = await runGit(projectRoot, ["push", "--set-upstream", "origin", `refs/heads/${branch}:refs/heads/${branch}`], { timeout: autoSyncNetworkTimeout });
  if (!pushed.ok) return result("push-failed", `Could not push: ${cleanOutput(pushed.stderr).split("\n").pop() || "the remote refused the push"}`);
  status = await inspectProjectGit(projectRoot);
  return result("pushed", "Autosaved and pushed.", true);
}
