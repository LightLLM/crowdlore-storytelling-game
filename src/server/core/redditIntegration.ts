/**
 * Reddit Integration service for handling Reddit-specific functionality
 * including comment parsing, vote collection, and user authentication
 */

import { reddit, context } from '@devvit/web/server';
import { VoteProcessor } from './voteProcessor.js';
import type {
  VoteValidation,
  DilemmaData,
  RedditVoteSource,
  RedditCommentVote,
} from '../../shared/types/index.js';

/**
 * Reddit Integration service class
 */
export class RedditIntegration {
  /**
   * Parse Reddit comments for votes on a dilemma
   */
  static async parseCommentsForVotes(
    postId: string,
    dilemma: DilemmaData
  ): Promise<RedditCommentVote[]> {
    try {
      console.log(`🔍 Parsing comments for votes on post: ${postId}`);

      // Get all comments from the post
      const comments = await reddit.getComments({
        postId: postId as `t3_${string}`,
        limit: 1000, // Get up to 1000 comments
        sort: 'new',
      });

      const votes: RedditCommentVote[] = [];
      const validOptionIds = dilemma.options.map((opt) => opt.id);

      for (const comment of comments.children) {
        // Skip deleted or removed comments
        if (!comment.body || comment.body === '[deleted]' || comment.body === '[removed]') {
          continue;
        }

        // Parse comment for vote indicators
        const voteChoice = this.parseCommentForVote(comment.body, validOptionIds);

        if (voteChoice) {
          const redditVote: RedditCommentVote = {
            commentId: comment.id,
            userId: comment.authorId || 'anonymous',
            username: comment.authorId || 'anonymous',
            optionId: voteChoice,
            commentBody: comment.body,
            timestamp: new Date(comment.createdAt),
            postId,
            dilemmaId: dilemma.id,
          };

          votes.push(redditVote);
        }
      }

      console.log(`📊 Found ${votes.length} valid votes in comments`);
      return votes;
    } catch (error) {
      console.error('❌ Error parsing comments for votes:', error);
      return [];
    }
  }

  /**
   * Parse a comment body to extract vote choice
   */
  static parseCommentForVote(commentBody: string, validOptionIds: string[]): string | null {
    const normalizedComment = commentBody.toLowerCase().trim();

    // Look for explicit option IDs (option-a, option-b, option-c)
    for (const optionId of validOptionIds) {
      if (normalizedComment.includes(optionId.toLowerCase())) {
        return optionId;
      }
    }

    // Look for common vote patterns
    const votePatterns = [
      // Letter choices
      { pattern: /^a\b|^option\s*a\b|^choice\s*a\b/i, optionIndex: 0 },
      { pattern: /^b\b|^option\s*b\b|^choice\s*b\b/i, optionIndex: 1 },
      { pattern: /^c\b|^option\s*c\b|^choice\s*c\b/i, optionIndex: 2 },

      // Number choices
      { pattern: /^1\b|^option\s*1\b|^choice\s*1\b/i, optionIndex: 0 },
      { pattern: /^2\b|^option\s*2\b|^choice\s*2\b/i, optionIndex: 1 },
      { pattern: /^3\b|^option\s*3\b|^choice\s*3\b/i, optionIndex: 2 },

      // Word choices
      { pattern: /^first\b|^top\b/i, optionIndex: 0 },
      { pattern: /^second\b|^middle\b/i, optionIndex: 1 },
      { pattern: /^third\b|^last\b|^bottom\b/i, optionIndex: 2 },
    ];

    for (const { pattern, optionIndex } of votePatterns) {
      if (pattern.test(normalizedComment) && optionIndex < validOptionIds.length) {
        return validOptionIds[optionIndex] || null;
      }
    }

    return null;
  }

  /**
   * Collect and process votes from Reddit comments
   */
  static async collectVotesFromReddit(
    postId: string,
    dilemma: DilemmaData
  ): Promise<{ processed: number; duplicates: number; invalid: number }> {
    try {
      console.log(`🗳️ Collecting votes from Reddit post: ${postId}`);

      // Parse comments for votes
      const commentVotes = await this.parseCommentsForVotes(postId, dilemma);

      let processed = 0;
      let duplicates = 0;
      let invalid = 0;

      // Process each vote
      for (const commentVote of commentVotes) {
        try {
          // Submit vote through VoteProcessor
          const validation = await VoteProcessor.submitVote(
            commentVote.dilemmaId,
            commentVote.optionId,
            commentVote.userId,
            commentVote.username,
            'reddit_comment',
            context
          );

          if (validation.isValid) {
            processed++;
            console.log(`✅ Processed vote from ${commentVote.username}: ${commentVote.optionId}`);
          } else {
            if (validation.reason?.includes('already voted')) {
              duplicates++;
            } else {
              invalid++;
            }
            console.log(`⚠️ Vote rejected from ${commentVote.username}: ${validation.reason}`);
          }
        } catch (error) {
          invalid++;
          console.error(`❌ Error processing vote from ${commentVote.username}:`, error);
        }
      }

      console.log(
        `📊 Vote collection complete: ${processed} processed, ${duplicates} duplicates, ${invalid} invalid`
      );
      return { processed, duplicates, invalid };
    } catch (error) {
      console.error('❌ Error collecting votes from Reddit:', error);
      return { processed: 0, duplicates: 0, invalid: 0 };
    }
  }

