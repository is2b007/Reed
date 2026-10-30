import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow,
  SelectionMode, useNodesState, type Connection, type Edge, type Node, type NodeProps,
  type OnConnectEnd, type ReactFlowInstance,
} from "@xyflow/react";
import type {
  BackupRecord, CharacterRecord, ConversationGraph, DialogueNodeRecord, MutationRecord, ProjectSnapshot,
  ProjectGitHubPullRequest, ProjectGitHubStatus, ProjectGitStatus, ProjectRecord, SceneRecord, SearchResult, ValidationIssue, ValidationReport, VariableRecord,
} from "@reed/core";
import { GAME_LANGUAGE_CATALOG, GAME_LANGUAGE_PRESET, canonicalizeLanguageCode, getLanguageDefinition, isLanguageCode } from "@reed/schema";
import type { AppearancePreference, AppearanceState, AutoSyncState, EditorBootstrap, ExportKind, MutationName, SaveStateEvent, UpdateState, WorkspaceId } from "./contract.js";
import type { RecentProject } from "./recent-projects.js";
import { conditionVariableNames, createPickerPosition, evaluatePlaytestCondition, globalShortcut, nextAppearancePreference, nextMenuIndex, nodeKindOptions, nodePositionForConnectionDrop, parseLanguageList, promptValueIsValid, speakerAccent, variableInitialValueLabel, type AddableNodeKind } from "./ui-logic.js";
import reedLogo from "../assets/reed-logo.png";

type Workspace = WorkspaceId;
interface CardData extends Record<string, unknown> { record: DialogueNodeRecord; speaker: string; speakerAccent: string; primary: string; secondary: string; onPath: boolean; }
type CardNode = Node<CardData, "dialogue">;
interface ConnectionCreatePicker {
  sourceNodeId: string;
  flowPosition: { x: number; y: number };
  anchor: { x: number; y: number };
  picker: { x: number; y: number };
  returnFocus: HTMLElement | null;
}

const workspaces: Array<{ id: Workspace; label: string; key: string }> = [
  { id: "graph", label: "Graph", key: "1" }, { id: "beats", label: "Beats", key: "2" },
  { id: "playtest", label: "Playtest", key: "3" }, { id: "translation", label: "Translation", key: "4" },
  { id: "characters", label: "Characters", key: "5" }, { id: "variables", label: "Variables", key: "0" },
  { id: "validation", label: "Validation", key: "6" },
  { id: "review", label: "Review", key: "7" }, { id: "production", label: "Export", key: "8" },
  { id: "history", label: "History", key: "" },
  { id: "read", label: "Read", key: "9" },
];
const primaryWorkspaces = workspaces.slice(0, 4);
const secondaryWorkspaceGroups = [
  { label: "Project", items: workspaces.filter((item) => item.id === "characters" || item.id === "variables") },
  { label: "Quality", items: workspaces.filter((item) => item.id === "validation" || item.id === "review") },
  { label: "Output", items: workspaces.filter((item) => item.id === "production" || item.id === "history" || item.id === "read") },
];
const secondaryWorkspaces = secondaryWorkspaceGroups.flatMap((group) => group.items);
const secondaryWorkspaceIndex = new Map(secondaryWorkspaces.map((workspace, index) => [workspace.id, index]));
const desktopPanelMedia = "(min-width: 901px)";
const workspaceIconProps = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const recentDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const appearanceOptions: Array<{ value: AppearancePreference; label: string; description: string }> = [
  { value: "system", label: "Automatic", description: "Follow this Mac’s current appearance." },
  { value: "light", label: "Light", description: "Use the bright production workspace." },
  { value: "dark", label: "Dark", description: "Use the low-light production workspace." },
];

function applyAppearance(state: AppearanceState): void {
  document.documentElement.dataset.theme = state.resolved;
  document.documentElement.dataset.appearance = state.preference;
}

function WorkspaceIcon({ workspace }: { workspace: Workspace }) {
  const content = (() => {
    if (workspace === "graph") return <><circle cx="5" cy="5" r="2" /><circle cx="19" cy="7" r="2" /><circle cx="12" cy="19" r="2" /><path d="M7 5.4 17 6.6M6.2 6.8l4.6 10.4M17.8 8.7l-4.6 8.5" /></>;
    if (workspace === "beats") return <><path d="M6 3v18M6 6h5M6 12h9M6 18h12" /><circle cx="6" cy="6" r="1.5" /><circle cx="6" cy="12" r="1.5" /><circle cx="6" cy="18" r="1.5" /></>;
    if (workspace === "playtest") return <><path d="m9 7 8 5-8 5V7Z" /><circle cx="12" cy="12" r="10" /></>;
    if (workspace === "translation") return <><path d="M4 5h9M8.5 3v2c0 4-2 7-5 9M6 10c1.5 1.8 3.2 3 5.2 3.8M14 19l3.2-8 3.2 8M15.2 16h4" /></>;
    if (workspace === "characters") return <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3.5 20c.5-4 2.4-6 5.5-6s5 2 5.5 6M14 15c3.6-.6 5.7 1 6.5 4" /></>;
    if (workspace === "variables") return <><path d="M8 4H5v6l-2 2 2 2v6h3M16 4h3v6l2 2-2 2v6h-3M10 9h4M10 15h4" /></>;
    if (workspace === "validation") return <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>;
    if (workspace === "review") return <><path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h6M9 16h4" /></>;
    if (workspace === "production") return <><path d="M4 8h16v12H4zM8 4h8v4M12 12v5M9.5 14.5 12 17l2.5-2.5" /></>;
    if (workspace === "history") return <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2M5.5 5.5 3 5v-2.5" /></>;
    return <><path d="M3 5c4-1 7 0 9 2v14c-2-2-5-3-9-2V5Zm18 0c-4-1-7 0-9 2v14c2-2 5-3 9-2V5Z" /></>;
  })();
  return <svg className="workspace-icon" viewBox="0 0 24 24" aria-hidden="true" {...workspaceIconProps}>{content}</svg>;
}

function HomeActionIcon({ action }: { action: "open" | "new" }) {
  return <svg className="home-action-icon" viewBox="0 0 24 24" aria-hidden="true" {...workspaceIconProps}>{action === "open"
    ? <><path d="M3.5 7.5h6l2-2h4l2 2h3v11h-17z" /><path d="M6 12h12M15 9l3 3-3 3" /></>
    : <><path d="M5 3.5h10l4 4v13H5zM15 3.5v4h4" /><path d="M12 10v7M8.5 13.5h7" /></>}</svg>;
}

function AppearanceCycleIcon({ preference }: { preference: AppearancePreference }) {
  return <span className="appearance-cycle-icon" aria-hidden="true">
    <svg className={preference === "system" ? "active" : ""} viewBox="0 0 24 24" {...workspaceIconProps}><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" stroke="none" opacity=".34" /><path d="M12 2v2M12 20v2" /></svg>
    <svg className={preference === "light" ? "active" : ""} viewBox="0 0 24 24" {...workspaceIconProps}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    <svg className={preference === "dark" ? "active" : ""} viewBox="0 0 24 24" {...workspaceIconProps}><path d="M19.5 15.2A8.5 8.5 0 0 1 8.8 4.5 8.5 8.5 0 1 0 19.5 15.2Z" /></svg>
  </span>;
}

function desktopPanelLayout(): boolean {
  return typeof window !== "undefined" && window.matchMedia(desktopPanelMedia).matches;
}

const DialogueCard = memo(({ data, selected }: NodeProps<CardNode>) => {
  const node = data.record;
  return <div className={`dialogue-card kind-${node.kind} status-${node.lineStatus} ${data.onPath ? "on-path" : ""} ${selected ? "selected" : ""}`} style={{ "--speaker-accent": data.speakerAccent } as React.CSSProperties}>
    <Handle type="target" position={Position.Left} />
    <div className="node-head"><span className="speaker"><i aria-hidden="true" />{node.kind === "start" ? "START" : data.speaker}</span><span className="status-chip">{node.lineStatus}</span></div>
    <div className="line-id">{node.lineId}</div>
    {node.kind === "start" ? <div className="group-label">Entry point</div> : node.kind === "group" ? <div className="group-label">Logic junction</div> : <>
      <div className="node-copy">{data.primary || "No text in primary language"}</div>
      {data.secondary && <div className="node-secondary">{data.secondary}</div>}
    </>}
    {node.conditions && <div className="condition"><span>VAR</span>if {node.conditions}</div>}
    <Handle type="source" position={Position.Right} />
  </div>;
});
DialogueCard.displayName = "DialogueCard";
const nodeTypes = { dialogue: DialogueCard };

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function validGitBranchName(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value)
    && !value.includes("..") && !value.includes("//") && !value.includes("@{")
    && !value.endsWith(".") && !value.endsWith("/") && !value.endsWith(".lock");
}
function SaveIndicator({ state, autoSync, project, github, onGitHub, onOpenHistory, onProjectChanged }: { state: SaveStateEvent; autoSync: AutoSyncState | null; project: ProjectRecord; github: ProjectGitHubStatus | null; onGitHub(status: ProjectGitHubStatus | null): void; onOpenHistory(): void; onProjectChanged(): Promise<void> }) {
  const [status, setStatus] = useState<ProjectGitStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState("");
  const [checkpointName, setCheckpointName] = useState("");
  const [repositoryInput, setRepositoryInput] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    try { setStatus(await window.reed.getProjectGitStatus()); setError(""); }
    catch (value) { setError(message(value)); }
  }, []);
  useEffect(() => { if (autoSync?.lastRunAt) void load(); }, [autoSync?.lastRunAt, load]);
  useEffect(() => { if (state.status !== "saving" && state.status !== "dirty") { const timer = window.setTimeout(() => { void load(); }, 450); return () => window.clearTimeout(timer); } return undefined; }, [load, state.at, state.status]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof globalThis.Node && !containerRef.current?.contains(event.target)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", closeOutside); window.addEventListener("keydown", closeEscape);
    return () => { window.removeEventListener("pointerdown", closeOutside); window.removeEventListener("keydown", closeEscape); };
  }, [open]);
  useEffect(() => { if (project.pullRequestProvider === "disabled") onGitHub(null); }, [onGitHub, project.pullRequestProvider]);
  const performGit = async (key: string, action: () => Promise<ProjectGitStatus>, success: string) => {
    setWorking(key); setError(""); setNotice("");
    try { setStatus(await action()); setNotice(success); return true; }
    catch (value) { setError(message(value)); return false; }
    finally { setWorking(""); }
  };
  const performGitHub = async (key: string, action: () => Promise<ProjectGitHubStatus>, success: string) => {
    setWorking(key); setError(""); setNotice("");
    try {
      const next = await action();
      onGitHub(next);
      setStatus(await window.reed.getProjectGitStatus());
      if (next.state === "connected") setNotice(success);
      return true;
    } catch (value) { setError(message(value)); return false; }
    finally { setWorking(""); }
  };
  const initialize = () => performGit("initialize", async () => (await window.reed.initializeProjectGit()).status, "Local history is ready.");
  const checkpoint = async () => {
    const label = checkpointName.trim();
    if (!label) return;
    await performGit("checkpoint", async () => (await window.reed.createProjectGitCheckpoint(label)).status, "Checkpoint created locally.");
    setCheckpointName("");
  };
  const enableGitHub = async () => {
    if (!status?.available) return;
    setWorking("enable-github"); setError(""); setNotice("");
    try {
      await window.reed.mutate("updateProject", { pullRequestProvider: "github", expectedVersion: project.version, source: "human" });
      await onProjectChanged();
      let nextGit = await window.reed.getProjectGitStatus();
      if (!nextGit.initialized) nextGit = (await window.reed.initializeProjectGit()).status;
      setStatus(nextGit);
      const nextGitHub = await window.reed.getProjectGitHubStatus();
      onGitHub(nextGitHub);
      setNotice(nextGitHub.state === "connected" ? "GitHub sync is enabled for this project." : "GitHub sync is enabled. Connect the account to continue.");
    } catch (value) { setError(message(value)); }
    finally { setWorking(""); }
  };
  const checkGitHub = () => performGitHub("check-github", () => window.reed.getProjectGitHubStatus(), "GitHub connection refreshed.");
  const connectGitHub = () => performGitHub("connect-github", () => window.reed.connectProjectGitHub(), "GitHub connected. Reed stores no token.");
  const connectRepository = async () => {
    if (await performGitHub("connect-repository", () => window.reed.connectProjectGitHubRepository(repositoryInput), "Repository connected.")) setRepositoryInput("");
  };
  const performGitSync = async (key: string, action: () => Promise<ProjectGitStatus>, success: string) => {
    setWorking(key); setError(""); setNotice("");
    try {
      const nextStatus = await action();
      setStatus(nextStatus);
      onGitHub(await window.reed.getProjectGitHubStatus());
      setNotice(success);
    } catch (value) { setError(message(value)); }
    finally { setWorking(""); }
  };
  const fetchGitHub = () => performGitSync("fetch", () => window.reed.fetchProjectGitHub(), "GitHub updates checked. The open story was not replaced.");
  const pushGitHub = () => performGitSync("push", async () => {
    if (!status?.clean) {
      const label = checkpointName.trim();
      if (!label) throw new Error("Name this checkpoint before pushing it to GitHub.");
      await window.reed.createProjectGitCheckpoint(label);
      setCheckpointName("");
    }
    return window.reed.pushProjectGitHub();
  }, status?.clean ? "Current checkpoint pushed to GitHub." : "Checkpoint created and pushed to GitHub.");
  const saveLabel = state.status === "saving" ? "Saving…" : state.status === "dirty" ? "Unsaved changes" : state.status === "error" ? "Save failed" : "Saved";
  const gitLabel = state.status !== "saved" || !status?.available ? "" : !status.initialized ? "History off" : status.clean ? status.branch ?? "main" : `${status.changes.length} not checkpointed`;
  const label = gitLabel ? `${saveLabel} · ${gitLabel}` : saveLabel;
  const savedTime = state.at ? new Date(state.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "on this Mac";
  const syncSummary = !status?.upstream ? "This branch has not been published yet."
    : status.behind > 0 ? `${status.behind} ${status.behind === 1 ? "update is" : "updates are"} available on GitHub. Open History to review safely.`
      : status.ahead > 0 ? `${status.ahead} local ${status.ahead === 1 ? "checkpoint is" : "checkpoints are"} ready to push.`
        : "Everything is up to date.";
  return <div className="save-git" ref={containerRef}>
    <button type="button" className={`save-indicator save-${state.status} ${status?.initialized && !status.clean ? "git-dirty" : ""}`} aria-expanded={open} title="Save, version history, and GitHub sync" onClick={() => { setOpen((value) => !value); if (!open) void load(); }}><i aria-hidden="true" /><span>{label}</span><b aria-hidden="true">⌄</b><span className="sr-only" role="status" aria-live="polite">{label}</span></button>
    {open && <section className="save-git-popover" aria-label="Save, version history, and GitHub sync"><header><div><strong>Saved locally</strong><span>Autosaved {savedTime}</span></div><button type="button" aria-label="Close save and sync" onClick={() => setOpen(false)}>×</button></header>
      {status?.initialized && autoSync && <p className={`save-git-autosync ${autoSync.lastOutcome === "error" || autoSync.lastOutcome === "push-failed" || autoSync.lastOutcome === "remote-ahead" ? "warning" : ""}`} role="status">{autoSyncSummary(autoSync)}</p>}
      {!status && !error && <p className="save-git-loading">Checking local history…</p>}
      {status && !status.available && <div className="save-git-empty"><strong>Git is not available</strong><p>{status.message}</p></div>}
      {status?.available && !status.initialized && <div className="save-git-empty"><strong>Local version history is off</strong><p>Create readable checkpoints of the story on this Mac. This never needs GitHub.</p><button type="button" disabled={Boolean(working)} onClick={() => void initialize()}>{working === "initialize" ? "Starting…" : "Set up local history"}</button></div>}
      {status?.initialized && <><div className="save-git-status"><div><span>Branch</span><strong>{status.branch}</strong></div><div><span>Checkpoint</span><strong className={status.clean ? "clean" : "dirty"}>{status.clean ? "Current" : `${status.changes.length} pending`}</strong></div>{status.remote && <div><span>Remote</span><strong>{status.githubRepository ?? status.remote}</strong></div>}</div>
        {!status.clean && <form className="save-git-checkpoint" onSubmit={(event) => { event.preventDefault(); void checkpoint(); }}><label htmlFor="quick-checkpoint">Checkpoint name</label><div><input id="quick-checkpoint" value={checkpointName} maxLength={200} placeholder="Describe this story change" onChange={(event) => setCheckpointName(event.target.value)} /><button type="submit" disabled={Boolean(working) || !checkpointName.trim()}>{working === "checkpoint" ? "Saving…" : "Create checkpoint"}</button></div></form>}</>}
      {status?.available && <section className="save-git-sync" aria-labelledby="quick-github-heading"><div className="save-git-section-heading"><div><span className="save-git-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24" {...workspaceIconProps}><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 7v10M8 7c1 0 2 .3 2.8 1.1l1.4 1.4c.8.8 1.8 1.1 3 1.1H16" /></svg></span><div><strong id="quick-github-heading">GitHub sync</strong><small>{project.pullRequestProvider === "github" ? autoSync?.enabled ? `Enabled · autosave pushes every ${autoSync.intervalMinutes} min` : "Enabled · network only when requested" : "Optional · currently off"}</small></div></div>{github?.username && <span>@{github.username}</span>}</div>
        {project.pullRequestProvider === "disabled" && <div className="save-git-connect-prompt"><strong>Connect this project to GitHub?</strong><p>Set up local history, then check this Mac’s GitHub connection. Reed never stores your token.</p><button type="button" className="primary" disabled={Boolean(working)} onClick={() => void enableGitHub()}>{working === "enable-github" ? "Setting up…" : "Set up GitHub sync"}</button></div>}
        {project.pullRequestProvider === "github" && !github && <div className="save-git-connect-prompt"><strong>Check the GitHub connection</strong><p>Nothing has contacted GitHub yet. Check the account only when you are ready to sync.</p><button type="button" className="primary" disabled={Boolean(working)} onClick={() => void checkGitHub()}>{working === "check-github" ? "Checking…" : "Check connection"}</button></div>}
        {(github?.state === "signed-out" || github?.state === "error") && <div className="save-git-connect-prompt warning"><strong>Reconnect GitHub</strong><p>{github.message} Reed copies a one-time code and opens GitHub. Paste the code there if asked; Reed keeps no credential.</p><button type="button" className="primary" disabled={Boolean(working)} onClick={() => void connectGitHub()}>{working === "connect-github" ? "Code copied · finish in browser…" : "Reconnect GitHub"}</button></div>}
        {github?.state === "offline" && <div className="save-git-connect-prompt warning"><strong>GitHub is offline</strong><p>{github.message}</p><button type="button" disabled={Boolean(working)} onClick={() => void checkGitHub()}>{working === "check-github" ? "Checking…" : "Try again"}</button></div>}
        {github?.state === "tool-missing" && <div className="save-git-connect-prompt warning"><strong>GitHub tooling is unavailable</strong><p>{github.message}</p></div>}
        {github?.state === "connected" && !github.repository && <div className="save-git-repository-setup"><strong>No repository connected</strong><p>Connect an existing GitHub repository here, or open the full workspace to create one.</p><form onSubmit={(event) => { event.preventDefault(); void connectRepository(); }}><label htmlFor="quick-github-repository">Repository</label><div><input id="quick-github-repository" value={repositoryInput} required maxLength={2000} placeholder="owner/repository" onChange={(event) => setRepositoryInput(event.target.value)} /><button type="submit" disabled={Boolean(working) || !status.initialized || !repositoryInput.trim()}>{working === "connect-repository" ? "Connecting…" : "Connect repository"}</button></div></form></div>}
        {github?.state === "connected" && github.repository && <div className="save-git-connected"><div className="save-git-repository"><div><strong>{github.repository}</strong><span>{status.upstream ? `${status.branch} → ${status.upstream}` : status.branch ?? "Local branch"}</span></div><span className="connected">Connected</span></div><div className="save-git-metrics"><span><b>{status.ahead}</b> ahead</span><span><b>{status.behind}</b> behind</span><span><b>{github.pullRequests.length}</b> open PRs</span></div><p className="save-git-sync-summary" role="status">{syncSummary}</p><div className="save-git-sync-actions"><button type="button" disabled={Boolean(working)} onClick={() => void fetchGitHub()}>{working === "fetch" ? "Checking…" : "Check for updates"}</button><button type="button" className="primary" disabled={Boolean(working) || status.behind > 0 || (!status.clean ? !checkpointName.trim() : Boolean(status.upstream && status.ahead === 0))} onClick={() => void pushGitHub()}>{working === "push" ? status.clean ? "Pushing…" : "Checkpointing…" : status.clean ? "Push to GitHub" : "Checkpoint & push"}</button></div><small>Checking updates refreshes branch indicators only; it never replaces the open SQLite story.</small></div>}
        {project.pullRequestProvider === "github" && <button type="button" className="save-git-next" onClick={() => { setOpen(false); onOpenHistory(); }}>Full GitHub &amp; PR workspace<span aria-hidden="true">→</span></button>}
      </section>}
      {notice && <p className="save-git-notice" role="status">{notice}</p>}{error && <p className="save-git-error" role="alert">{error}</p>}
    </section>}
  </div>;
}
function focusGraphNodeWhenReady(nodeId: string, remainingFrames = 120): void {
  const pickerOpen = Boolean(document.querySelector("dialog.connection-create-picker"));
  const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
  if (!pickerOpen && node && getComputedStyle(node).visibility !== "hidden") {
    node.focus();
    if (document.activeElement === node) return;
  }
  if (remainingFrames > 0) window.requestAnimationFrame(() => focusGraphNodeWhenReady(nodeId, remainingFrames - 1));
}
function validationIssueKey(issue: ValidationIssue): string { return [issue.code, issue.severity, issue.sceneId, issue.conversationId, issue.nodeId, issue.lineId, issue.language, issue.message].join("\u001f"); }

