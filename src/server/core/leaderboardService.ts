/**
 * LeaderboardService - Manages user rankings and leaderboards
 */

import { redis } from '@devvit/web/server';
import type { Context } from '@devvit/web/server';
import type {
  LeaderboardCategory,
  TimeFrame,
  LeaderboardEntry,
  LeaderboardData,
  UserRankInfo,
  LeaderboardUpdate,
  UserProfile,
  UserStats,
} from '../../shared/types/index.js';

export class LeaderboardService {
  constructor(_context: Context) {}

  /**
   * Get leaderboard for a specific category and timeframe
   */
  async getLeaderboard(
    category: LeaderboardCategory,
    timeframe: TimeFrame,
    limit: number = 50,
    currentUserId?: string
  ): Promise<LeaderboardData> {
    try {
      const leaderboardKey = this.getLeaderboardKey(category, timeframe);

      // Get sorted leaderboard entries
      const entries = await this.getSortedEntries(leaderboardKey, category, limit);

      // Get total user count
      const totalUsers = await this.getTotalUserCount(category, timeframe);

      // Find current user's rank if provided
      let userRank: number | undefined;
      if (currentUserId) {
        userRank = await this.getUserRank(currentUserId, category, timeframe);
      }

      const leaderboardData: LeaderboardData = {
        category,
        timeframe,
        entries,
        totalUsers,
        lastUpdated: new Date(),
        userRank: userRank ?? 0,
      };

      return leaderboardData;
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      throw error;
    }
  }

  /**
   * Get user's rank in a specific category
   */
  async getUserRank(
    userId: string,
    category: LeaderboardCategory,
    timeframe: TimeFrame = 'allTime'
  ): Promise<number> {
    try {
      const leaderboardKey = this.getLeaderboardKey(category, timeframe);
      const rank = await redis.zRank(leaderboardKey, userId);

      // Redis returns null if user not found, rank is 0-based so add 1
      return rank !== null && rank !== undefined ? rank + 1 : -1;
    } catch (error) {
      console.error('Error getting user rank:', error);
      return -1;
    }
  }

  /**
   * Get detailed rank information for a user
   */
  async getUserRankInfo(
    userId: string,
    category: LeaderboardCategory,
    timeframe: TimeFrame = 'allTime'
  ): Promise<UserRankInfo | null> {
    try {
      const leaderboardKey = this.getLeaderboardKey(category, timeframe);

      // Get user's rank and score
      const rank = await redis.zRank(leaderboardKey, userId);
      const score = await redis.zScore(leaderboardKey, userId);

      if (rank === null || score === null) {
        return null;
      }

      // Get total users and calculate percentile
      const totalUsers = await redis.zCard(leaderboardKey);
      const percentile =
        totalUsers > 0 && rank !== undefined ? ((totalUsers - rank) / totalUsers) * 100 : 0;

      // Get previous rank for change calculation
      const previousRankKey = this.getPreviousRankKey(category, timeframe);
      const previousRank = await redis.zScore(previousRankKey, userId);
      const change =
        previousRank !== null && previousRank !== undefined && rank !== undefined
          ? previousRank - (rank + 1)
          : 0;

      const rankInfo: UserRankInfo = {
        category,
        rank: rank !== undefined ? rank + 1 : 0, // Convert to 1-based ranking
        score: parseFloat(score?.toString() || '0'),
        percentile: Math.round(percentile * 100) / 100,
        change: Math.round(change),
        totalUsers,
      };

      return rankInfo;
    } catch (error) {
      console.error('Error getting user rank info:', error);
      return null;
    }
  }

  /**
   * Update user's score in leaderboards
   */
  async updateUserStats(userId: string, stats: Partial<UserStats>): Promise<void> {
    try {
      const updates: LeaderboardUpdate[] = [];
      const timestamp = new Date();

      // Create updates for each relevant category
      if (stats.totalVotes !== undefined) {
        updates.push({
          userId,
          category: 'totalVotes',
          score: stats.totalVotes,
          timestamp,
        });
      }

      if (stats.winningPercentage !== undefined) {
        updates.push({
          userId,
          category: 'winningPercentage',
          score: stats.winningPercentage,
          timestamp,
        });
      }

      if (stats.currentStreak !== undefined) {
        updates.push({
          userId,
          category: 'currentStreak',
          score: stats.currentStreak,
          timestamp,
        });
      }

      if (stats.longestStreak !== undefined) {
        updates.push({
          userId,
          category: 'longestStreak',
          score: stats.longestStreak,
          timestamp,
        });
      }

      if (stats.achievementCount !== undefined) {
        updates.push({
          userId,
          category: 'achievements',
          score: stats.achievementCount,
          timestamp,
        });
      }

      if (stats.averageImpact !== undefined) {
        updates.push({
          userId,
          category: 'averageImpact',
          score: stats.averageImpact,
          timestamp,
        });
      }

      // Apply all updates
      await Promise.all(updates.map((update) => this.applyLeaderboardUpdate(update)));
    } catch (error) {
      console.error('Error updating user stats in leaderboards:', error);
      throw error;
    }
  }

