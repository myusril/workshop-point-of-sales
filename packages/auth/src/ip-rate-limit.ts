/**
 * Bounded, NAT-aware per-IP throttle for the public login endpoint (DEC-0011).
 *
 * This is deliberately in-process: it sits in front of the account lockout so a
 * caller rotating identifiers cannot spend the whole credential budget, while
 * the 30-failure threshold leaves normal shared-office NAT alone. The map is
 * capped and entries are pruned by time, so an attacker rotating spoofed
 * forwarded addresses cannot grow process memory without bound. No IP address
 * is written to the database, a log, or an error body.
 */

export const IP_THROTTLE = {
  /** Failures from one IP inside the window before it is blocked. */
  maxFailures: 30,
  windowMs: 15 * 60 * 1000,
  /** Block duration once the threshold is crossed. */
  lockMs: 15 * 60 * 1000,
  /** Hard cap on in-memory keys (distinct IP strings). */
  maxEntries: 10_000,
} as const;

export interface IpThrottleStatus {
  limited: boolean;
  retryAfterSeconds: number;
}

interface IpEntry {
  windowStartedAt: number;
  failures: number;
  lockedUntil: number;
}

const entries = new Map<string, IpEntry>();

const NOT_LIMITED: IpThrottleStatus = { limited: false, retryAfterSeconds: 0 };

function normalizeIp(ip: string | null | undefined): string | null {
  if (typeof ip !== "string") return null;
  const trimmed = ip.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function prune(now: number): void {
  for (const [key, entry] of entries) {
    const stale =
      entry.lockedUntil === 0
        ? now - entry.windowStartedAt >= IP_THROTTLE.windowMs
        : entry.lockedUntil <= now && now - entry.windowStartedAt >= IP_THROTTLE.windowMs;
    if (stale) entries.delete(key);
  }

  while (entries.size > IP_THROTTLE.maxEntries) {
    let oldestKey: string | null = null;
    let oldestStart = Number.POSITIVE_INFINITY;
    for (const [key, entry] of entries) {
      if (entry.windowStartedAt < oldestStart) {
        oldestStart = entry.windowStartedAt;
        oldestKey = key;
      }
    }
    if (oldestKey === null) break;
    entries.delete(oldestKey);
  }
}

/** Reads the current state without changing it. */
export function checkIpThrottle(
  ip: string | null | undefined,
  now: Date = new Date(),
): IpThrottleStatus {
  const key = normalizeIp(ip);
  if (key === null) return NOT_LIMITED;

  const entry = entries.get(key);
  if (!entry) return NOT_LIMITED;

  const nowMs = now.getTime();
  if (entry.lockedUntil > nowMs) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - nowMs) / 1000)),
    };
  }

  // An expired lock starts a fresh window on the next attempt.
  if (nowMs - entry.windowStartedAt >= IP_THROTTLE.windowMs) {
    entries.delete(key);
  }
  return NOT_LIMITED;
}

/**
 * Records one failed credential attempt for an IP. Successes are not recorded
 * and never reset the counter: an attacker who knows one account must not be
 * able to clear the budget for the rest.
 */
export function recordIpFailure(
  ip: string | null | undefined,
  now: Date = new Date(),
): IpThrottleStatus {
  const key = normalizeIp(ip);
  if (key === null) return NOT_LIMITED;

  const nowMs = now.getTime();
  prune(nowMs);

  const existing = entries.get(key);
  const entry =
    existing && nowMs - existing.windowStartedAt < IP_THROTTLE.windowMs
      ? existing
      : { windowStartedAt: nowMs, failures: 0, lockedUntil: 0 };

  entry.failures += 1;
  if (entry.failures >= IP_THROTTLE.maxFailures) {
    entry.lockedUntil = nowMs + IP_THROTTLE.lockMs;
  }
  entries.set(key, entry);

  return checkIpThrottle(key, now);
}

/** Test/ops hook: clears every in-process counter. */
export function resetIpThrottle(): void {
  entries.clear();
}

/** Number of tracked IP keys; bounded by `IP_THROTTLE.maxEntries`. */
export function ipThrottleSize(): number {
  return entries.size;
}
