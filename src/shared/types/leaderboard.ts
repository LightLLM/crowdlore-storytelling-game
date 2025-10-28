/**
 * Leaderboard and ranking types for CrowdLore
 */

export type LeaderboardCategory =
  | 'totalVotes'
  | 'winningPercentage'
  | 'currentStreak'
  | 'longestStreak'
  | 'achievements'
  | 'averageImpact';

export type TimeFrame = 'allTime' | 'monthly' | 'weekly';

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  score: number;
  change: number; // position change from previous period
  badge?: string; // special badge for top performers
};

export type LeaderboardData = {
  category: LeaderboardCategory;
  timeframe: TimeFrame;
  entries: LeaderboardEntry[];
  totalUsers: number;
  lastUpdated: Date;
  userRank?: number; // current user's rank in this leaderboard
};

export type UserRankInfo = {
  category: LeaderboardCategory;
  rank: number;
  score: number;
  percentile: number;
  change: number;
  totalUsers: number;
};

export type LeaderboardUpdate = {
  userId: string;
  category: LeaderboardCategory;
  score: number;
  timestamp: Date;
};

export type SeasonalReset = {
  season: string;
  resetDate: Date;
  preservedStats: string[];
};
