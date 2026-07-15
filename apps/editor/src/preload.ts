import { contextBridge, ipcRenderer } from "electron";
import type { MutationName, ReedDesktopApi } from "./contract.js";

const api: ReedDesktopApi = {
  chooseProject: () => ipcRenderer.invoke("reed:choose-project") as Promise<string | null>,
  chooseNewProject: () => ipcRenderer.invoke("reed:choose-new-project") as Promise<string | null>,
  createProject: (root, input) => ipcRenderer.invoke("reed:create-project", root, input),
  openProject: (root) => ipcRenderer.invoke("reed:open-project", root),
  getBootstrap: () => ipcRenderer.invoke("reed:bootstrap"),
  getConversation: (id) => ipcRenderer.invoke("reed:conversation", id),
  getChanges: (afterSequence) => ipcRenderer.invoke("reed:changes", afterSequence),
  mutate: (name: MutationName, input) => ipcRenderer.invoke("reed:mutate", name, input),
  validate: () => ipcRenderer.invoke("reed:validate"),
  findLines: (filters) => ipcRenderer.invoke("reed:find", filters),
  getReviewDiff: () => ipcRenderer.invoke("reed:review-diff"),
  export: (kind, options) => ipcRenderer.invoke("reed:export", kind, options),
};

contextBridge.exposeInMainWorld("reed", api);