interface PromptConfig {
  title: string;
  label: string;
  description?: string;
  defaultValue?: string;
  confirmLabel?: string;
  danger?: boolean;
  requiredValue?: string;
  options?: Array<{ value: string; label: string }>;
}
type PromptRequest = (config: PromptConfig) => Promise<string | null>;
const PromptContext = React.createContext<PromptRequest | null>(null);

function ModalDialog({ labelledBy, onClose, children }: { labelledBy: string; onClose(): void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      const target = returnFocusRef.current;
      window.requestAnimationFrame(() => { if (target?.isConnected) target.focus(); });
    };
  }, []);
  return <dialog ref={dialogRef} className="modal-shell" aria-labelledby={labelledBy} onCancel={(event) => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}

function PromptDialog({ config, onFinish }: { config: PromptConfig; onFinish(value: string | null): void }) {
  const [value, setValue] = useState(config.defaultValue ?? config.options?.[0]?.value ?? "");
  const valid = promptValueIsValid(value, config.requiredValue);
  return <ModalDialog labelledBy="prompt-title" onClose={() => onFinish(null)}>
    <form className="prompt-dialog" onSubmit={(event) => { event.preventDefault(); if (valid) onFinish(value); }} onKeyDown={(event) => event.stopPropagation()}>
      <header><p className="eyebrow">Local project action</p><h2 id="prompt-title">{config.title}</h2>{config.description && <p>{config.description}</p>}</header>
      <label>{config.label}{config.options ? <select autoFocus value={value} onChange={(event) => setValue(event.target.value)}>{config.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} />}</label>
      {config.requiredValue !== undefined && <small>Enter the exact Line ID to enable deletion.</small>}
      <div className="prompt-actions"><button type="button" onClick={() => onFinish(null)}>Cancel</button><button type="submit" className={config.danger ? "danger" : "primary"} disabled={!valid}>{config.confirmLabel ?? "Continue"}</button></div>
    </form>
  </ModalDialog>;
}

function PromptProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<{ config: PromptConfig; resolve(value: string | null): void } | null>(null);
  const request = useCallback<PromptRequest>((config) => new Promise((resolve) => setActive({ config, resolve })), []);
  const finish = (value: string | null) => { active?.resolve(value); setActive(null); };
  return <PromptContext.Provider value={request}>{children}{active && <PromptDialog config={active.config} onFinish={finish} />}</PromptContext.Provider>;
}

function usePrompt(): PromptRequest {
  const request = React.useContext(PromptContext);
  if (!request) throw new Error("PromptProvider is missing");
  return request;
}

function languageOptionLabel(code: string): string {
  const language = getLanguageDefinition(code);
  if (!language) return code;
  return language.nativeName === language.englishName
    ? `${language.englishName} · ${code}`
    : `${language.englishName} · ${language.nativeName} · ${code}`;
}

function LanguageConfigurator({ languages, defaultLanguage, onLanguages, onDefaultLanguage, compact = false }: {
  languages: string[];
  defaultLanguage: string;
  onLanguages(languages: string[]): void;
  onDefaultLanguage(language: string): void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [customCode, setCustomCode] = useState("");
  const selected = new Set(languages.map((language) => language.toLowerCase()));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = normalizedQuery
    ? GAME_LANGUAGE_CATALOG.filter((language) => [language.code, language.englishName, language.nativeName].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
    : GAME_LANGUAGE_CATALOG;
  const set = (next: string[]) => {
    onLanguages(next);
    if (next.length > 0 && !next.includes(defaultLanguage)) onDefaultLanguage(next[0] ?? defaultLanguage);
  };
  const toggle = (code: string) => {
    if (selected.has(code.toLowerCase())) set(languages.filter((language) => language.toLowerCase() !== code.toLowerCase()));
    else set([...languages, code]);
  };
  const customCanonical = canonicalizeLanguageCode(customCode);
  const customValid = isLanguageCode(customCanonical) && !selected.has(customCanonical.toLowerCase());
  const addCustom = () => {
    if (!customValid) return;
    set([...languages, customCanonical]);
    setCustomCode("");
  };
  const applyGamePreset = () => set([...GAME_LANGUAGE_PRESET]);
  return <section className={`language-configurator ${compact ? "compact" : ""}`} aria-labelledby={compact ? "new-project-languages-heading" : "project-languages-heading"}>
    <div className="language-config-heading"><div><h4 id={compact ? "new-project-languages-heading" : "project-languages-heading"}>Project languages</h4><p>Use standard BCP 47 tags. The catalog starts with the major game-market languages, and custom tags remain available for dialects and constructed languages.</p></div><span>{languages.length} enabled</span></div>
    {languages.length > 0 && <div className="selected-languages" aria-label="Enabled languages">{languages.map((code) => <button type="button" key={code} title={`Remove ${languageOptionLabel(code)}`} onClick={() => toggle(code)}><span>{getLanguageDefinition(code)?.englishName ?? code}</span><code>{code}</code><b aria-hidden="true">×</b></button>)}</div>}
    <div className="language-config-actions"><label><span>Find a language</span><input type="search" value={query} placeholder="Name or tag…" onChange={(event) => setQuery(event.target.value)} /></label><button type="button" onClick={applyGamePreset}>Use game-market preset</button><button type="button" disabled={languages.length === 0} onClick={() => set([])}>Clear</button></div>
    <div className="language-catalog" role="group" aria-label="Language catalog">{visible.map((language) => {
      const checked = selected.has(language.code.toLowerCase());
      return <label key={language.code} className={checked ? "selected" : ""}><input type="checkbox" checked={checked} onChange={() => toggle(language.code)} /><span dir={language.direction}><strong>{language.englishName}</strong><small>{language.nativeName}</small></span><code>{language.code}</code></label>;
    })}</div>
    {visible.length === 0 && <p className="language-empty">No catalog matches. Add a valid custom tag below.</p>}
    <div className="language-custom"><label><span>Custom language tag</span><input value={customCode} placeholder="e.g. ga, x-fictional" aria-invalid={customCode.length > 0 && !customValid} onChange={(event) => setCustomCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } }} /></label><button type="button" disabled={!customValid} onClick={addCustom}>Add language</button></div>
    <label className="default-language">Default writing language<select value={defaultLanguage} disabled={languages.length === 0} onChange={(event) => onDefaultLanguage(event.target.value)}>{languages.map((language) => <option key={language} value={language}>{languageOptionLabel(language)}</option>)}</select></label>
  </section>;
}

function ProjectHome({ current, recentProjects, mode, appearance, onMode, onReady, onContinue, onRecentProjects, onAppearance }: { current: EditorBootstrap | null; recentProjects: RecentProject[]; mode: "idle" | "new"; appearance: AppearanceState; onMode(mode: "idle" | "new"): void; onReady(value: EditorBootstrap): void; onContinue(): void; onRecentProjects(projects: RecentProject[]): void; onAppearance(preference: AppearancePreference): Promise<void> }) {
  const [name, setName] = useState("Untitled dialogue");
  const [slug, setSlug] = useState("untitled-dialogue");
  const [languageList, setLanguageList] = useState("en, el, it, de, griko");
  const [defaultLanguage, setDefaultLanguage] = useState("en");
  const [error, setError] = useState("");
  const [appearanceWorking, setAppearanceWorking] = useState(false);
  const languages = parseLanguageList(languageList);
  const appearanceLabel = appearanceOptions.find((option) => option.value === appearance.preference)?.label ?? "Automatic";
  const nextAppearance = nextAppearancePreference(appearance.preference);
  const nextAppearanceLabel = appearanceOptions.find((option) => option.value === nextAppearance)?.label ?? "Automatic";
  const open = async () => {
    try { const root = await window.reed.chooseProject(); if (root) onReady(await window.reed.openProject(root)); } catch (value) { setError(message(value)); }
  };
  const openRecent = async (root: string) => {
    try { setError(""); onReady(await window.reed.openProject(root)); } catch (value) { setError(message(value)); }
  };
  const create = async () => {
    try {
      const root = await window.reed.chooseNewProject();
      if (root) onReady(await window.reed.createProject(root, { name, slug, languages, defaultLanguage }));
    } catch (value) { setError(message(value)); }
  };
  const cycleAppearance = async () => {
    setAppearanceWorking(true); setError("");
    try { await onAppearance(nextAppearance); } catch (value) { setError(message(value)); } finally { setAppearanceWorking(false); }
  };
  const canCreate = Boolean(name.trim() && /^[a-z0-9][a-z0-9-]{1,62}$/u.test(slug) && languages.length > 0 && languages.includes(defaultLanguage));
  const visibleRecent = recentProjects.filter((project) => project.root !== current?.root);
  const forget = async (root: string) => onRecentProjects(await window.reed.forgetRecentProject(root));
  return <main className="project-home">
    <header className="home-header"><div className="home-brand"><img src={reedLogo} alt="" /><span><b>Reed</b><small>Offline dialogue production</small></span></div><div className="home-header-actions"><button type="button" className="home-action appearance-cycle-button" disabled={appearanceWorking} aria-label={`Appearance: ${appearanceLabel}. Switch to ${nextAppearanceLabel}.`} title={`Appearance: ${appearanceLabel} · Switch to ${nextAppearanceLabel}`} onClick={() => void cycleAppearance()}><AppearanceCycleIcon preference={appearance.preference} /><span className="home-action-label">{appearanceLabel}</span></button><button type="button" className="home-action" title="Open a local Reed project" onClick={() => void open()}><HomeActionIcon action="open" /><span className="home-action-label">Open project</span></button><button type="button" className="home-action home-action-new primary" aria-expanded={mode === "new"} aria-controls="new-project-form" aria-label={mode === "new" ? "Close new project form" : "New project"} title={mode === "new" ? "Close new project form" : "Create a new local project"} onClick={() => onMode(mode === "new" ? "idle" : "new")}><HomeActionIcon action="new" /><span className="home-action-label">New project</span></button></div></header>
    <div className="home-layout"><section className="home-main" aria-labelledby="project-home-title"><p className="eyebrow">Project home</p><h1 id="project-home-title">Keep every branch under control.</h1><p className="home-intro">Move between local projects without closing Reed. Every edit, backup, and export stays on this Mac.</p>
      {current && <article className="current-project"><div className="current-project-mark" aria-hidden="true"><span>{current.snapshot.project.name.slice(0, 2).toUpperCase()}</span></div><div><p className="eyebrow">Open now</p><h2>{current.snapshot.project.name}</h2><p>{current.snapshot.project.languages.map((language) => language.toUpperCase()).join(" · ")} · v{current.snapshot.project.version}</p><code>{current.root}</code></div><button type="button" className="primary" onClick={onContinue}>Continue editing</button></article>}
      {mode === "new" && <section id="new-project-form" className="new-project" aria-labelledby="new-project-title"><div className="new-project-heading"><div><p className="eyebrow">New local project</p><h2 id="new-project-title">Project identity</h2></div><button type="button" aria-label="Cancel new project" onClick={() => onMode("idle")}>×</button></div><div className="metadata-grid"><label>Project name<input autoFocus value={name} onChange={(event) => { setName(event.target.value); setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} /></label><label>Stable slug<input value={slug} onChange={(event) => setSlug(event.target.value)} aria-describedby="new-project-slug-help" /></label></div><small id="new-project-slug-help">Used for local export filenames. Permanent Line IDs will not change later.</small><LanguageConfigurator compact languages={languages} defaultLanguage={defaultLanguage} onLanguages={(next) => setLanguageList(next.join(", "))} onDefaultLanguage={setDefaultLanguage} /><button type="button" className="primary" disabled={!canCreate} onClick={() => void create()}>Choose folder and create</button></section>}
      <section className="recent-projects" aria-labelledby="recent-projects-title"><div className="section-heading"><div><p className="eyebrow">On this Mac</p><h2 id="recent-projects-title">Recent projects</h2></div>{recentProjects.length > 0 && <button type="button" onClick={() => void window.reed.clearRecentProjects().then(onRecentProjects)}>Clear list</button>}</div>{visibleRecent.length > 0 ? <div className="recent-project-list">{visibleRecent.map((project) => <article key={project.root} className={!project.available ? "unavailable" : ""}><button type="button" className="recent-project-open" disabled={!project.available} onClick={() => void openRecent(project.root)}><span className="recent-project-monogram" aria-hidden="true">{project.name.slice(0, 2).toUpperCase()}</span><span><strong>{project.name}</strong><small>{project.languages.map((language) => language.toUpperCase()).join(" · ")} · {project.available ? `Opened ${recentDateFormatter.format(new Date(project.lastOpenedAt))}` : "Folder unavailable"}</small><code>{project.root}</code></span><span aria-hidden="true">→</span></button><button type="button" className="forget-project" aria-label={`Remove ${project.name} from recent projects`} onClick={() => void forget(project.root)}>×</button></article>)}</div> : <div className="home-empty"><p>No other recent projects.</p><span>Open a Reed folder and it will stay here for next time.</span></div>}</section>
      {error && <div className="error-banner" role="alert">{error}</div>}
    </section><aside className="home-aside"><div><p className="eyebrow">Local by default</p><h2>No account required.</h2><p>Projects, SQLite history, backups, MCP, and exports remain local. GitHub is optional per project and connects only for actions you initiate.</p></div><dl><div><dt>Project home</dt><dd>⇧⌘H</dd></div><div><dt>Open project</dt><dd>⌘O</dd></div><div><dt>New project</dt><dd>⌘N</dd></div><div><dt>Settings</dt><dd>⌘,</dd></div></dl></aside></div>
  </main>;
}

function ProjectSettingsDialog({ state, onClose, onSaved }: { state: EditorBootstrap; onClose(): void; onSaved(): Promise<void> }) {
  const project = state.snapshot.project;
  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(project.slug);
  const [languageList, setLanguageList] = useState(() => project.languages.join(", "));
  const [defaultLanguage, setDefaultLanguage] = useState(project.defaultLanguage);
  const [pullRequestProvider, setPullRequestProvider] = useState(project.pullRequestProvider);
  const [pullRequestBaseBranch, setPullRequestBaseBranch] = useState(project.pullRequestBaseBranch);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const languages = parseLanguageList(languageList);
  const validBranch = validGitBranchName(pullRequestBaseBranch);
  const valid = Boolean(name.trim() && /^[a-z0-9][a-z0-9-]{1,62}$/u.test(slug) && languages.length > 0 && languages.includes(defaultLanguage) && validBranch);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) { setError("Enter a name, a valid lowercase slug, and a default language included in the language list."); return; }
    try {
      setSaving(true); setError("");
      await window.reed.mutate("updateProject", { name, slug, languages, defaultLanguage, pullRequestProvider, pullRequestBaseBranch, expectedVersion: project.version, source: "human" });
      await onSaved(); onClose();
    } catch (value) { setError(message(value)); } finally { setSaving(false); }
  };
  return <ModalDialog labelledBy="project-settings-title" onClose={onClose}><form className="project-settings" onSubmit={(event) => void save(event)}><header><div><p className="eyebrow">Project settings</p><h2 id="project-settings-title">Identity, languages & collaboration</h2></div><button type="button" aria-label="Close project settings" onClick={onClose}>×</button></header><section className="settings-section" aria-labelledby="identity-settings-heading"><h3 id="identity-settings-heading">Identity</h3><div className="metadata-grid"><label>Project name<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label><label>Stable slug<input value={slug} maxLength={63} aria-describedby="project-slug-help" onChange={(event) => setSlug(event.target.value)} /></label></div><p id="project-slug-help" className="form-help">The slug controls local export filenames. Existing Line IDs and Pixel Crushers IDs remain permanent.</p></section><LanguageConfigurator languages={languages} defaultLanguage={defaultLanguage} onLanguages={(next) => setLanguageList(next.join(", "))} onDefaultLanguage={setDefaultLanguage} /><section className="settings-section" aria-labelledby="collaboration-settings-heading"><h3 id="collaboration-settings-heading">GitHub collaboration</h3><div className="metadata-grid"><label>GitHub<select value={pullRequestProvider} aria-describedby="pull-request-provider-help" onChange={(event) => setPullRequestProvider(event.target.value as ProjectRecord["pullRequestProvider"])}><option value="disabled">Off — fully offline</option><option value="github">On — network when requested</option></select></label><label>Pull request base branch<input value={pullRequestBaseBranch} maxLength={128} aria-invalid={!validBranch} aria-describedby="pull-request-base-help" onChange={(event) => setPullRequestBaseBranch(event.target.value)} /></label></div><p id="pull-request-provider-help" className="form-help">When on, Reed can sign in, create or connect repositories, fetch, push, review, and merge from the History workspace. With Git autosave on (Reed settings), checkpoints are also committed and pushed on a timer; it never force-pushes or overwrites newer remote work. Reed never stores your GitHub token.</p><p id="pull-request-base-help" className="form-help">Use the branch contributors should propose changes into, usually <code>main</code>. Remote PR merges do not silently replace the open SQLite story.</p></section><label>Project location<input value={state.root} readOnly aria-readonly="true" /></label><div className="project-settings-meta"><span>Schema {project.schemaVersion}</span><span>Project version {project.version}</span></div>{error && <div className="error-banner" role="alert">{error}</div>}<div className="metadata-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={saving || !valid}>{saving ? "Saving…" : "Save project settings"}</button></div></form></ModalDialog>;
}

