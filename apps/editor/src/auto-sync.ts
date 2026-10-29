import { autoSyncProjectGit, type ProjectGitAutoSyncResult } from "@reed/core";
import type { AutoSyncSettings, AutoSyncState } from "./contract.js";

export const autoSyncIntervals = [1, 5, 10, 15, 30, 60] as const;
export const defaultAutoSyncSettings: AutoSyncSettings = { enabled: true, intervalMinutes: 5 };

export function parseAutoSyncSettings(value: unknown): AutoSyncSettings {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const interval = Number(input.intervalMinutes);
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : defaultAutoSyncSettings.enabled,
    intervalMinutes: (autoSyncIntervals as readonly number[]).includes(interval) ? interval : defaultAutoSyncSettings.intervalMinutes,
  };
}

interface AutoSyncOptions {
  settings: AutoSyncSettings;
  /** The open project's root, or null when no project is open. */
  projectRoot(): string | null;
  /** False keeps autosave local, e.g. while GitHub collaboration is off for the project. */
  canPush(): boolean;
  /** Writes the live story to exports/reed-project.json so the checkpoint has it. */
  exportProject(): Promise<void>;
  /** Runs Git work one operation at a time, shared with the manual Git actions. */
  serialize<T>(work: () => Promise<T>): Promise<T>;
  publish(state: AutoSyncState): void;
  persist(settings: AutoSyncSettings): Promise<void>;
  sync?: typeof autoSyncProjectGit;
}

/**
 * Commits the open story to its local Git history on a timer and pushes to origin when one is set.
 * On by default. Projects without local history are left alone, and pushes never overwrite newer remote work.
 */
export class AutoSyncController {
  private current: AutoSyncState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<AutoSyncState> | null = null;

  constructor(private readonly options: AutoSyncOptions) {
    this.current = { ...options.settings, running: false };
    this.schedule();
  }

  state(): AutoSyncState {
    return this.current;
  }

  async configure(input: Partial<AutoSyncSettings>): Promise<AutoSyncState> {
    const settings = parseAutoSyncSettings({ ...this.settings(), ...input });
    await this.options.persist(settings);
    this.update(settings);
    this.schedule();
    return this.current;
  }

  /** Runs now. With push false (closing or quitting) it only commits locally, so it never waits on the network. */
  run(options: { push?: boolean; manual?: boolean } = {}): Promise<AutoSyncState> {
    if (!options.manual && !this.current.enabled) return Promise.resolve(this.current);
    const root = this.options.projectRoot();
    if (!root) return Promise.resolve(this.current);
    this.running ??= this.perform(root, options.push ?? true).finally(() => { this.running = null; });
    return this.running;
  }

  projectChanged(): void {
    this.update({ lastRunAt: undefined, lastOutcome: undefined, message: undefined });
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private settings(): AutoSyncSettings {
    return { enabled: this.current.enabled, intervalMinutes: this.current.intervalMinutes };
  }

  private async perform(root: string, push: boolean): Promise<AutoSyncState> {
    this.update({ running: true });
    try {
      const result: ProjectGitAutoSyncResult = await this.options.serialize(async () => {
        await this.options.exportProject();
        return (this.options.sync ?? autoSyncProjectGit)(root, { push: push && this.options.canPush() });
      });
      return this.update({ running: false, lastRunAt: new Date().toISOString(), lastOutcome: result.outcome, message: result.message });
    } catch (error) {
      return this.update({ running: false, lastRunAt: new Date().toISOString(), lastOutcome: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  private schedule(): void {
    this.dispose();
    if (!this.current.enabled) return;
    this.timer = setInterval(() => { void this.run(); }, this.current.intervalMinutes * 60_000);
  }

  private update(patch: Partial<AutoSyncState>): AutoSyncState {
    this.current = { ...this.current, ...patch };
    this.options.publish(this.current);
    return this.current;
  }
}
