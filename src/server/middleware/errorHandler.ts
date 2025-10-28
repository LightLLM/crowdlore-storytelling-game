/**
 * Error handling middleware for CrowdLore API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import type { APIResponse } from '../../shared/types/api.js';
import { RequestValidationError } from './validation.js';

// Custom error classes
export class APIError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends APIError {
  constructor(message: string = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class UnauthorizedError extends APIError {
  constructor(message: string = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class RateLimitError extends APIError {
  constructor(message: string = 'Rate limit exceeded') {
    super(429, 'RATE_LIMITED', message);
  }
}

export class ContentModerationError extends APIError {
  public readonly sanitizedContent?: string;

  constructor(message: string, sanitizedContent?: string) {
    super(422, 'CONTENT_MODERATION_FAILED', message);
    if (sanitizedContent !== undefined) {
      this.sanitizedContent = sanitizedContent;
    }
  }
}

/**
 * Generates a unique request ID for error tracking
 */
function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Main error handling middleware
 */
export function errorHandler(error: Error, req: Request, res: Response, next: NextFunction): void {
  // Skip if response already sent
  if (res.headersSent) {
    return next(error);
  }

  const requestId = generateRequestId();
  const timestamp = new Date();

  // Log error with enhanced context (non-blocking)
  ErrorLogger.logError(error, {
    requestId,
    endpoint: req.path,
    method: req.method,
    userAgent: req.get('User-Agent') ?? undefined,
    body: req.body,
    query: req.query,
    params: req.params,
  }).catch((logError) => {
    console.error('Failed to log error:', logError);
  });

  // Handle validation errors
  if (error instanceof RequestValidationError) {
    const response: APIResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validationErrors,
      },
      timestamp,
      requestId,
    };
    res.status(400).json(response);
    return;
  }

  // Handle custom API errors
  if (error instanceof APIError) {
    const response: APIResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      timestamp,
      requestId,
    };

    // Add sanitized content for moderation errors
    if (error instanceof ContentModerationError && error.sanitizedContent) {
      response.error!.details = {
        ...((response.error!.details as object) || {}),
        sanitizedContent: error.sanitizedContent,
      };
    }

    res.status(error.statusCode).json(response);
    return;
  }

  // Handle specific Node.js errors
  if (error.name === 'SyntaxError' && 'body' in error) {
    const response: APIResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid JSON in request body',
      },
      timestamp,
      requestId,
    };
    res.status(400).json(response);
    return;
  }

  // Handle Redis connection errors
  if (error.message.includes('Redis') || error.message.includes('ECONNREFUSED')) {
    const response: APIResponse = {
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database service temporarily unavailable',
      },
      timestamp,
      requestId,
    };
    res.status(503).json(response);
    return;
  }

  // Handle timeout errors
  if (error.message.includes('timeout') || error.name === 'TimeoutError') {
    const response: APIResponse = {
      success: false,
      error: {
        code: 'TIMEOUT',
        message: 'Request timeout - please try again',
      },
      timestamp,
      requestId,
    };
    res.status(408).json(response);
    return;
  }

  // Generic server error
  const response: APIResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    timestamp,
    requestId,
  };

  res.status(500).json(response);
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = generateRequestId();
  const response: APIResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
    },
    timestamp: new Date(),
    requestId,
  };

  res.status(404).json(response);
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<void>
) {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Request timeout middleware
 */
export function requestTimeout(timeoutMs: number = 30000) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const requestId = generateRequestId();
        const response: APIResponse = {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: 'Request timeout',
          },
          timestamp: new Date(),
          requestId,
        };
        res.status(408).json(response);
      }
    }, timeoutMs);

    // Clear timeout when response is sent
    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
  };
}

/**
 * Enhanced error logging service
 */
export class ErrorLogger {
  private static errorCounts = new Map<string, number>();
  private static lastErrorTime = new Map<string, number>();

