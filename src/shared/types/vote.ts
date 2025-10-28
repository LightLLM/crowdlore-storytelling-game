/**
 * Voting and outcome types for CrowdLore storytelling game
 */

import type { DilemmaOption } from './dilemma.js';
import type { WorldAttributeEffects } from './world.js';

// Individual vote from a Reddit user
export type Vote = {
  id: string;
  dilemmaId: string;
  optionId: string;
  userId: string;
  username: string;
  timestamp: Date;
  source: 'reddit_comment' | 'reddit_vote' | 'web_interface';
};

// Aggregated vote data for a dilemma
export type VoteData = {
  dilemmaId: string;
  optionVotes: Record<string, number>; // optionId -> vote count
  totalVotes: number;
  uniqueVoters: number;
  votingStarted: Date;
  votingEnded?: Date;
};

// Result of vote processing
export type VoteResult = {
  dilemmaId: string;
  winningOption: DilemmaOption;
  voteData: VoteData;
  summary: string; // "The people chose to..." narrative
  attributeChanges: WorldAttributeEffects;
  participationRate: number; // 0-1, how many eligible users voted
};

// Vote processing status
export type VoteProcessingStatus = {
  dilemmaId: string;
  status: 'collecting' | 'processing' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  error?: string;
};

// Vote validation result
export type VoteValidation = {
  isValid: boolean;
  reason?: string;
  vote?: Vote;
};

// Reddit-specific vote sources
export type RedditVoteSource = 'reddit_comment' | 'reddit_vote' | 'web_interface';

// Vote parsed from Reddit comment
export type RedditCommentVote = {
  commentId: string;
  userId: string;
  username: string;
  optionId: string;
  commentBody: string;
  timestamp: Date;
  postId: string;
  dilemmaId: string;
};
