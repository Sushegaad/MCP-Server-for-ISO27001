import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  minify: false,
  banner: { js: "#!/usr/bin/env node" },
  // Keep native modules external — @journeyapps/sqlcipher must not be bundled
  external: ["@journeyapps/sqlcipher"],
  noExternal: [],
});