  /**
   * Log error with enhanced context and deduplication
   */
  static async logError(
    error: Error,
    context: {
      requestId: string;
      endpoint: string;
      method: string;
      userAgent?: string | undefined;
      body?: unknown;
      query?: unknown;
      params?: unknown;
      userId?: string;
    }
  ): Promise<void> {
    const errorKey = `${error.name}:${error.message}:${context.endpoint}`;
    const now = Date.now();

    // Deduplicate similar errors (within 5 minutes)
    const lastTime = this.lastErrorTime.get(errorKey) || 0;
    if (now - lastTime < 5 * 60 * 1000) {
      const count = this.errorCounts.get(errorKey) || 0;
      this.errorCounts.set(errorKey, count + 1);

      // Only log every 10th occurrence to reduce noise
      if (count % 10 !== 0) {
        return;
      }
    } else {
      this.errorCounts.set(errorKey, 1);
    }

    this.lastErrorTime.set(errorKey, now);

    const errorData = {
      timestamp: new Date().toISOString(),
      requestId: context.requestId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      request: {
        method: context.method,
        endpoint: context.endpoint,
        userAgent: context.userAgent,
        body: this.sanitizeData(context.body),
        query: context.query,
        params: context.params,
      },
      userId: context.userId,
      occurrenceCount: this.errorCounts.get(errorKey),
      environment: process.env.NODE_ENV || 'development',
    };

    // Log to console with structured format
    console.error('🚨 Server Error:', JSON.stringify(errorData, null, 2));
  }

  /**
   * Log client-side error
   */
  static async logClientError(errorData: {
    message: string;
    stack?: string;
    componentStack?: string;
    userAgent: string;
    url: string;
    timestamp: string;
  }): Promise<void> {
    const clientErrorData = {
      ...errorData,
      type: 'client_error',
      requestId: generateRequestId(),
    };

    console.error('🚨 Client Error:', JSON.stringify(clientErrorData, null, 2));
  }

  /**
   * Get error statistics
   */
  static getErrorStats(): { errorKey: string; count: number; lastOccurrence: number }[] {
    const stats: { errorKey: string; count: number; lastOccurrence: number }[] = [];

    for (const [errorKey, count] of this.errorCounts.entries()) {
      stats.push({
        errorKey,
        count,
        lastOccurrence: this.lastErrorTime.get(errorKey) || 0,
      });
    }

    return stats.sort((a, b) => b.count - a.count);
  }

  /**
   * Clear old error statistics
   */
  static clearOldStats(): void {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const [errorKey, lastTime] of this.lastErrorTime.entries()) {
      if (now - lastTime > oneHour) {
        this.errorCounts.delete(errorKey);
        this.lastErrorTime.delete(errorKey);
      }
    }
  }

  private static sanitizeData(data: unknown): unknown {
    if (!data) return data;

    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];

    if (typeof data === 'object' && data !== null) {
      const sanitized = { ...(data as Record<string, unknown>) };

      for (const field of sensitiveFields) {
        if (field in sanitized) {
          sanitized[field] = '[REDACTED]';
        }
      }

      return sanitized;
    }

    return data;
  }
}

/**
 * Recovery procedures for common error scenarios
 */
export class ErrorRecovery {
  /**
   * Attempt to recover from Redis connection errors
   */
  static async recoverRedisConnection(): Promise<boolean> {
    try {
      const { redis } = await import('@devvit/web/server');

      // Test connection with a simple operation
      await redis.get('ping'); // Test connection
      console.log('✅ Redis connection recovered');
      return true;
    } catch (error) {
      console.error('❌ Redis recovery failed:', error);
      return false;
    }
  }

  /**
   * Attempt to recover from service errors
   */
  static async recoverService(
    serviceName: string,
    recoveryFn: () => Promise<void>
  ): Promise<boolean> {
    try {
      await recoveryFn();
      console.log(`✅ ${serviceName} service recovered`);
      return true;
    } catch (error) {
      console.error(`❌ ${serviceName} recovery failed:`, error);
      return false;
    }
  }

  /**
   * Circuit breaker pattern for external services
   */
  static createCircuitBreaker<T>(
    operation: () => Promise<T>,
    options: {
      failureThreshold: number;
      resetTimeout: number;
      name: string;
    }
  ) {
    let failures = 0;
    let lastFailureTime = 0;
    let state: 'closed' | 'open' | 'half-open' = 'closed';

    return async (): Promise<T> => {
      const now = Date.now();

      // Check if we should attempt to close the circuit
      if (state === 'open' && now - lastFailureTime > options.resetTimeout) {
        state = 'half-open';
        console.log(`🔄 Circuit breaker for ${options.name} moving to half-open state`);
      }

      // Reject immediately if circuit is open
      if (state === 'open') {
        throw new Error(`Circuit breaker for ${options.name} is open`);
      }

      try {
        const result = await operation();

        // Reset on success
        if (state === 'half-open') {
          state = 'closed';
          failures = 0;
          console.log(`✅ Circuit breaker for ${options.name} closed`);
        }

        return result;
      } catch (error) {
        failures++;
        lastFailureTime = now;

        if (failures >= options.failureThreshold) {
          state = 'open';
          console.error(`🚨 Circuit breaker for ${options.name} opened after ${failures} failures`);
        }

        throw error;
      }
    };
  }
}
