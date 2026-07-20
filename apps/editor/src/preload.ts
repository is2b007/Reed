import { contextBridge, ipcRenderer } from "electron";
import type { AppearanceState, MenuCommand, MutationName, ReedDesktopApi, SaveStateEvent } from "./contract.js";

const saveListeners = new Set<(event: SaveStateEvent) => void>();
function emitSaveState(event: SaveStateEvent): void { for (const listener of saveListeners) listener(event); }

const api: ReedDesktopApi = {
  chooseProject: () => ipcRenderer.invoke("reed:choose-project") as Promise<string | null>,
  chooseNewProject: () => ipcRenderer.invoke("reed:choose-new-project") as Promise<string | null>,
  createProject: (root, input) => ipcRenderer.invoke("reed:create-project", root, input),
  openProject: (root) => ipcRenderer.invoke("reed:open-project", root),
  closeProject: () => ipcRenderer.invoke("reed:close-project"),
  getRecentProjects: () => ipcRenderer.invoke("reed:recent-projects"),
  forgetRecentProject: (root) => ipcRenderer.invoke("reed:forget-recent-project", root),
  clearRecentProjects: () => ipcRenderer.invoke("reed:clear-recent-projects"),
  getBootstrap: () => ipcRenderer.invoke("reed:bootstrap"),
  getConversation: (id) => ipcRenderer.invoke("reed:conversation", id),
  getChanges: (afterSequence) => ipcRenderer.invoke("reed:changes", afterSequence),
  mutate: async (name: MutationName, input) => {
    emitSaveState({ status: "saving" });
    try {
      const result = await ipcRenderer.invoke("reed:mutate", name, input);
      emitSaveState({ status: "saved", at: new Date().toISOString() });
      return result;
    } catch (error) {
      emitSaveState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
  validate: () => ipcRenderer.invoke("reed:validate"),
  findLines: (filters) => ipcRenderer.invoke("reed:find", filters),
  getReviewDiff: () => ipcRenderer.invoke("reed:review-diff"),
  export: (kind, options) => ipcRenderer.invoke("reed:export", kind, options),
  getProjectGitStatus: () => ipcRenderer.invoke("reed:git-status"),
  initializeProjectGit: () => ipcRenderer.invoke("reed:git-init"),
  createProjectGitCheckpoint: (message) => ipcRenderer.invoke("reed:git-checkpoint", message),
  createProjectGitBranch: (name) => ipcRenderer.invoke("reed:git-branch", name),
  prepareProjectPullRequest: (input) => ipcRenderer.invoke("reed:git-pr-handoff", input),
  setProjectGitRemote: (url) => ipcRenderer.invoke("reed:git-remote", url),
  getProjectGitHubStatus: () => ipcRenderer.invoke("reed:github-status"),
  connectProjectGitHub: () => ipcRenderer.invoke("reed:github-connect"),
  createProjectGitHubRepository: (input) => ipcRenderer.invoke("reed:github-create-repository", input),
  connectProjectGitHubRepository: (repository) => ipcRenderer.invoke("reed:github-connect-repository", repository),
  fetchProjectGitHub: () => ipcRenderer.invoke("reed:github-fetch"),
  pushProjectGitHub: () => ipcRenderer.invoke("reed:github-push"),
  createProjectGitHubPullRequest: (input) => ipcRenderer.invoke("reed:github-pr-create", input),
  reviewProjectGitHubPullRequest: (input) => ipcRenderer.invoke("reed:github-pr-review", input),
  mergeProjectGitHubPullRequest: (number, strategy) => ipcRenderer.invoke("reed:github-pr-merge", number, strategy),
  getAppearance: () => ipcRenderer.invoke("reed:get-appearance"),
  setAppearance: (preference) => ipcRenderer.invoke("reed:set-appearance", preference),
  revealInFinder: (filePath) => ipcRenderer.invoke("reed:reveal", filePath),
  setActiveWorkspace: (workspace) => ipcRenderer.invoke("reed:active-workspace", workspace),
  onMenuCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: MenuCommand) => listener(command);
    ipcRenderer.on("reed:menu-command", handler);
    return () => ipcRenderer.removeListener("reed:menu-command", handler);
  },
  onSaveState: (listener) => {
    saveListeners.add(listener);
    return () => { saveListeners.delete(listener); };
  },
  onAppearanceChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppearanceState) => listener(state);
    ipcRenderer.on("reed:appearance-changed", handler);
    return () => ipcRenderer.removeListener("reed:appearance-changed", handler);
  },
};

contextBridge.exposeInMainWorld("reed", api);
