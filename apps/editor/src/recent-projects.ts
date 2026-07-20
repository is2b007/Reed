export interface RecentProject {
  root: string;
  name: string;
  slug: string;
  languages: string[];
  defaultLanguage: string;
  lastOpenedAt: string;
  available: boolean;
}

const recentProjectLimit = 8;

function isRecentProject(value: unknown): value is Omit<RecentProject, "available"> & { available?: boolean } {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.root === "string" && typeof record.name === "string" && typeof record.slug === "string"
    && Array.isArray(record.languages) && record.languages.every((language) => typeof language === "string")
    && typeof record.defaultLanguage === "string" && record.languages.includes(record.defaultLanguage)
    && typeof record.lastOpenedAt === "string" && Number.isFinite(Date.parse(record.lastOpenedAt));
}

export function parseRecentProjects(value: unknown): RecentProject[] {
  if (!Array.isArray(value)) return [];
  const projects: RecentProject[] = [];
  for (const project of value) {
    if (isRecentProject(project)) projects.push({ ...project, available: project.available ?? true });
  }
  return projects.sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt)).slice(0, recentProjectLimit);
}

export function upsertRecentProject(projects: RecentProject[], project: RecentProject): RecentProject[] {
  return [project, ...projects.filter((candidate) => candidate.root !== project.root)]
    .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt)).slice(0, recentProjectLimit);
}

export function forgetRecentProject(projects: RecentProject[], root: string): RecentProject[] {
  return projects.filter((project) => project.root !== root);
}
