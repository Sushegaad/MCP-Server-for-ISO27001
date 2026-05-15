import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  minify: false,
  // Keep native modules external — .node binaries cannot be bundled by esbuild
  external: ["better-sqlite3-multiple-ciphers"],
  noExternal: [],
});
