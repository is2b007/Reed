import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("editor window lifecycle", () => {
  it("subscribes to ready-to-show before navigation can emit it", async () => {
    const source = await readFile(new URL("./main.ts", import.meta.url), "utf8");
    const createWindow = source.slice(
      source.indexOf("async function createWindow"),
      source.indexOf("app.setName"),
    );

    const readyListener = createWindow.indexOf('once("ready-to-show"');
    const navigation = createWindow.indexOf(".loadURL(MAIN_WINDOW_WEBPACK_ENTRY)");

    expect(readyListener).toBeGreaterThan(-1);
    expect(navigation).toBeGreaterThan(-1);
    expect(readyListener).toBeLessThan(navigation);
  });

  it("reveals an existing hidden or minimized window when Reed is activated", async () => {
    const source = await readFile(new URL("./main.ts", import.meta.url), "utf8");
    const lifecycle = source.slice(source.indexOf("function revealWindow"), source.indexOf("void app.whenReady"));

    expect(lifecycle).toContain("isMinimized()");
    expect(lifecycle).toContain("restore()");
    expect(lifecycle).toContain("show()");
    expect(lifecycle).toContain("focus()");
    expect(lifecycle).toContain('app.on("activate"');
    expect(lifecycle).toContain("revealWindow(window)");
  });
});
