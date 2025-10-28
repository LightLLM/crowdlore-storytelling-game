/**
 * Main exports for CrowdLore shared types
 */

// World types
export type {
  WorldAttributes,
  WorldAttributeEffects,
  WorldState,
  WorldHistoryEntry,
} from './world.js';

// Dilemma types
export type {
  DilemmaTheme,
  DilemmaOption,
  DilemmaData,
  DilemmaGenerationResult,
  ContentFlag,
  ModerationResult,
} from './dilemma.js';

// Vote types
export type {
  Vote,
  VoteData,
  VoteResult,
  VoteProcessingStatus,
  VoteValidation,
  RedditVoteSource,
  RedditCommentVote,
} from './vote.js';

// Story types
export type {
  ASCIIScene,
  LoreEntry,
  StoryOutcome,
  StoryContext,
  ASCIIGenerationParams,
} from './story.js';

// User types
export type {
  UserProfile,
  UserStats,
  Achievement,
  AchievementCategory,
  AchievementType,
  AchievementDefinition,
  UserVoteHistory,
  UserProfileUpdate,
} from './user.js';

// Leaderboard types
export type {
  LeaderboardCategory,
  TimeFrame,
  LeaderboardEntry,
  LeaderboardData,
  UserRankInfo,
  LeaderboardUpdate,
  SeasonalReset,
} from './leaderboard.js';

// API types
export type {
  APIResponse,
  CurrentDilemmaResponse,
  WorldStateResponse,
  VoteRequest,
  VoteResponse,
  VoteResultsResponse,
  ASCIISceneResponse,
  WorldHistoryResponse,
  GenerateDilemmaRequest,
  GenerateDilemmaResponse,
  ProcessVotesResponse,
  UserProfileResponse,
  UserAchievementsResponse,
  UserStatsResponse,
  ValidationError as APIValidationError,
  APIError,
} from './api.js';
