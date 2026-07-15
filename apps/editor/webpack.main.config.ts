import type { Configuration } from "webpack";

export const mainConfig: Configuration = {
  target: "electron-main",
  entry: "./src/main.ts",
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
