import { beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit, resetRateLimitForTests } from "@/lib/security/rate-limit";

beforeEach(() => {
  resetRateLimitForTests();
});

describe("rate limiting", () => {
  it("allows requests under both the burst and sustained thresholds", () => {
    const key = "203.0.113.5";
    for (let index = 0; index < 8; index += 1) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }
  });

  it("blocks once the short burst threshold is exceeded, even well under the sustained cap", () => {
    const key = "203.0.113.6";
    const now = Date.now();
    for (let index = 0; index < 8; index += 1) {
      expect(checkRateLimit(key, now).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("recovers from a burst block once the burst window elapses, until the sustained cap takes over", () => {
    const key = "203.0.113.7";
    let now = Date.now();
    for (let index = 0; index < 8; index += 1) {
      expect(checkRateLimit(key, now).allowed).toBe(true);
    }
    expect(checkRateLimit(key, now).allowed).toBe(false);

    now += 60 * 1_000 + 1;
    for (let index = 0; index < 8; index += 1) {
      expect(checkRateLimit(key, now).allowed).toBe(true);
    }
    // 16 total requests now sent across two burst windows; the sustained
    // window (20 per 10 minutes) has not been exceeded yet.
    now += 60 * 1_000 + 1;
    for (let index = 0; index < 4; index += 1) {
      expect(checkRateLimit(key, now).allowed).toBe(true);
    }
    // 20th request lands; the sustained cap now blocks further requests even
    // though the burst window would otherwise allow them.
    const blocked = checkRateLimit(key, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(60);
  });

  it("tracks separate keys independently", () => {
    const now = Date.now();
    for (let index = 0; index < 8; index += 1) {
      checkRateLimit("client-a", now);
    }
    expect(checkRateLimit("client-a", now).allowed).toBe(false);
    expect(checkRateLimit("client-b", now).allowed).toBe(true);
  });

  it("resets the sustained window after it elapses", () => {
    const key = "198.51.100.9";
    const start = Date.now();
    for (let index = 0; index < 8; index += 1) {
      checkRateLimit(key, start);
    }
    // Cycle through burst windows to exhaust the sustained cap without
    // tripping the burst limiter.
    let now = start;
    for (let burstIndex = 0; burstIndex < 2; burstIndex += 1) {
      now += 60 * 1_000 + 1;
      for (let index = 0; index < 6; index += 1) {
        checkRateLimit(key, now);
      }
    }
    expect(checkRateLimit(key, now).allowed).toBe(false);
    expect(checkRateLimit(key, start + 10 * 60 * 1_000 + 1).allowed).toBe(true);
  });
});
