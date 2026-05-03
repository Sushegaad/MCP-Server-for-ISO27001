import { vi } from "vitest";

export function createMockDb() {
  const store = new Map<string, Record<string, unknown>>();

  const mockStmt = (rows: unknown[] = [], runResult = { changes: 1 }) => ({
    all:  vi.fn((..._args: unknown[]) => rows),
    get:  vi.fn((..._args: unknown[]) => rows[0] ?? undefined),
    run:  vi.fn((..._args: unknown[]) => runResult),
  });

  const db = {
    prepare:     vi.fn((_sql: string) => mockStmt()),
    transaction: vi.fn((fn: () => unknown) => fn),
    store,
  };

  return db;
}
