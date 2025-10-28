/**
 * World attribute calculation engine for CrowdLore
 */

import type {
  WorldAttributes,
  WorldAttributeEffects,
  WorldHistoryEntry,
} from '../../shared/types/index.js';
import {
  validateWorldAttributes,
  validateWorldAttributeEffects,
} from '../../shared/validation/index.js';

// Attribute bounds and limits
export const ATTRIBUTE_BOUNDS = {
  MIN: -10,
  MAX: 10,
} as const;

export const EFFECT_LIMITS = {
  MIN: -3,
  MAX: 3,
} as const;

/**
 * Attribute calculation engine class
 */
export class AttributeEngine {
  /**
   * Apply attribute effects to current attributes with bounds checking
   */
  static applyEffects(
    currentAttributes: WorldAttributes,
    effects: WorldAttributeEffects
  ): { newAttributes: WorldAttributes; actualEffects: WorldAttributeEffects } {
    // Validate inputs
    const attributesValidation = validateWorldAttributes(currentAttributes);
    if (!attributesValidation.isValid) {
      throw new Error(
        `Invalid current attributes: ${attributesValidation.errors.map((e) => e.message).join(', ')}`
      );
    }

    const effectsValidation = validateWorldAttributeEffects(effects);
    if (!effectsValidation.isValid) {
      throw new Error(
        `Invalid effects: ${effectsValidation.errors.map((e) => e.message).join(', ')}`
      );
    }

    const newAttributes = { ...currentAttributes };
    const actualEffects: WorldAttributeEffects = {};

    // Apply each effect with bounds checking
    for (const [attribute, effect] of Object.entries(effects)) {
      if (effect !== undefined && attribute in newAttributes) {
        const attrKey = attribute as keyof WorldAttributes;
        const currentValue = currentAttributes[attrKey];
        const targetValue = currentValue + effect;

        // Apply bounds checking
        const boundedValue = Math.max(
          ATTRIBUTE_BOUNDS.MIN,
          Math.min(ATTRIBUTE_BOUNDS.MAX, targetValue)
        );
        const actualEffect = boundedValue - currentValue;

        newAttributes[attrKey] = boundedValue;
        actualEffects[attrKey] = actualEffect;

        console.log(
          `📊 ${attribute}: ${currentValue} + ${effect} = ${boundedValue} (actual effect: ${actualEffect})`
        );
      }
    }

    return { newAttributes, actualEffects };
  }

