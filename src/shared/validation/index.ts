/**
 * Validation utilities for CrowdLore types
 */

import type { WorldAttributes, WorldAttributeEffects } from '../types/index.js';

export type ValidationResult = {
  isValid: boolean;
  errors: Array<{ field: string; message: string; value?: unknown }>;
};

/**
 * Validate world attributes
 */
export function validateWorldAttributes(attributes: WorldAttributes): ValidationResult {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value !== 'number') {
      errors.push({
        field: key,
        message: `${key} must be a number`,
        value,
      });
    } else if (value < -10 || value > 10) {
      errors.push({
        field: key,
        message: `${key} must be between -10 and 10`,
        value,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate world attribute effects
 */
export function validateWorldAttributeEffects(effects: WorldAttributeEffects): ValidationResult {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  for (const [key, value] of Object.entries(effects)) {
    if (value !== undefined) {
      if (typeof value !== 'number') {
        errors.push({
          field: key,
          message: `${key} effect must be a number`,
          value,
        });
      } else if (value < -3 || value > 3) {
        errors.push({
          field: key,
          message: `${key} effect must be between -3 and 3`,
          value,
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
