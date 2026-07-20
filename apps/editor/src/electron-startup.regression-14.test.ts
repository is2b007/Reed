import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Electron main-process module format", () => {
  it("emits a local CommonJS boundary around webpack's main bundle", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { type?: string; main?: string };
    const webpack = await readFile(new URL("../webpack.main.config.ts", import.meta.url), "utf8");

    expect(packageJson.type).toBe("module");
    expect(packageJson.main).toBe(".webpack/main");
    expect(webpack).toContain("ReedCommonJsBoundary");
    expect(webpack).toContain('emitAsset("package.json"');
    expect(webpack).toContain('{"type":"commonjs"}');
  });

  it("clears macOS file-provider metadata and verifies the distributable signature", async () => {
    const forge = await readFile(new URL("../forge.config.ts", import.meta.url), "utf8");

    expect(forge).toContain('execFileSync("/usr/bin/ditto", ["--noextattr", "--noqtn", options.appPath, dmgStagingApp])');
    expect(forge).toContain('execFileSync("/usr/bin/xattr", ["-cr", dmgStagingApp])');
    expect(forge).toContain('execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", dmgStagingApp]');
  });
});
