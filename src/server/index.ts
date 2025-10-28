import express from 'express';
import { InitResponse, IncrementResponse, DecrementResponse } from '../shared/types/api';
import { redis, reddit, createServer, context, getServerPort } from '@devvit/web/server';
import { createPost, createDailyDilemmaPost } from './core/post';
import { WorldStateService } from './core/worldState';
import { DilemmaGenerator } from './core/dilemmaGenerator';
import { VoteProcessor } from './core/voteProcessor';
import { StoryEvolution } from './core/storyEvolution';
import { ASCIIGenerator } from './core/ASCIIGenerator';
import { RedditIntegration } from './core/redditIntegration';
import { Scheduler } from './core/scheduler';
import { AutomationEngine } from './core/automationEngine';
import { TaskRunner } from './core/taskRunner';
import { MaintenanceService } from './core/maintenanceService';
import { CacheService } from './core/cacheService';
import { ASCIIPerformanceOptimizer } from './core/performanceOptimizer';
import type {
  CurrentDilemmaResponse,
  WorldStateResponse,
  VoteRequest,
  VoteResponse,
  APIResponse,
  GenerateDilemmaRequest,
  GenerateDilemmaResponse,
  ASCIISceneResponse,
  DilemmaData,
  ASCIIGenerationParams,
} from '../shared/types/index.js';

// Import middleware
import {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  requestTimeout,
} from './middleware/errorHandler.js';
import {
  validateBody,
  validateQuery,
  validateParams,
  commonSchemas,
} from './middleware/validation.js';
import { rateLimiters, extractUsername } from './middleware/rateLimiter.js';
import { RedisDataModels } from './core/redisDataModels.js';

const app = express();

// Global middleware
app.use(requestTimeout(30000)); // 30 second timeout
app.use(express.json({ limit: '1mb' })); // Limit JSON payload size
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.text({ limit: '1mb' }));

// Extract username for rate limiting (non-blocking)
app.use(extractUsername);

const router = express.Router();

// CrowdLore API Routes

/**
 * Get current active dilemma with caching
 */
