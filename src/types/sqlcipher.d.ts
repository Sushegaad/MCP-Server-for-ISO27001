/**
 * Type declaration for better-sqlite3-multiple-ciphers.
 * This package is a direct fork of better-sqlite3 with SQLite3MultipleCiphers
 * encryption support. The API is 100% compatible with better-sqlite3 — same
 * synchronous methods, same statement interface, same transaction API.
 * We re-use the @types/better-sqlite3 declarations so we get full type safety
 * without duplicating the interface definitions.
 */
declare module "better-sqlite3-multiple-ciphers" {
  import BetterSqlite3 from "better-sqlite3";
  const Database: typeof BetterSqlite3;
  export = Database;
}
