/**
 * lib/rateLimiter.ts
 * Sliding-window in-memory rate limiter for API routes.
 *
 * Per Cloud Run instance — sufficient for burst protection.
 * For cross-instance limits, the wallet (retiro) already uses Firestore cooldowns.
 *
 * Usage:
 *   const ok = checkRateLimit(`join:${uid}`, 10, 60_000);
 *   if (!ok) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
 */

const store = new Map<string, number[]>();

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param key       Unique key (e.g., `endpoint:uid` or `endpoint:ip`)
 * @param maxReqs   Max requests allowed within the window
 * @param windowMs  Time window in milliseconds
 */
export function checkRateLimit(key: string, maxReqs: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter(t => now - t < windowMs);
  if (hits.length >= maxReqs) return false;
  hits.push(now);
  store.set(key, hits);
  return true;
}

/**
 * Returns the IP from the request headers.
 * Handles proxied requests (App Hosting / Cloud Run behind load balancer).
 */
export function getClientIp(req: { headers: { get: (k: string) => string | null } }): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

/** Periodically clean stale entries to avoid unbounded memory growth. */
setInterval(() => {
  const now = Date.now();
  const keys = Array.from(store.keys());
  for (const key of keys) {
    const fresh = (store.get(key) ?? []).filter((t: number) => now - t < 3_600_000);
    if (fresh.length === 0) store.delete(key);
    else store.set(key, fresh);
  }
}, 300_000); // every 5 minutes
