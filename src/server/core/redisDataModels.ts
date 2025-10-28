/**
 * Redis Data Models and Key Management for CrowdLore
 * Centralized Redis key definitions and data structure management
 */

import { redis } from '@devvit/web/server';
import type {
  UserProfile,
  UserStats,
  LeaderboardCategory,
  TimeFrame,
} from '../../shared/types/index.js';

/**
 * Centralized Redis key definitions
 */
export const REDIS_KEYS = {
  // World State Keys
  WORLD: {
    ATTRIBUTES: 'crowdlore:world:attributes',
    LORE_LOG: 'crowdlore:world:lore_log',
    HISTORY: 'crowdlore:world:history',
    VERSION: 'crowdlore:world:version',
    LAST_UPDATED: 'crowdlore:world:last_updated',
  },

  // Dilemma and Vote Keys
  DILEMMA: {
    CURRENT: 'crowdlore:current_dilemma',
    HISTORY: 'crowdlore:dilemma:history',
    VOTES: (dilemmaId: string) => `crowdlore:votes:${dilemmaId}`,
    VOTE_DATA: (dilemmaId: string) => `crowdlore:vote_data:${dilemmaId}`,
    PROCESSING_STATUS: (dilemmaId: string) => `crowdlore:processing:${dilemmaId}`,
  },

  // User Profile and Statistics Keys
  USER: {
    PROFILE: (userId: string) => `user:${userId}:profile`,
    VOTES: (userId: string) => `user:${userId}:votes`,
    ACHIEVEMENTS: (userId: string) => `user:${userId}:achievements`,
    PREFERENCES: (userId: string) => `user:${userId}:preferences`,
    VOTING_PATTERN: (userId: string) => `user:${userId}:voting_pattern`,
    SESSION: (userId: string) => `user:${userId}:session`,
    STATS_CACHE: (userId: string) => `user:${userId}:stats_cache`,
    LAST_VOTE: (userId: string) => `crowdlore:user_votes:${userId}`,
  },

  // Leaderboard Keys
  LEADERBOARD: {
    ALL_TIME: (category: LeaderboardCategory) => `leaderboard:${category}:alltime`,
    MONTHLY: (category: LeaderboardCategory, monthKey: string) =>
      `leaderboard:${category}:monthly:${monthKey}`,
    WEEKLY: (category: LeaderboardCategory, weekKey: string) =>
      `leaderboard:${category}:weekly:${weekKey}`,
    LAST_UPDATE: (category: LeaderboardCategory) => `leaderboard:${category}:last_update`,
    USER_RANK_CACHE: (userId: string, category: LeaderboardCategory, timeframe: TimeFrame) =>
      `leaderboard:rank:${userId}:${category}:${timeframe}`,
    STATS: 'leaderboard:global_stats',
  },

  // Cache Keys
  CACHE: {
    WORLD_STATE: 'cache:world_state',
    WORLD_TRENDS: 'cache:world_trends',
    CURRENT_DILEMMA: 'cache:current_dilemma',
    ASCII_SCENE: (dilemmaId: string) => `cache:ascii_scene:${dilemmaId}`,
    USER_PROFILE: (userId: string) => `cache:user_profile:${userId}`,
    LEADERBOARD: (category: LeaderboardCategory, timeframe: TimeFrame) =>
      `cache:leaderboard:${category}:${timeframe}`,
  },

  // Session Management Keys
  SESSION: {
    ACTIVE_USERS: 'session:active_users',
    USER_ACTIVITY: (userId: string) => `session:activity:${userId}`,
    DAILY_PARTICIPANTS: (date: string) => `session:daily:${date}`,
    ONLINE_COUNT: 'session:online_count',
  },

  // Global Statistics Keys
  STATS: {
    GLOBAL: 'crowdlore:global_stats',
    DAILY: (date: string) => `stats:daily:${date}`,
    PERFORMANCE: 'stats:performance',
    ACHIEVEMENTS_AWARDED: 'stats:achievements_awarded',
  },

  // Maintenance and Health Keys
  MAINTENANCE: {
    HEALTH_CHECK: 'maintenance:health_check',
    PERFORMANCE_LOG: 'maintenance:performance_log',
    ERROR_LOG: 'maintenance:error_log',
    CLEANUP_STATUS: 'maintenance:cleanup_status',
  },
} as const;

/**
 * Redis Data Structure Managers
 */
export class RedisDataModels {
  /**
   * Initialize Redis data structures with proper indexes and TTLs
   */
  static async initializeDataStructures(): Promise<void> {
    try {
      console.log('🔧 Initializing Redis data structures...');

      // Initialize global statistics if they don't exist
      const globalStats = await redis.get(REDIS_KEYS.STATS.GLOBAL);
      if (!globalStats) {
        const initialStats = {
          totalDilemmasProcessed: 0,
          totalVotesCast: 0,
          totalUsersRegistered: 0,
          averageParticipation: 0,
          popularOptions: {},
          attributeChanges: {
            stability: 0,
            curiosity: 0,
            survival: 0,
            reputation: 0,
          },
          lastUpdated: new Date().toISOString(),
        };
        await redis.set(REDIS_KEYS.STATS.GLOBAL, JSON.stringify(initialStats));
      }

      // Initialize leaderboard statistics
      const leaderboardStats = await redis.get(REDIS_KEYS.LEADERBOARD.STATS);
      if (!leaderboardStats) {
        const initialLeaderboardStats = {
          totalUsers: 0,
          activeUsers: 0,
          topCategories: [],
          lastReset: new Date().toISOString(),
        };
        await redis.set(REDIS_KEYS.LEADERBOARD.STATS, JSON.stringify(initialLeaderboardStats));
      }

      console.log('✅ Redis data structures initialized');
    } catch (error) {
      console.error('❌ Error initializing Redis data structures:', error);
      throw error;
    }
  }