  /**
   * Apply a leaderboard update
   */
  private async applyLeaderboardUpdate(update: LeaderboardUpdate): Promise<void> {
    try {
      // Update all-time leaderboard
      const allTimeKey = this.getLeaderboardKey(update.category, 'allTime');
      await redis.zAdd(allTimeKey, { member: update.userId, score: update.score });

      // Update monthly leaderboard
      const monthlyKey = this.getLeaderboardKey(update.category, 'monthly');
      await redis.zAdd(monthlyKey, { member: update.userId, score: update.score });

      // Update weekly leaderboard
      const weeklyKey = this.getLeaderboardKey(update.category, 'weekly');
      await redis.zAdd(weeklyKey, { member: update.userId, score: update.score });

      // Store update timestamp
      const timestampKey = `leaderboard:${update.category}:last_update`;
      await redis.set(timestampKey, update.timestamp.toISOString());
    } catch (error) {
      console.error('Error applying leaderboard update:', error);
      throw error;
    }
  }

  /**
   * Get sorted leaderboard entries
   */
  private async getSortedEntries(
    leaderboardKey: string,
    category: LeaderboardCategory,
    limit: number
  ): Promise<LeaderboardEntry[]> {
    try {
      // Get top users with scores (Redis returns in descending order)
      const results = await redis.zRange(leaderboardKey, 0, limit - 1, {
        reverse: true,
        by: 'rank',
      });

      const entries: LeaderboardEntry[] = [];

      // Process results (Redis returns array of {member, score} objects)
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result) continue;

        const userId = result.member;
        const score = result.score;

        if (userId) {
          // Get username from user profile
          const username = await this.getUsernameFromProfile(userId);

          // Calculate rank change (simplified - would need historical data)
          const change = 0; // TODO: Implement rank change calculation

          // Assign badges for top performers
          const badge = this.getBadgeForRank(i + 1, category);

          entries.push({
            rank: i + 1,
            userId,
            username: username || userId,
            score: this.formatScore(score, category),
            change,
            badge: badge || '',
          });
        }
      }

