/**
 * Simple in-memory rate limiter for Edge Functions
 * Note: This is per-instance, so it's not distributed across all serverless functions
 * For production with high traffic, consider using Vercel KV or Redis
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Store rate limit data in memory (per-instance)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

export interface RateLimitConfig {
  /** Maximum number of requests allowed */
  limit: number;
  /** Time window in seconds */
  window: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

/**
 * Check if a request is rate limited
 * @param identifier - Unique identifier (IP, user ID, etc.)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.window * 1000;
  const key = identifier;

  const existing = rateLimitStore.get(key);

  // If no existing entry or window has expired, create new entry
  if (!existing || existing.resetTime < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      remaining: config.limit - 1,
      reset: Math.ceil((now + windowMs) / 1000),
    };
  }

  // Increment count
  existing.count++;
  rateLimitStore.set(key, existing);

  // Check if over limit
  if (existing.count > config.limit) {
    const retryAfter = Math.ceil((existing.resetTime - now) / 1000);
    return {
      success: false,
      remaining: 0,
      reset: Math.ceil(existing.resetTime / 1000),
      retryAfter,
    };
  }

  return {
    success: true,
    remaining: config.limit - existing.count,
    reset: Math.ceil(existing.resetTime / 1000),
  };
}

/**
 * Rate limit configurations for different route types
 */
export const rateLimitConfigs: Record<string, RateLimitConfig> = {
  /** Auth endpoints - stricter to prevent brute force */
  auth: { limit: 10, window: 60 }, // 10 requests per minute

  /** AI endpoints - moderate to prevent quota exhaustion */
  ai: { limit: 20, window: 60 }, // 20 requests per minute

  /** General API endpoints */
  api: { limit: 100, window: 60 }, // 100 requests per minute

  /** Password reset - very strict */
  passwordReset: { limit: 3, window: 300 }, // 3 requests per 5 minutes
};

/**
 * Get client IP from request
 * Handles various proxy headers
 */
export function getClientIP(request: Request): string {
  // Try various headers in order of preference
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Vercel-specific header
  const vercelForwarded = request.headers.get('x-vercel-forwarded-for');
  if (vercelForwarded) {
    return vercelForwarded.split(',')[0].trim();
  }

  // Fallback - this typically won't work in serverless
  return 'unknown';
}
