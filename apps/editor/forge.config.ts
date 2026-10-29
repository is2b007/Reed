import type { ForgeConfig } from "@electron-forge/shared-types";
import { rebuild } from "@electron/rebuild";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import { mainConfig } from "./webpack.main.config.js";
import { rendererConfig } from "./webpack.renderer.config.js";
import { resolveReleasePlatform } from "./src/release-config.js";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const hoistedModules = path.resolve(configDirectory, "../../node_modules");
const dmgStagingDirectory = path.join(tmpdir(), `reed-dmg-${process.pid}`);
const dmgStagingApp = path.join(dmgStagingDirectory, "Reed.app");
const signatureValidationDirectory = path.join(tmpdir(), `reed-signature-${process.pid}`);
const signatureValidationApp = path.join(signatureValidationDirectory, "Reed.app");
const targetPlatform = resolveReleasePlatform(process.argv, process.platform);
const githubCliCandidates = targetPlatform === "win32"
  ? [process.env.REED_GH_WINDOWS_PATH]
  : [process.env.REED_GH_PATH, "/opt/homebrew/bin/gh", "/usr/local/bin/gh"];
const githubCliSource = githubCliCandidates
  .find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
const prebuildInstallScript = path.join(hoistedModules, "prebuild-install", "bin.js");
const productionRelease = process.env.REED_RELEASE_SIGNING === "1";
const appleSigningIdentity = process.env.APPLE_SIGNING_IDENTITY?.trim();
const appleKeychainProfile = process.env.APPLE_NOTARY_KEYCHAIN_PROFILE?.trim();
const appleApiKey = process.env.APPLE_API_KEY?.trim();
const appleApiKeyId = process.env.APPLE_API_KEY_ID?.trim();
const appleApiIssuer = process.env.APPLE_API_ISSUER?.trim();
const appleId = process.env.APPLE_ID?.trim();
const appleIdPassword = process.env.APPLE_ID_PASSWORD?.trim();
const appleTeamId = process.env.APPLE_TEAM_ID?.trim();
const windowsCertificateFile = process.env.WINDOWS_CERTIFICATE_FILE?.trim();
const windowsCertificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;

const osxNotarize: NonNullable<ForgeConfig["packagerConfig"]>["osxNotarize"] = appleKeychainProfile
  ? { keychainProfile: appleKeychainProfile }
  : appleApiKey && appleApiKeyId && appleApiIssuer
    ? { appleApiKey, appleApiKeyId, appleApiIssuer }
    : appleId && appleIdPassword && appleTeamId
      ? { appleId, appleIdPassword, teamId: appleTeamId }
      : undefined;

if (productionRelease && targetPlatform === "darwin" && (!appleSigningIdentity || !osxNotarize)) {
  throw new Error(
    "Public macOS releases require APPLE_SIGNING_IDENTITY and notarization credentials " +
      "(APPLE_NOTARY_KEYCHAIN_PROFILE, APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER, or " +
      "APPLE_ID + APPLE_ID_PASSWORD + APPLE_TEAM_ID).",
  );
}
if (productionRelease && targetPlatform === "win32" && (!windowsCertificateFile || !windowsCertificatePassword)) {
  throw new Error(
    "Public Windows releases require WINDOWS_CERTIFICATE_FILE and WINDOWS_CERTIFICATE_PASSWORD.",
  );
}

