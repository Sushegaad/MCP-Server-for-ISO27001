import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    pool: "forks",
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/server.ts",
        "src/tools/index.ts",
        "src/resources/index.ts",
        "src/transport/sse.ts",
        "src/types/**",
        // Interactive CLI tools — readline-based wizard and health-check; not
        // unit-testable in CI without a real TTY and Claude Desktop installation.
        "src/cli/**",
        // Infrastructure files that require a real encrypted SQLite database
        // on disk — not unit-testable without the native binary (macOS only).
        "src/db/connection.ts",
        "src/seed/seeder.ts",
        // Migration definitions — pure SQL data, runner functions never invoked in unit tests.
        "src/db/migrations/**",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
