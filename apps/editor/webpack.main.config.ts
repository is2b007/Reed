import type { Compiler, Configuration } from "webpack";

const emitCommonJsBoundary = {
  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap("ReedCommonJsBoundary", (compilation) => {
      compilation.hooks.processAssets.tap({
        name: "ReedCommonJsBoundary",
        stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
      }, () => {
        compilation.emitAsset("package.json", new compiler.webpack.sources.RawSource('{"type":"commonjs"}\n'));
      });
    });
  },
};

export const mainConfig: Configuration = {
  target: "electron-main",
  entry: "./src/main.ts",
  plugins: [emitCommonJsBoundary],
  module: {
    rules: [
      { test: /native_modules[/\\].+\.node$/, use: "node-loader" },
      { test: /[/\\]node_modules[/\\].+\.(m?js|node)$/, parser: { amd: false } },
      { test: /\.tsx?$/, exclude: /node_modules/, use: { loader: "ts-loader", options: { transpileOnly: true } } },
      { test: /\.woff2?$/, type: "asset/resource" },
    ],
  },
  resolve: { extensions: [".js", ".ts", ".tsx", ".json"], extensionAlias: { ".js": [".ts", ".tsx", ".js"] }, conditionNames: ["import", "module", "node", "electron", "default"] },
  externals: { "better-sqlite3": "commonjs better-sqlite3" },
};
