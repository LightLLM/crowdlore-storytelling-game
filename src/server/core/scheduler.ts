/**
 * Scheduler service for automated CrowdLore tasks
 * Handles daily dilemma creation, vote collection, and result processing
 */

import { redis, context } from '@devvit/web/server';
import { createDailyDilemmaPost } from './post.js';
import { RedditIntegration } from './redditIntegration.js';
import { VoteProcessor } from './voteProcessor.js';
import { StoryEvolution } from './storyEvolution.js';
import type { DilemmaData } from '../../shared/types/index.js';

// Redis keys for scheduler state
const SCHEDULER_KEYS = {
  LAST_POST_CREATED: 'crowdlore:scheduler:last_post_created',
  LAST_VOTE_COLLECTION: 'crowdlore:scheduler:last_vote_collection',
  ACTIVE_POST_ID: 'crowdlore:scheduler:active_post_id',
  SCHEDULER_STATE: 'crowdlore:scheduler:state',
} as const;

export type SchedulerState = {
  lastPostCreated?: Date;
  lastVoteCollection?: Date;
  activePostId?: string | null;
  activeDilemmaId?: string | null;
  nextScheduledAction?: Date;
  status: 'idle' | 'creating_post' | 'collecting_votes' | 'processing_results';
};

/**
 * Scheduler service for automated CrowdLore operations
 */
export class Scheduler {
  /**
   * Get current scheduler state
   */
  static async getState(): Promise<SchedulerState> {
    try {
      const stateJson = await redis.get(SCHEDULER_KEYS.SCHEDULER_STATE);
      if (stateJson) {
        const state = JSON.parse(stateJson);
        // Convert date strings back to Date objects
        if (state.lastPostCreated) state.lastPostCreated = new Date(state.lastPostCreated);
        if (state.lastVoteCollection) state.lastVoteCollection = new Date(state.lastVoteCollection);
        if (state.nextScheduledAction)
          state.nextScheduledAction = new Date(state.nextScheduledAction);
        return state;
      }

      return { status: 'idle' };
    } catch (error) {
      console.error('❌ Error getting scheduler state:', error);
      return { status: 'idle' };
    }
  }

  /**
   * Update scheduler state
   */
  static async updateState(updates: Partial<SchedulerState>): Promise<void> {
    try {
      const currentState = await this.getState();
      const newState = { ...currentState, ...updates };
      await redis.set(SCHEDULER_KEYS.SCHEDULER_STATE, JSON.stringify(newState));
      console.log(`📅 Scheduler state updated: ${newState.status}`);
    } catch (error) {
      console.error('❌ Error updating scheduler state:', error);
    }
  }

  /**
   * Create daily dilemma post and set up for vote collection
   */
  static async createDailyPost(theme?: string): Promise<{ postId: string; dilemmaId: string }> {
    try {
      console.log('🗓️ Scheduler: Creating daily dilemma post...');

      await this.updateState({ status: 'creating_post' });

      // Create the post
      const result = await createDailyDilemmaPost(theme);

      // Update scheduler state
      await this.updateState({
        status: 'idle',
        lastPostCreated: new Date(),
        activePostId: result.post.id,
        activeDilemmaId: result.dilemma.id,
        nextScheduledAction: new Date(Date.now() + 23 * 60 * 60 * 1000), // 23 hours from now
      });

      console.log(`✅ Scheduler: Daily post created - ${result.post.id}`);
      return { postId: result.post.id, dilemmaId: result.dilemma.id };
    } catch (error) {
      console.error('❌ Scheduler: Error creating daily post:', error);
      await this.updateState({ status: 'idle' });
      throw error;
    }
  }

