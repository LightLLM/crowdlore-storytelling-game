/**
 * API request and response types for CrowdLore client-server communication
 */

import type { DilemmaData } from './dilemma.js';
import type { WorldState } from './world.js';
import type { VoteResult, Vote } from './vote.js';
import type { StoryOutcome, ASCIIScene } from './story.js';

// Base API response structure
export type APIResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: Date;
  requestId: string;
};

// Current dilemma endpoint response
export type CurrentDilemmaResponse = APIResponse<{
  dilemma: DilemmaData | null;
  timeRemaining: number; // seconds until voting closes
  voteCount: number;
  hasUserVoted: boolean;
}>;

// World state endpoint response
export type WorldStateResponse = APIResponse<{
  worldState: WorldState;
  recentOutcomes: StoryOutcome[];
  trends: {
    attribute: keyof WorldState['attributes'];
    change: number;
    direction: 'up' | 'down' | 'stable';
  }[];
}>;

// Vote submission request
export type VoteRequest = {
  dilemmaId: string;
  optionId: string;
};

// Vote submission response
export type VoteResponse = APIResponse<{
  vote: Vote;
  currentVoteCount: number;
  timeRemaining: number;
}>;

// Vote results endpoint response
export type VoteResultsResponse = APIResponse<{
  result: VoteResult;
  storyOutcome: StoryOutcome;
  nextDilemmaAt: Date;
}>;

// ASCII scene endpoint response
export type ASCIISceneResponse = APIResponse<{
  scene: ASCIIScene;
  context: string;
}>;

// World history endpoint response
export type WorldHistoryResponse = APIResponse<{
  history: import('./world.js').WorldHistoryEntry[];
  totalEntries: number;
  page: number;
  pageSize: number;
}>;

// Admin endpoints for dilemma generation
export type GenerateDilemmaRequest = {
  theme?: import('./dilemma.js').DilemmaTheme;
  forceGenerate?: boolean;
};

export type GenerateDilemmaResponse = APIResponse<{
  dilemma: DilemmaData;
  balanceScore: number;
  moderationPassed: boolean;
}>;

// Process votes admin endpoint
export type ProcessVotesResponse = APIResponse<{
  result: VoteResult;
  outcome: StoryOutcome;
  worldStateUpdated: boolean;
}>;

// User profile API responses
export type UserProfileResponse = APIResponse<{
  profile: import('./user.js').UserProfile;
}>;

export type UserAchievementsResponse = APIResponse<{
  achievements: import('./user.js').Achievement[];
}>;

export type UserStatsResponse = APIResponse<{
  stats: import('./user.js').UserStats;
}>;

// Leaderboard API responses
export type LeaderboardResponse = APIResponse<{
  leaderboard: import('./leaderboard.js').LeaderboardData;
}>;

export type UserRankResponse = APIResponse<{
  rankInfo: import('./leaderboard.js').UserRankInfo;
}>;

export type LeaderboardStatsResponse = APIResponse<{
  totalUsers: number;
  activeUsers: number;
  topCategories: { category: import('./leaderboard.js').LeaderboardCategory; userCount: number }[];
}>;

// Error response types
export type ValidationError = {
  field: string;
  message: string;
  value?: unknown;
};

export type APIError = {
  code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'INTERNAL_ERROR';
  message: string;
  details?: ValidationError[] | unknown;
};

// Legacy API types for backward compatibility
export type InitResponse = {
  type: 'init';
  postId: string;
  count: number;
  username: string;
};

export type IncrementResponse = {
  type: 'increment';
  postId: string;
  count: number;
};

export type DecrementResponse = {
  type: 'decrement';
  postId: string;
  count: number;
};
