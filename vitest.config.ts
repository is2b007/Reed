import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve workspace packages to source so `pnpm test` works on a fresh checkout without building dist/.
export default defineConfig({
  resolve: {
    alias: {
      "@reed/schema": fileURLToPath(new URL("./packages/schema/src/index.ts", import.meta.url)),
      "@reed/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
});
