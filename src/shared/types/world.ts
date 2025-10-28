/**
 * World state and attribute types for CrowdLore storytelling game
 */

// Core world attributes that track the state of the fictional world
export type WorldAttributes = {
  stability: number; // -10 to +10: How stable/chaotic the world is
  curiosity: number; // -10 to +10: How exploratory/conservative the world is
  survival: number; // -10 to +10: How well the world is surviving/thriving
  reputation: number; // -10 to +10: How the world is perceived by others
};

// Effects that can be applied to world attributes (limited range for balance)
export type WorldAttributeEffects = {
  stability?: number; // -3 to +3: Change to stability
  curiosity?: number; // -3 to +3: Change to curiosity
  survival?: number; // -3 to +3: Change to survival
  reputation?: number; // -3 to +3: Change to reputation
};

// Complete world state including attributes and history
export type WorldState = {
  attributes: WorldAttributes;
  loreLog: string[];
  lastUpdated: Date;
  version: number; // For optimistic locking
};

// Historical record of world changes
export type WorldHistoryEntry = {
  timestamp: Date;
  dilemmaId: string;
  attributesBefore: WorldAttributes;
  attributesAfter: WorldAttributes;
  changes: WorldAttributeEffects;
  loreEntry: string;
};
