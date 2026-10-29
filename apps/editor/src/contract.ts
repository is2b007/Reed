import type {
  BackupRecord,
  ConversationGraph,
  MutationRecord,
  ProjectGitAutoSyncOutcome,
  ProjectGitCheckpointResult,
  ProjectGitHubStatus,
  ProjectGitStatus,
  ProjectPullRequestHandoff,
  ProjectSnapshot,
  SearchResult,
  ValidationReport,
} from "@reed/core";
import type { RecentProject } from "./recent-projects.js";

export type WorkspaceId = "graph" | "beats" | "playtest" | "translation" | "characters" | "variables" | "validation" | "review" | "production" | "history" | "read";
export type ExportKind =
  | "project" | "pixel-single" | "pixel-partitioned" | "voice" | "screenplay"
  | "game-json" | "game-csv" | "unity-localization" | "godot"
  | "unreal-string-table" | "yarn-spinner" | "gettext" | "xliff-2.0";
export type SaveStateStatus = "saved" | "dirty" | "saving" | "error";
export interface SaveStateEvent { status: SaveStateStatus; at?: string; message?: string; }
export type AppearancePreference = "system" | "light" | "dark";
export interface AppearanceState { preference: AppearancePreference; resolved: "light" | "dark"; }
export type UpdateStatus = "idle" | "checking" | "current" | "available" | "downloading" | "installing" | "error";
export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  notes?: string;
  /** 0–1 while downloading. */
  progress?: number;
  message?: string;
  /** Off until the user turns it on: Reed then checks GitHub for releases at launch and twice a day. */
  autoCheck: boolean;
  lastCheckedAt?: string;
  /** False when this copy cannot replace itself (development build, disk image, unsupported platform). */
  canInstall: boolean;
}
export interface AutoSyncSettings {
  /** On by default: Reed commits the open story to its local Git history and pushes to origin when one is set. */
  enabled: boolean;
  intervalMinutes: number;
}
export interface AutoSyncState extends AutoSyncSettings {
  running: boolean;
  lastRunAt?: string;
  lastOutcome?: ProjectGitAutoSyncOutcome | "error";
  message?: string;
}
export type MenuCommand =
  | { type: "new-project" | "open-project" | "show-home" | "close-project" | "preferences" | "check-updates" | "project-settings" | "focus-search" | "toggle-navigator" | "toggle-inspector" | "create-backup" }
  | { type: "open-recent"; root: string }
  | { type: "workspace"; workspace: WorkspaceId }
  | { type: "export"; kind: ExportKind };

export interface EditorBootstrap {
  root: string;
  snapshot: ProjectSnapshot;
  validation: ValidationReport;
  lastChangeSequence: number;
}

export type MutationName =
  | "updateProject" | "createLevel" | "createScene" | "updateScene" | "createConversation" | "updateConversation" | "createPartition"
  | "addNode" | "linkNodes" | "unlinkNodes" | "updateNode" | "deleteNode"
  | "setNodeText" | "setLineStatus" | "setVoiceStatus"
  | "upsertCharacter" | "declareVariable" | "approveReview" | "createBackup";

export interface ReedDesktopApi {
  chooseProject(): Promise<string | null>;
  chooseNewProject(): Promise<string | null>;
  createProject(root: string, input: { name: string; slug: string; languages: string[]; defaultLanguage: string }): Promise<EditorBootstrap>;
  openProject(root: string): Promise<EditorBootstrap>;
  closeProject(): Promise<void>;
  getRecentProjects(): Promise<RecentProject[]>;
  forgetRecentProject(root: string): Promise<RecentProject[]>;
  clearRecentProjects(): Promise<RecentProject[]>;
  getBootstrap(): Promise<EditorBootstrap | null>;
  getConversation(id: string): Promise<ConversationGraph>;
  getChanges(afterSequence: number): Promise<MutationRecord[]>;
  mutate(name: MutationName, input: unknown): Promise<unknown>;
  validate(): Promise<ValidationReport>;
  findLines(filters: { query?: string; characterId?: string; tag?: string; status?: string; language?: string; missingLanguage?: string }): Promise<SearchResult[]>;
  getReviewDiff(): Promise<MutationRecord[]>;
  export(kind: ExportKind, options?: Record<string, unknown>): Promise<unknown>;
  getProjectGitStatus(): Promise<ProjectGitStatus>;
  initializeProjectGit(): Promise<ProjectGitCheckpointResult>;
  createProjectGitCheckpoint(message: string): Promise<ProjectGitCheckpointResult>;
  createProjectGitBranch(name: string): Promise<ProjectGitStatus>;
  prepareProjectPullRequest(input: { baseBranch: string; title: string; body?: string; pullRequestNumber?: number }): Promise<ProjectPullRequestHandoff>;
  setProjectGitRemote(url: string | null): Promise<ProjectGitStatus>;
  getProjectGitHubStatus(): Promise<ProjectGitHubStatus>;
  connectProjectGitHub(): Promise<ProjectGitHubStatus>;
  createProjectGitHubRepository(input: { name: string; description?: string; visibility: "private" | "public" | "internal" }): Promise<ProjectGitHubStatus>;
  connectProjectGitHubRepository(repository: string): Promise<ProjectGitHubStatus>;
  fetchProjectGitHub(): Promise<ProjectGitStatus>;
  pushProjectGitHub(): Promise<ProjectGitStatus>;
  createProjectGitHubPullRequest(input: { baseBranch: string; title: string; body?: string; draft?: boolean }): Promise<ProjectGitHubStatus>;
  reviewProjectGitHubPullRequest(input: { number: number; action: "approve" | "comment" | "request-changes"; body?: string }): Promise<ProjectGitHubStatus>;
  mergeProjectGitHubPullRequest(number: number, strategy: "merge" | "squash" | "rebase"): Promise<ProjectGitHubStatus>;
  getAppearance(): Promise<AppearanceState>;
  setAppearance(preference: AppearancePreference): Promise<AppearanceState>;
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<UpdateState>;
  installUpdate(): Promise<UpdateState>;
  setAutoUpdateCheck(enabled: boolean): Promise<UpdateState>;
  getAutoSyncState(): Promise<AutoSyncState>;
  setAutoSync(settings: Partial<AutoSyncSettings>): Promise<AutoSyncState>;
  runAutoSync(): Promise<AutoSyncState>;
  openUpdateRelease(): Promise<void>;
  revealInFinder(filePath: string): Promise<void>;
  listBackups(): Promise<BackupRecord[]>;
  restoreBackup(backupId: string, confirmation: string): Promise<EditorBootstrap>;
  setActiveWorkspace(workspace: WorkspaceId): Promise<void>;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
  onSaveState(listener: (event: SaveStateEvent) => void): () => void;
  onAppearanceChanged(listener: (state: AppearanceState) => void): () => void;
  onUpdateState(listener: (state: UpdateState) => void): () => void;
  onAutoSyncState(listener: (state: AutoSyncState) => void): () => void;
}

declare global {
  interface Window {
    reed: ReedDesktopApi;
  }
}
