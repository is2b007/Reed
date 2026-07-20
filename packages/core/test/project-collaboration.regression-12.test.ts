import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReedProject, serializeProject } from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project collaboration settings", () => {
  it("versions, persists, and exports the offline GitHub handoff preference", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-collaboration-test-"));
    roots.push(root);
    const project = await ReedProject.create(root, { name: "Team Story", slug: "team-story", languages: ["en", "el"], defaultLanguage: "en" });
    const original = project.getProject();
    expect(original).toMatchObject({ pullRequestProvider: "disabled", pullRequestBaseBranch: "main" });

    const updated = await project.updateProject({
      pullRequestProvider: "github",
      pullRequestBaseBranch: "release/dialogue",
      expectedVersion: original.version,
    });
    expect(updated.value).toMatchObject({ pullRequestProvider: "github", pullRequestBaseBranch: "release/dialogue", version: original.version + 1 });
    expect(serializeProject(project)).toContain('"pullRequestProvider": "github"');
    project.close();

    const reopened = await ReedProject.open(root);
    try {
      expect(reopened.getProject()).toMatchObject({ pullRequestProvider: "github", pullRequestBaseBranch: "release/dialogue" });
    } finally { reopened.close(); }
  });
});
