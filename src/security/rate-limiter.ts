/**
 * iso27001-mcp — In-process sliding window rate limiter
 *
 * Keyed by key_hash. Tracks timestamps of calls within the last 60 seconds.
 * Applies in all server modes (local, team, ci, hosted).
 *
 * checkRateLimit(keyHash) — throws RATE_LIMITED if RPM exceeded
 */

import { getEnv } from "./secrets.js";
import { rateLimited } from "../types/errors.js";

// ── Config ────────────────────────────────────────────────────

function getRpm(): number {
  const val = parseInt(getEnv("RATE_LIMIT_RPM", "500"), 10);
  return isNaN(val) || val <= 0 ? 500 : val;
}

// ── State ─────────────────────────────────────────────────────

// Map<key_hash, timestamps[] (ms since epoch)>
const _windows = new Map<string, number[]>();

// Call counter driving the periodic sweep of dead entries (keys whose
// window has fully aged out) so the map cannot grow without bound.
let _callCounter = 0;

// ── checkRateLimit ────────────────────────────────────────────

/**
 * Check if the caller has exceeded RATE_LIMIT_RPM in the last 60 seconds.
 * Records the current call timestamp before returning.
 * Throws RATE_LIMITED if the limit is exceeded.
 */
export function checkRateLimit(keyHash: string): void {
  const rpm = getRpm();
  const now = Date.now();
  const windowMs = 60_000; // 60-second sliding window

  // Every 1000th call, sweep entries whose newest timestamp is outside the
  // window — those keys will never be trimmed by their own calls again.
  if (++_callCounter % 1000 === 0) {
    for (const [k, ts] of _windows) {
      if (ts.length === 0 || (ts[ts.length - 1] ?? 0) < now - windowMs) _windows.delete(k);
    }
  }

  // Get or create the timestamp list for this key
  let timestamps = _windows.get(keyHash);
  if (!timestamps) {
    timestamps = [];
    _windows.set(keyHash, timestamps);
  }

  // Evict entries outside the window
  const cutoff = now - windowMs;
  let i = 0;
  while (i < timestamps.length && timestamps[i] < cutoff) i++;
  if (i > 0) timestamps.splice(0, i);

  // Check limit before recording this call
  if (timestamps.length >= rpm) {
    throw rateLimited();
  }

  // Record this call
  timestamps.push(now);
}

/**
 * Reset the rate limit window for a key (used in tests).
 */
export function resetRateLimit(keyHash: string): void {
  _windows.delete(keyHash);
}

/**
 * Clear all rate limit state (used in tests or server restart).
 */
export function clearAllRateLimits(): void {
  _windows.clear();
}

/**
 * Number of keys currently tracked in the window map (diagnostics/tests —
 * lets the periodic sweep be observed).
 */
export function trackedKeyCount(): number {
  return _windows.size;
}

/**
 * Return the number of calls recorded in the current window for a key.
 * Useful for diagnostics and testing.
 */
export function currentWindowCount(keyHash: string): number {
  const timestamps = _windows.get(keyHash);
  if (!timestamps) return 0;
  const cutoff = Date.now() - 60_000;
  return timestamps.filter((t) => t >= cutoff).length;
}
