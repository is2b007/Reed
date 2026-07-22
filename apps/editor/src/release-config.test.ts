import { describe, expect, it } from "vitest";
import { resolveReleasePlatform } from "./release-config.js";

describe("release platform selection", () => {
  it("recognizes Forge's inline platform argument", () => {
    expect(resolveReleasePlatform(["package", "--platform=win32", "--arch=x64"], "darwin")).toBe("win32");
  });

  it("recognizes the split platform argument", () => {
    expect(resolveReleasePlatform(["package", "--platform", "darwin", "--arch", "arm64"], "win32")).toBe("darwin");
  });

  it("uses the host platform only when no target was supplied", () => {
    expect(resolveReleasePlatform(["package"], "linux")).toBe("linux");
  });
});
