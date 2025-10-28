/**
 * Rate limiting middleware for CrowdLore API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '@devvit/web/server';
import { RateLimitError } from './errorHandler.js';

type RateLimitConfig = {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  message?: string; // Custom error message
};

/**
 * Default key generator using IP address and user agent
 */
function defaultKeyGenerator(req: Request): string {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  return `rate_limit:${ip}:${Buffer.from(userAgent).toString('base64').slice(0, 16)}`;
}

/**
 * User-based key generator for authenticated requests
 */
function userKeyGenerator(req: Request): string {
  // Try to get username from request context (set by auth middleware)
  const username = (req as { username?: string }).username || 'anonymous';
  return `rate_limit:user:${username}`;
}

/**
 * Creates rate limiting middleware
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    message = 'Too many requests, please try again later',
  } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = keyGenerator(req);
      const now = Date.now();

      // Get current request count for this window
      const requestKey = `${key}:${Math.floor(now / windowMs)}`;
      const currentCount = await redis.get(requestKey);
      const requestCount = currentCount ? parseInt(currentCount, 10) : 0;

      // Check if limit exceeded
      if (requestCount >= maxRequests) {
        throw new RateLimitError(message);
      }

      // Increment counter
      await redis.incrBy(requestKey, 1);
      await redis.expire(requestKey, Math.ceil(windowMs / 1000));

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, maxRequests - requestCount - 1).toString(),
        'X-RateLimit-Reset': new Date(now + windowMs).toISOString(),
      });

      // Handle response counting
      if (!skipSuccessfulRequests || !skipFailedRequests) {
        const originalSend = res.json;
        res.json = function (body: unknown) {
          const shouldSkip =
            (skipSuccessfulRequests && res.statusCode < 400) ||
            (skipFailedRequests && res.statusCode >= 400);

          if (shouldSkip) {
            // Decrement counter if we should skip this request
            redis.incrBy(requestKey, -1).catch((err: unknown) => {
              console.warn('Failed to decrement rate limit counter:', err);
            });
          }

          return originalSend.call(this, body);
        };
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Predefined rate limiters for different endpoint types
 */
export const rateLimiters = {
  // General API rate limit - 100 requests per minute
  general: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many API requests, please try again in a minute',
  }),

  // Vote submission rate limit - 1 vote per dilemma per user
  voting: rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    maxRequests: 1,
    keyGenerator: (req: Request) => {
      const username = (req as { username?: string }).username || 'anonymous';
      const dilemmaId = req.body?.dilemmaId || req.params?.dilemmaId || 'unknown';
      return `vote_limit:${username}:${dilemmaId}`;
    },
    message: 'You can only vote once per dilemma',
  }),

  // Admin endpoints - 10 requests per minute
  admin: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyGenerator: userKeyGenerator,
    message: 'Too many admin requests, please try again in a minute',
  }),

  // Content generation - 5 requests per minute to prevent abuse
  generation: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
    keyGenerator: userKeyGenerator,
    message: 'Too many generation requests, please try again in a minute',
  }),

  // Strict rate limit for expensive operations - 2 requests per minute
  strict: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 2,
    keyGenerator: userKeyGenerator,
    message: 'Rate limit exceeded for this operation, please try again in a minute',
  }),
};

/**
 * Middleware to extract username for rate limiting
 */
export async function extractUsername(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Try to get username from Reddit context
    const { reddit } = await import('@devvit/web/server');
    const username = await reddit.getCurrentUsername();
    (req as { username?: string }).username = username || 'anonymous';
  } catch (error) {
    // If we can't get username, use anonymous
    (req as { username?: string }).username = 'anonymous';
  }
  next();
}

/**
 * Get current rate limit status for a key
 */
export async function getRateLimitStatus(
  key: string,
  windowMs: number
): Promise<{
  requests: number;
  resetTime: Date;
}> {
  const now = Date.now();
  const requestKey = `${key}:${Math.floor(now / windowMs)}`;
  const currentCount = await redis.get(requestKey);
  const requests = currentCount ? parseInt(currentCount, 10) : 0;
  const resetTime = new Date(now + windowMs);

  return { requests, resetTime };
}

/**
 * Clear rate limit for a specific key (admin function)
 */
export async function clearRateLimit(key: string, windowMs: number): Promise<void> {
  const now = Date.now();
  const requestKey = `${key}:${Math.floor(now / windowMs)}`;
  await redis.del(requestKey);
}
