import type { ForgeConfig } from "@electron-forge/shared-types";
import { rebuild } from "@electron/rebuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import { mainConfig } from "./webpack.main.config.js";
import { rendererConfig } from "./webpack.renderer.config.js";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const hoistedModules = path.resolve(configDirectory, "../../node_modules");

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
      await rebuild({
        buildPath,
        electronVersion: _electronVersion,
        arch: _arch,
        onlyModules: ["better-sqlite3"],
        force: true,
      });
    })().then(() => callback(), (error: Error) => callback(error));
  },
];

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: "com.reed.dialogue-editor",
    appCategoryType: "public.app-category.developer-tools",
    name: "Reed",
    icon: path.join(configDirectory, "assets", "Reed.icns"),
    osxSign: {
      identity: "-",
      identityValidation: false,
      preAutoEntitlements: false,
      preEmbedProvisioningProfile: false,
      optionsForFile: () => ({ hardenedRuntime: false, timestamp: "none" }),
    },
    afterPrune: includeNativeRuntime,
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ["darwin"]), new MakerDMG({ format: "ULFO" })],
  plugins: [
    new AutoUnpackNativesPlugin({}),
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