  /**
   * Get current Reddit user context
   */
  static async getCurrentUser(): Promise<{ userId: string; username: string } | null> {
    try {
      const username = await reddit.getCurrentUsername();
      if (!username) {
        return null;
      }

      // For Reddit integration, we'll use username as userId for consistency
      return {
        userId: username,
        username: username,
      };
    } catch (error) {
      console.error('❌ Error getting current user:', error);
      return null;
    }
  }

  /**
   * Validate Reddit user authentication
   */
  static async validateUserAuthentication(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      return user !== null;
    } catch (error) {
      console.error('❌ Error validating user authentication:', error);
      return false;
    }
  }

  /**
   * Submit a vote from Reddit interface with user authentication
   */
  static async submitAuthenticatedVote(
    dilemmaId: string,
    optionId: string,
    source: RedditVoteSource = 'web_interface'
  ): Promise<VoteValidation> {
    try {
      // Get authenticated user
      const user = await this.getCurrentUser();
      if (!user) {
        return {
          isValid: false,
          reason: 'User authentication required',
        };
      }

      // Submit vote through VoteProcessor
      return await VoteProcessor.submitVote(
        dilemmaId,
        optionId,
        user.userId,
        user.username,
        source,
        context
      );
    } catch (error) {
      console.error('❌ Error submitting authenticated vote:', error);
      return {
        isValid: false,
        reason: 'Failed to submit vote due to internal error',
      };
    }
  }

  /**
   * Check if current user has voted on a dilemma
   */
  static async hasCurrentUserVoted(dilemmaId: string): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      if (!user) {
        return false;
      }

      return await VoteProcessor.hasUserVoted(user.userId, dilemmaId);
    } catch (error) {
      console.error('❌ Error checking user vote status:', error);
      return false;
    }
  }

  /**
   * Get vote deduplication key for a user
   */
  static getUserVoteKey(userId: string, dilemmaId: string): string {
    return `${userId}:${dilemmaId}`;
  }

  /**
   * Validate vote submission to prevent duplicates and ensure data integrity
   */
  static async validateVoteSubmission(
    dilemmaId: string,
    optionId: string,
    userId: string
  ): Promise<{ isValid: boolean; reason?: string }> {
    try {
      // Use VoteProcessor's validation logic
      return await VoteProcessor.validateVote(dilemmaId, optionId, userId);
    } catch (error) {
      console.error('❌ Error validating vote submission:', error);
      return {
        isValid: false,
        reason: 'Failed to validate vote submission',
      };
    }
  }

  /**
   * Get subreddit context for post creation
   */
  static getSubredditContext(): { subredditName: string | null } {
    return {
      subredditName: context.subredditName || null,
    };
  }

  /**
   * Create a comment on a post (for bot responses or announcements)
   */
  static async createComment(postId: string, text: string): Promise<string | null> {
    try {
      console.log(`💬 Creating comment on post: ${postId}`);

      const comment = await reddit.submitComment({
        id: postId as `t3_${string}`,
        text: text,
      });

      console.log(`✅ Comment created: ${comment.id}`);
      return comment.id;
    } catch (error) {
      console.error('❌ Error creating comment:', error);
      return null;
    }
  }

  /**
   * Post voting results as a comment
   */
  static async postVotingResults(
    postId: string,
    voteResult: import('../../shared/types/index.js').VoteResult,
    asciiScene?: import('../../shared/types/index.js').ASCIIScene
  ): Promise<string | null> {
    try {
      const { winningOption, voteData, summary } = voteResult;
      const totalVotes = voteData.totalVotes;

      let resultText = `🏆 **VOTING RESULTS**\n\n`;
      resultText += `${summary}\n\n`;
      resultText += `📊 **Vote Breakdown:**\n`;

      // Show vote counts for all options
      const sortedOptions = Object.entries(voteData.optionVotes).sort(
        ([, a], [, b]) => (b || 0) - (a || 0)
      );

      for (const [optionId, votes] of sortedOptions) {
        const percentage = totalVotes > 0 ? Math.round(((votes || 0) / totalVotes) * 100) : 0;
        const isWinner = optionId === winningOption.id;
        const emoji = isWinner ? '🏆' : '📊';
        resultText += `${emoji} Option ${optionId.split('-')[1]?.toUpperCase()}: ${votes || 0} votes (${percentage}%)\n`;
      }

      resultText += `\n**Total Votes:** ${totalVotes}\n`;

      // Add ASCII scene if provided
      if (asciiScene) {
        resultText += `\n🎨 **Scene:**\n\`\`\`\n${asciiScene.lines.join('\n')}\n\`\`\`\n`;
        if (asciiScene.caption) {
          resultText += `*${asciiScene.caption}*\n`;
        }
      }

      resultText += `\n*The world continues to evolve based on your collective choices...*`;

      return await this.createComment(postId, resultText);
    } catch (error) {
      console.error('❌ Error posting voting results:', error);
      return null;
    }
  }
}
