/**
 * UserStatsService - Manages user profiles, statistics, and achievements
 */

import { redis } from '@devvit/web/server';
import type { Context } from '@devvit/web/server';
import type {
  UserProfile,
  UserStats,
  Achievement,
  AchievementType,
  AchievementDefinition,
  UserVoteHistory,
  WorldAttributes,
} from '../../shared/types/index.js';
import { REDIS_KEYS, RedisDataModels } from './redisDataModels.js';

export class UserStatsService {
  private context: Context;

  constructor(context: Context) {
    this.context = context;
  }

  /**
   * Get user profile by userId
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      // Update user activity tracking
      await RedisDataModels.updateUserActivity(userId);

      const profileData = await redis.get(REDIS_KEYS.USER.PROFILE(userId));
      if (!profileData) {
        return null;
      }

      const profile = JSON.parse(profileData) as UserProfile;
      // Convert date strings back to Date objects
      profile.joinDate = new Date(profile.joinDate);
      profile.lastVoteDate = new Date(profile.lastVoteDate);
      profile.achievements = profile.achievements.map((achievement) => ({
        ...achievement,
        unlockedAt: new Date(achievement.unlockedAt),
      }));

      return profile;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  /**
   * Create a new user profile
   */
  async createUserProfile(userId: string, username: string): Promise<UserProfile> {
    // Use the centralized Redis data model for profile creation
    return await RedisDataModels.createUserProfile(userId, username);
  }

