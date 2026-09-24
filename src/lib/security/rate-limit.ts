// Best-effort, per-instance rate limiting. Vercel serverless functions do not
// share memory across instances, so this bounds abuse from a single instance
// only; it is not a durable, cross-instance limit. If Autrey Mill's traffic or
// abuse risk grows, replace this with a shared store (e.g. Vercel KV or
// Upstash Redis) or a Vercel Firewall rule instead of relying on this alone.
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

interface WindowConfig {
  windowMs: number;
  maxRequests: number;
  records: Map<string, RateLimitRecord>;
}

// Two tiers: a short burst window catches rapid-fire abuse (e.g. a script
// hammering the endpoint) quickly, and a longer sustained window catches
// slower abuse that stays under the burst threshold.
const BURST_WINDOW: WindowConfig = {
  windowMs: 60 * 1_000,
  maxRequests: 8,
  records: new Map(),
};
const SUSTAINED_WINDOW: WindowConfig = {
  windowMs: 10 * 60 * 1_000,
  maxRequests: 20,
  records: new Map(),
};
const MAX_RECORDS_PER_WINDOW = 5_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

function evictIfFull(records: Map<string, RateLimitRecord>, now: number): void {
  if (records.size < MAX_RECORDS_PER_WINDOW) return;
  for (const [recordKey, record] of records) {
    if (record.resetAt <= now) records.delete(recordKey);
  }
  if (records.size >= MAX_RECORDS_PER_WINDOW) {
    const oldestKey = records.keys().next().value;
    if (typeof oldestKey === "string") records.delete(oldestKey);
  }
}

function checkWindow(config: WindowConfig, key: string, now: number): RateLimitResult {
  evictIfFull(config.records, now);

  const current = config.records.get(key);
  if (!current || current.resetAt <= now) {
    config.records.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= config.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function checkRateLimit(key: string, now = Date.now()): RateLimitResult {
  const burst = checkWindow(BURST_WINDOW, key, now);
  if (!burst.allowed) return burst;
  return checkWindow(SUSTAINED_WINDOW, key, now);
}

export function resetRateLimitForTests(): void {
  BURST_WINDOW.records.clear();
  SUSTAINED_WINDOW.records.clear();
}