router.get(
  '/api/current-dilemma',
  rateLimiters.general,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Use cached current dilemma for better performance
    const currentDilemma = await CacheService.getCachedCurrentDilemma();

    if (!currentDilemma) {
      const response: CurrentDilemmaResponse = {
        success: true,
        data: {
          dilemma: null,
          timeRemaining: 0,
          voteCount: 0,
          hasUserVoted: false,
        },
        timestamp: new Date(),
        requestId,
      };
      res.json(response);
      return;
    }

    // Check if user has voted using Reddit integration
    let hasUserVoted = false;
    try {
      hasUserVoted = await RedditIntegration.hasCurrentUserVoted(currentDilemma.id);
    } catch (error) {
      console.log('Could not check user vote status (user may not be authenticated)');
    }

    // Get current vote count (cached)
    const voteCount = await VoteProcessor.getVoteCount(currentDilemma.id);

    const response: CurrentDilemmaResponse = {
      success: true,
      data: {
        dilemma: currentDilemma,
        timeRemaining: Math.floor((currentDilemma.expiresAt.getTime() - Date.now()) / 1000),
        voteCount,
        hasUserVoted,
      },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Get current world state with caching
 */
router.get(
  '/api/world-state',
  rateLimiters.general,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Use cached world state for better performance
    const worldState = await CacheService.getCachedWorldState();
    const trends = await CacheService.getCachedWorldTrends();
    const recentOutcomes = await StoryEvolution.getRecentOutcomes(5);

    const response: WorldStateResponse = {
      success: true,
      data: {
        worldState,
        recentOutcomes,
        trends: Object.entries(trends).map(
          ([attribute, trend]: [string, { change: number; direction: string }]) => ({
            attribute: attribute as keyof typeof worldState.attributes,
            change: trend.change,
            direction: trend.direction as 'up' | 'down' | 'stable',
          })
        ),
      },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Submit a vote for a dilemma option
 */
router.post(
  '/api/vote',
  rateLimiters.voting,
  validateBody({
    dilemmaId: commonSchemas.dilemmaId,
    optionId: commonSchemas.optionId,
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const voteRequest = req.body as VoteRequest;

    // Submit vote using Reddit integration (handles authentication)
    const voteValidation = await RedditIntegration.submitAuthenticatedVote(
      voteRequest.dilemmaId,
      voteRequest.optionId,
      'web_interface'
    );

    if (!voteValidation.isValid) {
      const statusCode = voteValidation.reason?.includes('authentication') ? 401 : 400;
      const errorCode = voteValidation.reason?.includes('authentication')
        ? 'UNAUTHORIZED'
        : 'VALIDATION_ERROR';

      const response: APIResponse = {
        success: false,
        error: {
          code: errorCode,
          message: voteValidation.reason || 'Vote validation failed',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(statusCode).json(response);
      return;
    }

    // Get updated vote count and time remaining
    const voteCount = await VoteProcessor.getVoteCount(voteRequest.dilemmaId);

    // Calculate time remaining (mock for now - would get from dilemma expiry)
    const timeRemaining = 86400; // 24 hours in seconds

    const response: VoteResponse = {
      success: true,
      data: {
        vote: voteValidation.vote!,
        currentVoteCount: voteCount,
        timeRemaining,
      },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Generate a new dilemma (admin endpoint)
 */
router.post(
  '/api/generate-dilemma',
  rateLimiters.generation,
  validateBody({
    theme: commonSchemas.theme,
    forceGenerate: { type: 'boolean' },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const generateRequest = req.body as GenerateDilemmaRequest;

    console.log('🎲 Generating new dilemma...');

    // Generate dilemma using DilemmaGenerator service
    const generationResult = await DilemmaGenerator.generateDailyDilemma(generateRequest.theme);

    const response: GenerateDilemmaResponse = {
      success: true,
      data: {
        dilemma: generationResult.dilemma,
        balanceScore: generationResult.balanceScore,
        moderationPassed: generationResult.isApproved,
      },
      timestamp: new Date(),
      requestId,
    };

    console.log(`✅ Dilemma generated successfully - ID: ${generationResult.dilemma.id}`);
    res.json(response);
  })
);

/**
 * Process votes for a dilemma (admin endpoint)
 */
router.post(
  '/api/process-votes',
  rateLimiters.admin,
  validateBody({
    dilemmaId: commonSchemas.dilemmaId,
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { dilemmaId } = req.body;

    console.log(`🏆 Processing votes for dilemma: ${dilemmaId}`);

    // Process votes using VoteProcessor
    const voteResult = await VoteProcessor.processVotes(dilemmaId, context);

    // Evolve story based on vote result
    const storyOutcome = await StoryEvolution.evolveStory(voteResult);

    const response: import('../shared/types/api.js').ProcessVotesResponse = {
      success: true,
      data: {
        result: voteResult,
        outcome: storyOutcome,
        worldStateUpdated: true,
      },
      timestamp: new Date(),
      requestId,
    };

    console.log(`✅ Votes processed successfully for dilemma: ${dilemmaId}`);
    res.json(response);
  })
);

/**
 * Get vote results for a dilemma
 */
router.get(
  '/api/vote-results/:dilemmaId',
  rateLimiters.general,
  validateParams({
    dilemmaId: commonSchemas.dilemmaId,
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { dilemmaId } = req.params;

    if (!dilemmaId) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dilemma ID is required',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    // Get vote data
    const voteData = await VoteProcessor.getVoteData(dilemmaId);
    if (!voteData) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Vote data not found for this dilemma',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    // Get story outcome
    const recentOutcomes = await StoryEvolution.getRecentOutcomes(10);
    const storyOutcome = recentOutcomes.find((outcome) => outcome.dilemmaId === dilemmaId);

    if (!storyOutcome) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Story outcome not found for this dilemma',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    const response: import('../shared/types/api.js').VoteResultsResponse = {
      success: true,
      data: {
        result: storyOutcome.voteResult,
        storyOutcome,
        nextDilemmaAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Mock: 24 hours from now
      },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Generate ASCII scene for a dilemma outcome with caching and optimization
 */
router.get(
  '/api/ascii-scene/:dilemmaId',
  rateLimiters.general,
  validateParams({
    dilemmaId: commonSchemas.dilemmaId,
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { dilemmaId } = req.params;

    if (!dilemmaId) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dilemma ID is required',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    // Try cached ASCII scene first
    const cachedScene = await CacheService.getCachedASCIIScene(dilemmaId);

    if (cachedScene) {
      // Optimize scene for client device if specified
      const userAgent = req.get('User-Agent') || '';
      const targetDevice = userAgent.includes('Mobile')
        ? 'mobile'
        : userAgent.includes('Tablet')
          ? 'tablet'
          : 'desktop';

      const optimizedScene = ASCIIPerformanceOptimizer.optimizeSceneForDevice(
        cachedScene,
        targetDevice
      );

      const response: ASCIISceneResponse = {
        success: true,
        data: {
          scene: optimizedScene,
          context: `Optimized ASCII scene for ${targetDevice}`,
        },
        timestamp: new Date(),
        requestId,
      };
      res.json(response);
      return;
    }

    // Fallback to story outcome lookup
    const recentOutcomes = await StoryEvolution.getRecentOutcomes(20);
    const storyOutcome = recentOutcomes.find((outcome) => outcome.dilemmaId === dilemmaId);

    if (!storyOutcome) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Story outcome not found for this dilemma',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    const response: ASCIISceneResponse = {
      success: true,
      data: {
        scene: storyOutcome.asciiScene,
        context: storyOutcome.loreEntry.text,
      },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Generate custom ASCII scene with parameters
 */
router.post(
  '/api/generate-ascii',
  rateLimiters.generation,
  validateBody({
    theme: commonSchemas.asciiParams.theme,
    mood: commonSchemas.asciiParams.mood,
    complexity: commonSchemas.asciiParams.complexity,
    maxLines: commonSchemas.asciiParams.maxLines,
    maxWidth: commonSchemas.asciiParams.maxWidth,
    includeCaption: { type: 'boolean' },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const params = req.body as ASCIIGenerationParams;

    // Set defaults for optional parameters
    const generationParams: ASCIIGenerationParams = {
      theme: params.theme,
      mood: params.mood || 'neutral',
      complexity: params.complexity || 'moderate',
      maxLines: params.maxLines || 8,
      maxWidth: params.maxWidth || 24,
      includeCaption: params.includeCaption !== false, // Default to true
    };

    // Generate ASCII scene
    const scene = await ASCIIGenerator.generateSceneWithParams(generationParams);

    const response: ASCIISceneResponse = {
      success: true,
      data: {
        scene,
        context: `Generated ${params.theme} scene with ${params.mood} mood`,
      },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Get available ASCII themes
 */
router.get(
  '/api/ascii-themes',
  rateLimiters.general,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const themes = ASCIIGenerator.getAvailableThemes();
    const themeDetails = themes.map((theme) => ({
      name: theme,
      templateCount: ASCIIGenerator.getTemplateCount(theme),
    }));

    const response: APIResponse<{ themes: typeof themeDetails }> = {
      success: true,
      data: {
        themes: themeDetails,
      },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Collect votes from Reddit comments (admin endpoint)
 */
router.post(
  '/api/collect-reddit-votes',
  rateLimiters.admin,
  validateBody({
    postId: { required: true, type: 'string' },
    dilemmaId: commonSchemas.dilemmaId,
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { postId, dilemmaId } = req.body;

    console.log(`🗳️ Collecting Reddit votes for post: ${postId}, dilemma: ${dilemmaId}`);

    // Get dilemma data
    const dilemmaJson = await redis.get('crowdlore:current_dilemma');
    if (!dilemmaJson) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No active dilemma found',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    const dilemma: DilemmaData = JSON.parse(dilemmaJson);
    if (dilemma.id !== dilemmaId) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dilemma ID mismatch',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    // Collect votes from Reddit
    const collectionResult = await RedditIntegration.collectVotesFromReddit(postId, dilemma);

    const response: APIResponse<typeof collectionResult> = {
      success: true,
      data: collectionResult,
      timestamp: new Date(),
      requestId,
    };

    console.log(`✅ Reddit vote collection completed: ${JSON.stringify(collectionResult)}`);
    res.json(response);
  })
);

/**
 * Create daily dilemma post with Reddit integration
 */
router.post(
  '/api/create-daily-post',
  rateLimiters.admin,
  validateBody({
    theme: { type: 'string' },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { theme } = req.body;

    console.log(`📝 Creating daily dilemma post with theme: ${theme || 'random'}`);

    try {
      // Create daily post with dilemma
      const result = await createDailyDilemmaPost(theme);

      const response: APIResponse<{ postId: string; dilemmaId: string; postUrl: string }> = {
        success: true,
        data: {
          postId: result.post.id,
          dilemmaId: result.dilemma.id,
          postUrl: `https://reddit.com/r/${context.subredditName}/comments/${result.post.id}`,
        },
        timestamp: new Date(),
        requestId,
      };

      console.log(`✅ Daily post created successfully: ${result.post.id}`);
      res.json(response);
    } catch (error) {
      console.error('❌ Error creating daily post:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create daily post',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Post voting results to Reddit (admin endpoint)
 */
router.post(
  '/api/post-results',
  rateLimiters.admin,
  validateBody({
    postId: { required: true, type: 'string' },
    dilemmaId: commonSchemas.dilemmaId,
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { postId, dilemmaId } = req.body;

    console.log(`📊 Posting voting results for post: ${postId}, dilemma: ${dilemmaId}`);

    // Get vote results
    const recentOutcomes = await StoryEvolution.getRecentOutcomes(10);
    const storyOutcome = recentOutcomes.find((outcome) => outcome.dilemmaId === dilemmaId);

    if (!storyOutcome) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Story outcome not found for this dilemma',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    // Post results as comment
    const commentId = await RedditIntegration.postVotingResults(
      postId,
      storyOutcome.voteResult,
      storyOutcome.asciiScene
    );

    if (!commentId) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to post voting results',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
      return;
    }

    const response: APIResponse<{ commentId: string }> = {
      success: true,
      data: {
        commentId,
      },
      timestamp: new Date(),
      requestId,
    };

    console.log(`✅ Voting results posted successfully: ${commentId}`);
    res.json(response);
  })
);

/**
 * Run daily cycle (admin endpoint)
 */
router.post(
  '/api/run-daily-cycle',
  rateLimiters.admin,
  validateBody({
    theme: { type: 'string' },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { theme } = req.body;

    console.log('🔄 Running daily cycle...');

    try {
      const result = await Scheduler.runDailyCycle(theme);

      const response: APIResponse<typeof result> = {
        success: true,
        data: result,
        timestamp: new Date(),
        requestId,
      };

      console.log('✅ Daily cycle completed successfully');
      res.json(response);
    } catch (error) {
      console.error('❌ Error running daily cycle:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to run daily cycle',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Get detailed vote breakdown for a dilemma (admin endpoint)
 */
router.get(
  '/api/vote-breakdown/:dilemmaId',
  rateLimiters.admin,
  validateParams({
    dilemmaId: commonSchemas.dilemmaId,
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { dilemmaId } = req.params;

    if (!dilemmaId) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dilemma ID is required',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    try {
      const breakdown = await VoteProcessor.getVoteBreakdown(dilemmaId);

      if (!breakdown) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Vote data not found for this dilemma',
          },
          timestamp: new Date(),
          requestId,
        };
        res.status(404).json(response);
        return;
      }

      const response: APIResponse<typeof breakdown> = {
        success: true,
        data: breakdown,
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting vote breakdown:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get vote breakdown',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Get scheduler status (admin endpoint)
 */
router.get(
  '/api/scheduler-status',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const state = await Scheduler.getState();
      const timeUntilNext = await Scheduler.getTimeUntilNextAction();
      const shouldRun = await Scheduler.shouldRunDailyCycle();

      const response: APIResponse<{
        state: typeof state;
        timeUntilNextAction: number;
        shouldRunDailyCycle: boolean;
      }> = {
        success: true,
        data: {
          state,
          timeUntilNextAction: timeUntilNext,
          shouldRunDailyCycle: shouldRun,
        },
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting scheduler status:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get scheduler status',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Get automation status (admin endpoint)
 */
router.get(
  '/api/automation-status',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const automationState = await AutomationEngine.getState();
      const queueStatus = await TaskRunner.getQueueStatus();
      const shouldRunCycle = await AutomationEngine.shouldRunDailyCycle();
      const shouldRunCleanup = await AutomationEngine.shouldRunCleanup();
      const shouldRunHealthCheck = await AutomationEngine.shouldRunHealthCheck();

      const response: APIResponse<{
        automation: typeof automationState;
        taskRunner: typeof queueStatus;
        checks: {
          shouldRunDailyCycle: boolean;
          shouldRunCleanup: boolean;
          shouldRunHealthCheck: boolean;
        };
      }> = {
        success: true,
        data: {
          automation: automationState,
          taskRunner: queueStatus,
          checks: {
            shouldRunDailyCycle: shouldRunCycle,
            shouldRunCleanup: shouldRunCleanup,
            shouldRunHealthCheck: shouldRunHealthCheck,
          },
        },
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting automation status:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get automation status',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Run task runner cycle (admin endpoint)
 */
router.post(
  '/api/run-task-cycle',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      console.log('🚀 Manual task runner cycle triggered');
      const result = await TaskRunner.runCycle();

      const response: APIResponse<typeof result> = {
        success: true,
        data: result,
        timestamp: new Date(),
        requestId,
      };

      console.log(`✅ Task runner cycle completed: ${result.executed.length} tasks executed`);
      res.json(response);
    } catch (error) {
      console.error('❌ Error running task cycle:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to run task cycle',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Run health check (admin endpoint)
 */
router.post(
  '/api/run-health-check',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      console.log('🏥 Manual health check triggered');
      const result = await AutomationEngine.runHealthCheck();

      const response: APIResponse<typeof result> = {
        success: true,
        data: result,
        timestamp: new Date(),
        requestId,
      };

      console.log(`✅ Health check completed: ${result.overallHealth}`);
      res.json(response);
    } catch (error) {
      console.error('❌ Error running health check:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to run health check',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Run data cleanup (admin endpoint)
 */
router.post(
  '/api/run-cleanup',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      console.log('🧹 Manual data cleanup triggered');
      const result = await AutomationEngine.runDataCleanup();

      const response: APIResponse<typeof result> = {
        success: true,
        data: result,
        timestamp: new Date(),
        requestId,
      };

      console.log(`✅ Data cleanup completed: ${JSON.stringify(result.cleaned)}`);
      res.json(response);
    } catch (error) {
      console.error('❌ Error running cleanup:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to run cleanup',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Get performance metrics (admin endpoint)
 */
router.get(
  '/api/performance-metrics',
  rateLimiters.admin,
  validateQuery({
    hours: { type: 'number', min: 1, max: 168 }, // Max 1 week
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const metrics = await AutomationEngine.getPerformanceMetrics(hours);

      const response: APIResponse<{ metrics: typeof metrics; timeRange: number }> = {
        success: true,
        data: {
          metrics,
          timeRange: hours,
        },
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting performance metrics:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get performance metrics',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Schedule task (admin endpoint)
 */
router.post(
  '/api/schedule-task',
  rateLimiters.admin,
  validateBody({
    type: {
      required: true,
      type: 'string',
      enum: ['daily_cycle', 'cleanup', 'health_check', 'maintenance'],
    },
    scheduledAt: { required: true, type: 'string' },
    priority: { type: 'number', min: 1, max: 10 },
    params: { type: 'object' },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const { type, scheduledAt, priority = 5, params } = req.body;
      const scheduledDate = new Date(scheduledAt);

      if (isNaN(scheduledDate.getTime())) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid scheduledAt date format',
          },
          timestamp: new Date(),
          requestId,
        };
        res.status(400).json(response);
        return;
      }

      const taskId = await TaskRunner.scheduleTask(type, scheduledDate, priority, params);

      const response: APIResponse<{ taskId: string }> = {
        success: true,
        data: { taskId },
        timestamp: new Date(),
        requestId,
      };

      console.log(`📅 Task scheduled: ${type} at ${scheduledAt} (${taskId})`);
      res.json(response);
    } catch (error) {
      console.error('❌ Error scheduling task:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to schedule task',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Enable/disable automation (admin endpoint)
 */
router.post(
  '/api/automation-toggle',
  rateLimiters.admin,
  validateBody({
    enabled: { required: true, type: 'boolean' },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const { enabled } = req.body;
      await AutomationEngine.setEnabled(enabled);

      const response: APIResponse<{ enabled: boolean }> = {
        success: true,
        data: { enabled },
        timestamp: new Date(),
        requestId,
      };

      console.log(`🤖 Automation ${enabled ? 'enabled' : 'disabled'}`);
      res.json(response);
    } catch (error) {
      console.error('❌ Error toggling automation:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to toggle automation',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Automation trigger endpoint - can be called by external schedulers
 * This endpoint checks for pending automation tasks and executes them
 */
router.post(
  '/api/automation-trigger',
  rateLimiters.general, // Less restrictive rate limiting for automated calls
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      console.log('⏰ Automation trigger called');

      // Check if task runner should run
      if (!(await TaskRunner.shouldRun())) {
        const queueStatus = await TaskRunner.getQueueStatus();
        const response: APIResponse<{ message: string; nextCheck?: Date }> = {
          success: true,
          data: {
            message: 'Task runner not ready or already running',
            ...(queueStatus.nextRun && { nextCheck: queueStatus.nextRun }),
          },
          timestamp: new Date(),
          requestId,
        };
        res.json(response);
        return;
      }

      // Run task cycle
      const result = await TaskRunner.runCycle();

      const response: APIResponse<typeof result & { message: string }> = {
        success: true,
        data: {
          ...result,
          message: `Automation cycle completed: ${result.executed.length} tasks executed`,
        },
        timestamp: new Date(),
        requestId,
      };

      console.log(`✅ Automation trigger completed: ${result.executed.length} tasks executed`);
      res.json(response);
    } catch (error) {
      console.error('❌ Error in automation trigger:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Automation trigger failed',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Get system health status (admin endpoint)
 */
router.get(
  '/api/system-health',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const healthStatus = await MaintenanceService.performSystemHealthCheck();

      const response: APIResponse<typeof healthStatus> = {
        success: true,
        data: healthStatus,
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting system health:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get system health',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Get health history (admin endpoint)
 */
router.get(
  '/api/health-history',
  rateLimiters.admin,
  validateQuery({
    hours: { type: 'number', min: 1, max: 168 }, // Max 1 week
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const healthHistory = await MaintenanceService.getHealthHistory(hours);

      const response: APIResponse<{ history: typeof healthHistory; timeRange: number }> = {
        success: true,
        data: {
          history: healthHistory,
          timeRange: hours,
        },
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting health history:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get health history',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Get performance logs (admin endpoint)
 */
router.get(
  '/api/performance-logs',
  rateLimiters.admin,
  validateQuery({
    hours: { type: 'number', min: 1, max: 168 }, // Max 1 week
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const performanceLogs = await MaintenanceService.getPerformanceLogs(hours);

      const response: APIResponse<{ logs: typeof performanceLogs; timeRange: number }> = {
        success: true,
        data: {
          logs: performanceLogs,
          timeRange: hours,
        },
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting performance logs:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get performance logs',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Monitor Redis performance (admin endpoint)
 */
router.get(
  '/api/redis-performance',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const redisPerformance = await MaintenanceService.monitorRedisPerformance();

      const response: APIResponse<typeof redisPerformance> = {
        success: true,
        data: redisPerformance,
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error monitoring Redis performance:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to monitor Redis performance',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Archive old data (admin endpoint)
 */
router.post(
  '/api/archive-data',
  rateLimiters.admin,
  validateBody({
    olderThanDays: { type: 'number', min: 1, max: 365 },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const { olderThanDays = 30 } = req.body;
      console.log(`📦 Manual data archival triggered (older than ${olderThanDays} days)`);

      const archiveResult = await MaintenanceService.archiveOldDecisions(olderThanDays);

      const response: APIResponse<typeof archiveResult> = {
        success: true,
        data: archiveResult,
        timestamp: new Date(),
        requestId,
      };

      console.log(`✅ Data archival completed: ${archiveResult.archived.length} items archived`);
      res.json(response);
    } catch (error) {
      console.error('❌ Error archiving data:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to archive data',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Log client-side errors
 */
router.post(
  '/api/log-client-error',
  rateLimiters.general,
  validateBody({
    message: { required: true, type: 'string' },
    stack: { type: 'string' },
    componentStack: { type: 'string' },
    userAgent: { required: true, type: 'string' },
    url: { required: true, type: 'string' },
    timestamp: { required: true, type: 'string' },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Import ErrorLogger dynamically to avoid circular imports
    const { ErrorLogger } = await import('./middleware/errorHandler.js');

    await ErrorLogger.logClientError(req.body);

    const response: APIResponse<{ logged: boolean }> = {
      success: true,
      data: { logged: true },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Get error statistics (admin endpoint)
 */
router.get(
  '/api/error-stats',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const { ErrorLogger } = await import('./middleware/errorHandler.js');
    const stats = ErrorLogger.getErrorStats();

    const response: APIResponse<{ stats: typeof stats }> = {
      success: true,
      data: { stats },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Error testing endpoint (admin endpoint)
 */
router.post(
  '/api/test-errors',
  rateLimiters.admin,
  validateBody({
    action: { required: true, type: 'string', enum: ['list', 'run', 'run-all'] },
    scenario: { type: 'string' },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const { ErrorTestingService } = await import('./utils/errorTesting.js');
    const testHandler = ErrorTestingService.createTestEndpoint();
    await testHandler(req, res);
  })
);

/**
 * System health monitoring endpoint (admin endpoint)
 */
router.get(
  '/api/system-health-detailed',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const { HealthMonitorService } = await import('./utils/healthMonitor.js');
    const health = await HealthMonitorService.performHealthCheck();
    const metrics = HealthMonitorService.getSystemMetrics();

    const response: APIResponse<{
      health: typeof health;
      metrics: typeof metrics;
    }> = {
      success: true,
      data: { health, metrics },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Health history endpoint (admin endpoint)
 */
router.get(
  '/api/health-history-detailed',
  rateLimiters.admin,
  validateQuery({
    limit: { type: 'number', min: 1, max: 100 },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const limit = parseInt(req.query.limit as string) || 50;

    const { HealthMonitorService } = await import('./utils/healthMonitor.js');
    const history = HealthMonitorService.getHealthHistory(limit);

    const response: APIResponse<{ history: typeof history }> = {
      success: true,
      data: { history },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Preview ASCII template
 */
router.get(
  '/api/ascii-preview/:theme/:templateIndex?',
  rateLimiters.general,
  validateParams({
    theme: { required: true, type: 'string' },
    templateIndex: { type: 'number', min: 0 },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { theme, templateIndex } = req.params;

    if (!theme) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Theme is required',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const index = templateIndex ? parseInt(templateIndex, 10) : 0;
    const preview = ASCIIGenerator.previewTemplate(theme, index);

    if (!preview) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Template not found for theme '${theme}' at index ${index}`,
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    const response: ASCIISceneResponse = {
      success: true,
      data: {
        scene: preview,
        context: `Preview of ${theme} template ${index}`,
      },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Get world history for attribute trend data (admin endpoint)
 */
router.get(
  '/api/world-history',
  rateLimiters.admin,
  validateQuery({
    page: commonSchemas.pagination.page,
    limit: commonSchemas.pagination.limit,
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100 entries per request

    console.log(`📊 Getting world history - page: ${page}, pageSize: ${pageSize}`);

    // Get paginated history using WorldStateService
    const historyData = await WorldStateService.getPaginatedHistory(page, pageSize);

    const response: import('../shared/types/api.js').WorldHistoryResponse = {
      success: true,
      data: historyData,
      timestamp: new Date(),
      requestId,
    };

    console.log(
      `✅ Retrieved ${historyData.history.length} history entries (page ${page}/${Math.ceil(historyData.totalEntries / pageSize)})`
    );
    res.json(response);
  })
);

/**
 * Get cache statistics (admin endpoint)
 */
router.get(
  '/api/cache-stats',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const cacheStats = CacheService.getCacheStats();
    const cacheHealth = await CacheService.getCacheHealth();

    const response: APIResponse<{
      stats: typeof cacheStats;
      health: typeof cacheHealth;
    }> = {
      success: true,
      data: {
        stats: cacheStats,
        health: cacheHealth,
      },
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Clear cache (admin endpoint)
 */
router.post(
  '/api/clear-cache',
  rateLimiters.admin,
  validateBody({
    type: { type: 'string', enum: ['all', 'world', 'dilemma', 'ascii'] },
    dilemmaId: { type: 'string' },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { type, dilemmaId } = req.body;

    let clearedCount = 0;

    switch (type) {
      case 'all':
        clearedCount += await CacheService.clearPrefix('cache:');
        ASCIIPerformanceOptimizer.clearCaches();
        break;
      case 'world':
        await CacheService.invalidateWorldState();
        clearedCount = 1;
        break;
      case 'dilemma':
        await CacheService.invalidateDilemma(dilemmaId);
        clearedCount = 1;
        break;
      case 'ascii':
        ASCIIPerformanceOptimizer.clearCaches();
        clearedCount += await CacheService.clearPrefix('cache:ascii_');
        break;
      default:
        throw new Error('Invalid cache type');
    }

    const response: APIResponse<{ clearedCount: number }> = {
      success: true,
      data: { clearedCount },
      timestamp: new Date(),
      requestId,
    };

    console.log(`🗑️ Cache cleared: ${type} (${clearedCount} entries)`);
    res.json(response);
  })
);

/**
 * Warm up cache (admin endpoint)
 */
router.post(
  '/api/warm-cache',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await Promise.all([
      CacheService.warmUpCache(),
      ASCIIPerformanceOptimizer.precomputeCommonScenes(),
    ]);

    const response: APIResponse<{ warmedUp: boolean }> = {
      success: true,
      data: { warmedUp: true },
      timestamp: new Date(),
      requestId,
    };

    console.log('🔥 Cache warmed up successfully');
    res.json(response);
  })
);

/**
 * Get ASCII performance metrics (admin endpoint)
 */
router.get(
  '/api/ascii-performance',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const performanceMetrics = ASCIIPerformanceOptimizer.getPerformanceMetrics();

    const response: APIResponse<typeof performanceMetrics> = {
      success: true,
      data: performanceMetrics,
      timestamp: new Date(),
      requestId,
    };

    res.json(response);
  })
);

/**
 * Batch API endpoint for multiple requests
 */
router.post(
  '/api/batch',
  rateLimiters.general,
  validateBody({
    requests: {
      type: 'array',
    },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { requests } = req.body;

    // Validate batch size
    if (!Array.isArray(requests) || requests.length > 10) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid requests array or batch size too large (max 10)',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    console.log(`📦 Processing batch of ${requests.length} requests`);

    const results = await Promise.allSettled(
      requests.map(
        async (batchReq: { id: string; endpoint: string; method: string; body?: unknown }) => {
          try {
            // Simple internal request handling for common endpoints
            let data: unknown;

            switch (batchReq.endpoint) {
              case '/world-state': {
                const worldState = await CacheService.getCachedWorldState();
                const trends = await CacheService.getCachedWorldTrends();
                data = { worldState, trends };
                break;
              }

              case '/current-dilemma': {
                const dilemma = await CacheService.getCachedCurrentDilemma();
                data = { dilemma };
                break;
              }

              default:
                throw new Error(`Unsupported batch endpoint: ${batchReq.endpoint}`);
            }

            return {
              id: batchReq.id,
              success: true,
              data,
            };
          } catch (error: unknown) {
            return {
              id: batchReq.id,
              success: false,
              error: {
                code: 'BATCH_REQUEST_FAILED',
                message: error instanceof Error ? error.message : 'Unknown error',
              },
            };
          }
        }
      )
    );

    const batchResponse = results.map((result) =>
      result.status === 'fulfilled'
        ? result.value
        : {
            id: 'unknown',
            success: false,
            error: { code: 'BATCH_PROCESSING_FAILED', message: 'Request processing failed' },
          }
    );

    const response: APIResponse<{ results: typeof batchResponse }> = {
      success: true,
      data: { results: batchResponse },
      timestamp: new Date(),
      requestId,
    };

    console.log(
      `✅ Batch processed: ${batchResponse.filter((r) => r.success).length}/${requests.length} successful`
    );
    res.json(response);
  })
);

// User Profile API Routes

/**
 * Get user profile data
 */
router.get(
  '/api/user/profile',
  rateLimiters.general,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Get user ID from Reddit context
      const userId = context.userId;
      if (!userId) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
          },
          timestamp: new Date(),
          requestId,
        };
        res.status(401).json(response);
        return;
      }

      // Import UserStatsService dynamically to avoid circular imports
      const { UserStatsService } = await import('./core/userStatsService.js');
      const userStatsService = new UserStatsService(context);

      const profile = await userStatsService.getUserProfile(userId);

      if (!profile) {
        // Create new profile if it doesn't exist
        const username = (await reddit.getCurrentUsername()) || userId;
        const newProfile = await userStatsService.createUserProfile(userId, username);

        const response: APIResponse<{ profile: typeof newProfile }> = {
          success: true,
          data: { profile: newProfile },
          timestamp: new Date(),
          requestId,
        };
        res.json(response);
        return;
      }

      const response: APIResponse<{ profile: typeof profile }> = {
        success: true,
        data: { profile },
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting user profile:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get user profile',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Get user achievements
 */
router.get(
  '/api/user/achievements',
  rateLimiters.general,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const userId = context.userId;
      if (!userId) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
          },
          timestamp: new Date(),
          requestId,
        };
        res.status(401).json(response);
        return;
      }

      const { UserStatsService } = await import('./core/userStatsService.js');
      const userStatsService = new UserStatsService(context);

      const profile = await userStatsService.getUserProfile(userId);

      if (!profile) {
        const response: APIResponse<{ achievements: [] }> = {
          success: true,
          data: { achievements: [] },
          timestamp: new Date(),
          requestId,
        };
        res.json(response);
        return;
      }

      const response: APIResponse<{ achievements: typeof profile.achievements }> = {
        success: true,
        data: { achievements: profile.achievements },
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting user achievements:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get user achievements',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Get user statistics
 */
router.get(
  '/api/user/stats',
  rateLimiters.general,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const userId = context.userId;
      if (!userId) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
          },
          timestamp: new Date(),
          requestId,
        };
        res.status(401).json(response);
        return;
      }

      const { UserStatsService } = await import('./core/userStatsService.js');
      const userStatsService = new UserStatsService(context);

      const stats = await userStatsService.getUserStats(userId);

      if (!stats) {
        // Return default stats if no profile exists
        const defaultStats = {
          totalVotes: 0,
          winningVotes: 0,
          winningPercentage: 0,
          currentStreak: 0,
          longestStreak: 0,
          achievementCount: 0,
          averageImpact: 0,
          participationDays: 0,
          lastActiveDate: new Date(),
        };

        const response: APIResponse<{ stats: typeof defaultStats }> = {
          success: true,
          data: { stats: defaultStats },
          timestamp: new Date(),
          requestId,
        };
        res.json(response);
        return;
      }

      const response: APIResponse<{ stats: typeof stats }> = {
        success: true,
        data: { stats },
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting user stats:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get user stats',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

// Leaderboard API Routes

/**
 * Get leaderboard for a specific category and timeframe
 */
router.get(
  '/api/leaderboard',
  rateLimiters.general,
  validateQuery({
    category: commonSchemas.leaderboard.category,
    timeframe: commonSchemas.leaderboard.timeframe,
    limit: commonSchemas.leaderboard.limit,
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const category = req.query.category as import('../shared/types/index.js').LeaderboardCategory;
      const timeframe =
        (req.query.timeframe as import('../shared/types/index.js').TimeFrame) || 'allTime';
      const limit = parseInt(req.query.limit as string) || 50;

      // Get current user ID for rank info
      const currentUserId = context.userId;

      // Import LeaderboardService dynamically
      const { LeaderboardService } = await import('./core/leaderboardService.js');
      const leaderboardService = new LeaderboardService(context);

      const leaderboard = await leaderboardService.getLeaderboard(
        category,
        timeframe,
        limit,
        currentUserId
      );

      const response: import('../shared/types/api.js').LeaderboardResponse = {
        success: true,
        data: { leaderboard },
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting leaderboard:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get leaderboard',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Get user's rank in a specific category
 */
router.get(
  '/api/user/rank',
  rateLimiters.general,
  validateQuery({
    category: commonSchemas.leaderboard.category,
    timeframe: commonSchemas.leaderboard.timeframe,
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const userId = context.userId;
      if (!userId) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
          },
          timestamp: new Date(),
          requestId,
        };
        res.status(401).json(response);
        return;
      }

      const category = req.query.category as import('../shared/types/index.js').LeaderboardCategory;
      const timeframe =
        (req.query.timeframe as import('../shared/types/index.js').TimeFrame) || 'allTime';

      const { LeaderboardService } = await import('./core/leaderboardService.js');
      const leaderboardService = new LeaderboardService(context);

      const rankInfo = await leaderboardService.getUserRankInfo(userId, category, timeframe);

      if (!rankInfo) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'User rank not found',
          },
          timestamp: new Date(),
          requestId,
        };
        res.status(404).json(response);
        return;
      }

      const response: import('../shared/types/api.js').UserRankResponse = {
        success: true,
        data: { rankInfo },
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting user rank:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get user rank',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Update leaderboard rankings (admin endpoint)
 */
router.post(
  '/api/leaderboard/update',
  rateLimiters.admin,
  validateBody({
    userId: { required: true, type: 'string' },
    stats: { required: true, type: 'object' },
  }),
  asyncHandler(async (req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const { userId, stats } = req.body;

      const { LeaderboardService } = await import('./core/leaderboardService.js');
      const leaderboardService = new LeaderboardService(context);

      await leaderboardService.updateUserStats(userId, stats);

      const response: APIResponse<{ updated: boolean }> = {
        success: true,
        data: { updated: true },
        timestamp: new Date(),
        requestId,
      };

      console.log(`✅ Leaderboard updated for user: ${userId}`);
      res.json(response);
    } catch (error) {
      console.error('❌ Error updating leaderboard:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update leaderboard',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Get leaderboard statistics (admin endpoint)
 */
router.get(
  '/api/leaderboard/stats',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const { LeaderboardService } = await import('./core/leaderboardService.js');
      const leaderboardService = new LeaderboardService(context);

      const stats = await leaderboardService.getLeaderboardStats();

      const response: import('../shared/types/api.js').LeaderboardStatsResponse = {
        success: true,
        data: stats,
        timestamp: new Date(),
        requestId,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error getting leaderboard stats:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get leaderboard stats',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

/**
 * Reset seasonal leaderboards (admin endpoint)
 */
router.post(
  '/api/leaderboard/reset-seasonal',
  rateLimiters.admin,
  asyncHandler(async (_req, res): Promise<void> => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const { LeaderboardService } = await import('./core/leaderboardService.js');
      const leaderboardService = new LeaderboardService(context);

      await leaderboardService.resetSeasonalLeaderboards();

      const response: APIResponse<{ reset: boolean }> = {
        success: true,
        data: { reset: true },
        timestamp: new Date(),
        requestId,
      };

      console.log('✅ Seasonal leaderboards reset');
      res.json(response);
    } catch (error) {
      console.error('❌ Error resetting seasonal leaderboards:', error);
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to reset seasonal leaderboards',
        },
        timestamp: new Date(),
        requestId,
      };
      res.status(500).json(response);
    }
  })
);

// Legacy API Routes (keeping for backward compatibility)

router.get<{ postId: string }, InitResponse | { status: string; message: string }>(
  '/api/init',
  async (_req, res): Promise<void> => {
    const { postId } = context;

    if (!postId) {
      console.error('API Init Error: postId not found in devvit context');
      res.status(400).json({
        status: 'error',
        message: 'postId is required but missing from context',
      });
      return;
    }

    try {
      const [count, username] = await Promise.all([
        redis.get('count'),
        reddit.getCurrentUsername(),
      ]);

      res.json({
        type: 'init',
        postId: postId,
        count: count ? parseInt(count) : 0,
        username: username ?? 'anonymous',
      });
    } catch (error) {
      console.error(`API Init Error for post ${postId}:`, error);
      let errorMessage = 'Unknown error during initialization';
      if (error instanceof Error) {
        errorMessage = `Initialization failed: ${error.message}`;
      }
      res.status(400).json({ status: 'error', message: errorMessage });
    }
  }
);

router.post<{ postId: string }, IncrementResponse | { status: string; message: string }, unknown>(
  '/api/increment',
  async (_req, res): Promise<void> => {
    const { postId } = context;
    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    res.json({
      count: await redis.incrBy('count', 1),
      postId,
      type: 'increment',
    });
  }
);

router.post<{ postId: string }, DecrementResponse | { status: string; message: string }, unknown>(
  '/api/decrement',
  async (_req, res): Promise<void> => {
    const { postId } = context;
    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    res.json({
      count: await redis.incrBy('count', -1),
      postId,
      type: 'decrement',
    });
  }
);

router.post('/internal/on-app-install', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      status: 'success',
      message: `Post created in subreddit ${context.subredditName} with id ${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

router.post('/internal/menu/post-create', async (_req, res): Promise<void> => {
  try {
    // Create daily dilemma post instead of basic post
    const result = await createDailyDilemmaPost();

    res.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${result.post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

// Use router middleware
app.use(router);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Get port from environment variable with fallback
const port = getServerPort();

// Initialize Redis data structures
RedisDataModels.initializeDataStructures().catch(console.error);

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
