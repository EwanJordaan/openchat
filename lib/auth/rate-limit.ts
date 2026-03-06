interface RateLimitBucket {
  blockedUntil: number;
  attempts: number[];
  lastSeenAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  blockMs: number;
}

interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

const buckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS = 20_000;

function bucketKey(scope: string, identifier: string) {
  return `${scope}:${identifier}`;
}

function pruneAttempts(bucket: RateLimitBucket, now: number, windowMs: number) {
  bucket.attempts = bucket.attempts.filter((timestamp) => now - timestamp <= windowMs);
  if (bucket.blockedUntil <= now) {
    bucket.blockedUntil = 0;
  }
  bucket.lastSeenAt = now;
}

function maybeCompactBuckets(now: number) {
  if (buckets.size < MAX_BUCKETS) return;

  for (const [key, bucket] of buckets.entries()) {
    if (!bucket.attempts.length && bucket.blockedUntil <= now) {
      buckets.delete(key);
    }
  }
}

function getOrCreateBucket(key: string) {
  const existing = buckets.get(key);
  if (existing) return existing;

  const created: RateLimitBucket = {
    blockedUntil: 0,
    attempts: [],
    lastSeenAt: Date.now(),
  };
  buckets.set(key, created);
  return created;
}

export function assertRateLimit(scope: string, identifier: string, config: RateLimitConfig): RateLimitDecision {
  const now = Date.now();
  maybeCompactBuckets(now);

  const key = bucketKey(scope, identifier);
  const bucket = getOrCreateBucket(key);
  pruneAttempts(bucket, now, config.windowMs);

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000)),
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

export function registerRateLimitFailure(scope: string, identifier: string, config: RateLimitConfig) {
  const now = Date.now();
  maybeCompactBuckets(now);

  const key = bucketKey(scope, identifier);
  const bucket = getOrCreateBucket(key);
  pruneAttempts(bucket, now, config.windowMs);

  bucket.attempts.push(now);
  if (bucket.attempts.length > config.maxAttempts) {
    bucket.blockedUntil = now + config.blockMs;
    bucket.attempts = [];
  }
}

export function clearRateLimit(scope: string, identifier: string) {
  buckets.delete(bucketKey(scope, identifier));
}

export function getClientAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}
