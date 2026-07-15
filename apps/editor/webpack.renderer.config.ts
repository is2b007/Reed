import type { Configuration } from "webpack";

export const rendererConfig: Configuration = {
  module: {
    rules: [
      { test: /\.tsx?$/, exclude: /node_modules/, use: { loader: "ts-loader", options: { transpileOnly: true } } },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
      { test: /\.(woff2?|ttf|otf)$/, type: "asset/resource" },
    ],
  },
  resolve: { extensions: [".js", ".ts", ".tsx", ".css"], extensionAlias: { ".js": [".ts", ".tsx", ".js"] } },
};