function updateStatusText(update: UpdateState): string {
  if (update.status === "checking") return "Checking GitHub for a newer release…";
  if (update.status === "current") return "Up to date.";
  if (update.status === "available") return `Reed ${update.latestVersion} is available. You have ${update.currentVersion}.`;
  if (update.status === "downloading") return `Downloading Reed ${update.latestVersion}… ${Math.round((update.progress ?? 0) * 100)}%`;
  if (update.status === "installing") return update.message ?? "Installing…";
  if (update.status === "error") return update.message ?? "The update check failed.";
  return "Not checked yet.";
}

function SettingRow({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return <div className="pref-row"><div className="pref-row-text"><strong>{title}</strong>{description && <small>{description}</small>}</div>{children && <div className="pref-row-control">{children}</div>}</div>;
}

function SettingSwitch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange(checked: boolean): void }) {
  return <input type="checkbox" role="switch" className="pref-switch" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />;
}

function UpdateSettings({ update }: { update: UpdateState }) {
  const [error, setError] = useState("");
  const busy = update.status === "checking" || update.status === "downloading" || update.status === "installing";
  const act = (action: () => Promise<unknown>) => { setError(""); void action().catch((value) => setError(message(value))); };
  return <section className="pref-pane" aria-labelledby="update-settings-heading"><h3 id="update-settings-heading">Updates</h3>
    <SettingRow title={update.status === "available" ? `Reed ${update.latestVersion} is available` : `Reed ${update.currentVersion}`} description={<span role="status" className={update.status === "error" ? "bad" : undefined}>{update.status === "available" ? `You have ${update.currentVersion}.` : updateStatusText(update)}{update.releaseUrl && (update.status === "available" || update.status === "error") && <> <button type="button" className="pref-link" onClick={() => act(() => window.reed.openUpdateRelease())}>Release notes</button></>}</span>}>
      {update.status === "available"
        ? <button type="button" className="primary" disabled={!update.canInstall || busy} title={update.canInstall ? undefined : "This copy of Reed cannot replace itself. Download the update from the release page."} onClick={() => act(() => window.reed.installUpdate())}>Install and restart</button>
        : <button type="button" disabled={busy} onClick={() => act(() => window.reed.checkForUpdates())}>{update.status === "checking" ? "Checking…" : "Check for updates"}</button>}
    </SettingRow>
    {update.status === "downloading" && <progress max={1} value={update.progress ?? 0} aria-label="Update download progress" />}
    <SettingRow title="Check automatically" description="At launch and twice a day. Nothing installs without your OK."><SettingSwitch label="Check for updates automatically" checked={update.autoCheck} onChange={(checked) => act(() => window.reed.setAutoUpdateCheck(checked))} /></SettingRow>
    <p className="pref-note">Updates are checksum-verified and never touch your projects.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
  </section>;
}

const autoSyncIntervalOptions = [1, 5, 10, 15, 30, 60];

function autoSyncSummary(autoSync: AutoSyncState, inSettings = false): string {
  if (!autoSync.enabled) return inSettings ? "Off." : "Git autosave is off. Turn it on in Reed settings.";
  if (autoSync.running) return "Autosaving to Git…";
  const when = autoSync.lastRunAt ? ` · ${new Date(autoSync.lastRunAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
  return autoSync.message ? `${autoSync.message}${when}` : inSettings ? "Nothing autosaved yet in this session." : `Git autosave every ${autoSync.intervalMinutes} min.`;
}

function AutoSyncSettingsSection({ autoSync }: { autoSync: AutoSyncState }) {
  const [error, setError] = useState("");
  const act = (action: () => Promise<unknown>) => { setError(""); void action().catch((value) => setError(message(value))); };
  return <section className="pref-pane" aria-labelledby="autosync-settings-heading"><h3 id="autosync-settings-heading">Git autosave</h3>
    <SettingRow title="Commit and push automatically" description="Commits the open story to its local history on a timer, when you close it and when you quit, then pushes if the project has a remote."><SettingSwitch label="Commit and push automatically" checked={autoSync.enabled} onChange={(enabled) => act(() => window.reed.setAutoSync({ enabled }))} /></SettingRow>
    <SettingRow title="Interval" description="How often Reed commits while you work."><select aria-label="Autosave interval" value={autoSync.intervalMinutes} disabled={!autoSync.enabled} onChange={(event) => act(() => window.reed.setAutoSync({ intervalMinutes: Number(event.target.value) }))}>{autoSyncIntervalOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes === 1 ? "Every minute" : `Every ${minutes} minutes`}</option>)}</select></SettingRow>
    <SettingRow title="Last autosave" description={<span role="status" className={autoSync.lastOutcome === "error" || autoSync.lastOutcome === "push-failed" ? "bad" : undefined}>{autoSyncSummary(autoSync, true)}</span>}><button type="button" disabled={autoSync.running} onClick={() => act(() => window.reed.runAutoSync())}>{autoSync.running ? "Saving…" : "Commit and push now"}</button></SettingRow>
    <p className="pref-note">Edits always save locally. Reed never force-pushes.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
  </section>;
}

function UpdateBanner({ update, onOpen }: { update: UpdateState | null; onOpen(): void }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!update || !["available", "downloading", "installing"].includes(update.status) || dismissed === update.latestVersion) return null;
  return <aside className="update-banner" role="status"><span>{update.status === "available" ? `Reed ${update.latestVersion} is available.` : updateStatusText(update)}</span>{update.status === "available" && <><button type="button" className="primary" onClick={onOpen}>View update</button><button type="button" aria-label="Dismiss update notice" onClick={() => setDismissed(update.latestVersion ?? null)}>×</button></>}</aside>;
}

type PreferencesPane = "appearance" | "autosave" | "updates";

function PreferencesDialog({ appearance, update, autoSync, onAppearance, onClose }: { appearance: AppearanceState; update: UpdateState | null; autoSync: AutoSyncState | null; onAppearance(preference: AppearancePreference): Promise<void>; onClose(): void }) {
  const [error, setError] = useState("");
  const [pane, setPane] = useState<PreferencesPane>(update?.status === "available" ? "updates" : "appearance");
  const panes: Array<{ id: PreferencesPane; label: string; badge?: boolean }> = [
    { id: "appearance", label: "Appearance" },
    ...(autoSync ? [{ id: "autosave" as const, label: "Git autosave" }] : []),
    ...(update ? [{ id: "updates" as const, label: "Updates", badge: update.status === "available" }] : []),
  ];
  return <ModalDialog labelledBy="preferences-title" onClose={onClose}><section className="preferences-dialog">
    <nav className="pref-nav" aria-label="Settings sections"><h2 id="preferences-title">Settings</h2>
      {panes.map((item) => <button key={item.id} type="button" className={pane === item.id ? "active" : ""} aria-current={pane === item.id ? "page" : undefined} onClick={() => setPane(item.id)}>{item.label}{item.badge && <i className="pref-badge" aria-label="Update available" />}</button>)}
      {update && <span className="pref-version">Reed {update.currentVersion}</span>}
    </nav>
    <div className="pref-content">
      <button type="button" className="pref-close" aria-label="Close Reed settings" onClick={onClose}>×</button>
      {pane === "appearance" && <section className="pref-pane" aria-labelledby="appearance-settings-heading"><h3 id="appearance-settings-heading">Appearance</h3>
        <div className="pref-row pref-row-stack"><div className="pref-row-text"><strong>Theme</strong><small>Stored only on this Mac. Automatic follows macOS.</small></div>
          <div className="pref-themes" role="radiogroup" aria-label="Theme">{appearanceOptions.map((option) => <label key={option.value} className={appearance.preference === option.value ? "selected" : ""}><input type="radio" name="appearance" value={option.value} checked={appearance.preference === option.value} onChange={() => { setError(""); void onAppearance(option.value).catch((value) => setError(message(value))); }} /><span className={`pref-theme-preview ${option.value}`} aria-hidden="true"><i /><i /></span><span>{option.label}</span></label>)}</div>
        </div>
      </section>}
      {pane === "autosave" && autoSync && <AutoSyncSettingsSection autoSync={autoSync} />}
      {pane === "updates" && update && <UpdateSettings update={update} />}
      {error && <div className="error-banner" role="alert">{error}</div>}
    </div>
  </section></ModalDialog>;
}

function Navigator({ snapshot, selectedConversationId, open, onConversation, onScene, onProjectSettings, onClose }: { snapshot: ProjectSnapshot; selectedConversationId: string | null; open: boolean; onConversation(id: string): void; onScene(id: string): void; onProjectSettings(): void; onClose(): void }) {
  const [collapsedLevels, setCollapsedLevels] = useState<Set<string>>(() => new Set());
  const scenesByLevel = useMemo(() => {
    const index = new Map<string | null, SceneRecord[]>();
    for (const scene of snapshot.scenes) {
      const levelId = scene.levelId ?? null;
      const scenes = index.get(levelId);
      if (scenes) scenes.push(scene); else index.set(levelId, [scene]);
    }
    return index;
  }, [snapshot.scenes]);
  const toggleLevel = (levelId: string) => setCollapsedLevels((current) => {
    const next = new Set(current);
    if (next.has(levelId)) next.delete(levelId); else next.add(levelId);
    return next;
  });
  return <nav id="project-navigator" className={`navigator ${open ? "panel-open" : ""}`} aria-label="Project navigator">
    <div className="panel-title"><span>Project</span><kbd>⌘K</kbd><button type="button" className="panel-close" aria-label="Close project navigator" onClick={onClose}>×</button></div>
    <button type="button" className="project-name" onClick={onProjectSettings} title="Edit project settings"><i aria-hidden="true" /><span>{snapshot.project.name}</span><small>Settings…</small></button>
    {snapshot.levels.map((level) => { const expanded = !collapsedLevels.has(level.id); return <div className="tree-level" key={level.id}>
      <button type="button" className="tree-heading level" aria-expanded={expanded} onClick={() => toggleLevel(level.id)}><span className="disclosure" aria-hidden="true">⌄</span>{level.name}</button>
      {expanded && (scenesByLevel.get(level.id) ?? []).map((scene) => <SceneTree key={scene.id} sceneId={scene.id} snapshot={snapshot} selected={selectedConversationId} onConversation={onConversation} onScene={onScene} />)}
    </div>; })}
    {(scenesByLevel.get(null) ?? []).map((scene) => <SceneTree key={scene.id} sceneId={scene.id} snapshot={snapshot} selected={selectedConversationId} onConversation={onConversation} onScene={onScene} />)}
    {snapshot.scenes.length === 0 && <div className="panel-empty">No scenes yet.<br />Create the first beat from Beat map.</div>}
  </nav>;
}

function SceneTree({ sceneId, snapshot, selected, onConversation, onScene }: { sceneId: string; snapshot: ProjectSnapshot; selected: string | null; onConversation(id: string): void; onScene(id: string): void }) {
  const [expanded, setExpanded] = useState(true);
  const scene = snapshot.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) return null;
  const conversations: ConversationGraph[] = [];
  for (const conversation of snapshot.conversations) if (conversation.sceneId === scene.id) conversations.push(conversation);
  return <div className="tree-scene"><div className="tree-scene-row">
    <button type="button" className="tree-disclosure" aria-label={`${expanded ? "Collapse" : "Expand"} ${scene.name}`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span aria-hidden="true">⌄</span></button>
    <button type="button" className="tree-heading scene" aria-label={`Open ${scene.name} in Beat map`} onClick={() => onScene(scene.id)}><span>{scene.name}</span><small>{scene.beatRef}</small></button>
  </div>
    {expanded && conversations.map((conversation) => <button type="button" key={conversation.id} className={`tree-conversation ${selected === conversation.id ? "active" : ""}`} aria-current={selected === conversation.id ? "page" : undefined} onClick={() => onConversation(conversation.id)}><span>↳</span>{conversation.title}<em>v{conversation.version}</em></button>)}
  </div>;
}

function Inspector({ graph, node, primary, secondary, languages, characters, open, onMutated, onDirty, onClose }: { graph: ConversationGraph; node: DialogueNodeRecord | null; primary: string; secondary: string; languages: string[]; characters: CharacterRecord[]; open: boolean; onMutated(): Promise<void>; onDirty(): void; onClose(): void }) {
  if (!node) return <aside id="line-inspector" className={`inspector ${open ? "panel-open" : ""}`}><div className="panel-title"><span>Inspector</span><button type="button" className="panel-close" aria-label="Close inspector" onClick={onClose}>×</button></div><div className="panel-empty">Select a line to edit its text, production state, and logic.</div></aside>;
  return <InspectorForm key={`${node.id}-${node.updatedAt}-${primary}-${secondary}`} graph={graph} node={node} primary={primary} secondary={secondary} languages={languages} characters={characters} open={open} onMutated={onMutated} onDirty={onDirty} onClose={onClose} />;
}

function LanguageTextEditor({ language, role, secondary, node, value, onSave, onDirty }: { language: string; role: string; secondary?: boolean; node: DialogueNodeRecord; value: DialogueNodeRecord["texts"][number] | undefined; onSave(value: { text: string; menuText: string | null; verificationStatus: "unverified" | "native-verified" }): Promise<void>; onDirty(): void }) {
  type TextDraft = { text: string; menuText: string | null; verificationStatus: "unverified" | "native-verified" };
  const [text, setText] = useState(value?.text ?? "");
  const [menuText, setMenuText] = useState(value?.menuText ?? "");
  const [verificationStatus, setVerificationStatus] = useState<"unverified" | "native-verified">(value?.verificationStatus ?? "unverified");
  const [saving, setSaving] = useState(false);
  const [initialDraft] = useState<TextDraft>(() => ({ text: value?.text ?? "", menuText: value?.menuText ?? null, verificationStatus: value?.verificationStatus ?? "unverified" }));
  const [initialDraftSignature] = useState(() => JSON.stringify(initialDraft));
  const latestDraftRef = useRef<TextDraft>(initialDraft); const persistedDraftRef = useRef(initialDraftSignature); const savingRef = useRef(false); const onSaveRef = useRef(onSave);
  const changed = text !== (value?.text ?? "") || menuText !== (value?.menuText ?? "") || verificationStatus !== (value?.verificationStatus ?? "unverified");
  useEffect(() => { latestDraftRef.current = { text, menuText: menuText.trim() || null, verificationStatus }; onSaveRef.current = onSave; }, [text, menuText, verificationStatus, onSave]);
  const save = useCallback(async () => { if (!changed || savingRef.current) return; const draft = latestDraftRef.current; savingRef.current = true; setSaving(true); try { await onSave(draft); persistedDraftRef.current = JSON.stringify(draft); } finally { savingRef.current = false; setSaving(false); } }, [changed, onSave]);
  useEffect(() => { if (!changed || saving) return; const timer = window.setTimeout(() => { void save(); }, 800); return () => window.clearTimeout(timer); }, [changed, save, saving]);
  useEffect(() => () => { const draft = latestDraftRef.current; if (!savingRef.current && JSON.stringify(draft) !== persistedDraftRef.current) void onSaveRef.current(draft); }, []);
  return <div className={`language-editor ${secondary ? "secondary" : ""}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget instanceof Element ? event.relatedTarget : null)) void save(); }}><label className={`language-label ${secondary ? "secondary" : ""}`}><span>{language.toUpperCase()} · {role}</span><textarea aria-label={`${language.toUpperCase()} ${role} dialogue`} rows={secondary ? 4 : 5} value={text} onChange={(event) => { setText(event.target.value); onDirty(); }} /></label>
    <label>Menu label<input value={menuText} maxLength={2000} placeholder={node.kind === "choice" ? "Optional choice label" : "Optional playtest label"} onChange={(event) => { setMenuText(event.target.value); onDirty(); }} /></label>
    <label>Translation verification<select value={verificationStatus} onChange={(event) => { setVerificationStatus(event.target.value as "unverified" | "native-verified"); onDirty(); }}><option value="unverified">Unverified</option><option value="native-verified">Native verified</option></select></label>
    <small className="autosave-hint">{saving ? "Saving…" : changed ? "Saves after a short pause or when you leave this section" : "Saved automatically"}</small>
  </div>;
}

