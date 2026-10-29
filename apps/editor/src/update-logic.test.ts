import { describe, expect, it } from "vitest";
import { installLocationProblem, isAllowedUpdateUrl, isNewerVersion, parseChecksums, parseRelease, updateAssetName } from "./update-logic.js";

describe("desktop update logic", () => {
  it("only offers stable releases that are strictly newer", () => {
    expect(isNewerVersion("0.2.1", "0.2.0")).toBe(true);
    expect(isNewerVersion("v0.10.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.2.0")).toBe(false);
    expect(isNewerVersion("0.1.9", "0.2.0")).toBe(false);
    expect(isNewerVersion("0.3.0-beta.1", "0.2.0")).toBe(false);
    expect(isNewerVersion("0.2.0", "0.2.0-beta.2")).toBe(true);
    expect(isNewerVersion("latest", "0.2.0")).toBe(false);
  });

  it("parses GitHub releases and drops assets on unexpected hosts", () => {
    const release = parseRelease({
      tag_name: "v0.2.1", html_url: "https://github.com/is2b007/Reed/releases/tag/v0.2.1", body: "Fixes", draft: false, prerelease: false,
      assets: [
        { name: "Reed-0.2.1-macos-arm64.zip", browser_download_url: "https://github.com/is2b007/Reed/releases/download/v0.2.1/Reed-0.2.1-macos-arm64.zip", size: 10 },
        { name: "evil.zip", browser_download_url: "https://example.com/evil.zip", size: 1 },
      ],
    });
    expect(release.version).toBe("0.2.1");
    expect(release.assets.map((asset) => asset.name)).toEqual(["Reed-0.2.1-macos-arm64.zip"]);
    expect(() => parseRelease({ tag_name: "v0.3.0", html_url: "https://github.com/x", assets: [], prerelease: true })).toThrow(/stable/);
  });

  it("restricts update traffic to GitHub over HTTPS", () => {
    expect(isAllowedUpdateUrl("https://api.github.com/repos/is2b007/Reed/releases/latest")).toBe(true);
    expect(isAllowedUpdateUrl("https://release-assets.githubusercontent.com/x")).toBe(true);
    expect(isAllowedUpdateUrl("http://github.com/x")).toBe(false);
    expect(isAllowedUpdateUrl("https://github.com.evil.example/x")).toBe(false);
  });

  it("matches the archives the release workflow publishes", () => {
    expect(updateAssetName("0.2.1", "darwin", "arm64")).toBe("Reed-0.2.1-macos-arm64.zip");
    expect(updateAssetName("0.2.1", "win32", "x64")).toBe("Reed-0.2.1-windows-x64.zip");
    expect(updateAssetName("0.2.1", "linux", "x64")).toBeNull();
  });

  it("reads sha256sum output", () => {
    const hash = "a".repeat(64);
    const checksums = parseChecksums(`${hash}  ./Reed-0.2.1-macos-arm64.zip\n${"B".repeat(64)} *Reed-0.2.1-windows-x64.zip\nnot a line\n`);
    expect(checksums.get("Reed-0.2.1-macos-arm64.zip")).toBe(hash);
    expect(checksums.get("Reed-0.2.1-windows-x64.zip")).toBe("b".repeat(64));
  });

  it("refuses to replace a copy running from a disk image or translocation", () => {
    expect(installLocationProblem("/Applications/Reed.app", "darwin")).toBeNull();
    expect(installLocationProblem("/Volumes/Reed/Reed.app", "darwin")).toMatch(/disk image/);
    expect(installLocationProblem("/private/var/folders/x/AppTranslocation/y/d/Reed.app", "darwin")).toMatch(/temporary location/);
    expect(installLocationProblem("C:\\Users\\k\\Reed", "win32")).toBeNull();
  });
});
