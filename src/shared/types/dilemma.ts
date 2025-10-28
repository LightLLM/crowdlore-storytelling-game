/**
 * Dilemma and decision types for CrowdLore storytelling game
 */

import type { WorldAttributeEffects } from './world.js';

// Themes for dilemma generation to ensure variety
export type DilemmaTheme =
  | 'exploration'
  | 'diplomacy'
  | 'humor'
  | 'discovery'
  | 'survival'
  | 'mystery'
  | 'community'
  | 'trade';

// Individual option within a dilemma
export type DilemmaOption = {
  id: string;
  text: string;
  description: string;
  attributeEffects: WorldAttributeEffects;
  pros: string[];
  cons: string[];
};

// Complete dilemma with scenario and options
export type DilemmaData = {
  id: string;
  title: string;
  scenario: string;
  theme: DilemmaTheme;
  options: [DilemmaOption, DilemmaOption, DilemmaOption]; // Always exactly 3 options
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
};

// Status of dilemma generation and validation
export type DilemmaGenerationResult = {
  dilemma: DilemmaData;
  balanceScore: number; // 0-1, higher is more balanced
  moderationFlags: ContentFlag[];
  isApproved: boolean;
};

// Content moderation flags
export type ContentFlag = {
  type: 'political' | 'sexual' | 'hateful' | 'personal' | 'brand' | 'inappropriate';
  severity: 'low' | 'medium' | 'high';
  location: string;
  originalText: string;
  suggestedReplacement?: string;
};

// Result of content moderation
export type ModerationResult = {
  isAppropriate: boolean;
  flags: ContentFlag[];
  sanitizedContent: string;
  confidence: number; // 0-1, confidence in moderation decision
};
