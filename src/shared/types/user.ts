/**
 * User profile and statistics types for CrowdLore
 */

import type { WorldAttributes } from './world.js';

export type UserProfile = {
  userId: string;
  username: string;
  totalVotes: number;
  winningVotes: number;
  currentStreak: number;
  longestStreak: number;
  achievements: Achievement[];
  joinDate: Date;
  lastVoteDate: Date;
  favoriteAttribute?: keyof WorldAttributes;
  averageImpact: number;
};

export type UserStats = {
  totalVotes: number;
  winningVotes: number;
  winningPercentage: number;
  currentStreak: number;
  longestStreak: number;
  achievementCount: number;
  favoriteAttribute?: keyof WorldAttributes;
  averageImpact: number;
  participationDays: number;
  lastActiveDate: Date;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  unlockedAt: Date;
  category: AchievementCategory;
};

export type AchievementCategory = 'participation' | 'accuracy' | 'streak' | 'impact' | 'milestone';

export type AchievementType =
  | 'firstVote'
  | 'tenVotes'
  | 'fiftyVotes'
  | 'hundredVotes'
  | 'twoFiftyVotes'
  | 'fiveHundredVotes'
  | 'thousandVotes'
  | 'fiveWinStreak'
  | 'tenWinStreak'
  | 'fifteenWinStreak'
  | 'twentyWinStreak'
  | 'twentyFiveWinStreak'
  | 'monthlyParticipant'
  | 'worldShaper'
  | 'consistentVoter'
  | 'highAccuracy'
  | 'majorImpact';

export type AchievementDefinition = {
  id: AchievementType;
  name: string;
  description: string;
  iconUrl: string;
  category: AchievementCategory;
  checkCondition: (profile: UserProfile, stats: UserStats) => boolean;
};

export type UserVoteHistory = {
  dilemmaId: string;
  optionId: string;
  timestamp: Date;
  wasWinner: boolean;
  attributeImpact: number;
};

export type UserProfileUpdate = {
  userId: string;
  dilemmaId: string;
  optionId: string;
  wasWinner: boolean;
  attributeImpact: number;
  timestamp: Date;
};
