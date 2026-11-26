import { beforeEach, describe, expect, it } from "vitest";

import {
  IP_THROTTLE,
  checkIpThrottle,
  ipThrottleSize,
  recordIpFailure,
  resetIpThrottle,
} from "../src/ip-rate-limit.ts";

const IP = "203.0.113.10";
const START = new Date("2026-11-26T10:00:00.000Z");

beforeEach(() => {
  resetIpThrottle();
});

describe("per-IP login throttle", () => {
  it("does not limit an address without failures", () => {
    expect(checkIpThrottle(IP, START)).toEqual({ limited: false, retryAfterSeconds: 0 });
    expect(checkIpThrottle(null, START)).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  it("limits the 30th failure for 15 minutes and releases after the window", () => {
    for (let attempt = 1; attempt < IP_THROTTLE.maxFailures; attempt += 1) {
      expect(recordIpFailure(IP, START).limited).toBe(false);
    }

    const limited = recordIpFailure(IP, START);
    expect(limited.limited).toBe(true);
    expect(limited.retryAfterSeconds).toBe(IP_THROTTLE.lockMs / 1000);

    const halfway = new Date(START.getTime() + 5 * 60 * 1000);
    expect(checkIpThrottle(IP, halfway)).toEqual({
      limited: true,
      retryAfterSeconds: 10 * 60,
    });

    const after = new Date(START.getTime() + 16 * 60 * 1000);
    expect(checkIpThrottle(IP, after)).toEqual({ limited: false, retryAfterSeconds: 0 });
    expect(ipThrottleSize()).toBe(0);
  });

  it("keeps addresses independent and never resets on a success", () => {
    for (let attempt = 0; attempt < IP_THROTTLE.maxFailures - 1; attempt += 1) {
      recordIpFailure(IP, START);
    }
    expect(checkIpThrottle("198.51.100.20", START).limited).toBe(false);

    // A successful login is not recorded here; the IP counter stays at 29.
    const limited = recordIpFailure(IP, START);
    expect(limited.limited).toBe(true);
    expect(checkIpThrottle("198.51.100.20", START).limited).toBe(false);
  });

  it("starts a fresh window after the old one has fully expired", () => {
    recordIpFailure(IP, START);
    const later = new Date(START.getTime() + IP_THROTTLE.windowMs + 1);
    expect(recordIpFailure(IP, later).limited).toBe(false);
    expect(ipThrottleSize()).toBe(1);
  });
});
