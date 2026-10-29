// Pure helpers for the opt-in desktop updater. Kept free of Electron so they can be unit tested.

export const updateRepository = "is2b007/Reed";
export const latestReleaseUrl = `https://api.github.com/repos/${updateRepository}/releases/latest`;

/** Hosts a release lookup or download may touch. Anything else is refused. */
const allowedUpdateHosts = new Set([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

export interface ReleaseAsset { name: string; url: string; size: number }
export interface ReleaseInfo { version: string; tag: string; pageUrl: string; notes: string; assets: ReleaseAsset[] }

export function isAllowedUpdateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedUpdateHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function versionParts(version: string): [number, number, number, string] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? ""];
}

/** True when `candidate` is a newer release than `current`. Prereleases never count as newer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = versionParts(candidate);
  const now = versionParts(current);
  if (!next || !now || next[3]) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== now[index]) return (next[index] as number) > (now[index] as number);
  }
  return Boolean(now[3]);
}

export function parseRelease(value: unknown): ReleaseInfo {
  const release = value as { tag_name?: unknown; html_url?: unknown; body?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown };
  if (!release || typeof release.tag_name !== "string" || typeof release.html_url !== "string" || !Array.isArray(release.assets)) {
    throw new Error("GitHub returned an unexpected release format");
  }
  if (release.draft || release.prerelease) throw new Error("The latest release is not a stable release");
  const version = release.tag_name.replace(/^v/, "");
  if (!versionParts(version)) throw new Error(`Unrecognized release version ${release.tag_name}`);
  const assets = release.assets.flatMap((asset: { name?: unknown; browser_download_url?: unknown; size?: unknown }) =>
    typeof asset?.name === "string" && typeof asset.browser_download_url === "string" && isAllowedUpdateUrl(asset.browser_download_url)
      ? [{ name: asset.name, url: asset.browser_download_url, size: typeof asset.size === "number" ? asset.size : 0 }]
      : []);
  return { version, tag: release.tag_name, pageUrl: release.html_url, notes: typeof release.body === "string" ? release.body : "", assets };
}

/** The archive the release workflow publishes for this platform, e.g. Reed-0.2.1-macos-arm64.zip. */
export function updateAssetName(version: string, platform: NodeJS.Platform, arch: string): string | null {
  if (platform === "darwin" && arch === "arm64") return `Reed-${version}-macos-arm64.zip`;
  if (platform === "win32" && arch === "x64") return `Reed-${version}-windows-x64.zip`;
  return null;
}

/** Reads `sha256sum` output ("<hash>  ./<file>") into a file name → lowercase hash map. */
export function parseChecksums(contents: string): Map<string, string> {
  const checksums = new Map<string, string>();
  for (const line of contents.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(?:\.\/)?(.+)$/.exec(line.trim());
    if (match) checksums.set(match[2]!.trim(), match[1]!.toLowerCase());
  }
  return checksums;
}

/** Self-replacement is only safe from a normal install, not a mounted DMG or a Gatekeeper-translocated copy. */
export function installLocationProblem(appPath: string, platform: NodeJS.Platform): string | null {
  if (platform === "darwin") {
    if (!appPath.endsWith(".app")) return "Reed is not running from an app bundle.";
    if (appPath.startsWith("/Volumes/")) return "Reed is running from the disk image. Drag it to Applications first, then update.";
    if (appPath.includes("/AppTranslocation/")) return "macOS is running Reed from a temporary location. Move Reed to Applications and open it from there, then update.";
  }
  return null;
}