  /**
   * Save user profile to Redis with proper TTL and session management
   */
  private async saveUserProfile(profile: UserProfile): Promise<void> {
    try {
      // Store profile with TTL for inactive users (1 year)
      await redis.set(REDIS_KEYS.USER.PROFILE(profile.userId), JSON.stringify(profile), {
        expiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      // Invalidate cached stats
      await redis.del(REDIS_KEYS.USER.STATS_CACHE(profile.userId));

      // Update user activity
      await RedisDataModels.updateUserActivity(profile.userId);
    } catch (error) {
      console.error('Error saving user profile:', error);
      throw error;
    }
  }

  /**
   * Update user profile after a vote
   */
  async updateUserVote(userId: string, dilemmaId: string, optionId: string): Promise<void> {
    try {
      let profile = await this.getUserProfile(userId);

      // Create profile if it doesn't exist
      if (!profile) {
        // Get username from Reddit context if available
        const username = this.context.userId || userId;
        profile = await this.createUserProfile(userId, username);
      }

      // Update vote count and last vote date
      profile.totalVotes += 1;
      profile.lastVoteDate = new Date();

      // Store vote history
      const voteHistory: UserVoteHistory = {
        dilemmaId,
        optionId,
        timestamp: new Date(),
        wasWinner: false, // Will be updated when outcome is processed
        attributeImpact: 0, // Will be updated when outcome is processed
      };

      await this.addVoteToHistory(userId, voteHistory);
      await this.saveUserProfile(profile);

      // Update leaderboards with new stats
      await this.updateLeaderboards(profile);

      // Check for achievements
      await this.checkAndAwardAchievements(profile);
    } catch (error) {
      console.error('Error updating user vote:', error);
      throw error;
    }
  }

  /**
   * Process vote outcome and update user statistics
   */
  async processVoteOutcome(
    userId: string,
    dilemmaId: string,
    wasWinner: boolean,
    attributeImpact: number = 0,
    optionId?: string
  ): Promise<void> {
    try {
      const profile = await this.getUserProfile(userId);
      if (!profile) {
        console.warn(`No profile found for user ${userId} when processing vote outcome`);
        return;
      }

      // Enhanced streak tracking with date validation
      const today = new Date();
      const lastVoteDate = new Date(profile.lastVoteDate);
      const daysSinceLastVote = Math.floor(
        (today.getTime() - lastVoteDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Reset streak if more than 2 days have passed (allowing for 1 day gap)
      if (daysSinceLastVote > 2) {
        profile.currentStreak = 0;
      }

      // Update winning votes and streak
      if (wasWinner) {
        profile.winningVotes += 1;
        profile.currentStreak += 1;
        profile.longestStreak = Math.max(profile.longestStreak, profile.currentStreak);
      } else {
        profile.currentStreak = 0;
      }

      // Enhanced average impact calculation with weighted history
      const impactWeight = 0.1; // Weight for new impact vs historical average
      profile.averageImpact =
        profile.averageImpact * (1 - impactWeight) + Math.abs(attributeImpact) * impactWeight;

      // Update vote history with enhanced data
      await this.updateVoteHistory(userId, dilemmaId, wasWinner, attributeImpact, optionId);

      // Track user's attribute preferences
      if (optionId) {
        await this.updateAttributePreferences(userId, optionId, attributeImpact);
      }

      // Update last vote date
      profile.lastVoteDate = today;

      await this.saveUserProfile(profile);

      // Update leaderboards with new stats
      await this.updateLeaderboards(profile);

      // Check for achievements after outcome processing
      await this.checkAndAwardAchievements(profile);

      // Track milestone achievements
      await this.checkMilestoneAchievements(profile);
    } catch (error) {
      console.error('Error processing vote outcome:', error);
      throw error;
    }
  }

  /**
   * Get user statistics with caching
   */
  async getUserStats(userId: string): Promise<UserStats | null> {
    try {
      // Use cached stats for better performance
      const cachedStats = await RedisDataModels.getUserStatsWithCache(userId);
      if (cachedStats) {
        return cachedStats;
      }

      // Fallback to manual calculation if cache fails
      const profile = await this.getUserProfile(userId);
      if (!profile) {
        return null;
      }

      const winningPercentage =
        profile.totalVotes > 0 ? (profile.winningVotes / profile.totalVotes) * 100 : 0;

      const participationDays = Math.ceil(
        (Date.now() - profile.joinDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate favorite attribute from vote history
      const favoriteAttribute = await this.calculateFavoriteAttribute(userId);

      const stats: UserStats = {
        totalVotes: profile.totalVotes,
        winningVotes: profile.winningVotes,
        winningPercentage: Math.round(winningPercentage * 100) / 100,
        currentStreak: profile.currentStreak,
        longestStreak: profile.longestStreak,
        achievementCount: profile.achievements.length,
        ...(favoriteAttribute && { favoriteAttribute }),
        averageImpact: Math.round(profile.averageImpact * 100) / 100,
        participationDays,
        lastActiveDate: profile.lastVoteDate,
      };

      return stats;
    } catch (error) {
      console.error('Error getting user stats:', error);
      return null;
    }
  }

  /**
   * Award achievement to user
   */
  async awardAchievement(userId: string, achievementType: AchievementType): Promise<void> {
    try {
      const profile = await this.getUserProfile(userId);
      if (!profile) {
        console.warn(`No profile found for user ${userId} when awarding achievement`);
        return;
      }

      // Check if user already has this achievement
      const hasAchievement = profile.achievements.some((a) => a.id === achievementType);
      if (hasAchievement) {
        return;
      }

      const achievementDef = this.getAchievementDefinition(achievementType);
      if (!achievementDef) {
        console.warn(`Unknown achievement type: ${achievementType}`);
        return;
      }

      const achievement: Achievement = {
        id: achievementType,
        name: achievementDef.name,
        description: achievementDef.description,
        iconUrl: achievementDef.iconUrl,
        category: achievementDef.category,
        unlockedAt: new Date(),
      };

      profile.achievements.push(achievement);
      await this.saveUserProfile(profile);

      console.log(`Achievement awarded: ${achievementType} to user ${userId}`);
    } catch (error) {
      console.error('Error awarding achievement:', error);
      throw error;
    }
  }

  /**
   * Check and award achievements based on current profile
   */
  private async checkAndAwardAchievements(profile: UserProfile): Promise<void> {
    try {
      const stats = await this.getUserStats(profile.userId);
      if (!stats) return;

      const achievementDefinitions = this.getAllAchievementDefinitions();

      for (const achievementDef of achievementDefinitions) {
        const hasAchievement = profile.achievements.some((a) => a.id === achievementDef.id);
        if (!hasAchievement && achievementDef.checkCondition(profile, stats)) {
          await this.awardAchievement(profile.userId, achievementDef.id);
        }
      }
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  }

  /**
   * Add vote to user's history with TTL management
   */
  private async addVoteToHistory(userId: string, voteHistory: UserVoteHistory): Promise<void> {
    try {
      const historyKey = REDIS_KEYS.USER.VOTES(userId);
      const existingHistory = await redis.get(historyKey);

      let history: UserVoteHistory[] = [];
      if (existingHistory) {
        history = JSON.parse(existingHistory);
      }

      history.push(voteHistory);

      // Keep only last 100 votes to manage storage
      if (history.length > 100) {
        history = history.slice(-100);
      }

      // Store with 1 year TTL
      await redis.set(historyKey, JSON.stringify(history), {
        expiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
    } catch (error) {
      console.error('Error adding vote to history:', error);
    }
  }

  /**
   * Update vote history with outcome
   */
  private async updateVoteHistory(
    userId: string,
    dilemmaId: string,
    wasWinner: boolean,
    attributeImpact: number,
    _optionId?: string
  ): Promise<void> {
    try {
      const historyKey = REDIS_KEYS.USER.VOTES(userId);
      const existingHistory = await redis.get(historyKey);

      if (!existingHistory) return;

      const history: UserVoteHistory[] = JSON.parse(existingHistory);
      const voteIndex = history.findIndex((v) => v.dilemmaId === dilemmaId);

      if (voteIndex !== -1 && history[voteIndex]) {
        history[voteIndex].wasWinner = wasWinner;
        history[voteIndex].attributeImpact = attributeImpact;

        // Convert date strings back to Date objects if needed
        history[voteIndex].timestamp = new Date(history[voteIndex].timestamp);

        // Store with TTL
        await redis.set(historyKey, JSON.stringify(history), {
          expiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });
      }
    } catch (error) {
      console.error('Error updating vote history:', error);
    }
  }

  /**
   * Update user's attribute preferences based on voting patterns
   */
  private async updateAttributePreferences(
    userId: string,
    _optionId: string,
    _attributeImpact: number
  ): Promise<void> {
    try {
      const preferencesKey = REDIS_KEYS.USER.PREFERENCES(userId);
      const existingPreferences = await redis.get(preferencesKey);

      let preferences = {
        stability: 0,
        curiosity: 0,
        survival: 0,
        reputation: 0,
        totalChoices: 0,
        lastUpdated: new Date().toISOString(),
      };

      if (existingPreferences) {
        preferences = JSON.parse(existingPreferences);
      }

      // This is a simplified approach - in a real implementation,
      // we'd need to analyze the actual attribute effects of the chosen option
      // For now, we'll track general preference patterns
      preferences.totalChoices += 1;
      preferences.lastUpdated = new Date().toISOString();

      // Store preferences with TTL
      await redis.set(preferencesKey, JSON.stringify(preferences), {
        expiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }); // 1 year TTL
    } catch (error) {
      console.error('Error updating attribute preferences:', error);
    }
  }

  /**
   * Check for milestone achievements based on current profile state
   */
  private async checkMilestoneAchievements(profile: UserProfile): Promise<void> {
    try {
      const milestones = [
        { votes: 50, achievement: 'fiftyVotes' as AchievementType },
        { votes: 250, achievement: 'twoFiftyVotes' as AchievementType },
        { votes: 500, achievement: 'fiveHundredVotes' as AchievementType },
      ];

      for (const milestone of milestones) {
        if (profile.totalVotes >= milestone.votes) {
          const hasAchievement = profile.achievements.some((a) => a.id === milestone.achievement);
          if (!hasAchievement) {
            // Award milestone achievement if it exists in our definitions
            const achievementDef = this.getAchievementDefinition(milestone.achievement);
            if (achievementDef) {
              await this.awardAchievement(profile.userId, milestone.achievement);
            }
          }
        }
      }

      // Check for streak milestones
      const streakMilestones = [
        { streak: 15, achievement: 'fifteenWinStreak' as AchievementType },
        { streak: 25, achievement: 'twentyFiveWinStreak' as AchievementType },
      ];

      for (const milestone of streakMilestones) {
        if (
          profile.currentStreak >= milestone.streak ||
          profile.longestStreak >= milestone.streak
        ) {
          const hasAchievement = profile.achievements.some((a) => a.id === milestone.achievement);
          if (!hasAchievement) {
            const achievementDef = this.getAchievementDefinition(milestone.achievement);
            if (achievementDef) {
              await this.awardAchievement(profile.userId, milestone.achievement);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking milestone achievements:', error);
    }
  }

  /**
   * Calculate user's favorite attribute based on voting patterns
   */
  private async calculateFavoriteAttribute(
    userId: string
  ): Promise<keyof WorldAttributes | undefined> {
    try {
      const historyKey = REDIS_KEYS.USER.VOTES(userId);
      const existingHistory = await redis.get(historyKey);

      if (!existingHistory) return undefined;

      // This is a simplified calculation - in a real implementation,
      // you'd analyze the attribute effects of the options the user chose
      // For now, return undefined as we'd need more complex logic
      return undefined;
    } catch (error) {
      console.error('Error calculating favorite attribute:', error);
      return undefined;
    }
  }

  /**
   * Get achievement definition by type
   */
  private getAchievementDefinition(type: AchievementType): AchievementDefinition | null {
    const definitions = this.getAllAchievementDefinitions();
    return definitions.find((def) => def.id === type) || null;
  }

  /**
   * Update leaderboards with user stats using efficient Redis operations
   */
  private async updateLeaderboards(profile: UserProfile): Promise<void> {
    try {
      const stats = await this.getUserStats(profile.userId);
      if (!stats) return;

      // Update all leaderboard categories efficiently
      const leaderboardUpdates = [
        { category: 'totalVotes' as const, score: stats.totalVotes },
        { category: 'winningPercentage' as const, score: stats.winningPercentage },
        { category: 'currentStreak' as const, score: stats.currentStreak },
        { category: 'longestStreak' as const, score: stats.longestStreak },
        { category: 'achievements' as const, score: stats.achievementCount },
        { category: 'averageImpact' as const, score: stats.averageImpact },
      ];

      // Update all timeframes for each category
      const updatePromises = leaderboardUpdates.flatMap((update) => [
        RedisDataModels.updateLeaderboardEntry(
          profile.userId,
          update.category,
          update.score,
          'allTime'
        ),
        RedisDataModels.updateLeaderboardEntry(
          profile.userId,
          update.category,
          update.score,
          'monthly'
        ),
        RedisDataModels.updateLeaderboardEntry(
          profile.userId,
          update.category,
          update.score,
          'weekly'
        ),
      ]);

      await Promise.allSettled(updatePromises);
    } catch (error) {
      console.error('Error updating leaderboards:', error);
      // Don't throw error to avoid breaking user stats updates
    }
  }

  /**
   * Get all achievement definitions
   */
  private getAllAchievementDefinitions(): AchievementDefinition[] {
    return [
      {
        id: 'firstVote',
        name: 'First Step',
        description: 'Cast your first vote in the world',
        iconUrl: '/achievements/first-vote.png',
        category: 'participation',
        checkCondition: (profile) => profile.totalVotes >= 1,
      },
      {
        id: 'tenVotes',
        name: 'Active Participant',
        description: 'Cast 10 votes',
        iconUrl: '/achievements/ten-votes.png',
        category: 'participation',
        checkCondition: (profile) => profile.totalVotes >= 10,
      },
      {
        id: 'fiftyVotes',
        name: 'Engaged Citizen',
        description: 'Cast 50 votes',
        iconUrl: '/achievements/fifty-votes.png',
        category: 'participation',
        checkCondition: (profile) => profile.totalVotes >= 50,
      },
      {
        id: 'hundredVotes',
        name: 'Dedicated Citizen',
        description: 'Cast 100 votes',
        iconUrl: '/achievements/hundred-votes.png',
        category: 'milestone',
        checkCondition: (profile) => profile.totalVotes >= 100,
      },
      {
        id: 'twoFiftyVotes',
        name: 'Community Pillar',
        description: 'Cast 250 votes',
        iconUrl: '/achievements/two-fifty-votes.png',
        category: 'milestone',
        checkCondition: (profile) => profile.totalVotes >= 250,
      },
      {
        id: 'fiveHundredVotes',
        name: 'World Guardian',
        description: 'Cast 500 votes',
        iconUrl: '/achievements/five-hundred-votes.png',
        category: 'milestone',
        checkCondition: (profile) => profile.totalVotes >= 500,
      },
      {
        id: 'thousandVotes',
        name: 'World Architect',
        description: 'Cast 1000 votes',
        iconUrl: '/achievements/thousand-votes.png',
        category: 'milestone',
        checkCondition: (profile) => profile.totalVotes >= 1000,
      },
      {
        id: 'fiveWinStreak',
        name: 'Lucky Streak',
        description: 'Win 5 votes in a row',
        iconUrl: '/achievements/five-streak.png',
        category: 'streak',
        checkCondition: (profile) => profile.currentStreak >= 5 || profile.longestStreak >= 5,
      },
      {
        id: 'tenWinStreak',
        name: 'Oracle',
        description: 'Win 10 votes in a row',
        iconUrl: '/achievements/ten-streak.png',
        category: 'streak',
        checkCondition: (profile) => profile.currentStreak >= 10 || profile.longestStreak >= 10,
      },
      {
        id: 'fifteenWinStreak',
        name: 'Sage',
        description: 'Win 15 votes in a row',
        iconUrl: '/achievements/fifteen-streak.png',
        category: 'streak',
        checkCondition: (profile) => profile.currentStreak >= 15 || profile.longestStreak >= 15,
      },
      {
        id: 'twentyWinStreak',
        name: 'Prophet',
        description: 'Win 20 votes in a row',
        iconUrl: '/achievements/twenty-streak.png',
        category: 'streak',
        checkCondition: (profile) => profile.currentStreak >= 20 || profile.longestStreak >= 20,
      },
      {
        id: 'twentyFiveWinStreak',
        name: 'Legendary Oracle',
        description: 'Win 25 votes in a row',
        iconUrl: '/achievements/twenty-five-streak.png',
        category: 'streak',
        checkCondition: (profile) => profile.currentStreak >= 25 || profile.longestStreak >= 25,
      },
      {
        id: 'highAccuracy',
        name: 'Wise Counselor',
        description: 'Maintain 80% winning rate with 20+ votes',
        iconUrl: '/achievements/high-accuracy.png',
        category: 'accuracy',
        checkCondition: (profile, stats) =>
          profile.totalVotes >= 20 && stats.winningPercentage >= 80,
      },
      {
        id: 'consistentVoter',
        name: 'Reliable Voice',
        description: 'Vote for 30 consecutive days',
        iconUrl: '/achievements/consistent-voter.png',
        category: 'participation',
        checkCondition: (_profile, stats) => stats.participationDays >= 30,
      },
      {
        id: 'worldShaper',
        name: 'World Shaper',
        description: 'Have significant impact on world attributes',
        iconUrl: '/achievements/world-shaper.png',
        category: 'impact',
        checkCondition: (_profile, stats) => stats.averageImpact >= 2.0,
      },
      {
        id: 'majorImpact',
        name: 'Force of Change',
        description: 'Achieve maximum impact in a single vote',
        iconUrl: '/achievements/major-impact.png',
        category: 'impact',
        checkCondition: (_profile, stats) => stats.averageImpact >= 3.0,
      },
    ];
  }
}