function InspectorForm({ graph, node, primary, secondary, languages, characters, open, onMutated, onDirty, onClose }: { graph: ConversationGraph; node: DialogueNodeRecord; primary: string; secondary: string; languages: string[]; characters: CharacterRecord[]; open: boolean; onMutated(): Promise<void>; onDirty(): void; onClose(): void }) {
  const [conditions, setConditions] = useState(node.conditions); const [sequence, setSequence] = useState(node.sequence);
  const [script, setScript] = useState(node.userScript); const [context, setContext] = useState(node.contextComment);
  const [terminal, setTerminal] = useState(node.isTerminal); const [contextPath, setContextPath] = useState(() => node.contextPath.join(", "));
  const [pronunciation, setPronunciation] = useState(node.pronunciation); const [voiceComment, setVoiceComment] = useState(node.voiceComment); const [tags, setTags] = useState(() => node.tags.join(", "));
  const [error, setError] = useState("");
  const mutate = useCallback(async (name: MutationName, input: Record<string, unknown>) => {
    try { setError(""); await window.reed.mutate(name, { ...input, expectedVersion: graph.version, source: "human" }); await onMutated(); }
    catch (value) { setError(message(value)); }
  }, [graph.version, onMutated]);
  const forceRework = useCallback(() => node.lineStatus === "final" ? window.confirm("This line is Final. Reopen it for rework?") : false, [node.lineStatus]);
  const logicChanged = conditions !== node.conditions || sequence !== node.sequence || script !== node.userScript || terminal !== node.isTerminal;
  const contextChanged = context !== node.contextComment || pronunciation !== node.pronunciation || voiceComment !== node.voiceComment || contextPath !== node.contextPath.join(", ") || tags !== node.tags.join(", ");
  useEffect(() => { if (!logicChanged) return; const timer = window.setTimeout(() => { void mutate("updateNode", { lineId: node.lineId, conditions, sequence, userScript: script, isTerminal: terminal, force: forceRework() }); }, 800); return () => window.clearTimeout(timer); }, [conditions, forceRework, logicChanged, mutate, node.lineId, sequence, script, terminal]);
  useEffect(() => { if (!contextChanged) return; const timer = window.setTimeout(() => { void mutate("updateNode", { lineId: node.lineId, contextComment: context, pronunciation, voiceComment, contextPath: contextPath.split(/[\s,]+/u).map((lineId) => lineId.trim()).filter(Boolean), tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), force: forceRework() }); }, 800); return () => window.clearTimeout(timer); }, [context, contextChanged, contextPath, forceRework, mutate, node.lineId, pronunciation, tags, voiceComment]);
  const saveText = (language: string, value: { text: string; menuText: string | null; verificationStatus: "unverified" | "native-verified" }) => mutate("setNodeText", { lineId: node.lineId, language, text: value.text, menuText: value.menuText, verificationStatus: value.verificationStatus, force: forceRework() });
  const deleteLine = () => {
    const finalWarning = node.lineStatus === "final" ? " This line is Final." : "";
    if (!window.confirm(`Delete line ${node.lineId}? This removes the node and its links.${finalWarning} A local backup is created automatically, and permanent IDs are never reused.`)) return;
    void mutate("deleteNode", { lineId: node.lineId, confirmation: node.lineId, force: node.lineStatus === "final" });
  };
  return <aside id="line-inspector" className={`inspector ${open ? "panel-open" : ""}`}>
    <div className="panel-title"><span>Line inspector</span><span className={`status-indicator status-${node.lineStatus}`}><span className="dot" aria-hidden="true" /><span>{node.lineStatus}</span></span><button type="button" className="panel-close" aria-label="Close inspector" onClick={onClose}>×</button></div>
    <section><div className="inspector-id">{node.lineId}<button type="button" onClick={() => navigator.clipboard.writeText(node.lineId)}>Copy</button></div>
      <div className="field-grid"><label>Speaker<select value={node.speakerCharacterId ?? ""} onChange={(event) => void mutate("updateNode", { lineId: node.lineId, speakerCharacterId: event.target.value || null, force: forceRework() })}><option value="">Unassigned</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
      <label>Listener<select value={node.listenerCharacterId ?? ""} onChange={(event) => void mutate("updateNode", { lineId: node.lineId, listenerCharacterId: event.target.value || null, force: forceRework() })}><option value="">Unassigned</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
      <label>Text status<select value={node.lineStatus} onChange={(event) => { const status = event.target.value; const force = status === "final"; if (force && !window.confirm("Mark this line Final?")) return; void mutate("setLineStatus", { lineId: node.lineId, status, force }); }}>{["placeholder", "draft", "polished", "edited", "final", "rework"].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Voice status<select value={node.voiceStatus} onChange={(event) => { const status = event.target.value; const force = status === "final"; if (force && !window.confirm("Mark this recording Final?")) return; void mutate("setVoiceStatus", { lineId: node.lineId, status, force }); }}>{["none", "placeholder", "recorded", "processed", "final", "rework"].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Spoken language<select value={node.spokenLanguage} onChange={(event) => void mutate("updateNode", { lineId: node.lineId, spokenLanguage: event.target.value, force: forceRework() })}>{languages.map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}</select></label>
      <label>Subtitle mode<select value={node.subtitleOverride} onChange={(event) => void mutate("updateNode", { lineId: node.lineId, subtitleOverride: event.target.value, force: forceRework() })}><option value="none">Normal</option><option value="forced">Forced subtitle</option></select></label></div>
    </section>
    {node.kind !== "start" && node.kind !== "group" && <section><LanguageTextEditor language={primary} role="primary" node={node} value={node.texts.find((value) => value.language === primary)} onSave={(value) => saveText(primary, value)} onDirty={onDirty} />
      {secondary !== primary && <LanguageTextEditor language={secondary} role="reference" secondary node={node} value={node.texts.find((value) => value.language === secondary)} onSave={(value) => saveText(secondary, value)} onDirty={onDirty} />}</section>}
    <details open><summary>Logic & sequence</summary><label>Conditions<textarea rows={3} className="code" value={conditions} onChange={(event) => { setConditions(event.target.value); onDirty(); }} /></label><label>Sequence<textarea rows={2} className="code" value={sequence} onChange={(event) => { setSequence(event.target.value); onDirty(); }} /></label><label>User script<textarea rows={2} className="code" value={script} onChange={(event) => { setScript(event.target.value); onDirty(); }} /></label><label className="inspector-checkbox"><input type="checkbox" checked={terminal} onChange={(event) => { setTerminal(event.target.checked); onDirty(); }} /><span>Deliberate endpoint</span></label><small className="autosave-hint">{logicChanged ? "Saves after a short pause" : "Saved automatically"}</small></details>
    <details><summary>Voice context</summary><label>Story context<textarea rows={3} value={context} placeholder="What is happening when this line is spoken?" onChange={(event) => { setContext(event.target.value); onDirty(); }} /></label><label>Pronunciation guide<textarea rows={2} value={pronunciation} placeholder="Phonetic spelling, stress, or language note for the actor" onChange={(event) => { setPronunciation(event.target.value); onDirty(); }} /></label><label>Performance direction<textarea rows={3} value={voiceComment} placeholder="Intention, pace, emotion, or delivery—without line readings" onChange={(event) => { setVoiceComment(event.target.value); onDirty(); }} /></label><label>Authored context path<input className="code" value={contextPath} placeholder="line-id, next-line-id" onChange={(event) => { setContextPath(event.target.value); onDirty(); }} /></label><label>Tags<input value={tags} onChange={(event) => { setTags(event.target.value); onDirty(); }} /></label><small className="autosave-hint">{contextChanged ? "Saves after a short pause" : "Saved automatically"}</small></details>
    {node.kind !== "start" && <button type="button" className="danger-action" onClick={deleteLine}>Delete line…</button>}
    {error && <div className="error-banner" role="alert">{error}</div>}
  </aside>;
}

function GraphWorkspace({ graph, snapshot, selectedNodeId, onSelect, onMutated, primary, secondary }: { graph: ConversationGraph | null; snapshot: ProjectSnapshot; selectedNodeId: string | null; onSelect(id: string): void; onMutated(): Promise<void>; primary: string; secondary: string }) {
  const [graphError, setGraphError] = useState("");
  const [connectionCreate, setConnectionCreate] = useState<ConnectionCreatePicker | null>(null);
  const [creatingConnectedNode, setCreatingConnectedNode] = useState(false);
  const graphWorkspaceRef = useRef<HTMLDivElement>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance<CardNode, Edge> | null>(null);
  const connectionCreateRef = useRef<HTMLDialogElement>(null);
  const firstConnectionCreateOptionRef = useRef<HTMLButtonElement>(null);
  const characters = useMemo(() => new Map(snapshot.characters.map((character) => [character.id, { name: character.name, accent: speakerAccent(character.numericId) }])), [snapshot.characters]);
  const nodeById = useMemo(() => new Map(graph?.nodes.map((node) => [node.id, node]) ?? []), [graph]);
  const linksByOrigin = useMemo(() => {
    const index = new Map<string, ConversationGraph["links"]>();
    for (const link of graph?.links ?? []) {
      const links = index.get(link.originNodeId);
      if (links) links.push(link); else index.set(link.originNodeId, [link]);
    }
    return index;
  }, [graph]);
  const pathIds = useMemo(() => {
    const ids = new Set<string>(); if (!graph || !selectedNodeId) return ids;
    const start = graph.nodes.find((node) => node.kind === "start"); if (!start) return ids;
    const parent = new Map<string, string>(); const queue = [start.id]; const seen = new Set(queue);
    while (queue.length) { const origin = queue.shift(); if (!origin) break; for (const edge of linksByOrigin.get(origin) ?? []) if (!seen.has(edge.destinationNodeId)) { seen.add(edge.destinationNodeId); parent.set(edge.destinationNodeId, origin); queue.push(edge.destinationNodeId); } }
    let current: string | undefined = selectedNodeId; while (current) { ids.add(current); current = parent.get(current); } return ids;
  }, [graph, selectedNodeId, linksByOrigin]);
  const graphNodes = useMemo<CardNode[]>(() => graph?.nodes.map((node) => ({ id: node.id, type: "dialogue", position: { x: node.x, y: node.y }, selected: node.id === selectedNodeId,
    data: { record: node, speaker: node.speakerCharacterId ? characters.get(node.speakerCharacterId)?.name ?? "Unknown" : "Unassigned", speakerAccent: node.kind === "start" ? "#b6cb78" : node.speakerCharacterId ? characters.get(node.speakerCharacterId)?.accent ?? "#818d84" : "#818d84", primary: node.texts.find((value) => value.language === primary)?.text ?? "", secondary: node.texts.find((value) => value.language === secondary)?.text ?? "", onPath: pathIds.has(node.id) },
  })) ?? [], [graph, selectedNodeId, characters, primary, secondary, pathIds]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>(graphNodes);
  useEffect(() => setNodes(graphNodes), [graphNodes, setNodes]);
  useEffect(() => setConnectionCreate(null), [graph?.id]);
  useEffect(() => {
    if (!connectionCreate) return;
    const dialog = connectionCreateRef.current;
    if (dialog && !dialog.open) dialog.show();
    const focusFrame = window.requestAnimationFrame(() => firstConnectionCreateOptionRef.current?.focus());
    const closeOutside = (event: PointerEvent) => { if (!connectionCreateRef.current?.contains(event.target as globalThis.Node)) setConnectionCreate(null); };
    window.addEventListener("pointerdown", closeOutside);
    return () => { if (dialog?.open) dialog.close(); window.cancelAnimationFrame(focusFrame); window.removeEventListener("pointerdown", closeOutside); };
  }, [connectionCreate]);
  const selectedCount = nodes.filter((node) => node.selected).length;
  const edges = useMemo<Edge[]>(() => graph?.links.map((link) => ({ id: link.id, source: link.originNodeId, target: link.destinationNodeId,
    label: nodeById.get(link.destinationNodeId)?.conditions.slice(0, 42),
    style: pathIds.has(link.originNodeId) && pathIds.has(link.destinationNodeId) ? { stroke: "#b6cb78", strokeWidth: 3 } : { stroke: "#526057", strokeWidth: 1.5 },
  })) ?? [], [graph, pathIds, nodeById]);
  const connect = async (connection: Connection) => { if (!connection.source || !connection.target || !graph) return; await window.reed.mutate("linkNodes", { originNodeId: connection.source, destinationNodeId: connection.target, expectedVersion: graph.version, source: "human", force: false }); await onMutated(); };
  const closeConnectionCreate = (restoreFocus: boolean) => {
    const returnFocus = connectionCreate?.returnFocus;
    setConnectionCreate(null);
    if (restoreFocus) window.requestAnimationFrame(() => { if (returnFocus?.isConnected) returnFocus.focus(); });
  };
  const finishConnection: OnConnectEnd = (event, connectionState) => {
    if (!graph || connectionState.fromHandle?.type !== "source" || !connectionState.fromNode || connectionState.toNode) return;
    const clientPoint = "changedTouches" in event && event.changedTouches[0]
      ? { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
      : { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
    const target = document.elementFromPoint(clientPoint.x, clientPoint.y);
    if (!target?.closest(".react-flow__pane") || target.closest(".react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__minimap, .graph-tools")) return;
    const bounds = graphWorkspaceRef.current?.getBoundingClientRect();
    const instance = reactFlowInstanceRef.current;
    if (!bounds || !instance) return;
    const anchor = { x: clientPoint.x - bounds.left, y: clientPoint.y - bounds.top };
    setConnectionCreate({
      sourceNodeId: connectionState.fromNode.id,
      flowPosition: instance.screenToFlowPosition(clientPoint, { snapToGrid: true, snapGrid: [16, 16] }),
      anchor,
      picker: createPickerPosition(anchor, { width: bounds.width, height: bounds.height }),
      returnFocus: document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null,
    });
  };
  const createConnectedNode = async (kind: AddableNodeKind) => {
    if (!graph || !connectionCreate || creatingConnectedNode) return;
    setCreatingConnectedNode(true); setGraphError("");
    const position = nodePositionForConnectionDrop(connectionCreate.flowPosition, kind);
    let createdNodeId: string | null = null;
    try {
      const added = await window.reed.mutate("addNode", { conversationId: graph.id, kind, text: "", x: position.x, y: position.y, expectedVersion: graph.version, source: "human" }) as { version: number; value?: { id?: string } };
      const nodeId = added.value?.id;
      if (!nodeId) throw new Error("Reed created the node without returning its ID.");
      await window.reed.mutate("linkNodes", { originNodeId: connectionCreate.sourceNodeId, destinationNodeId: nodeId, expectedVersion: added.version, source: "human", force: false });
      createdNodeId = nodeId;
      await onMutated(); onSelect(nodeId);
    } catch (value) {
      setGraphError(message(value)); await onMutated();
    } finally {
      setCreatingConnectedNode(false); setConnectionCreate(null);
      const nodeIdToFocus = createdNodeId;
      if (nodeIdToFocus) window.requestAnimationFrame(() => focusGraphNodeWhenReady(nodeIdToFocus));
    }
  };
  const add = async (kind: "line" | "choice" | "group") => {
    if (!graph) return;
    const result = await window.reed.mutate("addNode", { conversationId: graph.id, kind, text: "", x: 300 + graph.nodes.length * 36, y: 160 + (graph.nodes.length % 4) * 150, expectedVersion: graph.version, source: "human" }) as { value?: { id?: string } };
    await onMutated();
    if (result.value?.id) onSelect(result.value.id);
  };
  const beforeDelete = async ({ nodes: requestedNodes, edges: requestedEdges }: { nodes: CardNode[]; edges: Edge[] }) => {
    if (!graph) return false;
    setGraphError("");
    const records = requestedNodes.map((node) => nodeById.get(node.id)).filter((record): record is DialogueNodeRecord => Boolean(record) && record?.kind !== "start");
    const startSelected = requestedNodes.some((node) => nodeById.get(node.id)?.kind === "start");
    if (requestedNodes.length > 0) {
      if (records.length === 0) {
        window.alert("The START node cannot be deleted.");
        return false;
      }
      const finalCount = records.filter((record) => record.lineStatus === "final").length;
      const subject = records.length === 1 ? `line ${records[0]?.lineId}` : `${records.length} selected nodes`;
      const finalWarning = finalCount > 0 ? ` ${finalCount} selected ${finalCount === 1 ? "line is" : "lines are"} Final.` : "";
      const startWarning = startSelected ? " The START node will be kept." : "";
      if (!window.confirm(`Delete ${subject}? This removes the selected ${records.length === 1 ? "node" : "nodes"} and their links.${finalWarning}${startWarning} A local backup is created automatically, and permanent IDs are never reused.`)) return false;
      let expectedVersion = graph.version;
      try {
        for (const record of records) {
          const result = await window.reed.mutate("deleteNode", { lineId: record.lineId, confirmation: record.lineId, expectedVersion, source: "human", force: record.lineStatus === "final" }) as { version: number };
          expectedVersion = result.version;
        }
        await onMutated();
      } catch (value) {
        setGraphError(message(value));
        await onMutated();
      }
      return false;
    }
    const links = requestedEdges.map((edge) => graph.links.find((link) => link.id === edge.id)).filter((link): link is ConversationGraph["links"][number] => Boolean(link));
    if (links.length === 0) return false;
    const touchesFinal = links.some((link) => graph.nodes.some((node) => (node.id === link.originNodeId || node.id === link.destinationNodeId) && node.kind !== "start" && node.lineStatus === "final"));
    const subject = links.length === 1 ? "this dialogue link" : `${links.length} selected dialogue links`;
    if (!window.confirm(`Remove ${subject}?${touchesFinal ? " The selection touches Final content." : ""} A local backup is created automatically.`)) return false;
    let expectedVersion = graph.version;
    try {
      for (const link of links) {
        const result = await window.reed.mutate("unlinkNodes", { linkId: link.id, expectedVersion, source: "human", force: touchesFinal }) as { version: number };
        expectedVersion = result.version;
      }
      await onMutated();
    } catch (value) {
      setGraphError(message(value));
      await onMutated();
    }
    return false;
  };
  const persistPositions = async (movedNodes: CardNode[]) => {
    if (!graph) return;
    const changed: Array<{ moved: CardNode; record: DialogueNodeRecord }> = [];
    for (const moved of movedNodes) {
      const record = nodeById.get(moved.id);
      if (record && (record.x !== moved.position.x || record.y !== moved.position.y)) changed.push({ moved, record });
    }
    if (changed.length === 0) return;
    setGraphError("");
    let expectedVersion = graph.version;
    try {
      for (const { moved, record } of changed) {
        const result = await window.reed.mutate("updateNode", { lineId: record.lineId, x: moved.position.x, y: moved.position.y, expectedVersion, source: "human", force: record.lineStatus === "final" }) as { version: number };
        expectedVersion = result.version;
      }
      await onMutated();
    } catch (value) {
      setGraphError(message(value));
      await onMutated();
    }
  };
  if (!graph) return <div className="workspace-empty"><h2>Select a conversation</h2><p>The graph, playtest, and translation workspaces follow the same selection.</p></div>;
  return <div ref={graphWorkspaceRef} className="graph-workspace"><div className="graph-tools" aria-label="Add dialogue node"><span className="graph-tools-label">Add</span>{nodeKindOptions.map((option) => <React.Fragment key={option.kind}><button type="button" className="node-kind-tool" data-help={`${option.label} — ${option.description}`} aria-describedby={`node-kind-help-${option.kind}`} onClick={() => void add(option.kind)}>{option.label}</button><span className="sr-only" id={`node-kind-help-${option.kind}`}>{option.description}</span></React.Fragment>)}<small>{selectedCount > 0 ? `${selectedCount} selected · Delete selected · Drag a connector to empty space to create · Two-finger pan` : "Drag to select · Drag a connector to empty space to create · Two-finger pan"}</small></div>{graphError && <div className="graph-error error-banner" role="alert">{graphError}</div>}<ReactFlow<CardNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} proOptions={{ hideAttribution: true }} fitView minZoom={0.2} maxZoom={1.8} onInit={(instance) => { reactFlowInstanceRef.current = instance; }} onNodesChange={onNodesChange} selectionOnDrag selectionMode={SelectionMode.Partial} panOnDrag={[1, 2]} panOnScroll panOnScrollSpeed={1} zoomOnScroll={false} zoomOnPinch panActivationKeyCode="Space" multiSelectionKeyCode={["Meta", "Control", "Shift"]} deleteKeyCode={["Backspace", "Delete"]} onNodeClick={(event, node) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey) onSelect(node.id); }} onConnect={(value) => void connect(value)} onConnectEnd={finishConnection} onClickConnectEnd={finishConnection} onBeforeDelete={(elements) => beforeDelete(elements)} onNodeDragStop={(_event, _moved, movedNodes) => void persistPositions(movedNodes)}>
    <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334038" /><Controls position="bottom-right" /><MiniMap pannable zoomable nodeColor={(node) => pathIds.has(node.id) ? "#b6cb78" : String(node.data.speakerAccent ?? "#344139")} /></ReactFlow>
    {connectionCreate && <><span className="connection-create-anchor" aria-hidden="true" style={{ left: connectionCreate.anchor.x, top: connectionCreate.anchor.y }} /><dialog ref={connectionCreateRef} className="connection-create-picker" aria-labelledby="connection-create-title" aria-describedby="connection-create-hint" aria-busy={creatingConnectedNode} style={{ left: connectionCreate.picker.x, top: connectionCreate.picker.y }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeConnectionCreate(true); } }}><header><div><p className="eyebrow">Connect & create</p><h3 id="connection-create-title">What belongs here?</h3></div><button type="button" aria-label="Cancel node creation" onClick={() => closeConnectionCreate(true)}>×</button></header><p id="connection-create-hint">Reed will place it here and connect it from <code>{nodeById.get(connectionCreate.sourceNodeId)?.lineId ?? "the source node"}</code>.</p><div className="connection-create-options">{nodeKindOptions.map((option, index) => <button ref={index === 0 ? firstConnectionCreateOptionRef : undefined} type="button" key={option.kind} disabled={creatingConnectedNode} onClick={() => void createConnectedNode(option.kind)}><span aria-hidden="true">{option.symbol}</span><span><strong>{option.label}</strong><small>{option.description}</small></span></button>)}</div></dialog></>}
  </div>;
}

function ConversationEditor({ conversation, open, onOpen, onClose, onConversation, onSaved }: { conversation: ConversationGraph; open: boolean; onOpen(): void; onClose(): void; onConversation(): void; onSaved(): Promise<void> }) {
  const [title, setTitle] = useState(conversation.title);
  const [description, setDescription] = useState(conversation.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reset = () => { setTitle(conversation.title); setDescription(conversation.description); setError(""); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true); setError("");
      await window.reed.mutate("updateConversation", { id: conversation.id, title, description, expectedVersion: conversation.version, source: "human" });
      await onSaved(); onClose();
    } catch (value) { setError(message(value)); } finally { setSaving(false); }
  };
  return <div className={`conversation-row ${open ? "editing" : ""}`}><button type="button" className="conversation-open" onClick={onConversation}><span><strong>{conversation.title}</strong>{conversation.description && <small>{conversation.description}</small>}</span><em>{conversation.nodes.length - 1} lines</em></button><button type="button" className="conversation-edit" onClick={open ? () => { reset(); onClose(); } : onOpen}>{open ? "Cancel" : "Edit"}</button>
    {open && <form className="metadata-form conversation-form" onSubmit={(event) => void save(event)}><label>Conversation title<input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Conversation description<textarea rows={3} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>{error && <div className="error-banner" role="alert">{error}</div>}<div className="metadata-actions"><button type="button" onClick={() => { reset(); onClose(); }}>Cancel</button><button className="primary" type="submit" disabled={saving || !title.trim()}>{saving ? "Saving…" : "Save conversation"}</button></div></form>}
  </div>;
}

