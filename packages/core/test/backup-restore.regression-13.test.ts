import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReedProject } from "../src/index.js";

const openProjects: ReedProject[] = [];
afterEach(() => { while (openProjects.length > 0) openProjects.pop()?.close(); });

async function createProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), "reed-restore-"));
  const project = await ReedProject.create(root, { name: "Restore", slug: "restore-story", languages: ["en"], defaultLanguage: "en" });
  openProjects.push(project);
  return { root, project };
}

describe("backup restore", () => {
  it("keeps every backup, including a pre-restore safety copy, after restoring and pruning", async () => {
    const { root, project } = await createProject();
    const first = await project.createBackup("rolling");
    await project.createScene({ name: "Later", slug: "later" });
    await project.createBackup("rolling");
    const result = await project.restoreBackup(first.id, first.id);

    const reopened = await ReedProject.open(root);
    openProjects.push(reopened);
    expect(reopened.listScenes()).toHaveLength(0);
    await reopened.createBackup("rolling");
    const files = await readdir(reopened.paths.backups);
    expect(files).toHaveLength(4);
    const ids = reopened.listBackups().map((backup) => backup.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(result.safetyBackupId);

    await reopened.restoreBackup(result.safetyBackupId, result.safetyBackupId);
    const undone = await ReedProject.open(root);
    openProjects.push(undone);
    expect(undone.listScenes().map((scene) => scene.slug)).toEqual(["later"]);
  });

  it("restores while another connection has the project open", async () => {
    const { root, project } = await createProject();
    const backup = await project.createBackup("named", "Empty");
    await project.createScene({ name: "Draft", slug: "draft" });
    const other = await ReedProject.open(root);
    openProjects.push(other);
    expect(other.listScenes()).toHaveLength(1);
    await project.restoreBackup(backup.id, backup.id);
    expect(other.listScenes()).toHaveLength(0);
  });
});
