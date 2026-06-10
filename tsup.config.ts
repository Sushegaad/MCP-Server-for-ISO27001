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
  // Bake build-time provenance metadata into the bundle.
  // GIT_COMMIT_SHA and BUILD_TIMESTAMP are injected by the release workflow
  // before `npm run build` runs, so get_server_info can return real values.
  // When building locally without those vars set, the values fall back to null
  // (matching the runtime ?? null fallback in server-info.ts).
  define: {
    "process.env.GIT_COMMIT_SHA":   JSON.stringify(process.env.GIT_COMMIT_SHA   ?? null),
    "process.env.BUILD_TIMESTAMP":  JSON.stringify(process.env.BUILD_TIMESTAMP  ?? null),
  },
});
