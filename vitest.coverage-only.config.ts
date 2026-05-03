import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "istanbul",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts","src/server.ts","src/tools/index.ts","src/transport/sse.ts",
        "src/types/**","src/db/connection.ts","src/seed/seeder.ts","src/db/migrations/**",
      ],
    },
  },
});
