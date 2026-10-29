import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, session, shell, type MenuItemConstructorOptions } from "electron";
import {
  ReedProject,
  checkpointProjectGit,
  connectProjectGitHub,
  connectProjectGitHubRepository,
  createProjectGitBranch,
  createProjectGitHubPullRequest,
  createProjectGitHubRepository,
  createProjectPullRequestHandoff,
  createProjectSnapshot,
  disabledProjectGitHubStatus,
  exportPixelCrushers,
  exportGameData,
  exportProjectJson,
  exportScreenplay,
  exportVoicePackage,
  fetchProjectGitHub,
  initializeProjectGit,
  inspectProjectGitHub,
  inspectProjectGit,
  mergeProjectGitHubPullRequest,
  pushProjectGitHub,
  reviewProjectGitHubPullRequest,
  setProjectGitRemote,
  validateProject,
} from "@reed/core";
import type { AppearancePreference, AppearanceState, EditorBootstrap, ExportKind, MenuCommand, MutationName, WorkspaceId } from "./contract.js";
import { forgetRecentProject, parseRecentProjects, upsertRecentProject, type RecentProject } from "./recent-projects.js";

let window: BrowserWindow | null = null;
let reed: ReedProject | null = null;
let recentProjects: RecentProject[] = [];
let activeWorkspace: WorkspaceId = "graph";
let appearancePreference: AppearancePreference = "system";
let githubConnection: ReturnType<typeof connectProjectGitHub> | null = null;

const githubDeviceUrl = "https://github.com/login/device";

const workspaceMenuItems: Array<{ id: WorkspaceId; label: string; accelerator?: string }> = [
  { id: "graph", label: "Graph", accelerator: "CommandOrControl+1" },
  { id: "beats", label: "Beats", accelerator: "CommandOrControl+2" },
  { id: "playtest", label: "Playtest", accelerator: "CommandOrControl+3" },
  { id: "translation", label: "Translation", accelerator: "CommandOrControl+4" },
  { id: "characters", label: "Characters", accelerator: "CommandOrControl+5" },
  { id: "validation", label: "Validation", accelerator: "CommandOrControl+6" },
  { id: "review", label: "Review", accelerator: "CommandOrControl+7" },
  { id: "production", label: "Export", accelerator: "CommandOrControl+8" },
  { id: "read", label: "Read", accelerator: "CommandOrControl+9" },
  { id: "variables", label: "Variables", accelerator: "CommandOrControl+0" },
  { id: "history", label: "Local History" },
];

function recentProjectsFile(): string {
  return path.join(app.getPath("userData"), "recent-projects.json");
}

