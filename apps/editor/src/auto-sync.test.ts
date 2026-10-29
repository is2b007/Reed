import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoSyncController, parseAutoSyncSettings } from "./auto-sync.js";

const controllers: AutoSyncController[] = [];
afterEach(() => { controllers.splice(0).forEach((controller) => controller.dispose()); vi.useRealTimers(); });

function controller(overrides: { enabled?: boolean; canPush?: boolean; root?: string | null } = {}) {
  const sync = vi.fn(async (_root: string, options: { push: boolean }) => ({ outcome: options.push ? "pushed" : "committed", committed: true, pushed: options.push, message: "ok", status: {} }) as never);
  const exportProject = vi.fn(async () => undefined);
  const persist = vi.fn(async () => undefined);
  const value = new AutoSyncController({
    settings: { enabled: overrides.enabled ?? true, intervalMinutes: 5 },
    projectRoot: () => overrides.root === undefined ? "/story" : overrides.root,
    canPush: () => overrides.canPush ?? true,
    exportProject,
    serialize: (work) => work(),
    publish: () => undefined,
    persist,
    sync,
  });
  controllers.push(value);
  return { value, sync, exportProject, persist };
}

describe("Git autosave", () => {
  it("defaults on every 5 minutes and rejects unknown intervals", () => {
    expect(parseAutoSyncSettings(undefined)).toEqual({ enabled: true, intervalMinutes: 5 });
    expect(parseAutoSyncSettings({ enabled: false, intervalMinutes: 15 })).toEqual({ enabled: false, intervalMinutes: 15 });
    expect(parseAutoSyncSettings({ intervalMinutes: 0 })).toEqual({ enabled: true, intervalMinutes: 5 });
  });

  it("exports then commits on the timer, pushing only when allowed", async () => {
    vi.useFakeTimers();
    const { sync, exportProject } = controller({ canPush: false });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(exportProject).toHaveBeenCalledOnce();
    expect(sync).toHaveBeenCalledWith("/story", { push: false });
  });

  it("does nothing while off or without a project, except when asked", async () => {
    const off = controller({ enabled: false });
    expect((await off.value.run()).lastOutcome).toBeUndefined();
    expect((await off.value.run({ manual: true })).lastOutcome).toBe("pushed");
    const empty = controller({ root: null });
    await empty.value.run();
    expect(empty.sync).not.toHaveBeenCalled();
  });

  it("keeps closing and quitting local", async () => {
    const { value, sync } = controller();
    await value.run({ push: false });
    expect(sync).toHaveBeenCalledWith("/story", { push: false });
  });

  it("persists new settings", async () => {
    const { value, persist } = controller();
    expect(await value.configure({ intervalMinutes: 30 })).toMatchObject({ enabled: true, intervalMinutes: 30 });
    expect(persist).toHaveBeenCalledWith({ enabled: true, intervalMinutes: 30 });
  });
});
