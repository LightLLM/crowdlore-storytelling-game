/**
 * Data validation schemas for CrowdLore types
 */

import type { WorldAttributes, WorldAttributeEffects } from '../types/world.js';
import type { DilemmaOption, DilemmaTheme } from '../types/dilemma.js';
import type { Vote } from '../types/vote.js';
import type { VoteRequest } from '../types/api.js';

// Validation result type
export type ValidationResult<T> = {
  isValid: boolean;
  data?: T;
  errors: ValidationError[];
};

export type ValidationError = {
  field: string;
  message: string;
  value?: unknown;
};

// World attribute validation
export const validateWorldAttributes = (data: unknown): ValidationResult<WorldAttributes> => {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: [{ field: 'root', message: 'Must be an object' }] };
  }

  const obj = data as Record<string, unknown>;
  const attributes = ['stability', 'curiosity', 'survival', 'reputation'] as const;

  for (const attr of attributes) {
    const value = obj[attr];
    if (typeof value !== 'number') {
      errors.push({ field: attr, message: 'Must be a number', value });
    } else if (value < -10 || value > 10) {
      errors.push({ field: attr, message: 'Must be between -10 and 10', value });
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: obj as WorldAttributes,
    errors: [],
  };
};

// World attribute effects validation
export const validateWorldAttributeEffects = (
  data: unknown
): ValidationResult<WorldAttributeEffects> => {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: [{ field: 'root', message: 'Must be an object' }] };
  }

  const obj = data as Record<string, unknown>;
  const attributes = ['stability', 'curiosity', 'survival', 'reputation'] as const;

  for (const attr of attributes) {
    const value = obj[attr];
    if (value !== undefined) {
      if (typeof value !== 'number') {
        errors.push({ field: attr, message: 'Must be a number', value });
      } else if (value < -3 || value > 3) {
        errors.push({ field: attr, message: 'Must be between -3 and 3', value });
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: obj as WorldAttributeEffects,
    errors: [],
  };
};

// Dilemma theme validation
export const validateDilemmaTheme = (data: unknown): ValidationResult<DilemmaTheme> => {
  const validThemes: DilemmaTheme[] = [
    'exploration',
    'diplomacy',
    'humor',
    'discovery',
    'survival',
    'mystery',
    'community',
    'trade',
  ];

  if (typeof data !== 'string' || !validThemes.includes(data as DilemmaTheme)) {
    return {
      isValid: false,
      errors: [
        {
          field: 'theme',
          message: `Must be one of: ${validThemes.join(', ')}`,
          value: data,
        },
      ],
    };
  }

  return {
    isValid: true,
    data: data as DilemmaTheme,
    errors: [],
  };
};

// Dilemma option validation
export const validateDilemmaOption = (data: unknown): ValidationResult<DilemmaOption> => {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: [{ field: 'root', message: 'Must be an object' }] };
  }

  const obj = data as Record<string, unknown>;

  // Validate required string fields
  const stringFields = ['id', 'text', 'description'] as const;
  for (const field of stringFields) {
    if (typeof obj[field] !== 'string' || !obj[field]) {
      errors.push({ field, message: 'Must be a non-empty string', value: obj[field] });
    }
  }

  // Validate attribute effects
  if (obj.attributeEffects) {
    const effectsValidation = validateWorldAttributeEffects(obj.attributeEffects);
    if (!effectsValidation.isValid) {
      errors.push(
        ...effectsValidation.errors.map((e) => ({
          ...e,
          field: `attributeEffects.${e.field}`,
        }))
      );
    }
  }

  // Validate pros and cons arrays
  const arrayFields = ['pros', 'cons'] as const;
  for (const field of arrayFields) {
    if (!Array.isArray(obj[field])) {
      errors.push({ field, message: 'Must be an array', value: obj[field] });
    } else {
      const arr = obj[field] as unknown[];
      if (!arr.every((item) => typeof item === 'string')) {
        errors.push({ field, message: 'Must be an array of strings', value: obj[field] });
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: obj as DilemmaOption,
    errors: [],
  };
};

// Vote request validation
export const validateVoteRequest = (data: unknown): ValidationResult<VoteRequest> => {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: [{ field: 'root', message: 'Must be an object' }] };
  }

  const obj = data as Record<string, unknown>;

  // Validate required string fields
  const stringFields = ['dilemmaId', 'optionId'] as const;
  for (const field of stringFields) {
    if (typeof obj[field] !== 'string' || !obj[field]) {
      errors.push({ field, message: 'Must be a non-empty string', value: obj[field] });
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: obj as VoteRequest,
    errors: [],
  };
};

// Vote validation
export const validateVote = (data: unknown): ValidationResult<Vote> => {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: [{ field: 'root', message: 'Must be an object' }] };
  }

  const obj = data as Record<string, unknown>;

  // Validate required string fields
  const stringFields = ['id', 'dilemmaId', 'optionId', 'userId', 'username'] as const;
  for (const field of stringFields) {
    if (typeof obj[field] !== 'string' || !obj[field]) {
      errors.push({ field, message: 'Must be a non-empty string', value: obj[field] });
    }
  }

  // Validate timestamp
  if (!(obj.timestamp instanceof Date) && typeof obj.timestamp !== 'string') {
    errors.push({
      field: 'timestamp',
      message: 'Must be a Date or ISO string',
      value: obj.timestamp,
    });
  }

  // Validate source
  const validSources = ['reddit_comment', 'reddit_vote', 'web_interface'] as const;
  if (!validSources.includes(obj.source as (typeof validSources)[number])) {
    errors.push({
      field: 'source',
      message: `Must be one of: ${validSources.join(', ')}`,
      value: obj.source,
    });
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: obj as Vote,
    errors: [],
  };
};

// Generic string validation helpers
export const validateNonEmptyString = (
  value: unknown,
  fieldName: string
): ValidationError | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { field: fieldName, message: 'Must be a non-empty string', value };
  }
  return null;
};

export const validateNumberInRange = (
  value: unknown,
  fieldName: string,
  min: number,
  max: number
): ValidationError | null => {
  if (typeof value !== 'number') {
    return { field: fieldName, message: 'Must be a number', value };
  }
  if (value < min || value > max) {
    return { field: fieldName, message: `Must be between ${min} and ${max}`, value };
  }
  return null;
};