function appSettingsFile(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function configureBundledTools(): void {
  if (!app.isPackaged) return;
  const bundledGitHubCli = path.join(process.resourcesPath, process.platform === "win32" ? "gh.exe" : "gh");
  if (existsSync(bundledGitHubCli)) process.env.REED_GH_PATH = bundledGitHubCli;
  if (process.platform === "darwin") process.env.REED_GH_BROWSER = "/usr/bin/true";
}

function appearanceState(): AppearanceState {
  return { preference: appearancePreference, resolved: nativeTheme.shouldUseDarkColors ? "dark" : "light" };
}

async function loadAppSettings(): Promise<void> {
  try {
    const parsed = JSON.parse(await readFile(appSettingsFile(), "utf8")) as { appearance?: unknown };
    if (parsed.appearance === "light" || parsed.appearance === "dark" || parsed.appearance === "system") appearancePreference = parsed.appearance;
  } catch { appearancePreference = "system"; }
  nativeTheme.themeSource = appearancePreference;
}

async function saveAppSettings(): Promise<void> {
  const file = appSettingsFile();
  const temporary = `${file}.${process.pid}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(temporary, `${JSON.stringify({ appearance: appearancePreference }, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

function publishAppearance(): AppearanceState {
  const state = appearanceState();
  window?.setBackgroundColor(state.resolved === "dark" ? "#0e1210" : "#f2f5f0");
  if (window && !window.isDestroyed()) window.webContents.send("reed:appearance-changed", state);
  return state;
}

async function setAppearance(preference: AppearancePreference): Promise<AppearanceState> {
  if (preference !== "system" && preference !== "light" && preference !== "dark") throw new Error("Unsupported appearance preference");
  appearancePreference = preference;
  nativeTheme.themeSource = preference;
  await saveAppSettings();
  refreshApplicationMenu();
  return publishAppearance();
}

async function loadRecentProjects(): Promise<RecentProject[]> {
  try {
    const parsed = parseRecentProjects(JSON.parse(await readFile(recentProjectsFile(), "utf8")));
    return parsed.map((project) => ({ ...project, available: existsSync(path.join(project.root, ".reed", "reed.sqlite")) }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
}

async function saveRecentProjects(): Promise<void> {
  const file = recentProjectsFile();
  const temporary = `${file}.${process.pid}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(recentProjects, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

function sendMenuCommand(command: MenuCommand): void {
  if (window && !window.isDestroyed()) window.webContents.send("reed:menu-command", command);
}

function requestedScreenshotPath(): string | undefined {
  const screenshotFlag = process.argv.indexOf("--screenshot");
  return process.env.REED_SCREENSHOT ?? (screenshotFlag >= 0 ? process.argv[screenshotFlag + 1] : undefined);
}

function requestedScreenshotWorkspace(): WorkspaceId | undefined {
  if (!requestedScreenshotPath()) return undefined;
  const workspaceFlag = process.argv.indexOf("--screenshot-workspace");
  const requested = workspaceFlag >= 0 ? process.argv[workspaceFlag + 1] : undefined;
  return workspaceMenuItems.some((item) => item.id === requested) ? requested as WorkspaceId : undefined;
}

function requestedScreenshotDimension(flag: "--screenshot-width" | "--screenshot-height", fallback: number, minimum: number): number {
  if (!requestedScreenshotPath()) return fallback;
  const index = process.argv.indexOf(flag);
  const parsed = index >= 0 ? Number.parseInt(process.argv[index + 1] ?? "", 10) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
}

function requestedScreenshotAction(): "save" | "github-status" | "project-settings" | null {
  if (!requestedScreenshotPath()) return null;
  const index = process.argv.indexOf("--screenshot-action");
  const requested = index >= 0 ? process.argv[index + 1] : undefined;
  return requested === "save" || requested === "github-status" || requested === "project-settings" ? requested : null;
}

function applicationMenuTemplate(): MenuItemConstructorOptions[] {
  const hasProject = Boolean(reed);
  const recentSubmenu: MenuItemConstructorOptions[] = recentProjects.length > 0
    ? recentProjects.map((project) => ({
      label: project.name,
      sublabel: project.root,
      toolTip: project.root,
      enabled: project.available,
      click: () => sendMenuCommand({ type: "open-recent", root: project.root }),
    }))
    : [{ label: "No Recent Projects", enabled: false }];
  recentSubmenu.push(
    { type: "separator" },
    { label: "Clear Recent Projects", enabled: recentProjects.length > 0, click: () => { void clearRecentProjects(); } },
  );
  const exportAction = (label: string, kind: ExportKind): MenuItemConstructorOptions => ({ label, click: () => sendMenuCommand({ type: "export", kind }) });
  const exportSubmenu: MenuItemConstructorOptions[] = [
    { label: "Pixel Crushers", submenu: [exportAction("Single Database", "pixel-single"), exportAction("Partitioned Databases", "pixel-partitioned")] },
    { label: "Game Engines & Localization", submenu: [
      exportAction("Unity Localization CSV", "unity-localization"), exportAction("Godot Localization CSV", "godot"),
      exportAction("Unreal String Tables", "unreal-string-table"), exportAction("Yarn Spinner Strings", "yarn-spinner"),
      exportAction("gettext PO", "gettext"), exportAction("XLIFF 2.0", "xliff-2.0"),
    ] },
    { label: "Plain Data", submenu: [exportAction("Localization JSON", "game-json"), exportAction("Localization CSV", "game-csv"), exportAction("Complete Reed Project JSON", "project")] },
    { type: "separator" },
    exportAction("Voice Package", "voice"),
    exportAction("Screenplay", "screenplay"),
  ];
  const template: MenuItemConstructorOptions[] = [];
  if (process.platform === "darwin") template.push({
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { label: "Settings…", accelerator: "CommandOrControl+,", click: () => sendMenuCommand({ type: "preferences" }) },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  });
  template.push(
    {
      label: "File",
      submenu: [
        { label: "New Project…", accelerator: "CommandOrControl+N", click: () => sendMenuCommand({ type: "new-project" }) },
        { label: "Open Project…", accelerator: "CommandOrControl+O", click: () => sendMenuCommand({ type: "open-project" }) },
        { label: "Open Recent", submenu: recentSubmenu },
        { type: "separator" },
        { label: "Project Home", accelerator: "CommandOrControl+Shift+H", enabled: hasProject, click: () => sendMenuCommand({ type: "show-home" }) },
        { label: "Close Project", accelerator: "CommandOrControl+Alt+W", enabled: hasProject, click: () => { void closeCurrentProject(true); } },
        { type: "separator" },
        { label: "Create Backup…", accelerator: "CommandOrControl+Shift+S", enabled: hasProject, click: () => sendMenuCommand({ type: "create-backup" }) },
        { label: "Export", enabled: hasProject, submenu: exportSubmenu },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" },
        { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "pasteAndMatchStyle" }, { role: "delete" }, { role: "selectAll" },
        { type: "separator" },
        { label: "Find in Project", accelerator: "CommandOrControl+F", enabled: hasProject, click: () => sendMenuCommand({ type: "focus-search" }) },
        { type: "separator" },
        { role: "startSpeaking" }, { role: "stopSpeaking" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Project Navigator", accelerator: "CommandOrControl+K", enabled: hasProject, click: () => sendMenuCommand({ type: "toggle-navigator" }) },
        { label: "Inspector", accelerator: "CommandOrControl+Shift+L", enabled: hasProject, click: () => sendMenuCommand({ type: "toggle-inspector" }) },
        { type: "separator" },
        { label: "Appearance", submenu: [
          { label: "Automatic", type: "radio", checked: appearancePreference === "system", click: () => { void setAppearance("system"); } },
          { label: "Light", type: "radio", checked: appearancePreference === "light", click: () => { void setAppearance("light"); } },
          { label: "Dark", type: "radio", checked: appearancePreference === "dark", click: () => { void setAppearance("dark"); } },
        ] },
        { type: "separator" },
        ...workspaceMenuItems.map((item) => ({
          label: item.label, type: "radio" as const, checked: activeWorkspace === item.id, accelerator: item.accelerator, enabled: hasProject,
          click: () => sendMenuCommand({ type: "workspace", workspace: item.id }),
        })),
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Project",
      submenu: [
        { label: "Project Settings…", enabled: hasProject, click: () => sendMenuCommand({ type: "project-settings" }) },
        { type: "separator" },
        { label: "Characters", enabled: hasProject, click: () => sendMenuCommand({ type: "workspace", workspace: "characters" }) },
        { label: "Variables", enabled: hasProject, click: () => sendMenuCommand({ type: "workspace", workspace: "variables" }) },
        { label: "Local History", enabled: hasProject, click: () => sendMenuCommand({ type: "workspace", workspace: "history" }) },
        { type: "separator" },
        { label: "Validate Project", enabled: hasProject, click: () => sendMenuCommand({ type: "workspace", workspace: "validation" }) },
        { label: "Review Changes", enabled: hasProject, click: () => sendMenuCommand({ type: "workspace", workspace: "review" }) },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }] },
    {
      role: "help",
      submenu: [{
        label: "Reed Help",
        click: () => { void dialog.showMessageBox({ type: "info", title: "Reed Help", message: "Reed keeps projects local and saves every edit automatically.", detail: "Use File → Project Home to switch projects without closing your current work. Use ⌘1–⌘9 and ⌘0 to move between workspaces. Project settings are under the Reed or Project menu." }); },
      }],
    },
  );
  return template;
}

function refreshApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuTemplate()));
}

async function rememberProject(project: ReedProject): Promise<void> {
  const record = project.getProject();
  recentProjects = upsertRecentProject(recentProjects, {
    root: project.paths.root, name: record.name, slug: record.slug, languages: record.languages,
    defaultLanguage: record.defaultLanguage, lastOpenedAt: new Date().toISOString(), available: true,
  });
  await saveRecentProjects();
  refreshApplicationMenu();
}

async function clearRecentProjects(): Promise<RecentProject[]> {
  recentProjects = [];
  await saveRecentProjects();
  refreshApplicationMenu();
  sendMenuCommand({ type: "show-home" });
  return recentProjects;
}

async function closeCurrentProject(notifyRenderer: boolean): Promise<void> {
  reed?.close();
  reed = null;
  activeWorkspace = "graph";
  refreshApplicationMenu();
  if (notifyRenderer) sendMenuCommand({ type: "close-project" });
}

function requireProject(): ReedProject {
  if (!reed) throw new Error("Open a Reed project first");
  return reed;
}

function requireGitHubProject(): ReedProject {
  const project = requireProject();
  if (project.getProject().pullRequestProvider !== "github") throw new Error("Enable GitHub for this project in Project Settings first");
  return project;
}

function ipcErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function connectGitHubFromEditor() {
  if (githubConnection) return githubConnection;
  const projectRoot = requireGitHubProject().paths.root;
  githubConnection = (async () => {
    try { await shell.openExternal(githubDeviceUrl); }
    catch { throw new Error(`Reed could not open GitHub in the default browser. Open ${githubDeviceUrl} manually, then try again.`); }
    return connectProjectGitHub(projectRoot);
  })();
  try { return await githubConnection; }
  finally { githubConnection = null; }
}

function bootstrap(project: ReedProject): EditorBootstrap {
  const changes = project.getChanges();
  return {
    root: project.paths.root,
    snapshot: createProjectSnapshot(project),
    validation: validateProject(project),
    lastChangeSequence: changes.at(-1)?.sequence ?? 0,
  };
}

async function openProject(root: string): Promise<EditorBootstrap> {
  const resolvedRoot = path.resolve(root);
  if (reed?.paths.root !== resolvedRoot) {
    const next = await ReedProject.open(resolvedRoot);
    reed?.close();
    reed = next;
  }
  await rememberProject(reed);
  return bootstrap(reed);
}

function installOfflineBoundary(): void {
  const developmentOrigin = (() => {
    try { return new URL(MAIN_WINDOW_WEBPACK_ENTRY).origin; } catch { return ""; }
  })();
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (details, callback) => {
    const allowedDevelopmentAsset = !app.isPackaged && developmentOrigin && details.url.startsWith(developmentOrigin);
    callback({ cancel: !allowedDevelopmentAsset });
  });
}

function registerIpc(): void {
  ipcMain.handle("reed:choose-project", async () => {
    const options = { title: "Open Reed project", properties: ["openDirectory"] as Array<"openDirectory"> };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("reed:choose-new-project", async () => {
    const options = { title: "Choose a folder for the new Reed project", properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory"> };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("reed:create-project", async (_event, root: string, input: Parameters<typeof ReedProject.create>[1]) => {
    const next = await ReedProject.create(root, input);
    reed?.close(); reed = next;
    await rememberProject(reed);
    return bootstrap(reed);
  });
  ipcMain.handle("reed:open-project", async (_event, root: string) => openProject(root));
  ipcMain.handle("reed:close-project", async () => { await closeCurrentProject(false); });
  ipcMain.handle("reed:recent-projects", () => recentProjects.map((project) => ({ ...project, available: existsSync(path.join(project.root, ".reed", "reed.sqlite")) })));
  ipcMain.handle("reed:forget-recent-project", async (_event, root: string) => {
    recentProjects = forgetRecentProject(recentProjects, path.resolve(root));
    await saveRecentProjects(); refreshApplicationMenu(); return recentProjects;
  });
  ipcMain.handle("reed:clear-recent-projects", () => clearRecentProjects());
  ipcMain.handle("reed:active-workspace", (_event, workspace: WorkspaceId) => {
    if (workspaceMenuItems.some((item) => item.id === workspace)) { activeWorkspace = workspace; refreshApplicationMenu(); }
  });
  ipcMain.handle("reed:bootstrap", () => reed ? bootstrap(reed) : null);
  ipcMain.handle("reed:conversation", (_event, id: string) => requireProject().getConversation(id));
  ipcMain.handle("reed:changes", (_event, after: number) => requireProject().getChanges(after));
  ipcMain.handle("reed:validate", () => validateProject(requireProject()));
  ipcMain.handle("reed:find", (_event, filters) => requireProject().findLines(filters));
  ipcMain.handle("reed:review-diff", () => requireProject().getReviewDiff());
  ipcMain.handle("reed:mutate", async (_event, name: MutationName, input: unknown) => {
    const project = requireProject();
    const operations: Record<MutationName, (value: never) => unknown> = {
      updateProject: (value) => project.updateProject(value), createLevel: (value) => project.createLevel(value), createScene: (value) => project.createScene(value),
      updateScene: (value) => project.updateScene(value), createConversation: (value) => project.createConversation(value),
      updateConversation: (value) => project.updateConversation(value), createPartition: (value) => project.createPartition(value),
      addNode: (value) => project.addNode(value), linkNodes: (value) => project.linkNodes(value),
      unlinkNodes: (value) => project.unlinkNodes(value), updateNode: (value) => project.updateNode(value),
      deleteNode: (value) => project.deleteNode(value), setNodeText: (value) => project.setNodeText(value),
      setLineStatus: (value) => project.setLineStatus(value), setVoiceStatus: (value) => project.setVoiceStatus(value),
      upsertCharacter: (value) => project.upsertCharacter(value), declareVariable: (value) => project.declareVariable(value),
      approveReview: (value) => project.approveReview(String((value as { label?: string }).label ?? "Approved")),
      createBackup: (value) => project.createBackup("named", String((value as { label?: string }).label ?? "Manual")),
    };
    const operation = operations[name];
    if (!operation) throw new Error(`Unsupported mutation: ${name}`);
    const result = await operation(input as never);
    if (name === "updateProject") await rememberProject(project);
    return result;
  });
  ipcMain.handle("reed:export", async (_event, kind: string, options: Record<string, unknown> = {}) => {
    const project = requireProject();
    if (kind === "project") return exportProjectJson(project, options.output as string | undefined);
    if (kind === "pixel-single") return exportPixelCrushers(project, { mode: "single", outputDirectory: options.output as string | undefined });
    if (kind === "pixel-partitioned") return exportPixelCrushers(project, { mode: "partitioned", outputDirectory: options.output as string | undefined });
    if (kind === "voice") return exportVoicePackage(project, {
      outputDirectory: options.output as string | undefined,
      language: options.language as string | undefined,
      characterIds: options.characterIds as string[] | undefined,
      voiceStatuses: options.voiceStatuses as string[] | undefined,
      lineStatuses: options.lineStatuses as string[] | undefined,
    });
    if (kind === "screenplay") return exportScreenplay(project, options.language as string | undefined, options.referenceLanguage as string | undefined);
    const gameFormats = {
      "game-json": "json",
      "game-csv": "csv",
      "unity-localization": "unity-localization",
      godot: "godot",
      "unreal-string-table": "unreal-string-table",
      "yarn-spinner": "yarn-spinner",
      gettext: "gettext",
      "xliff-2.0": "xliff-2.0",
    } as const;
    if (kind in gameFormats) return exportGameData(project, {
      format: gameFormats[kind as keyof typeof gameFormats],
      outputDirectory: options.output as string | undefined,
      languages: options.languages as string[] | undefined,
    });
    throw new Error(`Unsupported export: ${kind}`);
  });
  ipcMain.handle("reed:git-status", async () => {
    const project = requireProject();
    await exportProjectJson(project);
    return inspectProjectGit(project.paths.root);
  });
  ipcMain.handle("reed:git-init", async () => {
    const project = requireProject();
    await exportProjectJson(project);
    await initializeProjectGit(project.paths.root);
    return checkpointProjectGit(project.paths.root, "Initial Reed story");
  });
  ipcMain.handle("reed:git-checkpoint", async (_event, message: string) => {
    const project = requireProject();
    await exportProjectJson(project);
    return checkpointProjectGit(project.paths.root, message);
  });
  ipcMain.handle("reed:git-branch", async (_event, name: string) => {
    const project = requireProject();
    await exportProjectJson(project);
    return createProjectGitBranch(project.paths.root, name);
  });
  ipcMain.handle("reed:git-pr-handoff", async (_event, input: Parameters<typeof createProjectPullRequestHandoff>[1]) => {
    const project = requireProject();
    await exportProjectJson(project);
    return createProjectPullRequestHandoff(project.paths.root, input);
  });
  ipcMain.handle("reed:git-remote", (_event, url: string | null) => setProjectGitRemote(requireProject().paths.root, url));
  ipcMain.handle("reed:github-status", () => {
    const project = requireProject();
    return project.getProject().pullRequestProvider === "github" ? inspectProjectGitHub(project.paths.root) : disabledProjectGitHubStatus();
  });
  ipcMain.handle("reed:github-connect", async () => {
    try { return await connectGitHubFromEditor(); }
    catch (error) { throw new Error(ipcErrorMessage(error)); }
  });
  ipcMain.handle("reed:github-create-repository", async (_event, input: Parameters<typeof createProjectGitHubRepository>[1]) => {
    const project = requireGitHubProject();
    await exportProjectJson(project);
    return createProjectGitHubRepository(project.paths.root, input);
  });
  ipcMain.handle("reed:github-connect-repository", (_event, repository: string) => connectProjectGitHubRepository(requireGitHubProject().paths.root, repository));
  ipcMain.handle("reed:github-fetch", () => fetchProjectGitHub(requireGitHubProject().paths.root));
  ipcMain.handle("reed:github-push", async () => {
    const project = requireGitHubProject();
    await exportProjectJson(project);
    return pushProjectGitHub(project.paths.root);
  });
  ipcMain.handle("reed:github-pr-create", async (_event, input: Parameters<typeof createProjectGitHubPullRequest>[1]) => {
    const project = requireGitHubProject();
    await exportProjectJson(project);
    return createProjectGitHubPullRequest(project.paths.root, input);
  });
  ipcMain.handle("reed:github-pr-review", (_event, input: Parameters<typeof reviewProjectGitHubPullRequest>[1]) => reviewProjectGitHubPullRequest(requireGitHubProject().paths.root, input));
  ipcMain.handle("reed:github-pr-merge", (_event, number: number, strategy: "merge" | "squash" | "rebase") => mergeProjectGitHubPullRequest(requireGitHubProject().paths.root, number, strategy));
  ipcMain.handle("reed:backups", () => requireProject().listBackups());
  ipcMain.handle("reed:restore-backup", async (_event, backupId: string, confirmation: string) => {
    const project = requireProject();
    const root = project.paths.root;
    reed = null;
    try {
      await project.restoreBackup(String(backupId), String(confirmation));
    } finally {
      project.close();
      reed = await ReedProject.open(root);
    }
    refreshApplicationMenu();
    return bootstrap(reed);
  });
  ipcMain.handle("reed:get-appearance", () => appearanceState());
  ipcMain.handle("reed:set-appearance", (_event, preference: AppearancePreference) => setAppearance(preference));
  ipcMain.handle("reed:reveal", async (_event, filePath: string) => {
    const root = path.resolve(requireProject().paths.root);
    const target = path.resolve(filePath);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Reed can only reveal files inside the open project");
    shell.showItemInFolder(target);
  });
}

function revealWindow(target: BrowserWindow): void {
  if (target.isDestroyed()) return;
  if (target.isMinimized()) target.restore();
  if (!target.isVisible()) target.show();
  target.focus();
}

async function createWindow(): Promise<void> {
  const createdWindow = new BrowserWindow({
    width: requestedScreenshotDimension("--screenshot-width", 1500, 600),
    height: requestedScreenshotDimension("--screenshot-height", 940, 560),
    minWidth: 600, minHeight: 560, backgroundColor: nativeTheme.shouldUseDarkColors ? "#0e1210" : "#f2f5f0",
    title: "Reed", show: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  window = createdWindow;
  createdWindow.on("closed", () => { if (window === createdWindow) window = null; });
  createdWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  createdWindow.webContents.on("will-navigate", (event, url) => { if (url !== createdWindow.webContents.getURL()) event.preventDefault(); });
  const screenshotPath = requestedScreenshotPath();
  if (!screenshotPath) {
    createdWindow.once("ready-to-show", () => {
      revealWindow(createdWindow);
    });
  }
  await createdWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  if (!screenshotPath) revealWindow(createdWindow);
  if (screenshotPath) {
    const screenshotWorkspace = requestedScreenshotWorkspace();
    const screenshotAction = requestedScreenshotAction();
    if (screenshotWorkspace) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      sendMenuCommand({ type: "workspace", workspace: screenshotWorkspace });
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    } else {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    if (screenshotAction) {
      await createdWindow.webContents.executeJavaScript(screenshotAction === "project-settings" ? `(() => {
        const button = document.querySelector("button.project-name");
        if (!(button instanceof HTMLElement)) throw new Error("Project settings control is unavailable");
        button.click();
      })()` : `(() => {
        const button = document.querySelector("button.save-indicator");
        if (!(button instanceof HTMLElement)) throw new Error("Saved control is unavailable");
        button.click();
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 750));
      if (screenshotAction === "github-status") {
        await createdWindow.webContents.executeJavaScript(`(() => {
          const button = Array.from(document.querySelectorAll(".save-git-popover button")).find((candidate) => candidate.textContent?.trim() === "Check connection");
          if (!(button instanceof HTMLElement)) throw new Error("Check connection action is unavailable");
          button.click();
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 2_500));
      }
    }
    const image = await createdWindow.webContents.capturePage();
    await writeFile(path.resolve(screenshotPath), image.toPNG());
    app.quit();
    return;
  }
}

app.setName("Reed");
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("will-quit", () => { reed?.close(); reed = null; });
app.on("activate", () => {
  if (!window || window.isDestroyed()) void createWindow();
  else revealWindow(window);
});

void app.whenReady().then(async () => {
  configureBundledTools();
  await loadAppSettings();
  nativeTheme.on("updated", publishAppearance);
  installOfflineBoundary();
  registerIpc();
  recentProjects = await loadRecentProjects();
  refreshApplicationMenu();
  const projectFlag = process.argv.indexOf("--project");
  const requestedProject = projectFlag >= 0 ? process.argv[projectFlag + 1] : undefined;
  if (requestedProject) await openProject(path.resolve(requestedProject));
  await createWindow();
}).catch(async (error: unknown) => {
  const detail = error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);
  const screenshotPath = requestedScreenshotPath();
  if (screenshotPath) await writeFile(`${path.resolve(screenshotPath)}.error.txt`, detail, "utf8");
  else dialog.showErrorBox("Reed could not start", detail);
  app.quit();
});