      return entries;
    } catch (error) {
      console.error('Error getting sorted entries:', error);
      return [];
    }
  }

  /**
   * Get username from user profile
   */
  private async getUsernameFromProfile(userId: string): Promise<string | null> {
    try {
      const profileData = await redis.get(`user:${userId}:profile`);
      if (profileData) {
        const profile = JSON.parse(profileData) as UserProfile;
        return profile.username;
      }
      return null;
    } catch (error) {
      console.error('Error getting username from profile:', error);
      return null;
    }
  }

  /**
   * Get total user count for a category
   */
  private async getTotalUserCount(
    category: LeaderboardCategory,
    timeframe: TimeFrame
  ): Promise<number> {
    try {
      const leaderboardKey = this.getLeaderboardKey(category, timeframe);
      return await redis.zCard(leaderboardKey);
    } catch (error) {
      console.error('Error getting total user count:', error);
      return 0;
    }
  }

  /**
   * Format score based on category
   */
  private formatScore(score: number, category: LeaderboardCategory): number {
    switch (category) {
      case 'winningPercentage':
        return Math.round(score * 100) / 100; // Round to 2 decimal places
      case 'averageImpact':
        return Math.round(score * 100) / 100; // Round to 2 decimal places
      default:
        return Math.round(score); // Integer for counts and streaks
    }
  }

  /**
   * Get badge for rank position
   */
  private getBadgeForRank(rank: number, _category: LeaderboardCategory): string | undefined {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    if (rank <= 10) return '🏆';
    if (rank <= 25) return '⭐';
    return undefined;
  }

  /**
   * Get Redis key for leaderboard
   */
  private getLeaderboardKey(category: LeaderboardCategory, timeframe: TimeFrame): string {
    const now = new Date();

    switch (timeframe) {
      case 'weekly': {
        const weekStart = this.getWeekStart(now);
        return `leaderboard:${category}:weekly:${weekStart.toISOString().split('T')[0]}`;
      }
      case 'monthly': {
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return `leaderboard:${category}:monthly:${monthKey}`;
      }
      case 'allTime':
      default:
        return `leaderboard:${category}:alltime`;
    }
  }

  /**
   * Get previous rank key for change calculation
   */
  private getPreviousRankKey(category: LeaderboardCategory, timeframe: TimeFrame): string {
    const now = new Date();

    switch (timeframe) {
      case 'weekly': {
        const prevWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const prevWeekStart = this.getWeekStart(prevWeek);
        return `leaderboard:${category}:weekly:${prevWeekStart.toISOString().split('T')[0]}:prev`;
      }
      case 'monthly': {
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
        return `leaderboard:${category}:monthly:${prevMonthKey}:prev`;
      }
      case 'allTime':
      default:
        return `leaderboard:${category}:alltime:prev`;
    }
  }

  /**
   * Get start of week (Monday)
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  }

  /**
   * Reset seasonal leaderboards (monthly/weekly)
   */
  async resetSeasonalLeaderboards(): Promise<void> {
    try {
      const categories: LeaderboardCategory[] = [
        'totalVotes',
        'winningPercentage',
        'currentStreak',
        'longestStreak',
        'achievements',
        'averageImpact',
      ];

      const now = new Date();

      // Reset monthly leaderboards on first day of month
      if (now.getDate() === 1) {
        for (const category of categories) {
          const currentKey = this.getLeaderboardKey(category, 'monthly');
          const prevKey = this.getPreviousRankKey(category, 'monthly');

          // Copy current to previous for change tracking
          await this.copyLeaderboard(currentKey, prevKey);

          // Clear current monthly leaderboard
          await redis.del(currentKey);
        }
        console.log('Monthly leaderboards reset');
      }

      // Reset weekly leaderboards on Monday
      if (now.getDay() === 1) {
        for (const category of categories) {
          const currentKey = this.getLeaderboardKey(category, 'weekly');
          const prevKey = this.getPreviousRankKey(category, 'weekly');

          // Copy current to previous for change tracking
          await this.copyLeaderboard(currentKey, prevKey);

          // Clear current weekly leaderboard
          await redis.del(currentKey);
        }
        console.log('Weekly leaderboards reset');
      }
    } catch (error) {
      console.error('Error resetting seasonal leaderboards:', error);
      throw error;
    }
  }

  /**
   * Copy leaderboard data from one key to another
   */
  private async copyLeaderboard(sourceKey: string, destKey: string): Promise<void> {
    try {
      // Get all entries from source
      const entries = await redis.zRange(sourceKey, 0, -1, { reverse: true, by: 'rank' });

      if (entries.length > 0) {
        // Clear destination
        await redis.del(destKey);

        // Add all entries to destination
        const members = [];
        for (const entry of entries) {
          if (entry.member) {
            members.push({ member: entry.member, score: entry.score });
          }
        }

        if (members.length > 0) {
          await redis.zAdd(destKey, ...members);
        }
      }
    } catch (error) {
      console.error('Error copying leaderboard:', error);
    }
  }

  /**
   * Get leaderboard statistics
   */
  async getLeaderboardStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    topCategories: { category: LeaderboardCategory; userCount: number }[];
  }> {
    try {
      const categories: LeaderboardCategory[] = [
        'totalVotes',
        'winningPercentage',
        'currentStreak',
        'longestStreak',
        'achievements',
        'averageImpact',
      ];

      let totalUsers = 0;
      const topCategories: { category: LeaderboardCategory; userCount: number }[] = [];

      for (const category of categories) {
        const key = this.getLeaderboardKey(category, 'allTime');
        const userCount = await redis.zCard(key);
        totalUsers = Math.max(totalUsers, userCount);
        topCategories.push({ category, userCount });
      }

      // Sort by user count
      topCategories.sort((a, b) => b.userCount - a.userCount);

      // Count active users (users who voted in last 7 days)

      const activeUsersKey = this.getLeaderboardKey('totalVotes', 'weekly');
      const activeUsers = await redis.zCard(activeUsersKey);

      return {
        totalUsers,
        activeUsers,
        topCategories,
      };
    } catch (error) {
      console.error('Error getting leaderboard stats:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        topCategories: [],
      };
    }
  }
}