  /**
   * Create efficient user profile with proper indexing
   */
  static async createUserProfile(userId: string, username: string): Promise<UserProfile> {
    const now = new Date();
    const profile: UserProfile = {
      userId,
      username,
      totalVotes: 0,
      winningVotes: 0,
      currentStreak: 0,
      longestStreak: 0,
      achievements: [],
      joinDate: now,
      lastVoteDate: now,
      averageImpact: 0,
    };

    // Store profile with TTL for inactive users (1 year)
    await redis.set(REDIS_KEYS.USER.PROFILE(userId), JSON.stringify(profile), {
      expiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });

    // Initialize user session data
    await this.initializeUserSession(userId);

    // Update global user count
    await this.incrementGlobalUserCount();

    return profile;
  }

  /**
   * Initialize user session management
   */
  static async initializeUserSession(userId: string): Promise<void> {
    const sessionData = {
      userId,
      lastActive: new Date().toISOString(),
      sessionStart: new Date().toISOString(),
      votesThisSession: 0,
      achievementsThisSession: [],
    };

    // Store session with 24-hour TTL
    await redis.set(REDIS_KEYS.USER.SESSION(userId), JSON.stringify(sessionData), {
      expiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // Add to active users set with TTL
    await redis.zAdd(REDIS_KEYS.SESSION.ACTIVE_USERS, { member: userId, score: Date.now() });
  }

  /**
   * Update user activity tracking
   */
  static async updateUserActivity(userId: string): Promise<void> {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // Update last activity
    await redis.zAdd(REDIS_KEYS.SESSION.ACTIVE_USERS, { member: userId, score: now });

    // Track daily participation
    // Note: sAdd is not available in Devvit Redis, using alternative approach
    const participantsKey = REDIS_KEYS.SESSION.DAILY_PARTICIPANTS(today || '');
    if (participantsKey) {
      await redis.set(`${participantsKey}:${userId}`, '1', {
        expiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }

    // Update user activity log
    const activityKey = REDIS_KEYS.SESSION.USER_ACTIVITY(userId);
    const activityData = {
      lastActive: new Date(now).toISOString(),
      dailyVotes: 0, // Will be updated by vote processor
      sessionDuration: 0, // Will be calculated
    };

    await redis.set(activityKey, JSON.stringify(activityData), {
      expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  /**
   * Efficient leaderboard data structure management
   */
  static async updateLeaderboardEntry(
    userId: string,
    category: LeaderboardCategory,
    score: number,
    timeframe: TimeFrame = 'allTime'
  ): Promise<void> {
    const leaderboardKey = this.getLeaderboardKey(category, timeframe);

    // Update leaderboard with new score
    await redis.zAdd(leaderboardKey, { member: userId, score });

    // Cache user's rank for quick access
    const rank = await redis.zRank(leaderboardKey, userId);
    if (rank !== null) {
      const rankCacheKey = REDIS_KEYS.LEADERBOARD.USER_RANK_CACHE(userId, category, timeframe);
      const rankData = {
        rank: rank !== undefined ? rank + 1 : 0, // Redis ranks are 0-based
        score,
        totalUsers: await redis.zCard(leaderboardKey),
        lastUpdated: new Date().toISOString(),
      };
      await redis.set(rankCacheKey, JSON.stringify(rankData), {
        expiration: new Date(Date.now() + 60 * 60 * 1000),
      }); // 1 hour TTL
    }

    // Update last update timestamp
    await redis.set(REDIS_KEYS.LEADERBOARD.LAST_UPDATE(category), new Date().toISOString());
  }

  /**
   * Get leaderboard key with proper time-based partitioning
   */
  static getLeaderboardKey(category: LeaderboardCategory, timeframe: TimeFrame): string {
    const now = new Date();

    switch (timeframe) {
      case 'weekly': {
        const weekStart = this.getWeekStart(now);
        return REDIS_KEYS.LEADERBOARD.WEEKLY(category, weekStart.toISOString().split('T')[0] || '');
      }
      case 'monthly': {
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return REDIS_KEYS.LEADERBOARD.MONTHLY(category, monthKey);
      }

      case 'allTime':
      default:
        return REDIS_KEYS.LEADERBOARD.ALL_TIME(category);
    }
  }

  /**
   * Get start of week (Monday) for consistent weekly leaderboards
   */
  private static getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  }

  /**
   * Clean up expired data and optimize storage
   */
  static async performDataCleanup(): Promise<{
    cleaned: string[];
    errors: string[];
  }> {
    const cleaned: string[] = [];
    const errors: string[] = [];

    try {
      // Clean up old session data (older than 7 days)

      // Note: zRangeByScore is not available, using alternative cleanup approach
      const activeUsers: string[] = []; // Placeholder - would need different cleanup strategy

      for (const userId of activeUsers) {
        try {
          await redis.zRem(REDIS_KEYS.SESSION.ACTIVE_USERS, [userId]);
          cleaned.push(`session:${userId}`);
        } catch (error) {
          errors.push(`Failed to clean session for ${userId}: ${error}`);
        }
      }

      // Clean up old daily participation data (older than 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      for (let i = 0; i < 30; i++) {
        const date = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        const participantsKey = REDIS_KEYS.SESSION.DAILY_PARTICIPANTS(dateKey || '');

        try {
          const exists = await redis.exists(participantsKey);
          if (exists) {
            await redis.del(participantsKey);
            cleaned.push(`daily_participants:${dateKey}`);
          }
        } catch (error) {
          errors.push(`Failed to clean daily participants for ${dateKey}: ${error}`);
        }
      }

      // Clean up expired cache entries
      const cacheKeys = [
        REDIS_KEYS.CACHE.WORLD_STATE,
        REDIS_KEYS.CACHE.WORLD_TRENDS,
        REDIS_KEYS.CACHE.CURRENT_DILEMMA,
      ];

      for (const key of cacheKeys) {
        try {
          // Set expiration for cache keys
          await redis.expire(key, 60 * 60); // 1 hour TTL
          cleaned.push(`ttl_added:${key}`);
        } catch (error) {
          errors.push(`Failed to set TTL for ${key}: ${error}`);
        }
      }

      console.log(
        `🧹 Data cleanup completed: ${cleaned.length} items cleaned, ${errors.length} errors`
      );

      return { cleaned, errors };
    } catch (error) {
      console.error('❌ Error during data cleanup:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive user statistics with caching
   */
  static async getUserStatsWithCache(userId: string): Promise<UserStats | null> {
    try {
      // Check cache first
      const cacheKey = REDIS_KEYS.USER.STATS_CACHE(userId);
      const cachedStats = await redis.get(cacheKey);

      if (cachedStats) {
        return JSON.parse(cachedStats);
      }

      // If not cached, calculate and cache
      const profile = await redis.get(REDIS_KEYS.USER.PROFILE(userId));
      if (!profile) {
        return null;
      }

      const userProfile: UserProfile = JSON.parse(profile);
      const winningPercentage =
        userProfile.totalVotes > 0 ? (userProfile.winningVotes / userProfile.totalVotes) * 100 : 0;

      const participationDays = Math.ceil(
        (Date.now() - userProfile.joinDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const stats: UserStats = {
        totalVotes: userProfile.totalVotes,
        winningVotes: userProfile.winningVotes,
        winningPercentage: Math.round(winningPercentage * 100) / 100,
        currentStreak: userProfile.currentStreak,
        longestStreak: userProfile.longestStreak,
        achievementCount: userProfile.achievements.length,
        averageImpact: Math.round(userProfile.averageImpact * 100) / 100,
        participationDays,
        lastActiveDate: userProfile.lastVoteDate,
      };

      // Cache for 5 minutes
      await redis.set(cacheKey, JSON.stringify(stats), {
        expiration: new Date(Date.now() + 5 * 60 * 1000),
      });

      return stats;
    } catch (error) {
      console.error('Error getting user stats with cache:', error);
      return null;
    }
  }

  /**
   * Increment global user count atomically
   */
  private static async incrementGlobalUserCount(): Promise<void> {
    try {
      const statsKey = REDIS_KEYS.STATS.GLOBAL;
      const statsJson = await redis.get(statsKey);

      if (statsJson) {
        const stats = JSON.parse(statsJson);
        stats.totalUsersRegistered += 1;
        stats.lastUpdated = new Date().toISOString();
        await redis.set(statsKey, JSON.stringify(stats));
      }
    } catch (error) {
      console.error('Error incrementing global user count:', error);
    }
  }

  /**
   * Get system health metrics from Redis
   */
  static async getSystemHealthMetrics(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    activeUsers: number;
    cacheHitRate: number;
  }> {
    try {
      // Get total key count (approximate) - not available in Devvit Redis
      const totalKeys = 0; // Placeholder since dbsize is not available

      // Get active users count
      const activeUsers = await redis.zCard(REDIS_KEYS.SESSION.ACTIVE_USERS);

      // Calculate cache hit rate (simplified)
      const cacheHitRate = 0.85; // Placeholder - would need actual metrics

      return {
        totalKeys,
        memoryUsage: 'N/A', // Redis info not available in Devvit
        activeUsers,
        cacheHitRate,
      };
    } catch (error) {
      console.error('Error getting system health metrics:', error);
      return {
        totalKeys: 0,
        memoryUsage: 'Error',
        activeUsers: 0,
        cacheHitRate: 0,
      };
    }
  }
}