  /**
   * Collect votes from Reddit for the active post
   */
  static async collectVotesFromActivePost(): Promise<{
    processed: number;
    duplicates: number;
    invalid: number;
  }> {
    try {
      console.log('🗳️ Scheduler: Collecting votes from active post...');

      const state = await this.getState();
      if (!state.activePostId || !state.activeDilemmaId) {
        throw new Error('No active post to collect votes from');
      }

      await this.updateState({ status: 'collecting_votes' });

      // Get dilemma data
      const dilemmaJson = await redis.get('crowdlore:current_dilemma');
      if (!dilemmaJson) {
        throw new Error('No active dilemma found');
      }

      const dilemma: DilemmaData = JSON.parse(dilemmaJson);

      // Collect votes from Reddit
      const result = await RedditIntegration.collectVotesFromReddit(state.activePostId, dilemma);

      // Update scheduler state
      await this.updateState({
        status: 'idle',
        lastVoteCollection: new Date(),
      });

      console.log(`✅ Scheduler: Vote collection completed - ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      console.error('❌ Scheduler: Error collecting votes:', error);
      await this.updateState({ status: 'idle' });
      throw error;
    }
  }

  /**
   * Process votes and post results for the active dilemma
   */
  static async processVotesAndPostResults(): Promise<{ commentId: string | null }> {
    try {
      console.log('🏆 Scheduler: Processing votes and posting results...');

      const state = await this.getState();
      if (!state.activePostId || !state.activeDilemmaId) {
        throw new Error('No active post to process results for');
      }

      await this.updateState({ status: 'processing_results' });

      // Process votes
      const voteResult = await VoteProcessor.processVotes(state.activeDilemmaId, context);

      // Evolve story
      const storyOutcome = await StoryEvolution.evolveStory(voteResult);

      // Post results to Reddit
      const commentId = await RedditIntegration.postVotingResults(
        state.activePostId,
        voteResult,
        storyOutcome.asciiScene
      );

      // Clear active post since voting is complete
      await this.updateState({
        status: 'idle',
        activePostId: null,
        activeDilemmaId: null,
      });

      console.log(`✅ Scheduler: Results processed and posted - comment: ${commentId}`);
      return { commentId };
    } catch (error) {
      console.error('❌ Scheduler: Error processing results:', error);
      await this.updateState({ status: 'idle' });
      throw error;
    }
  }

  /**
   * Run complete daily cycle: collect votes, process results, create new post
   */
  static async runDailyCycle(newTheme?: string): Promise<{
    voteCollection: { processed: number; duplicates: number; invalid: number };
    resultsPosted: { commentId: string | null };
    newPost: { postId: string; dilemmaId: string };
  }> {
    try {
      console.log('🔄 Scheduler: Running complete daily cycle...');

      // Step 1: Collect votes from current post (if exists)
      let voteCollection = { processed: 0, duplicates: 0, invalid: 0 };
      let resultsPosted: { commentId: string | null } = { commentId: null };

      const state = await this.getState();
      if (state.activePostId && state.activeDilemmaId) {
        // Collect final votes
        voteCollection = await this.collectVotesFromActivePost();

        // Process and post results
        resultsPosted = await this.processVotesAndPostResults();
      }

      // Step 2: Create new post for next day
      const newPost = await this.createDailyPost(newTheme);

      console.log('✅ Scheduler: Daily cycle completed successfully');
      return { voteCollection, resultsPosted, newPost };
    } catch (error) {
      console.error('❌ Scheduler: Error in daily cycle:', error);
      throw error;
    }
  }

  /**
   * Check if it's time to run the daily cycle
   */
  static async shouldRunDailyCycle(): Promise<boolean> {
    try {
      const state = await this.getState();

      // If no post has been created yet, create one
      if (!state.lastPostCreated) {
        return true;
      }

      // Check if 24 hours have passed since last post
      const hoursSinceLastPost = (Date.now() - state.lastPostCreated.getTime()) / (1000 * 60 * 60);
      return hoursSinceLastPost >= 24;
    } catch (error) {
      console.error('❌ Error checking daily cycle timing:', error);
      return false;
    }
  }

  /**
   * Get time until next scheduled action
   */
  static async getTimeUntilNextAction(): Promise<number> {
    try {
      const state = await this.getState();

      if (state.nextScheduledAction) {
        return Math.max(0, state.nextScheduledAction.getTime() - Date.now());
      }

      // If no scheduled action, check based on last post
      if (state.lastPostCreated) {
        const nextActionTime = state.lastPostCreated.getTime() + 24 * 60 * 60 * 1000;
        return Math.max(0, nextActionTime - Date.now());
      }

      return 0; // Ready to run now
    } catch (error) {
      console.error('❌ Error calculating time until next action:', error);
      return 0;
    }
  }

  /**
   * Manual trigger for vote collection (admin use)
   */
  static async manualVoteCollection(
    postId: string,
    dilemmaId: string
  ): Promise<{ processed: number; duplicates: number; invalid: number }> {
    try {
      console.log(`🔧 Manual vote collection triggered for post: ${postId}`);

      // Get dilemma data
      const dilemmaJson = await redis.get('crowdlore:current_dilemma');
      if (!dilemmaJson) {
        throw new Error('No active dilemma found');
      }

      const dilemma: DilemmaData = JSON.parse(dilemmaJson);
      if (dilemma.id !== dilemmaId) {
        throw new Error('Dilemma ID mismatch');
      }

      // Collect votes
      const result = await RedditIntegration.collectVotesFromReddit(postId, dilemma);

      console.log(`✅ Manual vote collection completed: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      console.error('❌ Error in manual vote collection:', error);
      throw error;
    }
  }
}
