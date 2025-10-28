/**
 * VoteProcessor service for handling vote collection, tallying, and outcome determination
 */

import { redis } from '@devvit/web/server';
import type {
  Vote,
  VoteData,
  VoteResult,
  VoteProcessingStatus,
  VoteValidation,
  DilemmaData,
  DilemmaOption,
} from '../../shared/types/index.js';

import { REDIS_KEYS } from './redisDataModels.js';

/**
 * VoteProcessor service class for managing vote collection and processing
 */
export class VoteProcessor {
  /**
   * Submit a vote for a dilemma option
   */
  static async submitVote(
    dilemmaId: string,
    optionId: string,
    userId: string,
    username: string,
    source: Vote['source'] = 'web_interface',
    context?: import('@devvit/web/server').Context
  ): Promise<VoteValidation> {
    try {
      console.log(`🗳️ Processing vote: ${username} -> ${optionId} for dilemma ${dilemmaId}`);

      // Validate the vote
      const validation = await this.validateVote(dilemmaId, optionId, userId);
      if (!validation.isValid) {
        console.log(`❌ Vote validation failed: ${validation.reason}`);
        return validation;
      }

      // Create vote record
      const vote: Vote = {
        id: `vote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        dilemmaId,
        optionId,
        userId,
        username,
        timestamp: new Date(),
        source,
      };

      // Store individual vote
      await redis.hSet(REDIS_KEYS.DILEMMA.VOTES(dilemmaId), { [vote.id]: JSON.stringify(vote) });

      // Update vote tallies
      await this.updateVoteTallies(dilemmaId, optionId);

      // Track user's vote to prevent duplicates
      await redis.set(
        REDIS_KEYS.USER.LAST_VOTE(userId),
        JSON.stringify({
          dilemmaId,
          optionId,
          voteId: vote.id,
          timestamp: vote.timestamp,
        })
      );

      // Update user profile with vote
      if (context) {
        try {
          const { UserStatsService } = await import('./userStatsService.js');
          const userStatsService = new UserStatsService(context);
          await userStatsService.updateUserVote(userId, dilemmaId, optionId);
        } catch (error) {
          console.warn('Failed to update user profile for vote:', error);
          // Don't fail the vote if profile update fails
        }
      }

      console.log(`✅ Vote recorded successfully: ${vote.id}`);
      return {
        isValid: true,
        vote,
      };
    } catch (error) {
      console.error('❌ Error submitting vote:', error);
      return {
        isValid: false,
        reason: 'Failed to submit vote due to internal error',
      };
    }
  }

  /**
   * Validate a vote before submission
   */
  static async validateVote(
    dilemmaId: string,
    optionId: string,
    userId: string
  ): Promise<VoteValidation> {
    try {
      // Check if dilemma exists and is active
      const dilemmaJson = await redis.get(REDIS_KEYS.DILEMMA.CURRENT);
      if (!dilemmaJson) {
        return {
          isValid: false,
          reason: 'No active dilemma found',
        };
      }

      const dilemma: DilemmaData = JSON.parse(dilemmaJson);
      if (dilemma.id !== dilemmaId) {
        return {
          isValid: false,
          reason: 'Dilemma is not currently active',
        };
      }

      // Check if dilemma has expired
      if (new Date() > new Date(dilemma.expiresAt)) {
        return {
          isValid: false,
          reason: 'Voting period has ended',
        };
      }

      // Validate option exists
      const validOptionIds = dilemma.options.map((opt) => opt.id);
      if (!validOptionIds.includes(optionId)) {
        return {
          isValid: false,
          reason: 'Invalid option selected',
        };
      }

      // Check if user has already voted
      const existingVoteJson = await redis.get(REDIS_KEYS.USER.LAST_VOTE(userId));
      if (existingVoteJson) {
        const existingVote = JSON.parse(existingVoteJson);
        if (existingVote.dilemmaId === dilemmaId) {
          return {
            isValid: false,
            reason: 'User has already voted on this dilemma',
          };
        }
      }

      return { isValid: true };
    } catch (error) {
      console.error('❌ Error validating vote:', error);
      return {
        isValid: false,
        reason: 'Failed to validate vote',
      };
    }
  }

  /**
   * Update vote tallies for a dilemma
   */
  static async updateVoteTallies(dilemmaId: string, optionId: string): Promise<void> {
    try {
      // Get current vote data or initialize
      const voteDataJson = await redis.get(REDIS_KEYS.DILEMMA.VOTE_DATA(dilemmaId));
      let voteData: VoteData;

      if (voteDataJson) {
        voteData = JSON.parse(voteDataJson);
      } else {
        voteData = {
          dilemmaId,
          optionVotes: {},
          totalVotes: 0,
          uniqueVoters: 0,
          votingStarted: new Date(),
        };
      }

      // Update vote counts
      voteData.optionVotes[optionId] = (voteData.optionVotes[optionId] || 0) + 1;
      voteData.totalVotes += 1;
      voteData.uniqueVoters = Object.keys(voteData.optionVotes).reduce(
        (sum, key) => sum + (voteData.optionVotes[key] || 0),
        0
      );

      // Save updated vote data
      await redis.set(REDIS_KEYS.DILEMMA.VOTE_DATA(dilemmaId), JSON.stringify(voteData));
      console.log(
        `📊 Vote tallies updated for ${dilemmaId}: ${JSON.stringify(voteData.optionVotes)}`
      );
    } catch (error) {
      console.error('❌ Error updating vote tallies:', error);
      throw new Error('Failed to update vote tallies');
    }
  }

  /**
   * Get current vote data for a dilemma
   */
  static async getVoteData(dilemmaId: string): Promise<VoteData | null> {
    try {
      const voteDataJson = await redis.get(REDIS_KEYS.DILEMMA.VOTE_DATA(dilemmaId));
      return voteDataJson ? JSON.parse(voteDataJson) : null;
    } catch (error) {
      console.error('❌ Error getting vote data:', error);
      return null;
    }
  }

  /**
   * Process votes and determine the winning option
   */
  static async processVotes(
    dilemmaId: string,
    context?: import('@devvit/web/server').Context
  ): Promise<VoteResult> {
    try {
      console.log(`🏆 Processing votes for dilemma: ${dilemmaId}`);

      // Set processing status
      await this.setProcessingStatus(dilemmaId, 'processing');

      // Get dilemma data
      const dilemmaJson = await redis.get(REDIS_KEYS.DILEMMA.CURRENT);
      if (!dilemmaJson) {
        throw new Error('No active dilemma found');
      }

      const dilemma: DilemmaData = JSON.parse(dilemmaJson);
      if (dilemma.id !== dilemmaId) {
        throw new Error('Dilemma mismatch');
      }

      // Get vote data
      const voteData = await this.getVoteData(dilemmaId);
      if (!voteData) {
        throw new Error('No vote data found');
      }

      // Mark voting as ended
      voteData.votingEnded = new Date();

      // Determine winning option
      const winningOption = this.determineWinner(dilemma.options, voteData);

      // Generate community summary
      const summary = this.generateCommunitySummary(winningOption, voteData);

      // Calculate participation rate (mock for now - would need total eligible users)
      const participationRate = Math.min(voteData.totalVotes / 100, 1); // Assume 100 eligible users

      const result: VoteResult = {
        dilemmaId,
        winningOption,
        voteData,
        summary,
        attributeChanges: winningOption.attributeEffects,
        participationRate,
      };

      // Update user profiles with vote outcomes
      if (context) {
        try {
          await this.updateUserProfilesWithOutcomes(dilemmaId, winningOption, context);
        } catch (error) {
          console.warn('Failed to update user profiles with outcomes:', error);
          // Don't fail the vote processing if profile updates fail
        }
      }

      // Set processing status to completed
      await this.setProcessingStatus(dilemmaId, 'completed');

      console.log(`✅ Vote processing completed. Winner: ${winningOption.text}`);
      return result;
    } catch (error) {
      console.error('❌ Error processing votes:', error);
      await this.setProcessingStatus(
        dilemmaId,
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw new Error('Failed to process votes');
    }
  }

  /**
   * Determine the winning option based on vote counts
   */
  static determineWinner(
    options: [DilemmaOption, DilemmaOption, DilemmaOption],
    voteData: VoteData
  ): DilemmaOption {
    let winningOption = options[0];
    let maxVotes = 0;

    // Find option with most votes
    for (const option of options) {
      const votes = voteData.optionVotes[option.id] || 0;
      if (votes > maxVotes) {
        maxVotes = votes;
        winningOption = option;
      }
    }

    // Handle ties by selecting the first option with the highest vote count
    // In a real implementation, you might want more sophisticated tie-breaking
    console.log(`🏆 Winning option: "${winningOption.text}" with ${maxVotes} votes`);
    return winningOption;
  }

  /**
   * Generate community summary in the required format
   */
  static generateCommunitySummary(winningOption: DilemmaOption, voteData: VoteData): string {
    const totalVotes = voteData.totalVotes;
    const winningVotes = voteData.optionVotes[winningOption.id] || 0;
    const percentage = totalVotes > 0 ? Math.round((winningVotes / totalVotes) * 100) : 0;

    // Generate summary based on vote margin
    let summaryPrefix: string;
    if (percentage >= 70) {
      summaryPrefix = 'The people overwhelmingly chose to';
    } else if (percentage >= 60) {
      summaryPrefix = 'Reddit decided that the community should';
    } else if (percentage >= 50) {
      summaryPrefix = 'After much deliberation, the people chose to';
    } else {
      summaryPrefix = 'In a close decision, the community chose to';
    }

    // Clean up the option text to fit naturally in the sentence
    let actionText = winningOption.text.toLowerCase();

    // Remove leading articles if present
    actionText = actionText.replace(/^(to\s+|the\s+)/, '');

    const summary = `${summaryPrefix} ${actionText}. ${winningOption.description}`;

    console.log(`📝 Generated summary: ${summary}`);
    return summary;
  }

  /**
   * Set processing status for a dilemma
   */
  static async setProcessingStatus(
    dilemmaId: string,
    status: VoteProcessingStatus['status'],
    error?: string
  ): Promise<void> {
    try {
      const processingStatus: VoteProcessingStatus = {
        dilemmaId,
        status,
        startTime: new Date(),
        ...(status === 'completed' || status === 'failed' ? { endTime: new Date() } : {}),
        ...(error ? { error } : {}),
      };

      await redis.set(
        REDIS_KEYS.DILEMMA.PROCESSING_STATUS(dilemmaId),
        JSON.stringify(processingStatus)
      );
      console.log(`📊 Processing status updated: ${dilemmaId} -> ${status}`);
    } catch (error) {
      console.error('❌ Error setting processing status:', error);
    }
  }

  /**
   * Get processing status for a dilemma
   */
  static async getProcessingStatus(dilemmaId: string): Promise<VoteProcessingStatus | null> {
    try {
      const statusJson = await redis.get(REDIS_KEYS.DILEMMA.PROCESSING_STATUS(dilemmaId));
      return statusJson ? JSON.parse(statusJson) : null;
    } catch (error) {
      console.error('❌ Error getting processing status:', error);
      return null;
    }
  }

  /**
   * Get all votes for a dilemma (for debugging/admin purposes)
   */
  static async getAllVotes(dilemmaId: string): Promise<Vote[]> {
    try {
      const votesData = await redis.hGetAll(REDIS_KEYS.DILEMMA.VOTES(dilemmaId));
      return Object.values(votesData).map((voteJson) => JSON.parse(voteJson));
    } catch (error) {
      console.error('❌ Error getting all votes:', error);
      return [];
    }
  }

  /**
   * Check if user has voted on a dilemma
   */
  static async hasUserVoted(userId: string, dilemmaId: string): Promise<boolean> {
    try {
      const userVoteJson = await redis.get(REDIS_KEYS.USER.LAST_VOTE(userId));
      if (!userVoteJson) return false;

      const userVote = JSON.parse(userVoteJson);
      return userVote.dilemmaId === dilemmaId;
    } catch (error) {
      console.error('❌ Error checking user vote status:', error);
      return false;
    }
  }

  /**
   * Get vote count for a specific dilemma
   */
  static async getVoteCount(dilemmaId: string): Promise<number> {
    try {
      const voteData = await this.getVoteData(dilemmaId);
      return voteData?.totalVotes || 0;
    } catch (error) {
      console.error('❌ Error getting vote count:', error);
      return 0;
    }
  }

  /**
   * Process multiple votes in batch (for Reddit comment processing)
   */
  static async processBatchVotes(
    votes: Array<{
      dilemmaId: string;
      optionId: string;
      userId: string;
      username: string;
      source: Vote['source'];
    }>,
    context?: import('@devvit/web/server').Context
  ): Promise<{ processed: number; duplicates: number; invalid: number }> {
    let processed = 0;
    let duplicates = 0;
    let invalid = 0;

    console.log(`🔄 Processing batch of ${votes.length} votes...`);

    for (const voteData of votes) {
      try {
        const validation = await this.submitVote(
          voteData.dilemmaId,
          voteData.optionId,
          voteData.userId,
          voteData.username,
          voteData.source,
          context
        );

        if (validation.isValid) {
          processed++;
        } else {
          if (validation.reason?.includes('already voted')) {
            duplicates++;
          } else {
            invalid++;
          }
        }
      } catch (error) {
        invalid++;
        console.error(`❌ Error processing vote from ${voteData.username}:`, error);
      }
    }

    console.log(
      `📊 Batch processing complete: ${processed} processed, ${duplicates} duplicates, ${invalid} invalid`
    );
    return { processed, duplicates, invalid };
  }

  /**
   * Get detailed vote breakdown for a dilemma
   */
  static async getVoteBreakdown(dilemmaId: string): Promise<{
    totalVotes: number;
    optionBreakdown: Array<{ optionId: string; votes: number; percentage: number }>;
    sources: Record<Vote['source'], number>;
  } | null> {
    try {
      const voteData = await this.getVoteData(dilemmaId);
      if (!voteData) return null;

      // Get all votes to analyze sources
      const allVotes = await this.getAllVotes(dilemmaId);
      const sources: Record<Vote['source'], number> = {
        reddit_comment: 0,
        reddit_vote: 0,
        web_interface: 0,
      };

      for (const vote of allVotes) {
        sources[vote.source] = (sources[vote.source] || 0) + 1;
      }

      // Calculate option breakdown
      const optionBreakdown = Object.entries(voteData.optionVotes).map(([optionId, votes]) => ({
        optionId,
        votes: votes || 0,
        percentage:
          voteData.totalVotes > 0 ? Math.round(((votes || 0) / voteData.totalVotes) * 100) : 0,
      }));

      return {
        totalVotes: voteData.totalVotes,
        optionBreakdown,
        sources,
      };
    } catch (error) {
      console.error('❌ Error getting vote breakdown:', error);
      return null;
    }
  }

  /**
   * Update user profiles with vote outcomes
   */
  static async updateUserProfilesWithOutcomes(
    dilemmaId: string,
    winningOption: DilemmaOption,
    context: import('@devvit/web/server').Context
  ): Promise<void> {
    try {
      const { UserStatsService } = await import('./userStatsService.js');
      const userStatsService = new UserStatsService(context);

      // Get all votes for this dilemma
      const votesData = await redis.hGetAll(REDIS_KEYS.DILEMMA.VOTES(dilemmaId));

      if (!votesData) {
        console.warn('No votes found for dilemma:', dilemmaId);
        return;
      }

      // Calculate attribute impact magnitude for the winning option
      // Calculate attribute impact for user stats
      Object.values(winningOption.attributeEffects).reduce(
        (sum, effect) => sum + Math.abs(effect || 0),
        0
      );

      // Get dilemma data to calculate individual user impacts
      const dilemmaJson = await redis.get(REDIS_KEYS.DILEMMA.CURRENT);
      const dilemma: DilemmaData = dilemmaJson ? JSON.parse(dilemmaJson) : null;

      // Process each vote with enhanced tracking
      const updatePromises = Object.values(votesData).map(async (voteJson) => {
        try {
          const vote: Vote = JSON.parse(voteJson);
          const wasWinner = vote.optionId === winningOption.id;

          // Calculate individual user's impact based on their chosen option
          let userImpact = 0;
          if (dilemma) {
            const userOption = dilemma.options.find((opt) => opt.id === vote.optionId);
            if (userOption) {
              userImpact = Object.values(userOption.attributeEffects).reduce(
                (sum, effect) => sum + Math.abs(effect || 0),
                0
              );
            }
          }

          // Enhanced outcome processing with streak tracking and achievement checking
          await userStatsService.processVoteOutcome(
            vote.userId,
            dilemmaId,
            wasWinner,
            userImpact,
            vote.optionId
          );

          // Track user's voting pattern for streak analysis
          await this.trackUserVotingPattern(vote.userId, dilemmaId, wasWinner, context);
        } catch (error) {
          console.warn(`Failed to update profile for vote ${voteJson}:`, error);
        }
      });

      await Promise.allSettled(updatePromises);

      // Update global statistics after processing all votes
      await this.updateGlobalStatistics(dilemmaId, winningOption, Object.keys(votesData).length);

      console.log(`✅ Updated user profiles for ${Object.keys(votesData).length} votes`);
    } catch (error) {
      console.error('❌ Error updating user profiles with outcomes:', error);
      throw error;
    }
  }

  /**
   * Track user voting patterns for streak analysis and behavioral insights
   */
  private static async trackUserVotingPattern(
    userId: string,
    dilemmaId: string,
    wasWinner: boolean,
    _context: import('@devvit/web/server').Context
  ): Promise<void> {
    try {
      const patternKey = REDIS_KEYS.USER.VOTING_PATTERN(userId);
      const existingPattern = await redis.get(patternKey);

      let pattern: {
        recentVotes: { dilemmaId: string; wasWinner: boolean; timestamp: Date }[];
        streakData: { current: number; longest: number; lastWinDate?: Date };
        votingFrequency: { daily: number; weekly: number; monthly: number };
      } = {
        recentVotes: [],
        streakData: { current: 0, longest: 0 },
        votingFrequency: { daily: 0, weekly: 0, monthly: 0 },
      };

      if (existingPattern) {
        pattern = JSON.parse(existingPattern);
      }

      // Add current vote to pattern
      pattern.recentVotes.push({
        dilemmaId,
        wasWinner,
        timestamp: new Date(),
      });

      // Keep only last 30 votes for pattern analysis
      if (pattern.recentVotes.length > 30) {
        pattern.recentVotes = pattern.recentVotes.slice(-30);
      }

      // Update streak data
      if (wasWinner) {
        pattern.streakData.current += 1;
        pattern.streakData.longest = Math.max(
          pattern.streakData.longest,
          pattern.streakData.current
        );
        pattern.streakData.lastWinDate = new Date();
      } else {
        pattern.streakData.current = 0;
      }

      // Update voting frequency (simplified calculation)
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      pattern.votingFrequency.daily = pattern.recentVotes.filter(
        (v) => new Date(v.timestamp) > oneDayAgo
      ).length;
      pattern.votingFrequency.weekly = pattern.recentVotes.filter(
        (v) => new Date(v.timestamp) > oneWeekAgo
      ).length;
      pattern.votingFrequency.monthly = pattern.recentVotes.filter(
        (v) => new Date(v.timestamp) > oneMonthAgo
      ).length;

      await redis.set(patternKey, JSON.stringify(pattern), {
        expiration: new Date(Date.now() + 60 * 60 * 24 * 90 * 1000),
      }); // 90 days TTL
    } catch (error) {
      console.warn('Failed to track user voting pattern:', error);
    }
  }

  /**
   * Update global statistics after vote processing
   */
  private static async updateGlobalStatistics(
    _dilemmaId: string,
    winningOption: DilemmaOption,
    totalVotes: number
  ): Promise<void> {
    try {
      const statsKey = REDIS_KEYS.STATS.GLOBAL;
      const existingStats = await redis.get(statsKey);

      let stats = {
        totalDilemmasProcessed: 0,
        totalVotesCast: 0,
        averageParticipation: 0,
        popularOptions: {} as Record<string, number>,
        attributeChanges: {
          stability: 0,
          curiosity: 0,
          survival: 0,
          reputation: 0,
        },
      };

      if (existingStats) {
        stats = JSON.parse(existingStats);
      }

      // Update global statistics
      stats.totalDilemmasProcessed += 1;
      stats.totalVotesCast += totalVotes;
      stats.averageParticipation = stats.totalVotesCast / stats.totalDilemmasProcessed;

      // Track popular option patterns
      const optionKey = winningOption.text.substring(0, 50); // First 50 chars as key
      stats.popularOptions[optionKey] = (stats.popularOptions[optionKey] || 0) + 1;

      // Track cumulative attribute changes
      Object.entries(winningOption.attributeEffects).forEach(([attr, effect]) => {
        if (effect && attr in stats.attributeChanges) {
          stats.attributeChanges[attr as keyof typeof stats.attributeChanges] += effect;
        }
      });

      await redis.set(statsKey, JSON.stringify(stats));
    } catch (error) {
      console.warn('Failed to update global statistics:', error);
    }
  }
}
