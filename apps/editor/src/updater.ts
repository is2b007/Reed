import { createHash, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, open, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { app, session, shell, type Session } from "electron";
import type { UpdateState } from "./contract.js";
import {
  fetchAllowedUpdate, installLocationProblem, isAllowedUpdateUrl, isNewerVersion, latestReleaseUrl, parseChecksums, parseRelease,
  updateAssetName, updateRepository, type ReleaseInfo,
} from "./update-logic.js";

const run = promisify(execFile);
const automaticCheckDelay = 20_000;
const automaticCheckInterval = 12 * 60 * 60 * 1000;

interface UpdaterOptions {
  autoCheck: boolean;
  publish(state: UpdateState): void;
  persistAutoCheck(enabled: boolean): Promise<void>;
}

/**
 * Opt-in updater for the zipped macOS and Windows builds. It never runs on its own: checks happen when the
 * user presses Check for Updates, or on a schedule only after they turn automatic checks on. Requests use a
 * dedicated in-memory session so the default session's offline boundary stays intact.
 */
export class DesktopUpdater {
  private current: UpdateState;
  private release: ReleaseInfo | null = null;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private checking: Promise<UpdateState> | null = null;
  private network: Session | null = null;

  constructor(private readonly options: UpdaterOptions) {
    this.current = {
      status: "idle",
      currentVersion: app.getVersion(),
      autoCheck: options.autoCheck,
      canInstall: this.installProblem() === null,
    };
    this.schedule();
  }

  state(): UpdateState {
    return this.current;
  }

  async setAutoCheck(enabled: boolean): Promise<UpdateState> {
    await this.options.persistAutoCheck(enabled);
    this.update({ autoCheck: enabled });
    this.schedule();
    return this.current;
  }

  check(automatic = false): Promise<UpdateState> {
    if (this.current.status === "downloading" || this.current.status === "installing") return Promise.resolve(this.current);
    this.checking ??= this.performCheck(automatic).finally(() => { this.checking = null; });
    return this.checking;
  }

  async install(): Promise<UpdateState> {
    if (this.current.status !== "available" || !this.release) await this.check();
    const release = this.release;
    if (this.current.status !== "available" || !release) return this.current;
    const problem = this.installProblem();
    if (problem) return this.fail(problem);
    const assetName = updateAssetName(release.version, process.platform, process.arch);
    const asset = release.assets.find((candidate) => candidate.name === assetName);
    const checksumAsset = release.assets.find((candidate) => candidate.name === "SHA256SUMS.txt");
    if (!asset || !checksumAsset) return this.fail(`Reed ${release.version} has no ${assetName ?? "build"} for this computer yet. Download it from the release page instead.`);

    const workspace = path.join(app.getPath("temp"), `reed-update-${release.version}-${randomUUID().slice(0, 8)}`);
    try {
      await mkdir(workspace, { recursive: true });
      this.update({ status: "downloading", progress: 0, message: `Downloading Reed ${release.version}…` });
      const checksums = parseChecksums(await (await this.get(checksumAsset.url)).text());
      const expected = checksums.get(asset.name);
      if (!expected) throw new Error(`The release checksums do not list ${asset.name}`);
      const archive = path.join(workspace, asset.name);
      const actual = await this.download(asset.url, archive, asset.size);
      if (actual !== expected) throw new Error("The downloaded update did not match its published checksum, so it was not installed");

      this.update({ status: "installing", progress: 1, message: "Preparing the update…" });
      const extracted = path.join(workspace, "extracted");
      await mkdir(extracted);
      if (process.platform === "darwin") await this.installMac(archive, extracted, workspace, release.version);
      else await this.installWindows(archive, extracted, workspace);
      this.update({ message: "Restarting Reed…" });
      setImmediate(() => app.quit());
      return this.current;
    } catch (error) {
      await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
      return this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  async openReleasePage(): Promise<void> {
    const url = this.current.releaseUrl ?? `https://github.com/${updateRepository}/releases/latest`;
    if (!isAllowedUpdateUrl(url)) throw new Error("Refusing to open an unexpected release page");
    await shell.openExternal(url);
  }

  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  private async performCheck(automatic: boolean): Promise<UpdateState> {
    this.update({ status: "checking", message: undefined, progress: undefined });
    try {
      const response = await this.get(latestReleaseUrl, { Accept: "application/vnd.github+json" });
      const release = parseRelease(await response.json());
      const lastCheckedAt = new Date().toISOString();
      if (!isNewerVersion(release.version, this.current.currentVersion)) {
        this.release = null;
        return this.update({ status: "current", latestVersion: release.version, releaseUrl: release.pageUrl, notes: undefined, lastCheckedAt });
      }
      this.release = release;
      return this.update({ status: "available", latestVersion: release.version, releaseUrl: release.pageUrl, notes: release.notes.slice(0, 4_000), lastCheckedAt });
    } catch (error) {
      // A scheduled check that fails (offline, rate limited) stays quiet until the next one.
      if (automatic) return this.update({ status: this.release ? "available" : "idle" });
      return this.fail(`Reed could not check for updates: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private schedule(): void {
    this.dispose();
    if (!this.current.autoCheck) return;
    this.timers.push(setTimeout(() => { void this.check(true); }, automaticCheckDelay));
    this.timers.push(setInterval(() => { void this.check(true); }, automaticCheckInterval));
  }

  private installProblem(): string | null {
    if (!app.isPackaged) return "Updates install only in packaged builds of Reed.";
    if (!updateAssetName(app.getVersion(), process.platform, process.arch)) return "Automatic installs are available for macOS on Apple silicon and Windows x64.";
    return installLocationProblem(this.installTarget(), process.platform);
  }

  /** The folder that gets replaced: Reed.app on macOS, the unzipped Reed folder on Windows. */
  private installTarget(): string {
    return process.platform === "darwin" ? path.resolve(process.execPath, "../../..") : path.dirname(process.execPath);
  }

  private async installMac(archive: string, extracted: string, workspace: string, version: string): Promise<void> {
    const target = this.installTarget();
    await access(path.dirname(target), constants.W_OK).catch(() => {
      throw new Error(`Reed cannot write to ${path.dirname(target)}. Move Reed to a folder you can change, or install the update by hand.`);
    });
    await run("/usr/bin/ditto", ["-x", "-k", archive, extracted]);
    const replacement = path.join(extracted, "Reed.app");
    await access(replacement).catch(() => { throw new Error("The update archive does not contain Reed.app"); });
    await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", replacement]);
    const { stdout } = await run("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path.join(replacement, "Contents", "Info.plist")]);
    if (stdout.trim() !== version) throw new Error(`The update archive contains Reed ${stdout.trim()}, not ${version}`);
    const [currentTeam, nextTeam] = await Promise.all([signingTeam(target), signingTeam(replacement)]);
    if (currentTeam && currentTeam !== nextTeam) throw new Error("The update is not signed by the same developer as this copy of Reed, so it was not installed");

    const script = path.join(workspace, "install.sh");
    await writeFile(script, [
      "#!/bin/bash",
      'pid="$1"; replacement="$2"; target="$3"; workspace="$4"',
      'while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done',
      'backup="${target%.app}.reed-update-backup.app"',
      'rm -rf "$backup"',
      'if mv "$target" "$backup"; then',
      '  if /usr/bin/ditto "$replacement" "$target"; then rm -rf "$backup"; else rm -rf "$target"; mv "$backup" "$target"; fi',
      "fi",
      '/usr/bin/xattr -dr com.apple.quarantine "$target" 2>/dev/null',
      '/usr/bin/open "$target"',
      'rm -rf "$workspace"',
      "",
    ].join("\n"), { mode: 0o700 });
    spawn("/bin/bash", [script, String(process.pid), replacement, target, workspace], { detached: true, stdio: "ignore", cwd: workspace }).unref();
  }

  private async installWindows(archive: string, extracted: string, workspace: string): Promise<void> {
    const target = this.installTarget();
    const executable = path.basename(process.execPath);
    await access(path.dirname(target), constants.W_OK).catch(() => {
      throw new Error(`Reed cannot write to ${path.dirname(target)}. Move the Reed folder somewhere you can change, or install the update by hand.`);
    });
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", archive, extracted]);
    const replacement = await findFolderContaining(extracted, executable);
    if (!replacement) throw new Error(`The update archive does not contain ${executable}`);
    await access(path.join(replacement, "resources", "app.asar")).catch(() => { throw new Error("The update archive is incomplete"); });

    const script = path.join(workspace, "install.ps1");
    await writeFile(script, [
      "param([int]$ProcessId, [string]$Replacement, [string]$Target, [string]$Executable, [string]$Workspace)",
      "while (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 200 }",
      '$backup = "$Target.reed-update-backup"',
      "if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }",
      "$moved = $false",
      "for ($attempt = 0; $attempt -lt 25 -and -not $moved; $attempt++) {",
      "  try { Move-Item -LiteralPath $Target -Destination $backup -ErrorAction Stop; $moved = $true } catch { Start-Sleep -Milliseconds 400 }",
      "}",
      "if ($moved) {",
      "  try { Copy-Item -LiteralPath $Replacement -Destination $Target -Recurse -ErrorAction Stop; Remove-Item -LiteralPath $backup -Recurse -Force }",
      "  catch { if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }; Move-Item -LiteralPath $backup -Destination $Target }",
      "}",
      "Start-Process -FilePath (Join-Path $Target $Executable)",
      "Remove-Item -LiteralPath $Workspace -Recurse -Force -ErrorAction SilentlyContinue",
      "",
    ].join("\r\n"), "utf8");
    spawn("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script,
      "-ProcessId", String(process.pid), "-Replacement", replacement, "-Target", target, "-Executable", executable, "-Workspace", workspace,
    ], { detached: true, stdio: "ignore", cwd: workspace, windowsHide: true }).unref();
  }

  private async get(url: string, headers: Record<string, string> = {}): Promise<Response> {
    if (!isAllowedUpdateUrl(url)) throw new Error("Refusing to contact an unexpected update host");
    const network = this.network ??= session.fromPartition("reed-updates", { cache: false });
    const response = await fetchAllowedUpdate(
      (target, init) => network.fetch(target, init),
      url,
      { headers: { "User-Agent": `Reed/${app.getVersion()}`, ...headers } },
    );
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    return response;
  }

  private async download(url: string, destination: string, expectedSize: number): Promise<string> {
    const response = await this.get(url, { Accept: "application/octet-stream" });
    if (!response.body) throw new Error("The update download was empty");
    const total = Number(response.headers.get("content-length")) || expectedSize;
    const hash = createHash("sha256");
    const file = await open(destination, "w");
    let received = 0;
    let reported = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        hash.update(chunk);
        await file.write(chunk);
        received += chunk.byteLength;
        const progress = total ? Math.min(received / total, 1) : 0;
        if (progress - reported >= 0.02) { reported = progress; this.update({ progress }); }
      }
    } finally {
      await file.close();
    }
    return hash.digest("hex");
  }

  private fail(message: string): UpdateState {
    return this.update({ status: "error", message, progress: undefined });
  }

  private update(patch: Partial<UpdateState>): UpdateState {
    this.current = { ...this.current, ...patch };
    this.options.publish(this.current);
    return this.current;
  }
}

async function signingTeam(appPath: string): Promise<string | null> {
  try {
    const { stderr } = await run("/usr/bin/codesign", ["-dv", "--verbose=2", appPath]);
    const team = /TeamIdentifier=(\S+)/.exec(stderr)?.[1];
    return team && team !== "not" ? team : null;
  } catch {
    return null;
  }
}

async function findFolderContaining(root: string, fileName: string): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === fileName)) return root;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const children = await readdir(path.join(root, entry.name));
    if (children.includes(fileName)) return path.join(root, entry.name);
  }
  return null;
}
