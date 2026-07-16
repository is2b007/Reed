import path from "node:path";
import { writeFile } from "node:fs/promises";
import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import {
  ReedProject,
  createProjectSnapshot,
  exportPixelCrushers,
  exportProjectJson,
  exportScreenplay,
  exportVoicePackage,
  validateProject,
} from "@reed/core";
import type { EditorBootstrap, MutationName } from "./contract.js";

let window: BrowserWindow | null = null;
let reed: ReedProject | null = null;

function requestedScreenshotPath(): string | undefined {
  const screenshotFlag = process.argv.indexOf("--screenshot");
  return process.env.REED_SCREENSHOT ?? (screenshotFlag >= 0 ? process.argv[screenshotFlag + 1] : undefined);
}

function requireProject(): ReedProject {
  if (!reed) throw new Error("Open a Reed project first");
  return reed;
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
  reed?.close();
  reed = await ReedProject.open(root);
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
    reed?.close(); reed = await ReedProject.create(root, input); return bootstrap(reed);
  });
  ipcMain.handle("reed:open-project", async (_event, root: string) => openProject(root));
  ipcMain.handle("reed:bootstrap", () => reed ? bootstrap(reed) : null);
  ipcMain.handle("reed:conversation", (_event, id: string) => requireProject().getConversation(id));
  ipcMain.handle("reed:changes", (_event, after: number) => requireProject().getChanges(after));
  ipcMain.handle("reed:validate", () => validateProject(requireProject()));
  ipcMain.handle("reed:find", (_event, filters) => requireProject().findLines(filters));
  ipcMain.handle("reed:review-diff", () => requireProject().getReviewDiff());
  ipcMain.handle("reed:mutate", async (_event, name: MutationName, input: unknown) => {
    const project = requireProject();
    const operations: Record<MutationName, (value: never) => unknown> = {
      createLevel: (value) => project.createLevel(value), createScene: (value) => project.createScene(value),
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
    return operation(input as never);
  });
  ipcMain.handle("reed:export", async (_event, kind: string, options: Record<string, unknown> = {}) => {
    const project = requireProject();
    if (kind === "project") return exportProjectJson(project, options.output as string | undefined);
    if (kind === "pixel-single") return exportPixelCrushers(project, { mode: "single", outputDirectory: options.output as string | undefined });
    if (kind === "pixel-partitioned") return exportPixelCrushers(project, { mode: "partitioned", outputDirectory: options.output as string | undefined });
    if (kind === "voice") return exportVoicePackage(project, { outputDirectory: options.output as string | undefined, language: options.language as string | undefined });
    if (kind === "screenplay") return exportScreenplay(project, options.language as string | undefined, options.referenceLanguage as string | undefined);
    throw new Error(`Unsupported export: ${kind}`);
  });
}

async function createWindow(): Promise<void> {
  const createdWindow = new BrowserWindow({
    width: 1500, height: 940, minWidth: 600, minHeight: 560, backgroundColor: "#0e1210",
    title: "Reed", show: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  window = createdWindow;
  createdWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  createdWindow.webContents.on("will-navigate", (event, url) => { if (url !== createdWindow.webContents.getURL()) event.preventDefault(); });
  const screenshotPath = requestedScreenshotPath();
  if (!screenshotPath) {
    createdWindow.once("ready-to-show", () => {
      if (!createdWindow.isDestroyed()) createdWindow.show();
    });
  }
  await createdWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  if (screenshotPath) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const image = await createdWindow.webContents.capturePage();
    await writeFile(path.resolve(screenshotPath), image.toPNG());
    app.quit();
    return;
  }
}

app.setName("Reed");
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("will-quit", () => { reed?.close(); reed = null; });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });

void app.whenReady().then(async () => {
  installOfflineBoundary();
  registerIpc();
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
