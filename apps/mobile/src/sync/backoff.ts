/**
 * Retry backoff for the outbox (FR-042). Exponential from 2 s with a 5-minute
 * cap and ±20 % jitter so a fleet of devices reconnecting together does not
 * hammer the server in lockstep.
 */

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_CAP_MS = 300_000;
export const BACKOFF_JITTER = 0.2;

export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const raw = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (safeAttempt - 1));
  const jitter = 1 + (random() * 2 - 1) * BACKOFF_JITTER;
  return Math.max(1_000, Math.round(raw * jitter));
}