function SceneEditor({ scene, conversations, projectVersion, editingConversationId, onEditConversation, onConversation, refresh }: { scene: SceneRecord; conversations: ConversationGraph[]; projectVersion: number; editingConversationId: string | null; onEditConversation(id: string | null): void; onConversation(id: string): void; refresh(): Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(scene.name);
  const [beatRef, setBeatRef] = useState(scene.beatRef);
  const [sortOrder, setSortOrder] = useState(scene.sortOrder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reset = () => { setName(scene.name); setBeatRef(scene.beatRef); setSortOrder(scene.sortOrder); setError(""); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true); setError("");
      await window.reed.mutate("updateScene", { id: scene.id, name, beatRef, sortOrder, expectedVersion: projectVersion, source: "human" });
      await refresh(); setEditing(false);
    } catch (value) { setError(message(value)); } finally { setSaving(false); }
  };
  return <div className="scene-editor"><div className="scene-heading"><div><h3>{scene.name}</h3><p>{scene.beatRef || "No beat reference"}</p></div><button type="button" onClick={editing ? () => { reset(); setEditing(false); } : () => setEditing(true)}>{editing ? "Cancel" : "Edit scene"}</button></div>
    {editing && <form className="metadata-form scene-form" onSubmit={(event) => void save(event)}><div className="metadata-grid"><label>Scene name<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Display order<input type="number" min={0} step={1} value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></label></div><label>Local beat reference<input maxLength={300} placeholder="Obsidian note, path, or beat ID" value={beatRef} onChange={(event) => setBeatRef(event.target.value)} /></label><small>The scene slug and Line ID prefix stay permanent.</small>{error && <div className="error-banner" role="alert">{error}</div>}<div className="metadata-actions"><button type="button" onClick={() => { reset(); setEditing(false); }}>Cancel</button><button className="primary" type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save scene"}</button></div></form>}
    <div className="scene-conversations">{conversations.map((conversation) => <ConversationEditor key={`${conversation.id}-${conversation.updatedAt}`} conversation={conversation} open={editingConversationId === conversation.id} onOpen={() => onEditConversation(conversation.id)} onClose={() => onEditConversation(null)} onConversation={() => onConversation(conversation.id)} onSaved={refresh} />)}</div>
  </div>;
}

function BeatMap({ snapshot, onConversation, refresh }: { snapshot: ProjectSnapshot; onConversation(id: string): void; refresh(): Promise<void> }) {
  const prompt = usePrompt();
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const addScene = async () => { const name = await prompt({ title: "Add scene", label: "Scene name", confirmLabel: "Create scene" }); if (!name) return; const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `scene-${snapshot.scenes.length + 1}`; try { setError(""); await window.reed.mutate("createScene", { name, slug, beatRef: "", sortOrder: snapshot.scenes.length, expectedVersion: snapshot.project.version, source: "human" }); await refresh(); } catch (value) { setError(message(value)); } };
  const addConversation = async (sceneId: string) => { const title = await prompt({ title: "Add conversation", label: "Conversation title", confirmLabel: "Create conversation" }); if (!title) return; try { setError(""); const result = await window.reed.mutate("createConversation", { sceneId, title, description: "", expectedVersion: snapshot.project.version, source: "human" }) as { value?: { id?: string } }; await refresh(); if (result.value?.id) setEditingConversationId(result.value.id); } catch (value) { setError(message(value)); } };
  return <div className="beat-map"><header><div><p className="eyebrow">Story structure</p><h2>Beat map</h2></div><button type="button" className="primary" onClick={() => void addScene()}>Add scene</button></header>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="beat-track">{snapshot.scenes.map((scene, index) => <article key={`${scene.id}-${scene.updatedAt}`}><span className="beat-index">{String(index + 1).padStart(2, "0")}</span><div><SceneEditor scene={scene} conversations={snapshot.conversations.filter((conversation) => conversation.sceneId === scene.id)} projectVersion={snapshot.project.version} editingConversationId={editingConversationId} onEditConversation={setEditingConversationId} onConversation={onConversation} refresh={refresh} /><button type="button" className="add-inline" onClick={() => void addConversation(scene.id)}>+ Conversation</button></div></article>)}</div>
  </div>;
}

function Playtest({ graph, snapshot, language }: { graph: ConversationGraph | null; snapshot: ProjectSnapshot; language: string }) {
  const start = graph?.nodes.find((node) => node.kind === "start"); const [currentId, setCurrentId] = useState(start?.id ?? ""); const [path, setPath] = useState<Array<{ nodeId: string; visitId: number }>>([]); const nextVisitId = useRef(0);
  const initialConditions = useMemo(() => Object.fromEntries(snapshot.variables.map((variable) => [variable.name, variable.initialValue])), [snapshot.variables]);
  const [conditionValues, setConditionValues] = useState<Record<string, string | number | boolean>>(initialConditions);
  useEffect(() => { setCurrentId(start?.id ?? ""); setPath([]); }, [graph?.id, start?.id]);
  useEffect(() => { setConditionValues(initialConditions); }, [initialConditions]);
  if (!graph || !start) return <div className="workspace-empty">Select a conversation to playtest.</div>;
  const current = graph.nodes.find((node) => node.id === currentId) ?? start; const outgoing = graph.links.filter((link) => link.originNodeId === current.id).sort((a, b) => a.priority - b.priority);
  const choose = (id: string) => { const visitId = nextVisitId.current++; setPath((value) => [...value, { nodeId: current.id, visitId }]); setCurrentId(id); };
  const speaker = current.speakerCharacterId ? snapshot.characters.find((character) => character.id === current.speakerCharacterId)?.name : "";
  return <div className="playtest"><aside><h3>Run conditions</h3>{snapshot.variables.map((variable) => <label key={variable.id}>{variable.name}<input type={variable.type === "boolean" ? "checkbox" : variable.type === "number" ? "number" : "text"} checked={variable.type === "boolean" ? Boolean(conditionValues[variable.name]) : undefined} value={variable.type !== "boolean" ? String(conditionValues[variable.name] ?? "") : undefined} onChange={(event) => setConditionValues((values) => ({ ...values, [variable.name]: variable.type === "boolean" ? event.target.checked : variable.type === "number" ? Number(event.target.value) : event.target.value }))} /></label>)}<h3>Path</h3>{path.map((entry, index) => <button type="button" key={entry.visitId} onClick={() => { setCurrentId(entry.nodeId); setPath((value) => value.slice(0, index)); }}>{graph.nodes.find((node) => node.id === entry.nodeId)?.lineId}</button>)}</aside>
    <main><p className="eyebrow">Text-only run · {graph.title}</p><div className="play-line"><span>{speaker}</span><p>{current.kind === "start" ? "Begin conversation" : current.texts.find((value) => value.language === language)?.text || "No text"}</p></div><div className="choices">{outgoing.map((link) => { const target = graph.nodes.find((node) => node.id === link.destinationNodeId); const condition = evaluatePlaytestCondition(target?.conditions ?? "", conditionValues); return <button type="button" key={link.id} disabled={!condition.allowed} onClick={() => { if (condition.allowed) choose(link.destinationNodeId); }}><span>{target?.texts.find((value) => value.language === language)?.menuText || target?.texts.find((value) => value.language === language)?.text || "Continue"}</span>{target?.conditions && <small>{condition.supported ? condition.allowed ? "Condition met" : "Gated" : "Unsupported condition"} · {target.conditions}</small>}</button>; })}{outgoing.length === 0 && <div className="end-marker">End of path</div>}</div><button type="button" className="reset" onClick={() => { setCurrentId(start.id); setPath([]); }}>Restart</button></main></div>;
}

function Translation({ graph, snapshot, primary, secondary, onSelect }: { graph: ConversationGraph | null; snapshot: ProjectSnapshot; primary: string; secondary: string; onSelect(id: string): void }) {
  if (!graph) return <div className="workspace-empty">Select a conversation to translate.</div>;
  const authoredNodes: DialogueNodeRecord[] = [];
  for (const node of graph.nodes) if (node.kind !== "start" && node.kind !== "group") authoredNodes.push(node);
  const characterNames = new Map(snapshot.characters.map((character) => [character.id, character.name]));
  const cells: React.ReactNode[] = [];
  for (const node of authoredNodes) {
    cells.push(<button type="button" className="tr-key" key={`${node.id}-key`} onClick={() => onSelect(node.id)}><code>{node.lineId}</code><span>{node.speakerCharacterId ? characterNames.get(node.speakerCharacterId) ?? "Unassigned" : "Unassigned"}</span></button>);
    for (const language of snapshot.project.languages) {
      const value = node.texts.find((text) => text.language === language);
      cells.push(<button type="button" className={`tr-cell ${value?.text ? "covered" : "missing"}`} key={`${node.id}-${language}`} onClick={() => onSelect(node.id)}>{value?.text || `Missing ${language}`}<small>{value?.verificationStatus === "native-verified" ? "✓ Native verified" : "Unverified"}</small></button>);
    }
  }
  return <div className="translation"><header><div><p className="eyebrow">Coverage matrix</p><h2>{graph.title}</h2></div><span>{authoredNodes.length} authored lines</span></header><div className="translation-grid"><div className="tr-head">Line / speaker</div>{snapshot.project.languages.map((language) => <div className={`tr-head ${language === primary || language === secondary ? "active" : ""}`} key={language}>{language.toUpperCase()}</div>)}{cells}</div></div>;
}

interface CharacterDraft {
  name: string;
  displayNames: Record<string, string>;
  isPlayer: boolean;
  portraitPath: string;
  description: string;
  actorNotes: string;
  voiceNotes: string;
}

function characterDraft(character?: CharacterRecord): CharacterDraft {
  return character ? {
    name: character.name, displayNames: character.displayNames, isPlayer: character.isPlayer,
    portraitPath: character.portraitPath ?? "", description: character.description,
    actorNotes: character.actorNotes, voiceNotes: character.voiceNotes,
  } : { name: "", displayNames: {}, isPlayer: false, portraitPath: "", description: "", actorNotes: "", voiceNotes: "" };
}

function CharacterFields({ value, languages, autoFocus, onChange }: { value: CharacterDraft; languages: string[]; autoFocus?: boolean; onChange(value: CharacterDraft): void }) {
  const update = <Key extends keyof CharacterDraft>(key: Key, next: CharacterDraft[Key]) => onChange({ ...value, [key]: next });
  return <><div className="metadata-grid"><label>Character name<input autoFocus={autoFocus} value={value.name} required maxLength={120} onChange={(event) => update("name", event.target.value)} /></label><label className="checkbox-label"><input type="checkbox" checked={value.isPlayer} onChange={(event) => update("isPlayer", event.target.checked)} /> Player character</label></div>
    <label>Character description<textarea rows={3} maxLength={8000} value={value.description} onChange={(event) => update("description", event.target.value)} /></label>
    <div className="metadata-grid">{languages.map((language) => <label key={language}>Display name · {language.toUpperCase()}<input value={value.displayNames[language] ?? ""} maxLength={200} onChange={(event) => update("displayNames", { ...value.displayNames, [language]: event.target.value })} /></label>)}</div>
    <div className="metadata-grid"><label>Actor direction<textarea rows={3} maxLength={8000} value={value.actorNotes} onChange={(event) => update("actorNotes", event.target.value)} /></label><label>Voice notes<textarea rows={3} maxLength={8000} value={value.voiceNotes} onChange={(event) => update("voiceNotes", event.target.value)} /></label></div>
    <label>Local portrait path<input value={value.portraitPath} maxLength={1000} placeholder="Optional file path" onChange={(event) => update("portraitPath", event.target.value)} /></label></>;
}

function CharacterCreateDialog({ languages, projectVersion, onClose, onCreated }: { languages: string[]; projectVersion: number; onClose(): void; onCreated(): Promise<void> }) {
  const [draft, setDraft] = useState<CharacterDraft>(() => characterDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const { name, displayNames, isPlayer, portraitPath, description, actorNotes, voiceNotes } = draft;
    try {
      setSaving(true); setError("");
      await window.reed.mutate("upsertCharacter", { name, displayNames, isPlayer, portraitPath: portraitPath.trim() || null, description, actorNotes, voiceNotes, expectedVersion: projectVersion, source: "human" });
      await onCreated(); onClose();
    } catch (value) { setError(message(value)); } finally { setSaving(false); }
  };
  return <ModalDialog labelledBy="character-create-title" onClose={onClose}><form className="prompt-dialog character-create-dialog metadata-form" onSubmit={(event) => void save(event)} onKeyDown={(event) => event.stopPropagation()}>
    <header><p className="eyebrow">Cast registry</p><h2 id="character-create-title">Add character details</h2><p>Create the complete cast record now. You can still edit every field later.</p></header>
    <CharacterFields value={draft} languages={languages} autoFocus onChange={setDraft} />
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="prompt-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={saving || !draft.name.trim()}>{saving ? "Creating…" : "Create character"}</button></div>
  </form></ModalDialog>;
}

function CharacterEditor({ character, languages, projectVersion, lineCount, open, onOpen, onClose, onSaved }: { character: CharacterRecord; languages: string[]; projectVersion: number; lineCount: number; open: boolean; onOpen(): void; onClose(): void; onSaved(): Promise<void> }) {
  const [draft, setDraft] = useState<CharacterDraft>(() => characterDraft(character));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reset = () => { setDraft(characterDraft(character)); setError(""); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const { name, displayNames, isPlayer, portraitPath, description, actorNotes, voiceNotes } = draft;
    try {
      setSaving(true); setError("");
      await window.reed.mutate("upsertCharacter", { id: character.id, name, displayNames, isPlayer, portraitPath: portraitPath.trim() || null, description, actorNotes, voiceNotes, expectedVersion: projectVersion, source: "human" });
      await onSaved(); onClose();
    } catch (value) { setError(message(value)); } finally { setSaving(false); }
  };
  return <article className={`character-card ${open ? "editing" : ""}`} style={{ "--speaker-accent": speakerAccent(character.numericId) } as React.CSSProperties}>
    <div className="avatar">{character.name.slice(0, 2).toUpperCase()}</div>
    <div className="character-content"><div className="registry-card-heading"><div><h3>{character.name}{character.isPlayer && <span>Player</span>}</h3><p>{character.description || "No character description"}</p><small>Actor ID {character.numericId} · {lineCount} lines</small></div><button type="button" onClick={open ? () => { reset(); onClose(); } : onOpen}>{open ? "Cancel" : "Edit"}</button></div>
      {open && <form className="metadata-form" onSubmit={(event) => void save(event)}>
        <CharacterFields value={draft} languages={languages} autoFocus onChange={setDraft} />
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="metadata-actions"><button type="button" onClick={() => { reset(); onClose(); }}>Cancel</button><button className="primary" type="submit" disabled={saving || !draft.name.trim()}>{saving ? "Saving…" : "Save character"}</button></div>
      </form>}
    </div>
  </article>;
}

function VariableEditor({ variable, projectVersion, usageCount, open, onOpen, onClose, onSaved }: { variable: VariableRecord; projectVersion: number; usageCount: number; open: boolean; onOpen(): void; onClose(): void; onSaved(): Promise<void> }) {
  const initialEditorValue = () => variable.type === "boolean" ? Boolean(variable.initialValue) : String(variable.initialValue);
  const [type, setType] = useState<VariableRecord["type"]>(variable.type);
  const [initialValue, setInitialValue] = useState<string | boolean>(initialEditorValue);
  const [description, setDescription] = useState(variable.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reset = () => { setType(variable.type); setInitialValue(initialEditorValue()); setDescription(variable.description); setError(""); };
  const changeType = (next: VariableRecord["type"]) => { setType(next); setInitialValue(next === "boolean" ? false : next === "number" ? "0" : ""); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedInitialValue = type === "boolean" ? Boolean(initialValue) : type === "number" ? Number(initialValue) : String(initialValue);
    if (type === "number" && (String(initialValue).trim() === "" || !Number.isFinite(parsedInitialValue))) { setError("Enter a valid number."); return; }
    try {
      setSaving(true); setError("");
      await window.reed.mutate("declareVariable", { name: variable.name, type, initialValue: parsedInitialValue, description, expectedVersion: projectVersion, source: "human" });
      await onSaved(); onClose();
    } catch (value) { setError(message(value)); } finally { setSaving(false); }
  };
  return <article className={`variable-card type-${variable.type} ${open ? "editing" : ""}`}><div className="variable-card-summary"><span className="variable-type-mark" aria-hidden="true">{variable.type === "boolean" ? "B" : variable.type === "number" ? "#" : "T"}</span><div className="variable-identity"><code>{variable.name}</code><small>{variable.type} · Variable ID {variable.numericId}</small></div><div className="variable-initial"><small>Initial value</small><strong>{variableInitialValueLabel(variable.type, variable.initialValue)}</strong></div><p>{variable.description || "No description yet"}</p><span className="variable-usage">{usageCount} condition {usageCount === 1 ? "reference" : "references"}</span><button type="button" onClick={open ? () => { reset(); onClose(); } : onOpen}>{open ? "Cancel" : "Edit"}</button></div>
    {open && <form className="metadata-form" onSubmit={(event) => void save(event)}><div className="metadata-grid"><label>Variable name<input value={variable.name} readOnly aria-readonly="true" /></label><label>Type<select value={type} onChange={(event) => changeType(event.target.value as VariableRecord["type"])}><option value="boolean">Boolean</option><option value="number">Number</option><option value="text">Text</option></select></label></div>
      <label>Initial value{type === "boolean" ? <span className="checkbox-control"><input type="checkbox" checked={Boolean(initialValue)} onChange={(event) => setInitialValue(event.target.checked)} />{Boolean(initialValue) ? "True" : "False"}</span> : <input type={type === "number" ? "number" : "text"} value={String(initialValue)} onChange={(event) => setInitialValue(event.target.value)} />}</label>
      <label>Variable description<textarea rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="metadata-actions"><button type="button" onClick={() => { reset(); onClose(); }}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save variable"}</button></div>
    </form>}
  </article>;
}

function Characters({ snapshot, refresh }: { snapshot: ProjectSnapshot; refresh(): Promise<void> }) {
  const [creatingCharacter, setCreatingCharacter] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const add = () => setCreatingCharacter(true);
  const lineCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const conversation of snapshot.conversations) for (const node of conversation.nodes) if (node.speakerCharacterId) counts.set(node.speakerCharacterId, (counts.get(node.speakerCharacterId) ?? 0) + 1);
    return counts;
  }, [snapshot.conversations]);
  return <div className="characters"><header><div><p className="eyebrow">Cast registry</p><h2>Characters</h2><p className="workspace-description">Stable actor identities, localized display names, performance context, and speaker accents.</p></div><button type="button" className="primary" onClick={add}>Add character</button></header><div className="speaker-legend" aria-label="Character speaker colors">{snapshot.characters.map((character) => <span key={character.id} style={{ "--speaker-accent": speakerAccent(character.numericId) } as React.CSSProperties}><i aria-hidden="true" />{character.name}</span>)}</div><div className="character-list">{snapshot.characters.map((character) => <CharacterEditor key={`${character.id}-${character.updatedAt}`} character={character} languages={snapshot.project.languages} projectVersion={snapshot.project.version} lineCount={lineCounts.get(character.id) ?? 0} open={editingCharacterId === character.id} onOpen={() => setEditingCharacterId(character.id)} onClose={() => setEditingCharacterId(null)} onSaved={refresh} />)}</div>{creatingCharacter && <CharacterCreateDialog languages={snapshot.project.languages} projectVersion={snapshot.project.version} onClose={() => setCreatingCharacter(false)} onCreated={refresh} />}</div>;
}

