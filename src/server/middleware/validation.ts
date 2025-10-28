/**
 * Request validation middleware for CrowdLore API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import type { ValidationError } from '../../shared/types/api.js';

// Validation error class
export class RequestValidationError extends Error {
  public readonly validationErrors: ValidationError[];

  constructor(errors: ValidationError[]) {
    super('Request validation failed');
    this.name = 'RequestValidationError';
    this.validationErrors = errors;
  }
}

// Validation schema types
type ValidationRule = {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: string[];
  custom?: (value: unknown) => string | null; // Return error message or null if valid
};

type ValidationSchema = {
  [key: string]: ValidationRule;
};

/**
 * Validates a value against a validation rule
 */
function validateField(
  fieldName: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  const errors: string[] = [];

  // Check required
  if (rule.required && (value === undefined || value === null || value === '')) {
    return {
      field: fieldName,
      message: `${fieldName} is required`,
      value,
    };
  }

  // Skip further validation if value is not provided and not required
  if (!rule.required && (value === undefined || value === null)) {
    return null;
  }

  // Type validation
  if (rule.type) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== rule.type) {
      errors.push(`${fieldName} must be of type ${rule.type}, got ${actualType}`);
    }
  }

  // String validations
  if (rule.type === 'string' && typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push(`${fieldName} must be at least ${rule.minLength} characters long`);
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push(`${fieldName} must be at most ${rule.maxLength} characters long`);
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(`${fieldName} format is invalid`);
    }
    if (rule.enum && !rule.enum.includes(value)) {
      errors.push(`${fieldName} must be one of: ${rule.enum.join(', ')}`);
    }
  }

  // Number validations
  if (rule.type === 'number' && typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      errors.push(`${fieldName} must be at least ${rule.min}`);
    }
    if (rule.max !== undefined && value > rule.max) {
      errors.push(`${fieldName} must be at most ${rule.max}`);
    }
  }

  // Custom validation
  if (rule.custom) {
    const customError = rule.custom(value);
    if (customError) {
      errors.push(customError);
    }
  }

  if (errors.length > 0) {
    return {
      field: fieldName,
      message: errors.join(', '),
      value,
    };
  }

  return null;
}

/**
 * Creates validation middleware for request body
 */
export function validateBody(schema: ValidationSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: ValidationError[] = [];
    const body = req.body || {};

    // Validate each field in the schema
    for (const [fieldName, rule] of Object.entries(schema)) {
      const error = validateField(fieldName, body[fieldName], rule);
      if (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      next(new RequestValidationError(errors));
      return;
    }

    next();
  };
}

/**
 * Creates validation middleware for query parameters
 */
export function validateQuery(schema: ValidationSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: ValidationError[] = [];
    const query = req.query || {};

    // Validate each field in the schema
    for (const [fieldName, rule] of Object.entries(schema)) {
      const value = query[fieldName];
      let processedValue: string | number | boolean | undefined;

      // Convert string query params to appropriate types
      if (typeof value === 'string' && rule.type === 'number') {
        const numValue = Number(value);
        processedValue = isNaN(numValue) ? value : numValue;
      } else if (typeof value === 'string' && rule.type === 'boolean') {
        processedValue = value.toLowerCase() === 'true';
      } else {
        processedValue = value as string | undefined;
      }

      const error = validateField(fieldName, processedValue, rule);
      if (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      next(new RequestValidationError(errors));
      return;
    }

    next();
  };
}

/**
 * Creates validation middleware for URL parameters
 */
export function validateParams(schema: ValidationSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: ValidationError[] = [];
    const params = req.params || {};

    // Validate each field in the schema
    for (const [fieldName, rule] of Object.entries(schema)) {
      const value = params[fieldName];
      let processedValue: string | number | undefined;

      // Convert string params to appropriate types
      if (typeof value === 'string' && rule.type === 'number') {
        const numValue = Number(value);
        processedValue = isNaN(numValue) ? value : numValue;
      } else {
        processedValue = value;
      }

      const error = validateField(fieldName, processedValue, rule);
      if (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      next(new RequestValidationError(errors));
      return;
    }

    next();
  };
}

// Common validation schemas
export const commonSchemas = {
  dilemmaId: {
    required: true,
    type: 'string' as const,
    minLength: 1,
    maxLength: 100,
    pattern: /^[a-zA-Z0-9_-]+$/,
  },
  optionId: {
    required: true,
    type: 'string' as const,
    minLength: 1,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9_-]+$/,
  },
  theme: {
    type: 'string' as const,
    enum: ['exploration', 'diplomacy', 'humor', 'discovery', 'survival', 'mystery'],
  },
  pagination: {
    page: {
      type: 'number' as const,
      min: 1,
      max: 1000,
    },
    limit: {
      type: 'number' as const,
      min: 1,
      max: 100,
    },
  },
  asciiParams: {
    theme: {
      required: true,
      type: 'string' as const,
      enum: ['campfire', 'stars', 'festival', 'forest', 'mountain', 'ocean', 'village', 'cave'],
    },
    mood: {
      type: 'string' as const,
      enum: ['happy', 'sad', 'neutral', 'mysterious', 'dramatic', 'peaceful'],
    },
    complexity: {
      type: 'string' as const,
      enum: ['simple', 'moderate', 'complex'],
    },
    maxLines: {
      type: 'number' as const,
      min: 4,
      max: 12,
    },
    maxWidth: {
      type: 'number' as const,
      min: 16,
      max: 32,
    },
  },
  leaderboard: {
    category: {
      required: true,
      type: 'string' as const,
      enum: [
        'totalVotes',
        'winningPercentage',
        'currentStreak',
        'longestStreak',
        'achievements',
        'averageImpact',
      ],
    },
    timeframe: {
      type: 'string' as const,
      enum: ['allTime', 'monthly', 'weekly'],
    },
    limit: {
      type: 'number' as const,
      min: 1,
      max: 100,
    },
  },
};