  /**
   * Validate that effects are within allowed limits (-3 to +3)
   */
  static validateEffectLimits(effects: WorldAttributeEffects): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (const [attribute, effect] of Object.entries(effects)) {
      if (effect !== undefined) {
        if (effect < EFFECT_LIMITS.MIN || effect > EFFECT_LIMITS.MAX) {
          errors.push(
            `${attribute} effect ${effect} is outside allowed range (${EFFECT_LIMITS.MIN} to ${EFFECT_LIMITS.MAX})`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate attribute balance score (0-1, higher is more balanced)
   */
  static calculateBalanceScore(attributes: WorldAttributes): number {
    const values = Object.values(attributes);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);

    // Convert standard deviation to balance score (0-1)
    // Lower standard deviation = higher balance
    const maxPossibleStdDev = Math.sqrt((ATTRIBUTE_BOUNDS.MAX - ATTRIBUTE_BOUNDS.MIN) ** 2 / 4);
    const balanceScore = Math.max(0, 1 - standardDeviation / maxPossibleStdDev);

    return Math.round(balanceScore * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get attribute status description
   */
  static getAttributeStatus(value: number): { status: string; color: string; description: string } {
    if (value >= 7) {
      return { status: 'Excellent', color: 'green', description: 'Thriving' };
    } else if (value >= 4) {
      return { status: 'Good', color: 'lightgreen', description: 'Stable' };
    } else if (value >= 1) {
      return { status: 'Fair', color: 'yellow', description: 'Moderate' };
    } else if (value >= -3) {
      return { status: 'Poor', color: 'orange', description: 'Struggling' };
    } else if (value >= -6) {
      return { status: 'Critical', color: 'red', description: 'In crisis' };
    } else {
      return { status: 'Catastrophic', color: 'darkred', description: 'Collapsing' };
    }
  }

  /**
   * Calculate trend from history entries
   */
  static calculateAttributeTrend(
    attribute: keyof WorldAttributes,
    history: WorldHistoryEntry[],
    lookbackPeriod = 5
  ): { trend: 'rising' | 'falling' | 'stable'; strength: number; totalChange: number } {
    if (history.length === 0) {
      return { trend: 'stable', strength: 0, totalChange: 0 };
    }

    // Get recent history entries
    const recentHistory = history.slice(-lookbackPeriod);
    let totalChange = 0;

    // Sum up changes for this attribute
    for (const entry of recentHistory) {
      const change = entry.changes[attribute];
      if (change !== undefined) {
        totalChange += change;
      }
    }

    // Determine trend
    let trend: 'rising' | 'falling' | 'stable';
    if (totalChange > 0.5) {
      trend = 'rising';
    } else if (totalChange < -0.5) {
      trend = 'falling';
    } else {
      trend = 'stable';
    }

    // Calculate strength (0-1)
    const maxPossibleChange = lookbackPeriod * EFFECT_LIMITS.MAX;
    const strength = Math.min(1, Math.abs(totalChange) / maxPossibleChange);

    return { trend, strength: Math.round(strength * 100) / 100, totalChange };
  }

  /**
   * Suggest balancing effects to improve world balance
   */
  static suggestBalancingEffects(attributes: WorldAttributes): WorldAttributeEffects {
    const values = Object.values(attributes);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;

    const balancingEffects: WorldAttributeEffects = {};

    for (const [attribute, value] of Object.entries(attributes)) {
      const attrKey = attribute as keyof WorldAttributes;
      const deviation = value - mean;

      if (Math.abs(deviation) > 1) {
        // Suggest effect to move toward mean
        const suggestedEffect =
          Math.sign(-deviation) * Math.min(EFFECT_LIMITS.MAX, Math.abs(deviation) / 2);
        balancingEffects[attrKey] = Math.round(suggestedEffect);
      }
    }

    return balancingEffects;
  }

  /**
   * Check if attributes are in a critical state requiring intervention
   */
  static checkCriticalState(attributes: WorldAttributes): {
    isCritical: boolean;
    criticalAttributes: Array<{
      attribute: keyof WorldAttributes;
      value: number;
      severity: 'high' | 'extreme';
    }>;
    recommendations: string[];
  } {
    const criticalAttributes: Array<{
      attribute: keyof WorldAttributes;
      value: number;
      severity: 'high' | 'extreme';
    }> = [];
    const recommendations: string[] = [];

    for (const [attribute, value] of Object.entries(attributes)) {
      const attrKey = attribute as keyof WorldAttributes;

      if (value <= -7) {
        criticalAttributes.push({ attribute: attrKey, value, severity: 'extreme' });
        recommendations.push(
          `${attribute} is in extreme crisis - immediate positive action needed`
        );
      } else if (value <= -4) {
        criticalAttributes.push({ attribute: attrKey, value, severity: 'high' });
        recommendations.push(
          `${attribute} is critically low - consider options that improve this area`
        );
      }
    }

    return {
      isCritical: criticalAttributes.length > 0,
      criticalAttributes,
      recommendations,
    };
  }

  /**
   * Generate attribute summary for display
   */
  static generateAttributeSummary(attributes: WorldAttributes): {
    overall: string;
    strongest: { attribute: keyof WorldAttributes; value: number };
    weakest: { attribute: keyof WorldAttributes; value: number };
    balanceScore: number;
  } {
    const entries = Object.entries(attributes) as Array<[keyof WorldAttributes, number]>;
    if (entries.length === 0) {
      throw new Error('No attributes provided');
    }

    const firstEntry = entries[0]!; // Non-null assertion since we checked length above
    const strongest = entries.reduce(
      (max, [attr, val]) => (val > max.value ? { attribute: attr, value: val } : max),
      { attribute: firstEntry[0], value: firstEntry[1] }
    );
    const weakest = entries.reduce(
      (min, [attr, val]) => (val < min.value ? { attribute: attr, value: val } : min),
      { attribute: firstEntry[0], value: firstEntry[1] }
    );

    const balanceScore = this.calculateBalanceScore(attributes);
    const averageValue = Object.values(attributes).reduce((sum, val) => sum + val, 0) / 4;

    let overall: string;
    if (averageValue >= 5) {
      overall = 'Your world is thriving with strong foundations across all areas.';
    } else if (averageValue >= 2) {
      overall = 'Your world is developing well with room for growth.';
    } else if (averageValue >= -2) {
      overall = 'Your world faces challenges but maintains stability.';
    } else if (averageValue >= -5) {
      overall = 'Your world is struggling and needs careful attention.';
    } else {
      overall = 'Your world is in crisis and requires immediate action.';
    }

    return { overall, strongest, weakest, balanceScore };
  }
}