function Variables({ snapshot, refresh }: { snapshot: ProjectSnapshot; refresh(): Promise<void> }) {
  const prompt = usePrompt();
  const [editingVariableName, setEditingVariableName] = useState<string | null>(null);
  const addVariable = async () => { const name = await prompt({ title: "Add variable", label: "Variable name", description: "Use the same stable name referenced by Pixel Crushers conditions.", confirmLabel: "Choose type" }); if (!name) return; const requested = await prompt({ title: `Set type for ${name}`, label: "Variable type", confirmLabel: "Create variable", options: [{ value: "boolean", label: "Boolean" }, { value: "number", label: "Number" }, { value: "text", label: "Text" }] }); if (!requested) return; const initialValue = requested === "boolean" ? false : requested === "number" ? 0 : ""; const result = await window.reed.mutate("declareVariable", { name, type: requested, initialValue, description: "", expectedVersion: snapshot.project.version, source: "human" }) as { value?: { name?: string } }; await refresh(); if (result.value?.name) setEditingVariableName(result.value.name); };
  const usageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const conversation of snapshot.conversations) for (const node of conversation.nodes) for (const name of conditionVariableNames(node.conditions)) counts.set(name, (counts.get(name) ?? 0) + 1);
    return counts;
  }, [snapshot.conversations]);
  const typeCounts = useMemo(() => ({
    boolean: snapshot.variables.filter((variable) => variable.type === "boolean").length,
    number: snapshot.variables.filter((variable) => variable.type === "number").length,
    text: snapshot.variables.filter((variable) => variable.type === "text").length,
  }), [snapshot.variables]);
  return <div className="variables-workspace"><header><div><p className="eyebrow">Condition contract</p><h2>Variables</h2><p className="workspace-description">Declared values available to dialogue conditions, playtest state, and Pixel Crushers exports.</p></div><button type="button" className="primary" onClick={() => void addVariable()}>Add variable</button></header><div className="variable-overview" aria-label={`${snapshot.variables.length} declared variables`}><span><b>{snapshot.variables.length}</b>Total</span><span><b>{typeCounts.boolean}</b>Boolean</span><span><b>{typeCounts.number}</b>Number</span><span><b>{typeCounts.text}</b>Text</span></div>{snapshot.variables.length ? <div className="variable-list">{snapshot.variables.map((variable) => <VariableEditor key={`${variable.id}-${variable.updatedAt}`} variable={variable} projectVersion={snapshot.project.version} usageCount={usageCounts.get(variable.name) ?? 0} open={editingVariableName === variable.name} onOpen={() => setEditingVariableName(variable.name)} onClose={() => setEditingVariableName(null)} onSaved={refresh} />)}</div> : <div className="registry-empty"><h3>No variables declared</h3><p>Add the first condition variable before referencing it in dialogue logic.</p><button type="button" onClick={() => void addVariable()}>Add variable</button></div>}</div>;
}

function Validation({ report, onJump }: { report: ValidationReport; onJump(issue: ValidationIssue): Promise<void> }) {
  const [severity, setSeverity] = useState<"all" | "error" | "warning">("all"); const issues = report.issues.filter((issue) => severity === "all" || issue.severity === severity);
  return <div className="validation"><header><div><p className="eyebrow">Preflight</p><h2>{report.valid ? "Ready to export" : `${report.errors} errors need attention`}</h2></div><div className="segmented"><button type="button" className={severity === "all" ? "active" : ""} onClick={() => setSeverity("all")}>All {report.issues.length}</button><button type="button" className={severity === "error" ? "active" : ""} onClick={() => setSeverity("error")}>Errors {report.errors}</button><button type="button" className={severity === "warning" ? "active" : ""} onClick={() => setSeverity("warning")}>Warnings {report.warnings}</button></div></header><div className="issue-list">{issues.map((issue) => <button type="button" key={validationIssueKey(issue)} onClick={() => void onJump(issue)}><span className={`severity ${issue.severity}`}>{issue.severity === "error" ? "!" : "△"}</span><div><code>{issue.code}</code><p>{issue.message}</p><small>{[issue.lineId, issue.language].filter(Boolean).join(" · ")}</small></div><em>Jump →</em></button>)}</div></div>;
}

function Review({ refresh }: { refresh(): Promise<void> }) {
  const prompt = usePrompt();
  const [changes, setChanges] = useState<MutationRecord[]>([]); useEffect(() => { void window.reed.getReviewDiff().then(setChanges); }, []);
  const approve = async () => { const label = await prompt({ title: "Approve review", label: "Snapshot name", description: "This records the current reviewed state locally.", confirmLabel: "Approve & snapshot" }); if (!label) return; await window.reed.mutate("approveReview", { label }); setChanges([]); await refresh(); };
  return <div className="review"><header><div><p className="eyebrow">Since last approval</p><h2>{changes.length ? `${changes.length} changes to review` : "Review inbox is clear"}</h2></div>{changes.length > 0 && <button type="button" className="primary" onClick={() => void approve()}>Approve & snapshot</button>}</header><div className="change-list">{changes.map((change) => <article key={change.sequence}><span>{change.sequence}</span><div><code>{change.operation}</code><p>{JSON.stringify(change.changes, null, 2)}</p><small>{change.source} · v{change.baseVersion} → v{change.newVersion}</small></div></article>)}</div></div>;
}

interface ExportFeedback { status: "working" | "success" | "error"; title: string; detail: string; paths: string[]; }
function exportedPaths(value: unknown): string[] {
  if (typeof value === "string") return value.startsWith("/") ? [value] : [];
  if (!value || typeof value !== "object") return [];
  const paths: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && (key === "filePath" || key.endsWith("Path"))) paths.push(child);
    else if (Array.isArray(child)) for (const entry of child) paths.push(...exportedPaths(entry));
  }
  return [...new Set(paths)];
}

function Production({ snapshot, validation, request, onRequestHandled }: { snapshot: ProjectSnapshot; validation: ValidationReport; request: { kind: ExportKind; id: number } | null; onRequestHandled(): void }) {
  const [feedback, setFeedback] = useState<ExportFeedback | null>(null);
  const [voiceLanguage, setVoiceLanguage] = useState(snapshot.project.defaultLanguage);
  const [voiceCharacter, setVoiceCharacter] = useState("all");
  const [voicePreset, setVoicePreset] = useState<"ready" | "pickups" | "all">("ready");
  const handledRequestRef = useRef<number | null>(null);
  const voiceSelection = useMemo(() => {
    const readyLineStatuses = ["polished", "edited", "final"];
    const lineStatuses = voicePreset === "all" ? undefined : readyLineStatuses;
    const voiceStatuses = voicePreset === "ready" ? ["none", "placeholder", "rework"] : voicePreset === "pickups" ? ["rework"] : undefined;
    const lineStatusSet = lineStatuses ? new Set(lineStatuses) : null;
    const voiceStatusSet = voiceStatuses ? new Set(voiceStatuses) : null;
    const nodes = snapshot.conversations.flatMap((conversation) => conversation.nodes.map((node) => ({ node, conversation })));
    const selected = nodes.filter(({ node }) => node.kind !== "start" && node.kind !== "group"
      && (voiceCharacter === "all" || node.speakerCharacterId === voiceCharacter)
      && (!lineStatusSet || lineStatusSet.has(node.lineStatus))
      && (!voiceStatusSet || voiceStatusSet.has(node.voiceStatus)));
    const missing = selected.filter(({ node }) => !node.texts.find((entry) => entry.language === voiceLanguage)?.text.trim());
    const words = selected.reduce((total, { node }) => {
      const text = node.texts.find((entry) => entry.language === voiceLanguage)?.text.trim() ?? "";
      return total + (text ? text.split(/\s+/u).length : 0);
    }, 0);
    return { selected, missing, words, lineStatuses, voiceStatuses };
  }, [snapshot.conversations, voiceCharacter, voiceLanguage, voicePreset]);
  const productionStats = useMemo(() => {
    const stats = new Map<string, { lines: number; words: number }>();
    for (const character of snapshot.characters) stats.set(character.id, { lines: 0, words: 0 });
    for (const { node } of voiceSelection.selected) {
      if (!node.speakerCharacterId) continue;
      const characterStats = stats.get(node.speakerCharacterId); if (!characterStats) continue;
      characterStats.lines += 1;
      const text = node.texts.find((entry) => entry.language === voiceLanguage)?.text.trim() ?? "";
      if (text) characterStats.words += text.split(/\s+/u).length;
    }
    return stats;
  }, [snapshot.characters, voiceLanguage, voiceSelection.selected]);
  const run = useCallback(async (kind: ExportKind, options?: Record<string, unknown>) => {
    const labels: Record<ExportKind, string> = {
      project: "Project JSON", "pixel-single": "Unity database", "pixel-partitioned": "Partitioned Unity databases", voice: "Voice package", screenplay: "Screenplay",
      "game-json": "Localization JSON", "game-csv": "Localization CSV", "unity-localization": "Unity Localization table", godot: "Godot localization table",
      "unreal-string-table": "Unreal String Tables", "yarn-spinner": "Yarn Spinner strings", gettext: "gettext catalogs", "xliff-2.0": "XLIFF package",
    };
    setFeedback({ status: "working", title: `Exporting ${labels[kind]}…`, detail: "Writing files on this Mac.", paths: [] });
    try {
      const result = await window.reed.export(kind, options ?? (kind === "voice" ? {
        language: voiceLanguage,
        characterIds: voiceCharacter === "all" ? undefined : [voiceCharacter],
        lineStatuses: voiceSelection.lineStatuses,
        voiceStatuses: voiceSelection.voiceStatuses,
      } : undefined));
      const paths = exportedPaths(result);
      setFeedback({ status: "success", title: `${labels[kind]} exported`, detail: `${paths.length || 1} ${paths.length === 1 ? "file" : "files"} written locally.`, paths });
    } catch (value) {
      setFeedback({ status: "error", title: `${labels[kind]} could not be exported`, detail: message(value), paths: [] });
    }
  }, [voiceCharacter, voiceLanguage, voiceSelection.lineStatuses, voiceSelection.voiceStatuses]);
  useEffect(() => { if (request && handledRequestRef.current !== request.id) { handledRequestRef.current = request.id; void run(request.kind).finally(onRequestHandled); } }, [onRequestHandled, request, run]);
  const exportRow = (kind: ExportKind, title: string, format: string, description: string, primaryAction = false) => {
    const blocked = kind.startsWith("pixel-") && !validation.valid;
    const marks: Partial<Record<ExportKind, string>> = { voice: "VO", screenplay: "MD", "game-csv": "CSV", "unity-localization": "U", godot: "G", "unreal-string-table": "UE", "yarn-spinner": "YS", gettext: "PO", "xliff-2.0": "XL" };
    return <article className="export-row" key={kind}><div className="export-mark" aria-hidden="true">{marks[kind] ?? (kind.startsWith("pixel-") ? "PC" : "{}")}</div><div><h4>{title}</h4><p>{description}</p><small>{format} · saved under exports/</small>{blocked && <span className="export-blocker">Blocked by {validation.errors} validation {validation.errors === 1 ? "error" : "errors"}</span>}</div><button type="button" className={primaryAction ? "primary" : ""} disabled={blocked || feedback?.status === "working"} aria-describedby={blocked ? "unity-export-help" : undefined} onClick={() => void run(kind)}>Export</button></article>;
  };
  return <div className="production"><header><div><p className="eyebrow">Local handoff</p><h2>Export</h2><p className="workspace-description">Create engine-ready localization, voice, script, and portable project files. Reed writes only inside this project and never uploads an export.</p></div></header>
    <section className="export-section" aria-labelledby="unity-export-heading"><div className="section-heading"><div><p className="eyebrow">Game integration</p><h3 id="unity-export-heading">Unity / Pixel Crushers</h3></div><span className={`validation-badge ${validation.valid ? "valid" : "invalid"}`}>{validation.valid ? "Ready" : `${validation.errors} errors`}</span></div><p id="unity-export-help" className="export-section-help">Unity exports require a validation-clear story so permanent IDs and links remain safe.</p>{exportRow("pixel-single", "Single dialogue database", "Pixel Crushers JSON + manifest", "One database containing every conversation. Best for most Unity projects.", true)}{exportRow("pixel-partitioned", "Partitioned dialogue databases", "Pixel Crushers JSON files + manifest", "One database per configured partition for larger production pipelines.")}</section>
    <section className="export-section" aria-labelledby="engine-export-heading"><div className="section-heading"><div><p className="eyebrow">Interchange</p><h3 id="engine-export-heading">Game engines & localization tools</h3></div><span className="validation-badge valid">{snapshot.project.languages.length} languages</span></div><p className="export-section-help">These tables use permanent Line IDs and include choice menu text as separate <code>.menu</code> keys. They carry localized strings and production context; Reed remains the source of branching graph logic.</p>{exportRow("unity-localization", "Unity Localization", "String Table Collection CSV", "A wide UTF-8 table with stable keys, numeric IDs, locale columns, and shared comments.")}{exportRow("godot", "Godot", "Localization CSV", "A Godot-ready keys-and-locales table with ignored context columns for speakers and source Line IDs.")}{exportRow("unreal-string-table", "Unreal Engine", "String Table CSV per culture", "One Key / SourceString table per enabled culture, with context preserved as metadata columns.")}{exportRow("yarn-spinner", "Yarn Spinner", "Strings CSV per language", "Line-ID-based strings files with source locations, deterministic locks, and translator comments.")}{exportRow("gettext", "gettext", "PO per language", "Version-control-friendly catalogs for Godot and standard localization tooling.")}{exportRow("xliff-2.0", "XLIFF 2.0", "XLIFF per target language", "Standards-based bilingual exchange for CAT tools and localization vendors.")}</section>
    <section className="export-section voice-export-section" aria-labelledby="production-export-heading"><div className="section-heading"><div><p className="eyebrow">Recording</p><h3 id="production-export-heading">Voice production</h3></div><span className={`validation-badge ${voiceSelection.missing.length ? "invalid" : "valid"}`}>{voiceSelection.missing.length ? `${voiceSelection.missing.length} missing` : "Script ready"}</span></div>
      <div className="voice-export-config"><div className="voice-export-copy"><div className="export-mark" aria-hidden="true">VO</div><div><h4>Voice actor package</h4><p>A studio master, a focused PDF for each actor, an editable session tracker, and CSV interchange data. Dialogue is exported only in the selected language; every recording uses its permanent <code>LineID.wav</code> filename.</p></div></div>
        <div className="voice-export-controls"><label>Recording language<select value={voiceLanguage} onChange={(event) => setVoiceLanguage(event.target.value)}>{snapshot.project.languages.map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}</select></label><label>Actor packet<select value={voiceCharacter} onChange={(event) => setVoiceCharacter(event.target.value)}><option value="all">All cast</option>{snapshot.characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label><label>Lines<select value={voicePreset} onChange={(event) => setVoicePreset(event.target.value as "ready" | "pickups" | "all")}><option value="ready">Ready to record</option><option value="pickups">Pickups only</option><option value="all">All authored lines</option></select></label></div>
        <div className="voice-export-summary"><div><strong>{voiceSelection.selected.length}</strong><span>lines</span></div><div><strong>{voiceSelection.words}</strong><span>words</span></div><div><strong>{(voiceSelection.words / 150).toFixed(1)}</strong><span>est. minutes</span></div><div className="voice-export-action"><small>{voicePreset === "ready" ? "Polished-or-later text with no recording or a required rework." : voicePreset === "pickups" ? "Polished-or-later text marked for recording rework." : "Every authored line, including drafts."}</small><button type="button" className="primary" disabled={feedback?.status === "working" || voiceSelection.selected.length === 0 || voiceSelection.missing.length > 0} onClick={() => void run("voice")}>Export voice package</button></div></div>
        {voiceSelection.missing.length > 0 && <div className="export-blocker voice-export-blocker" role="alert">Add {voiceLanguage.toUpperCase()} dialogue to {voiceSelection.missing.length} selected {voiceSelection.missing.length === 1 ? "line" : "lines"} before exporting. Reed will not substitute another language in an actor script.</div>}
      </div><div className="voice-budget"><h4>Selected cast estimate</h4><div className="table-scroll"><table><thead><tr><th>Character</th><th>Lines</th><th>Words</th><th>Est. minutes</th></tr></thead><tbody>{snapshot.characters.map((character) => { if (voiceCharacter !== "all" && character.id !== voiceCharacter) return null; const stats = productionStats.get(character.id) ?? { lines: 0, words: 0 }; return <tr key={character.id}><td>{character.name}</td><td>{stats.lines}</td><td>{stats.words}</td><td>{(stats.words / 150).toFixed(1)}</td></tr>; })}</tbody></table></div></div></section>
    <section className="export-section" aria-labelledby="portable-export-heading"><div className="section-heading"><div><p className="eyebrow">Portable files</p><h3 id="portable-export-heading">Plain data, story source & reading</h3></div></div>{exportRow("game-json", "Plain localization JSON", "Structured JSON dictionary", "Permanent Line IDs mapped to every configured language plus speaker, scene, context, tags, and menu text.")}{exportRow("game-csv", "Plain localization CSV", "Long-form UTF-8 CSV", "One row per Line ID and language for spreadsheets, scripts, databases, and custom engines.")}{exportRow("project", "Deterministic project JSON", "Reed JSON", "A complete graph snapshot for local Git history, inspection, archival, and Reed interchange.")}{exportRow("screenplay", "Linear screenplay", "Markdown", "A readable golden-path script in the project’s default language.")}</section>
    {feedback && <div className={`export-feedback ${feedback.status}`} role={feedback.status === "error" ? "alert" : "status"} aria-live="polite"><div><strong>{feedback.title}</strong><span>{feedback.detail}</span>{feedback.paths.map((filePath) => <code key={filePath}>{filePath}</code>)}</div>{feedback.paths[0] && <button type="button" onClick={() => void window.reed.revealInFinder(feedback.paths[0] ?? "")}>Show in Finder</button>}</div>}
  </div>;
}

function GitHubPanel({ project, gitStatus, github, onGitHub, onGitStatus, onProjectSettings }: { project: ProjectRecord; gitStatus: ProjectGitStatus; github: ProjectGitHubStatus | null; onGitHub(status: ProjectGitHubStatus | null): void; onGitStatus(status: ProjectGitStatus): void; onProjectSettings(): void }) {
  const prompt = usePrompt();
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [repositoryNameDraft, setRepositoryNameDraft] = useState<string | null>(null);
  const [repositoryDescriptionDraft, setRepositoryDescriptionDraft] = useState<string | null>(null);
  const [repositoryVisibility, setRepositoryVisibility] = useState<"private" | "public" | "internal">("private");
  const [existingRepository, setExistingRepository] = useState("");
  const [pullRequestTitle, setPullRequestTitle] = useState("");
  const [pullRequestBody, setPullRequestBody] = useState("");
  const [pullRequestDraft, setPullRequestDraft] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<{ number: number; body: string } | null>(null);
  const repositoryName = repositoryNameDraft ?? project.slug;
  const repositoryDescription = repositoryDescriptionDraft ?? `${project.name} dialogue project`;

  const refresh = useCallback(async () => {
    setWorking("refresh"); setError(""); setNotice("");
    try {
      const [nextGitHub, nextGit] = await Promise.all([window.reed.getProjectGitHubStatus(), window.reed.getProjectGitStatus()]);
      onGitHub(nextGitHub); onGitStatus(nextGit); setNotice("GitHub status refreshed.");
    } catch (value) { setError(message(value)); } finally { setWorking(""); }
  }, [onGitHub, onGitStatus]);
  const performGitHub = async (key: string, action: () => Promise<ProjectGitHubStatus>, success: string) => {
    setWorking(key); setError(""); setNotice("");
    try {
      const next = await action();
      onGitHub(next);
      onGitStatus(await window.reed.getProjectGitStatus());
      setNotice(success);
      return true;
    } catch (value) { setError(message(value)); return false; } finally { setWorking(""); }
  };
  const performGit = async (key: string, action: () => Promise<ProjectGitStatus>, success: string) => {
    setWorking(key); setError(""); setNotice("");
    try { onGitStatus(await action()); setNotice(success); }
    catch (value) { setError(message(value)); } finally { setWorking(""); }
  };
  const connectAccount = () => performGitHub("connect", () => window.reed.connectProjectGitHub(), "GitHub connected. Credentials are held by the macOS credential store, not Reed.");
  const createRepository = async () => {
    if (await performGitHub("create-repository", () => window.reed.createProjectGitHubRepository({ name: repositoryName, description: repositoryDescription, visibility: repositoryVisibility }), "Repository created and the current branch published.")) {
      setExistingRepository("");
    }
  };
  const connectRepository = async () => {
    if (await performGitHub("connect-repository", () => window.reed.connectProjectGitHubRepository(existingRepository), "Repository connected. Fetch or push only when you choose.")) setExistingRepository("");
  };
  const createPullRequest = async () => {
    if (await performGitHub("create-pr", () => window.reed.createProjectGitHubPullRequest({ baseBranch: project.pullRequestBaseBranch, title: pullRequestTitle, body: pullRequestBody, draft: pullRequestDraft }), "Branch pushed and pull request created.")) {
      setPullRequestTitle(""); setPullRequestBody(""); setPullRequestDraft(false);
    }
  };
  const reviewPullRequest = async (pullRequest: ProjectGitHubPullRequest, action: "approve" | "comment" | "request-changes") => {
    const body = reviewDraft?.number === pullRequest.number ? reviewDraft.body : "";
    if (await performGitHub(`review-${pullRequest.number}`, () => window.reed.reviewProjectGitHubPullRequest({ number: pullRequest.number, action, body }), action === "approve" ? `Pull request #${pullRequest.number} approved.` : `Review submitted on pull request #${pullRequest.number}.`)) setReviewDraft(null);
  };
  const mergePullRequest = async (pullRequest: ProjectGitHubPullRequest) => {
    const strategy = await prompt({
      title: `Merge pull request #${pullRequest.number}?`, label: "Merge method",
      description: `${pullRequest.title} will be merged into ${pullRequest.baseBranch} on GitHub. Reed will not replace the open local SQLite story.`,
      confirmLabel: "Merge on GitHub", danger: true,
      options: [{ value: "squash", label: "Squash and merge" }, { value: "merge", label: "Create merge commit" }, { value: "rebase", label: "Rebase and merge" }],
    });
    if (strategy === "merge" || strategy === "squash" || strategy === "rebase") await performGitHub(`merge-${pullRequest.number}`, () => window.reed.mergeProjectGitHubPullRequest(pullRequest.number, strategy), `Pull request #${pullRequest.number} merged on GitHub.`);
  };

  if (project.pullRequestProvider === "disabled") return <section className="history-panel collaboration-disabled"><div><p className="eyebrow">Optional remote</p><h3>GitHub is off</h3><p>Reed will remain completely offline. Enable GitHub only for projects that need remote branches and pull requests.</p></div><button type="button" onClick={onProjectSettings}>Open Project Settings…</button></section>;

  return <section className="history-panel github-panel" aria-labelledby="github-panel-heading">
    <div className="section-heading"><div><p className="eyebrow">Optional remote</p><h3 id="github-panel-heading">GitHub</h3></div><span>{github?.username ? `@${github.username}` : "Network on demand"}</span></div>
    <div className="github-boundary"><strong>Enabled for this project</strong><p>Local editing never needs GitHub. Reed connects when you press a GitHub action, and on the Git autosave timer when that is on in Reed settings. Autosave only pushes; it never pulls remote changes into the open story. No telemetry or Reed-managed token.</p></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {notice && <div className="github-notice" role="status">{notice}</div>}
    {!github && <div className="github-gate"><div><strong>Ready to check this Mac</strong><p>Reed can use its bundled GitHub tooling and the macOS credential store. You will not need Terminal.</p></div><button type="button" className="primary" disabled={Boolean(working)} onClick={() => void refresh()}>{working === "refresh" ? "Checking…" : "Check GitHub connection"}</button></div>}
    {github?.state === "tool-missing" && <div className="github-gate"><div><strong>GitHub tooling is unavailable</strong><p>{github.message}</p></div><button type="button" onClick={onProjectSettings}>Project Settings…</button></div>}
    {(github?.state === "signed-out" || github?.state === "error") && <div className="github-gate"><div><strong>Connect GitHub</strong><p>{github.message} Reed copies a one-time code and opens GitHub. Paste the code there if asked; the system credential store keeps the token, not Reed.</p></div><button type="button" className="primary" disabled={Boolean(working)} onClick={() => void connectAccount()}>{working === "connect" ? "Code copied · finish in browser…" : "Connect GitHub"}</button></div>}
    {github?.state === "offline" && <div className="github-gate offline"><div><strong>GitHub is offline</strong><p>{github.message}</p></div><button type="button" disabled={Boolean(working)} onClick={() => void refresh()}>Try again</button></div>}
    {github?.state === "connected" && !github.repository && <div className="github-setup-grid"><form onSubmit={(event) => { event.preventDefault(); void createRepository(); }}><p className="eyebrow">New remote</p><h4>Create a repository</h4><label>Repository name<input value={repositoryName} maxLength={200} required onChange={(event) => setRepositoryNameDraft(event.target.value)} /></label><label>Description<input value={repositoryDescription} maxLength={350} onChange={(event) => setRepositoryDescriptionDraft(event.target.value)} /></label><label>Visibility<select value={repositoryVisibility} onChange={(event) => setRepositoryVisibility(event.target.value as typeof repositoryVisibility)}><option value="private">Private</option><option value="public">Public</option><option value="internal">Internal organization</option></select></label><button type="submit" className="primary" disabled={Boolean(working) || !gitStatus.clean || !repositoryName.trim()}>{working === "create-repository" ? "Creating…" : "Create and publish"}</button><small>Create a checkpoint first. Reed publishes only project-owned Git files, never the live SQLite database.</small></form><form onSubmit={(event) => { event.preventDefault(); void connectRepository(); }}><p className="eyebrow">Existing remote</p><h4>Connect a repository</h4><label>Repository<input value={existingRepository} maxLength={2000} required placeholder="owner/repository" onChange={(event) => setExistingRepository(event.target.value)} /></label><button type="submit" disabled={Boolean(working) || !existingRepository.trim()}>{working === "connect-repository" ? "Connecting…" : "Connect repository"}</button><small>Use owner/name, an HTTPS URL, or an SSH URL. Reed validates it with GitHub before saving origin.</small></form></div>}
    {github?.state === "connected" && github.repository && <>
      <div className="github-repository"><div className="github-mark" aria-hidden="true">GH</div><div><strong>{github.repository}</strong><span>{github.defaultBranch ? `Default ${github.defaultBranch}` : "GitHub repository"}</span></div><div className="github-divergence"><span><b>{gitStatus.ahead}</b> ahead</span><span><b>{gitStatus.behind}</b> behind</span><span><b>{github.pullRequests.length}</b> open PRs</span></div></div>
      <div className="github-actions"><button type="button" disabled={Boolean(working)} onClick={() => void performGit("fetch", () => window.reed.fetchProjectGitHub(), "GitHub updates checked. The open SQLite story was not changed.")}>{working === "fetch" ? "Checking…" : "Check for updates"}</button><button type="button" className="primary" disabled={Boolean(working) || !gitStatus.clean || gitStatus.behind > 0 || Boolean(gitStatus.upstream && gitStatus.ahead === 0)} onClick={() => void performGit("push", () => window.reed.pushProjectGitHub(), "Current story branch pushed to GitHub.")}>{working === "push" ? "Pushing…" : "Push to GitHub"}</button><button type="button" disabled={Boolean(working)} onClick={() => void refresh()}>{working === "refresh" ? "Refreshing…" : "Refresh PRs"}</button></div>
      <p className="github-fetch-note">Checking updates refreshes remote branch indicators only. Reed will never overwrite the open canonical SQLite story with a remote JSON file.</p>
      <form className="github-pr-form" onSubmit={(event) => { event.preventDefault(); void createPullRequest(); }}><div><p className="eyebrow">Propose changes</p><h4>Open pull request</h4></div><label>Title<input value={pullRequestTitle} maxLength={256} required placeholder="Review chapter one dialogue" onChange={(event) => setPullRequestTitle(event.target.value)} /></label><label>Description<textarea rows={4} maxLength={20000} value={pullRequestBody} placeholder="Summarize dialogue, translation, validation, and production changes." onChange={(event) => setPullRequestBody(event.target.value)} /></label><label className="checkbox-control"><input type="checkbox" checked={pullRequestDraft} onChange={(event) => setPullRequestDraft(event.target.checked)} /> Create as draft</label><button type="submit" className="primary" disabled={Boolean(working) || !gitStatus.clean || gitStatus.branch === project.pullRequestBaseBranch || !pullRequestTitle.trim()}>{working === "create-pr" ? "Publishing…" : "Push and open PR"}</button><small>Base: <code>{project.pullRequestBaseBranch}</code> · Head: <code>{gitStatus.branch}</code></small></form>
      <div className="github-pr-list"><div className="section-heading"><div><p className="eyebrow">Team review</p><h4>Open pull requests</h4></div><span>{github.pullRequests.length}</span></div>{github.pullRequests.length === 0 ? <p className="github-pr-empty">No open pull requests.</p> : github.pullRequests.map((pullRequest) => <article key={pullRequest.number}><header><span className="github-pr-number">#{pullRequest.number}</span><div><strong>{pullRequest.title}</strong><small>{pullRequest.headBranch} → {pullRequest.baseBranch} · @{pullRequest.author || "unknown"}</small></div>{pullRequest.draft && <span className="github-pr-badge">Draft</span>}</header><div className="github-pr-signals"><span>Checks: {pullRequest.checkState}</span><span>Merge: {pullRequest.mergeState}</span><span>Review: {pullRequest.reviewDecision || "pending"}</span></div>{reviewDraft?.number === pullRequest.number ? <div className="github-review-compose"><label htmlFor={`github-review-${pullRequest.number}`}>Review comment<textarea id={`github-review-${pullRequest.number}`} autoFocus rows={3} maxLength={20000} value={reviewDraft.body} onChange={(event) => setReviewDraft({ number: pullRequest.number, body: event.target.value })} /></label><div><button type="button" onClick={() => setReviewDraft(null)}>Cancel</button><button type="button" disabled={Boolean(working) || !reviewDraft.body.trim()} onClick={() => void reviewPullRequest(pullRequest, "comment")}>Comment</button><button type="button" className="danger" disabled={Boolean(working) || !reviewDraft.body.trim()} onClick={() => void reviewPullRequest(pullRequest, "request-changes")}>Request changes</button></div></div> : <div className="github-pr-actions"><button type="button" disabled={Boolean(working)} onClick={() => void reviewPullRequest(pullRequest, "approve")}>Approve</button><button type="button" disabled={Boolean(working)} onClick={() => setReviewDraft({ number: pullRequest.number, body: "" })}>Review…</button><button type="button" className="primary" disabled={Boolean(working) || pullRequest.draft || pullRequest.checkState === "failing" || pullRequest.checkState === "pending"} onClick={() => void mergePullRequest(pullRequest)}>Merge…</button></div>}</article>)}</div>
    </>}
  </section>;
}

function BackupSnapshots({ onRestored }: { onRestored(): Promise<void> }) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { setBackups(await window.reed.listBackups()); } catch (value) { setError(message(value)); } }, []);
  useEffect(() => { void load(); }, [load]);
  const restore = async (backup: BackupRecord) => {
    setWorking(true); setError(""); setNotice("");
    try { await window.reed.restoreBackup(backup.id, backup.id); setPending(null); setNotice(`Restored ${backup.label ?? "snapshot"} from ${new Date(backup.createdAt).toLocaleString()}. The previous state was saved as “Before restore”.`); await onRestored().catch(() => undefined); await load(); }
    catch (value) { setError(message(value)); }
    finally { setWorking(false); }
  };
  return <section className="history-panel history-commits"><div className="section-heading"><div><p className="eyebrow">Local snapshots</p><h3>Restore a backup</h3></div><span>{backups.length} kept</span></div><p>Reed saves automatic and named SQLite snapshots on this device. Restoring first saves the current state, so a restore can always be undone.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="history-notice" role="status">{notice}</div>}
    {backups.length ? <ol>{backups.slice(0, 20).map((backup) => <li key={backup.id}><code>{backup.kind}</code><div><strong>{backup.label ?? "Automatic snapshot"}</strong><span>{new Date(backup.createdAt).toLocaleString()}</span></div>{pending === backup.id
      ? <span><button type="button" className="primary" disabled={working} onClick={() => void restore(backup)}>{working ? "Restoring…" : "Confirm restore"}</button><button type="button" disabled={working} onClick={() => setPending(null)}>Cancel</button></span>
      : <button type="button" disabled={working} onClick={() => setPending(backup.id)}>Restore…</button>}</li>)}</ol> : <p>No snapshots yet. Reed creates one automatically while you edit.</p>}</section>;
}