const includeNativeRuntime: NonNullable<ForgeConfig["packagerConfig"]>["afterPrune"] = [
  (buildPath, _electronVersion, _platform, _arch, callback) => {
    const destination = path.join(buildPath, "node_modules");
    void (async () => {
      await mkdir(destination, { recursive: true });
      for (const packageName of ["better-sqlite3", "bindings", "file-uri-to-path", "@fontsource/noto-sans"]) {
        const packageDestination = path.join(destination, packageName);
        await mkdir(path.dirname(packageDestination), { recursive: true });
        await cp(path.join(hoistedModules, packageName), packageDestination, { recursive: true });
      }
      const packagePath = path.join(buildPath, "package.json");
      const stagedPackage = JSON.parse(await readFile(packagePath, "utf8")) as Record<string, unknown>;
      stagedPackage.type = "commonjs";
      await writeFile(packagePath, `${JSON.stringify(stagedPackage, null, 2)}\n`, "utf8");
      if (_platform !== process.platform) {
        execFileSync(process.execPath, [
          prebuildInstallScript,
          "--runtime", "electron",
          "--target", _electronVersion,
          "--platform", _platform,
          "--arch", _arch,
          "--verbose",
        ], { cwd: path.join(destination, "better-sqlite3"), stdio: "inherit" });
      } else {
        await rebuild({
          buildPath,
          electronVersion: _electronVersion,
          platform: _platform as NodeJS.Platform,
          arch: _arch,
          onlyModules: ["better-sqlite3"],
          force: true,
        });
      }
    })().then(() => callback(), (error: Error) => callback(error));
  },
];

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: "com.reed.dialogue-editor",
    appCategoryType: "public.app-category.productivity",
    appCopyright: "Copyright © 2026 Kosta Canatselis",
    name: "Reed",
    icon: path.join(configDirectory, "assets", targetPlatform === "win32" ? "Reed.ico" : "Reed.icns"),
    extraResource: githubCliSource ? [realpathSync(githubCliSource)] : [],
    osxSign: productionRelease
      ? {
          identity: appleSigningIdentity,
          identityValidation: true,
          preAutoEntitlements: true,
          preEmbedProvisioningProfile: false,
          optionsForFile: () => ({ hardenedRuntime: true, timestamp: undefined }),
        }
      : {
          identity: "-",
          identityValidation: false,
          preAutoEntitlements: false,
          preEmbedProvisioningProfile: false,
          optionsForFile: () => ({ hardenedRuntime: false, timestamp: "none" }),
        },
    osxNotarize: productionRelease ? osxNotarize : undefined,
    win32metadata: {
      CompanyName: "Kosta Canatselis",
      FileDescription: "Reed narrative design workspace",
      ProductName: "Reed",
      InternalName: "Reed",
      OriginalFilename: "Reed.exe",
      "requested-execution-level": "asInvoker",
    },
    windowsSign: productionRelease
      ? {
          certificateFile: windowsCertificateFile,
          certificatePassword: windowsCertificatePassword,
          description: "Reed narrative design workspace",
          website: "https://github.com/is2b007/Reed",
        }
      : undefined,
    afterPrune: includeNativeRuntime,
  },
  hooks: {
    postPackage: async (_forgeConfig, packageResult) => {
      if (packageResult.platform !== "darwin") return;
      for (const outputPath of packageResult.outputPaths) {
        const appPath = path.join(outputPath, "Reed.app");
        if (!productionRelease) {
          execFileSync("/bin/chmod", ["-R", "u+w", appPath]);
          execFileSync("/usr/bin/xattr", ["-cr", appPath]);
          execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", appPath], { stdio: "inherit" });
        }
        await rm(signatureValidationDirectory, { recursive: true, force: true });
        await mkdir(signatureValidationDirectory, { recursive: true });
        execFileSync("/usr/bin/ditto", ["--noextattr", "--noqtn", appPath, signatureValidationApp]);
        execFileSync("/bin/chmod", ["-R", "u+w", signatureValidationApp]);
        execFileSync("/usr/bin/xattr", ["-cr", signatureValidationApp]);
        execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", signatureValidationApp], { stdio: "inherit" });
        if (productionRelease) {
          execFileSync("/usr/bin/xcrun", ["stapler", "validate", signatureValidationApp], { stdio: "inherit" });
          execFileSync("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", signatureValidationApp], { stdio: "inherit" });
        }
        await rm(signatureValidationDirectory, { recursive: true, force: true });
      }
    },
    postMake: async (_forgeConfig, makeResults) => {
      await rm(dmgStagingDirectory, { recursive: true, force: true });
      return makeResults;
    },
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ["darwin", "win32"]), new MakerDMG({
    format: "ULFO",
    contents: (options) => {
      mkdirSync(dmgStagingDirectory, { recursive: true });
      execFileSync("/usr/bin/ditto", ["--noextattr", "--noqtn", options.appPath, dmgStagingApp]);
      execFileSync("/bin/chmod", ["-R", "u+w", dmgStagingApp]);
      execFileSync("/usr/bin/xattr", ["-cr", dmgStagingApp]);
      execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", dmgStagingApp], { stdio: "inherit" });
      return [
        { x: 448, y: 344, type: "link", path: "/Applications" },
        { x: 192, y: 344, type: "file", path: dmgStagingApp },
      ];
    },
  })],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    // Packaged Reed must not double as a general Node runtime or accept injected Node flags.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [{
          html: "./src/index.html",
          js: "./src/renderer.tsx",
          name: "main_window",
          preload: { js: "./src/preload.ts" },
        }],
      },
    }),
  ],
};

export default config;
