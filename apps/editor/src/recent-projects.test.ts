import { describe, expect, it } from "vitest";
import { forgetRecentProject, parseRecentProjects, upsertRecentProject, type RecentProject } from "./recent-projects.js";

const project = (root: string, lastOpenedAt: string): RecentProject => ({
  root, name: root.slice(1), slug: root.slice(1), languages: ["en", "el"], defaultLanguage: "en", lastOpenedAt, available: true,
});

describe("recent projects", () => {
  it("deduplicates, sorts, limits, and forgets local projects", () => {
    const initial = Array.from({ length: 9 }, (_, index) => project(`/project-${index}`, `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`));
    const updated = upsertRecentProject(initial, project("/project-2", "2026-08-01T00:00:00.000Z"));
    expect(updated).toHaveLength(8);
    expect(updated[0]?.root).toBe("/project-2");
    expect(updated.filter((candidate) => candidate.root === "/project-2")).toHaveLength(1);
    expect(forgetRecentProject(updated, "/project-2").some((candidate) => candidate.root === "/project-2")).toBe(false);
  });

  it("ignores malformed persisted entries", () => {
    expect(parseRecentProjects([{ root: "/valid", name: "Valid", slug: "valid", languages: ["en"], defaultLanguage: "en", lastOpenedAt: "2026-07-17T00:00:00.000Z" }, { root: 42 }, { root: "/bad-date", name: "Bad", slug: "bad", languages: ["en"], defaultLanguage: "en", lastOpenedAt: "not-a-date" }]))
      .toEqual([expect.objectContaining({ root: "/valid", available: true })]);
  });
});