function ProjectHistory({ project, github, onGitHub, onProjectSettings, onRestored }: { project: ProjectRecord; github: ProjectGitHubStatus | null; onGitHub(status: ProjectGitHubStatus | null): void; onProjectSettings(): void; onRestored(): Promise<void> }) {
  const [status, setStatus] = useState<ProjectGitStatus | null>(null);
  const [checkpointName, setCheckpointName] = useState("");
  const [branchName, setBranchName] = useState("story/");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { const next = await window.reed.getProjectGitStatus(); setStatus(next); setError(""); } catch (value) { setError(message(value)); } }, []);
  useEffect(() => { void load(); }, [load]);
  const perform = async (action: () => Promise<ProjectGitStatus>, success: string): Promise<boolean> => { setWorking(true); setError(""); setNotice(""); try { const next = await action(); setStatus(next); setNotice(success); return true; } catch (value) { setError(message(value)); return false; } finally { setWorking(false); } };
  const initialize = () => perform(async () => (await window.reed.initializeProjectGit()).status, "Local history initialized with the first story checkpoint.");
  const checkpoint = async () => { if (await perform(async () => (await window.reed.createProjectGitCheckpoint(checkpointName)).status, "Story checkpoint created locally.")) setCheckpointName(""); };
  const createBranch = async () => { if (await perform(() => window.reed.createProjectGitBranch(branchName), `Local branch ${branchName} created.`)) setBranchName("story/"); };
  if (!status && !error) return <div className="history-workspace"><p>Inspecting local history…</p></div>;
  return <div className="history-workspace"><header><div><p className="eyebrow">Version retention & collaboration</p><h2>History</h2><p className="workspace-description">Create readable local checkpoints, then optionally publish branches and manage pull requests without leaving Reed. The live SQLite database stays outside Git.</p></div>{status?.initialized && <span className={`history-state ${status.clean ? "clean" : "dirty"}`}><i aria-hidden="true" />{status.clean ? "Checkpoint current" : "Changes to checkpoint"}</span>}</header>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="history-notice" role="status">{notice}</div>}
    {status && !status.available && <section className="history-empty"><h3>Git is not available</h3><p>{status.message}</p></section>}
    {status?.available && !status.initialized && <section className="history-empty"><h3>Start local story history</h3><p>{status.message} Reed will create a Git repository here, export deterministic story JSON, and make the first checkpoint.</p><button type="button" className="primary" disabled={working} onClick={() => void initialize()}>{working ? "Initializing…" : "Initialize local history"}</button></section>}
    {status?.initialized && <div className="history-layout"><section className="history-panel"><div className="section-heading"><div><p className="eyebrow">Working story</p><h3>Create checkpoint</h3></div><span>{status.branch}</span></div><p>{status.message}</p>{status.changes.length > 0 && <ul className="git-changes" aria-label="Files changed since the last checkpoint">{status.changes.map((change) => <li key={`${change.status}-${change.path}`}><code>{change.status}</code><span>{change.path}</span></li>)}</ul>}<form className="checkpoint-form" onSubmit={(event) => { event.preventDefault(); void checkpoint(); }}><label htmlFor="checkpoint-name">Checkpoint name</label><div><input id="checkpoint-name" value={checkpointName} maxLength={200} required placeholder="e.g. Lock chapter one dialogue" onChange={(event) => setCheckpointName(event.target.value)} /><button type="submit" className="primary" disabled={working || !checkpointName.trim() || status.clean}>Create checkpoint</button></div><small>Exports the latest story JSON before committing. No network connection is used.</small></form></section>
      <section className="history-panel"><div className="section-heading"><div><p className="eyebrow">Branches</p><h3>Start a story branch</h3></div><span>{status.branch}</span></div><p>Keep each reviewable story change on its own local branch. Creating a branch never uses the network.</p><form className="branch-form" onSubmit={(event) => { event.preventDefault(); void createBranch(); }}><label htmlFor="branch-name">New branch</label><div><input id="branch-name" value={branchName} maxLength={128} required placeholder="story/chapter-one" onChange={(event) => setBranchName(event.target.value)} /><button type="submit" disabled={working || !status.clean || !branchName.trim()}>Start branch</button></div><small>Checkpoint pending changes before switching branches.</small></form></section>
      <GitHubPanel project={project} gitStatus={status} github={github} onGitHub={onGitHub} onGitStatus={setStatus} onProjectSettings={onProjectSettings} />
      <section className="history-panel history-commits"><div className="section-heading"><div><p className="eyebrow">Retention</p><h3>Recent checkpoints</h3></div><span>{status.commits.length} shown</span></div>{status.commits.length ? <ol>{status.commits.map((commit) => <li key={commit.id}><code>{commit.shortId}</code><div><strong>{commit.summary}</strong><span>{new Date(commit.createdAt).toLocaleString()} · {commit.author}</span></div></li>)}</ol> : <p>No checkpoints yet.</p>}</section></div>}
    <BackupSnapshots onRestored={onRestored} />
  </div>;
}

function ReadConversation({ conversation, characterNames, language }: { conversation: ConversationGraph; characterNames: Map<string, string>; language: string }) {
  const lines: React.ReactNode[] = [];
  for (const node of conversation.nodes) if (node.kind !== "start" && node.kind !== "group") lines.push(<div className="script-line" key={node.id}><strong>{node.speakerCharacterId ? characterNames.get(node.speakerCharacterId) ?? "Unassigned" : "Unassigned"}</strong><p>{node.texts.find((text) => text.language === language)?.text || "—"}</p><code>{node.lineId}</code></div>);
  return <section><h2>{conversation.title}</h2>{lines}</section>;
}

function ReadView({ snapshot }: { snapshot: ProjectSnapshot }) {
  const characterNames = useMemo(() => new Map(snapshot.characters.map((character) => [character.id, character.name])), [snapshot.characters]);
  return <div className="read-view"><header><p className="eyebrow">Golden path</p><h1>{snapshot.project.name}</h1><p>Linear table-read view · {snapshot.project.defaultLanguage.toUpperCase()}</p></header>{snapshot.conversations.map((conversation) => <ReadConversation key={conversation.id} conversation={conversation} characterNames={characterNames} language={snapshot.project.defaultLanguage} />)}</div>;
}

