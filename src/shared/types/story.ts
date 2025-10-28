/**
 * Story and visualization types for CrowdLore storytelling game
 */

import type { VoteResult } from './vote.js';

// ASCII art scene representation
export type ASCIIScene = {
  lines: string[];
  caption: string;
  maxWidth: number;
  theme: string;
  generatedAt: Date;
};

// Story element that gets added to the lore log
export type LoreEntry = {
  id: string;
  dilemmaId: string;
  timestamp: Date;
  text: string;
  category: 'decision' | 'consequence' | 'world_change' | 'discovery';
  significance: 'minor' | 'major' | 'pivotal';
};

// Complete story outcome including narrative and visuals
export type StoryOutcome = {
  id: string;
  dilemmaId: string;
  voteResult: VoteResult;
  loreEntry: LoreEntry;
  asciiScene: ASCIIScene;
  communityReaction: string;
  createdAt: Date;
};

// Story generation context for AI/template systems
export type StoryContext = {
  currentWorldState: import('./world.js').WorldState;
  recentHistory: LoreEntry[];
  winningChoice: import('./dilemma.js').DilemmaOption;
  voteMetrics: {
    totalVotes: number;
    winningMargin: number;
    participationRate: number;
  };
};

// ASCII generation parameters
export type ASCIIGenerationParams = {
  theme: string;
  mood: 'positive' | 'negative' | 'neutral' | 'mysterious';
  complexity: 'simple' | 'moderate' | 'detailed';
  maxLines: number;
  maxWidth: number;
  includeCaption: boolean;
};