function EditorApp() {
  const prompt = usePrompt();
  const [state, setState] = useState<EditorBootstrap | null>(null); const [workspace, setWorkspace] = useState<Workspace>("graph");
  const [conversationId, setConversationId] = useState<string | null>(null); const [graph, setGraph] = useState<ConversationGraph | null>(null); const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [primary, setPrimary] = useState("en"); const [secondary, setSecondary] = useState("el"); const [search, setSearch] = useState(""); const [results, setResults] = useState<SearchResult[]>([]); const [notice, setNotice] = useState("Ready");
  const [saveState, setSaveState] = useState<SaveStateEvent>({ status: "saved" });
  const [githubStatus, setGitHubStatus] = useState<ProjectGitHubStatus | null>(null);
  const [exportRequest, setExportRequest] = useState<{ kind: ExportKind; id: number } | null>(null);
  const [appReady, setAppReady] = useState(false); const [homeVisible, setHomeVisible] = useState(true); const [homeMode, setHomeMode] = useState<"idle" | "new">("idle");
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]); const [projectSettingsOpen, setProjectSettingsOpen] = useState(false); const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [appearance, setAppearanceState] = useState<AppearanceState>(() => ({ preference: "system", resolved: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" }));
  const [navigatorOpen, setNavigatorOpen] = useState(desktopPanelLayout); const [inspectorOpen, setInspectorOpen] = useState(desktopPanelLayout);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false); const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const [workspaceMenuFocusIndex, setWorkspaceMenuFocusIndex] = useState(0); const [panelMotionInstant, setPanelMotionInstant] = useState(false);
  const workspaceMenuTriggerRef = useRef<HTMLButtonElement>(null); const workspaceMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const applyBootstrap = useCallback((value: EditorBootstrap) => {
    setState(value); setGraph(null); setSelectedNodeId(null);
    setPrimary(value.snapshot.project.defaultLanguage);
    setSecondary(value.snapshot.project.languages.find((language) => language !== value.snapshot.project.defaultLanguage) ?? value.snapshot.project.defaultLanguage);
    setConversationId(value.snapshot.conversations[0]?.id ?? null); setHomeVisible(false); setHomeMode("idle"); setNotice("Ready"); setSaveState({ status: "saved" }); setGitHubStatus(null);
    void window.reed.getRecentProjects().then(setRecentProjects);
  }, []);
  useEffect(() => { void Promise.all([window.reed.getBootstrap(), window.reed.getRecentProjects(), window.reed.getAppearance()]).then(([value, recent, nextAppearance]) => { applyAppearance(nextAppearance); setAppearanceState(nextAppearance); setRecentProjects(recent); if (value) applyBootstrap(value); else setHomeVisible(true); setAppReady(true); }); }, [applyBootstrap]);
  useEffect(() => window.reed.onAppearanceChanged((next) => { applyAppearance(next); setAppearanceState(next); }), []);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  useEffect(() => { void window.reed.getUpdateState().then(setUpdateState); return window.reed.onUpdateState(setUpdateState); }, []);
  const [autoSyncState, setAutoSyncState] = useState<AutoSyncState | null>(null);
  useEffect(() => { void window.reed.getAutoSyncState().then(setAutoSyncState); return window.reed.onAutoSyncState(setAutoSyncState); }, []);
  const chooseAppearance = useCallback(async (preference: AppearancePreference) => { const next = await window.reed.setAppearance(preference); applyAppearance(next); setAppearanceState(next); }, []);
  useEffect(() => window.reed.onSaveState(setSaveState), []);
  const loadConversation = useCallback(async (id: string | null): Promise<ConversationGraph | null> => { if (!id) { setGraph(null); return null; } const value = await window.reed.getConversation(id); setGraph(value); setSelectedNodeId((current) => value.nodes.some((node) => node.id === current) ? current : value.nodes.find((node) => node.kind !== "start")?.id ?? value.nodes[0]?.id ?? null); return value; }, []);
  useEffect(() => { void loadConversation(conversationId); }, [conversationId, loadConversation]);
  const refresh = useCallback(async () => { const next = await window.reed.getBootstrap(); if (next) { setState(next); if (conversationId) await loadConversation(conversationId); } }, [conversationId, loadConversation]);
  const chooseWorkspace = useCallback((id: Workspace) => { setWorkspace(id); setHomeVisible(false); if (!desktopPanelLayout()) { setNavigatorOpen(false); setInspectorOpen(false); } setWorkspaceMenuOpen(false); }, []);
  const openProjectRoot = useCallback(async (root: string) => applyBootstrap(await window.reed.openProject(root)), [applyBootstrap]);
  const clearRendererProject = useCallback(() => { setState(null); setGraph(null); setConversationId(null); setSelectedNodeId(null); setGitHubStatus(null); setProjectSettingsOpen(false); setHomeVisible(true); setHomeMode("idle"); void window.reed.getRecentProjects().then(setRecentProjects); }, []);
  const lastChangeSequence = state?.lastChangeSequence;
  useEffect(() => { if (lastChangeSequence === undefined) return; const timer = window.setInterval(async () => { const changes = await window.reed.getChanges(lastChangeSequence); if (changes.length) { setNotice(`${changes.length} external change${changes.length === 1 ? "" : "s"} loaded`); await refresh(); } }, 1400); return () => window.clearInterval(timer); }, [lastChangeSequence, refresh]);
  useEffect(() => {
    const media = window.matchMedia(desktopPanelMedia);
    const syncPanels = (event: MediaQueryListEvent) => { setNavigatorOpen(event.matches); setInspectorOpen(event.matches); };
    media.addEventListener("change", syncPanels);
    return () => media.removeEventListener("change", syncPanels);
  }, []);
  const suppressPanelMotionOnce = useCallback(() => setPanelMotionInstant(true), []);
  useEffect(() => {
    if (!panelMotionInstant) return;
    const frame = window.requestAnimationFrame(() => setPanelMotionInstant(false));
    return () => window.cancelAnimationFrame(frame);
  }, [panelMotionInstant]);
  useEffect(() => { const listener = (event: KeyboardEvent) => {
    if (event.key === "Escape") { suppressPanelMotionOnce(); setNavigatorOpen(false); setInspectorOpen(false); setWorkspaceMenuOpen(false); return; }
    const shortcut = globalShortcut(event.key, event.metaKey || event.ctrlKey);
    if (!shortcut) return;
    event.preventDefault();
    suppressPanelMotionOnce();
    if (shortcut === "toggle-project") { setNavigatorOpen((value) => !value); if (!desktopPanelLayout()) setInspectorOpen(false); setWorkspaceMenuOpen(false); return; }
    setHomeVisible(false); setWorkspace(shortcut); if (!desktopPanelLayout()) { setNavigatorOpen(false); setInspectorOpen(false); } setWorkspaceMenuOpen(false);
  }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, [suppressPanelMotionOnce]);
  useEffect(() => { if (state) void window.reed.setActiveWorkspace(workspace); }, [state, workspace]);
  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!workspaceMenuRef.current?.contains(event.target as HTMLElement)) setWorkspaceMenuOpen(false); };
    window.addEventListener("pointerdown", closeOutside);
    return () => window.removeEventListener("pointerdown", closeOutside);
  }, [workspaceMenuOpen]);
  useEffect(() => window.reed.onMenuCommand((command) => {
    void (async () => {
      try {
        if (command.type === "new-project") { setHomeVisible(true); setHomeMode("new"); setProjectSettingsOpen(false); setRecentProjects(await window.reed.getRecentProjects()); return; }
        if (command.type === "show-home") { setHomeVisible(true); setHomeMode("idle"); setProjectSettingsOpen(false); setRecentProjects(await window.reed.getRecentProjects()); return; }
        if (command.type === "close-project") { clearRendererProject(); return; }
        if (command.type === "open-project") { const root = await window.reed.chooseProject(); if (root) await openProjectRoot(root); return; }
        if (command.type === "open-recent") { await openProjectRoot(command.root); return; }
        if (command.type === "preferences" || command.type === "check-updates") { setPreferencesOpen(true); return; }
        if (command.type === "project-settings") { if (state) setProjectSettingsOpen(true); return; }
        if (command.type === "focus-search") { if (state) { setHomeVisible(false); window.requestAnimationFrame(() => searchInputRef.current?.focus()); } return; }
        if (command.type === "toggle-navigator") { if (state) { setHomeVisible(false); setNavigatorOpen((value) => !value); if (!desktopPanelLayout()) setInspectorOpen(false); } return; }
        if (command.type === "toggle-inspector") { if (state) { setHomeVisible(false); setInspectorOpen((value) => !value); if (!desktopPanelLayout()) setNavigatorOpen(false); } return; }
        if (command.type === "workspace") { if (state) chooseWorkspace(command.workspace); return; }
        if (command.type === "create-backup") { if (state) { const label = await prompt({ title: "Create local backup", label: "Backup name", description: "This creates a full SQLite recovery copy inside the project. Autosave continues separately.", defaultValue: "Manual backup", confirmLabel: "Create backup" }); if (label) { await window.reed.mutate("createBackup", { label }); setNotice("Recovery backup created locally"); } } return; }
        if (command.type === "export" && state) { chooseWorkspace("production"); setExportRequest({ kind: command.kind, id: Date.now() }); }
      } catch (value) { setNotice(`Command failed: ${message(value)}`); }
    })();
  }), [chooseWorkspace, clearRendererProject, openProjectRoot, prompt, state]);
  if (!appReady) return <main className="launch-screen"><img src={reedLogo} alt="" /><span>Opening Reed…</span></main>;
  if (homeVisible || !state) return <><ProjectHome current={state} recentProjects={recentProjects} mode={homeMode} appearance={appearance} onMode={setHomeMode} onReady={applyBootstrap} onContinue={() => setHomeVisible(false)} onRecentProjects={setRecentProjects} onAppearance={chooseAppearance} />{state && projectSettingsOpen && <ProjectSettingsDialog state={state} onClose={() => setProjectSettingsOpen(false)} onSaved={async () => { await refresh(); setRecentProjects(await window.reed.getRecentProjects()); }} />}{preferencesOpen && <PreferencesDialog appearance={appearance} update={updateState} autoSync={autoSyncState} onAppearance={chooseAppearance} onClose={() => setPreferencesOpen(false)} />}<UpdateBanner update={updateState} onOpen={() => setPreferencesOpen(true)} /></>;
  const snapshot = state.snapshot; const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const chooseConversation = (id: string) => { setConversationId(id); setWorkspace("graph"); if (!desktopPanelLayout()) { setNavigatorOpen(false); setInspectorOpen(false); } };
  const selectNode = (id: string) => { setSelectedNodeId(id); setInspectorOpen(true); };
  const focusWorkspaceMenuItem = (index: number) => { setWorkspaceMenuFocusIndex(index); window.requestAnimationFrame(() => workspaceMenuItemRefs.current[index]?.focus()); };
  const openWorkspaceMenu = (index: number) => { setWorkspaceMenuOpen(true); focusWorkspaceMenuItem(index); };
  const chooseWorkspaceFromMenu = (id: Workspace) => { workspaceMenuTriggerRef.current?.focus(); chooseWorkspace(id); };
  const jumpIssue = async (issue: ValidationIssue) => {
    try {
      const targetConversationId = issue.conversationId ?? conversationId;
      setWorkspace("graph"); if (!desktopPanelLayout()) setNavigatorOpen(false);
      if (targetConversationId && targetConversationId !== conversationId) setConversationId(targetConversationId);
      const targetGraph = targetConversationId === graph?.id ? graph : await loadConversation(targetConversationId);
      const node = issue.lineId ? targetGraph?.nodes.find((candidate) => candidate.lineId === issue.lineId) : null;
      if (node) { setSelectedNodeId(node.id); setInspectorOpen(true); }
    } catch (value) { setNotice(`Could not open validation issue: ${message(value)}`); }
  };
  const doSearch = async () => { setResults(search.trim() ? await window.reed.findLines({ query: search }) : []); };
  return <div className={`app-shell ${navigatorOpen ? "navigator-open" : "navigator-closed"} ${inspectorOpen ? "inspector-open" : "inspector-closed"} ${panelMotionInstant ? "panel-motion-instant" : ""}`}>
    <header className="command-bar">
      <button type="button" className="brand" aria-label="Show project home" title="Project Home (⇧⌘H)" onClick={() => { setHomeVisible(true); setHomeMode("idle"); void window.reed.getRecentProjects().then(setRecentProjects); }}><img src={reedLogo} alt="" /><b>Reed</b><i /><em>{snapshot.project.name}</em></button>
      <div className="workspace-navigation">
        <div className="workspace-tabs" aria-label="Authoring workspaces">{primaryWorkspaces.map((item) => <button type="button" key={item.id} className={workspace === item.id ? "active" : ""} aria-current={workspace === item.id ? "page" : undefined} onClick={() => chooseWorkspace(item.id)}><WorkspaceIcon workspace={item.id} /><span>{item.label}</span><kbd>⌘{item.key}</kbd></button>)}</div>
        <div className="workspace-more" ref={workspaceMenuRef}>
          <button type="button" ref={workspaceMenuTriggerRef} className={`workspace-more-trigger ${secondaryWorkspaceGroups.some((group) => group.items.some((item) => item.id === workspace)) ? "active" : ""}`} aria-haspopup="menu" aria-controls="workspace-more-menu" aria-expanded={workspaceMenuOpen} aria-label="More workspaces" onClick={() => { if (workspaceMenuOpen) setWorkspaceMenuOpen(false); else { setWorkspaceMenuFocusIndex(secondaryWorkspaceIndex.get(workspace) ?? 0); setWorkspaceMenuOpen(true); } }} onKeyDown={(event) => { if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); openWorkspaceMenu(event.key === "ArrowUp" ? secondaryWorkspaces.length - 1 : 0); } }}>More<span aria-hidden="true">⌄</span></button>
          <div id="workspace-more-menu" className="workspace-menu" role="menu" aria-label="More workspaces" hidden={!workspaceMenuOpen}>
            {secondaryWorkspaceGroups.map((group) => <div className="workspace-menu-section" key={group.label} role="group" aria-label={group.label}><span className="workspace-menu-label">{group.label}</span>{group.items.map((item) => { const itemIndex = secondaryWorkspaceIndex.get(item.id) ?? 0; return <button type="button" ref={(element) => { workspaceMenuItemRefs.current[itemIndex] = element; }} key={item.id} role="menuitem" tabIndex={workspaceMenuOpen && workspaceMenuFocusIndex === itemIndex ? 0 : -1} className={workspace === item.id ? "active" : ""} aria-current={workspace === item.id ? "page" : undefined} onClick={() => chooseWorkspaceFromMenu(item.id)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); workspaceMenuTriggerRef.current?.focus(); setWorkspaceMenuOpen(false); return; } const next = nextMenuIndex(itemIndex, secondaryWorkspaces.length, event.key); if (next !== null) { event.preventDefault(); focusWorkspaceMenuItem(next); } }}><span className="workspace-menu-item"><WorkspaceIcon workspace={item.id} /><span>{item.label}</span></span>{item.key && <kbd>⌘{item.key}</kbd>}</button>; })}</div>)}
          </div>
        </div>
      </div>
      <div className="command-actions"><div className="search"><span>⌕</span><input ref={searchInputRef} value={search} aria-label="Search dialogue" placeholder="Text, Line ID, tag…" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void doSearch(); }} />{results.length > 0 && <div className="search-results">{results.map((result) => <button type="button" key={`${result.lineId}-${result.language}`} onClick={() => { chooseConversation(result.conversationId); setResults([]); }}>{result.text}<small>{result.lineId} · {result.language}</small></button>)}</div>}</div><SaveIndicator state={saveState} autoSync={autoSyncState} project={snapshot.project} github={githubStatus} onGitHub={setGitHubStatus} onOpenHistory={() => chooseWorkspace("history")} onProjectChanged={refresh} /><button type="button" className="export-button" onClick={() => chooseWorkspace("production")}>Export</button></div>
    </header>
    {!navigatorOpen && (desktopPanelLayout() || !inspectorOpen) && <button type="button" className="panel-restore project" aria-controls="project-navigator" aria-expanded="false" aria-label="Open project navigator" title="Open Project navigator (⌘K)" onClick={() => { setNavigatorOpen(true); if (!desktopPanelLayout()) setInspectorOpen(false); }}>Project<kbd>⌘K</kbd></button>}
    {(workspace === "graph" || workspace === "translation") && graph && !inspectorOpen && (desktopPanelLayout() || !navigatorOpen) && <button type="button" className="panel-restore panel-restore-inspector" aria-controls="line-inspector" aria-expanded="false" aria-label="Open line inspector" title="Open Inspector" onClick={() => { setInspectorOpen(true); if (!desktopPanelLayout()) setNavigatorOpen(false); }}>Inspector</button>}
    <Navigator snapshot={snapshot} selectedConversationId={conversationId} open={navigatorOpen} onConversation={chooseConversation} onScene={() => chooseWorkspace("beats")} onProjectSettings={() => setProjectSettingsOpen(true)} onClose={() => setNavigatorOpen(false)} />
    <main className="workspace">{workspace === "graph" && <GraphWorkspace graph={graph} snapshot={snapshot} selectedNodeId={selectedNodeId} onSelect={selectNode} onMutated={refresh} primary={primary} secondary={secondary} />}{workspace === "beats" && <BeatMap snapshot={snapshot} onConversation={chooseConversation} refresh={refresh} />}{workspace === "playtest" && <Playtest graph={graph} snapshot={snapshot} language={primary} />}{workspace === "translation" && <Translation graph={graph} snapshot={snapshot} primary={primary} secondary={secondary} onSelect={selectNode} />}{workspace === "characters" && <Characters snapshot={snapshot} refresh={refresh} />}{workspace === "variables" && <Variables snapshot={snapshot} refresh={refresh} />}{workspace === "validation" && <Validation report={state.validation} onJump={jumpIssue} />}{workspace === "review" && <Review refresh={refresh} />}{workspace === "production" && <Production snapshot={snapshot} validation={state.validation} request={exportRequest} onRequestHandled={() => setExportRequest(null)} />}{workspace === "history" && <ProjectHistory project={snapshot.project} github={githubStatus} onGitHub={setGitHubStatus} onProjectSettings={() => setProjectSettingsOpen(true)} onRestored={refresh} />}{workspace === "read" && <ReadView snapshot={snapshot} />}</main>
    {(workspace === "graph" || workspace === "translation") && graph && <Inspector graph={graph} node={selectedNode} primary={primary} secondary={secondary} languages={snapshot.project.languages} characters={snapshot.characters} open={inspectorOpen} onMutated={refresh} onDirty={() => setSaveState({ status: "dirty" })} onClose={() => setInspectorOpen(false)} />}
    {(navigatorOpen || inspectorOpen) && <button type="button" className="panel-scrim" aria-label="Close open panel" onClick={() => { setNavigatorOpen(false); setInspectorOpen(false); }} />}
    <footer className="status-bar"><span><i className={state.validation.valid ? "ok" : "bad"} />{state.validation.valid ? "Validation clear" : `${state.validation.errors} errors`}</span><span>{notice}</span><span title={state.root}><bdi>{state.root}</bdi></span><div className="language-switch"><select aria-label="Primary language" title="Primary language" value={primary} onChange={(event) => setPrimary(event.target.value)}>{snapshot.project.languages.map((language) => <option key={language}>{language}</option>)}</select><button type="button" aria-label="Swap primary and reference languages" title="Swap primary and reference languages" onClick={() => { setPrimary(secondary); setSecondary(primary); }}>⇄</button><select aria-label="Reference language" title="Reference language" value={secondary} onChange={(event) => setSecondary(event.target.value)}>{snapshot.project.languages.map((language) => <option key={language}>{language}</option>)}</select></div></footer>
    {projectSettingsOpen && <ProjectSettingsDialog state={state} onClose={() => setProjectSettingsOpen(false)} onSaved={async () => { await refresh(); setRecentProjects(await window.reed.getRecentProjects()); }} />}
    {preferencesOpen && <PreferencesDialog appearance={appearance} update={updateState} autoSync={autoSyncState} onAppearance={chooseAppearance} onClose={() => setPreferencesOpen(false)} />}<UpdateBanner update={updateState} onOpen={() => setPreferencesOpen(true)} />
  </div>;
}

export function App() { return <PromptProvider><EditorApp /></PromptProvider>; }
