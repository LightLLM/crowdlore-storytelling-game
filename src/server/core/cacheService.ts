/**
 * Cache service for frequently accessed data in CrowdLore
 * Implements Redis-based caching with TTL and cache invalidation
 */

import { redis } from '@devvit/web/server';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction as ExpressNextFunction,
} from 'express';
import type { WorldState, DilemmaData, ASCIIScene } from '../../shared/types/index.js';

// Cache key prefixes
const CACHE_KEYS = {
  WORLD_STATE: 'cache:world_state',
  CURRENT_DILEMMA: 'cache:current_dilemma',
  VOTE_RESULTS: 'cache:vote_results',
  ASCII_SCENE: 'cache:ascii_scene',
  WORLD_TRENDS: 'cache:world_trends',
  PERFORMANCE_METRICS: 'cache:performance_metrics',
} as const;

// Cache TTL values (in seconds)
const CACHE_TTL = {
  WORLD_STATE: 300, // 5 minutes
  CURRENT_DILEMMA: 600, // 10 minutes
  VOTE_RESULTS: 1800, // 30 minutes
  ASCII_SCENE: 3600, // 1 hour
  WORLD_TRENDS: 900, // 15 minutes
  PERFORMANCE_METRICS: 60, // 1 minute
} as const;

export interface CacheOptions {
  ttl?: number;
  skipCache?: boolean;
  forceRefresh?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  lastReset: Date;
}

/**
 * Cache service for optimizing frequently accessed data
 */
export class CacheService {
  private static stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalRequests: 0,
    lastReset: new Date(),
  };

  /**
   * Get cached data or execute function and cache result
   */
  static async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const { ttl = 300, skipCache = false, forceRefresh = false } = options;

    this.stats.totalRequests++;

    // Skip cache if requested
    if (skipCache || forceRefresh) {
      const data = await fetchFunction();
      if (!skipCache) {
        await this.set(key, data, ttl);
      }
      this.stats.misses++;
      this.updateHitRate();
      return data;
    }

    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      this.stats.hits++;
      this.updateHitRate();
      return cached;
    }

    // Cache miss - fetch and cache
    const data = await fetchFunction();
    await this.set(key, data, ttl);
    this.stats.misses++;
    this.updateHitRate();
    return data;
  }

  /**
   * Get data from cache
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      if (!cached) return null;

      const parsed = JSON.parse(cached);

      // Check if data has expiration metadata
      if (parsed._cacheExpiry && Date.now() > parsed._cacheExpiry) {
        await redis.del(key);
        return null;
      }

      return parsed._cacheData || parsed;
    } catch (error) {
      console.warn(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set data in cache with TTL
   */
  static async set<T>(key: string, data: T, ttl: number = 300): Promise<void> {
    try {
      const cacheData = {
        _cacheData: data,
        _cacheExpiry: Date.now() + ttl * 1000,
        _cachedAt: new Date().toISOString(),
      };

      await redis.set(key, JSON.stringify(cacheData));
      await redis.expire(key, ttl);
    } catch (error) {
      console.warn(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete data from cache
   */
  static async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      console.warn(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Clear all cache entries with a specific prefix
   */
  static async clearPrefix(prefix: string): Promise<number> {
    try {
      // Note: Redis keys() is not available in Devvit, so we'll use a different approach
      // For now, we'll clear known cache keys individually
      const knownKeys = [
        `${prefix}world_state`,
        `${prefix}current_dilemma`,
        `${prefix}world_trends`,
        `${prefix}ascii_scene`,
        `${prefix}vote_results`,
      ];

      let clearedCount = 0;
      for (const key of knownKeys) {
        try {
          await redis.del(key);
          clearedCount++;
        } catch (error) {
          // Key might not exist, continue
        }
      }

      return clearedCount;
    } catch (error) {
      console.warn(`Cache clear prefix error for ${prefix}:`, error);
      return 0;
    }
  }

  /**
   * Get cached world state with optimized retrieval
   */
  static async getCachedWorldState(options: CacheOptions = {}): Promise<WorldState> {
    return this.getOrSet(
      CACHE_KEYS.WORLD_STATE,
      async () => {
        const { WorldStateService } = await import('./worldState.js');
        return WorldStateService.getCurrentState();
      },
      { ttl: CACHE_TTL.WORLD_STATE, ...options }
    );
  }

  /**
   * Get cached current dilemma
   */
  static async getCachedCurrentDilemma(options: CacheOptions = {}): Promise<DilemmaData | null> {
    return this.getOrSet(
      CACHE_KEYS.CURRENT_DILEMMA,
      async () => {
        const dilemmaJson = await redis.get('crowdlore:current_dilemma');
        return dilemmaJson ? JSON.parse(dilemmaJson) : null;
      },
      { ttl: CACHE_TTL.CURRENT_DILEMMA, ...options }
    );
  }

  /**
   * Get cached vote results for a dilemma
   */
  static async getCachedVoteResults(
    dilemmaId: string,
    options: CacheOptions = {}
  ): Promise<unknown | null> {
    const key = `${CACHE_KEYS.VOTE_RESULTS}:${dilemmaId}`;
    return this.getOrSet(
      key,
      async () => {
        const { VoteProcessor } = await import('./voteProcessor.js');
        return VoteProcessor.getVoteData(dilemmaId);
      },
      { ttl: CACHE_TTL.VOTE_RESULTS, ...options }
    );
  }

  /**
   * Get cached ASCII scene for a dilemma
   */
  static async getCachedASCIIScene(
    dilemmaId: string,
    options: CacheOptions = {}
  ): Promise<ASCIIScene | null> {
    const key = `${CACHE_KEYS.ASCII_SCENE}:${dilemmaId}`;
    return this.getOrSet(
      key,
      async () => {
        const { StoryEvolution } = await import('./storyEvolution.js');
        const outcomes = await StoryEvolution.getRecentOutcomes(20);
        const outcome = outcomes.find((o) => o.dilemmaId === dilemmaId);
        return outcome?.asciiScene || null;
      },
      { ttl: CACHE_TTL.ASCII_SCENE, ...options }
    );
  }

  /**
   * Get cached world attribute trends
   */
  static async getCachedWorldTrends(
    options: CacheOptions = {}
  ): Promise<Record<string, { change: number; direction: string }>> {
    return this.getOrSet(
      CACHE_KEYS.WORLD_TRENDS,
      async () => {
        const { WorldStateService } = await import('./worldState.js');
        return WorldStateService.getAttributeTrends();
      },
      { ttl: CACHE_TTL.WORLD_TRENDS, ...options }
    );
  }

  /**
   * Invalidate world state related caches
   */
  static async invalidateWorldState(): Promise<void> {
    await Promise.all([
      this.del(CACHE_KEYS.WORLD_STATE),
      this.del(CACHE_KEYS.WORLD_TRENDS),
      this.clearPrefix('cache:world_'),
    ]);
    console.log('🗑️ World state caches invalidated');
  }

  /**
   * Invalidate dilemma related caches
   */
  static async invalidateDilemma(dilemmaId?: string): Promise<void> {
    const promises = [this.del(CACHE_KEYS.CURRENT_DILEMMA)];

    if (dilemmaId) {
      promises.push(
        this.del(`${CACHE_KEYS.VOTE_RESULTS}:${dilemmaId}`),
        this.del(`${CACHE_KEYS.ASCII_SCENE}:${dilemmaId}`)
      );
    } else {
      // Clear known vote and ASCII cache keys
      promises.push(
        this.clearPrefix(CACHE_KEYS.VOTE_RESULTS).then(() => {}),
        this.clearPrefix(CACHE_KEYS.ASCII_SCENE).then(() => {})
      );
    }

    await Promise.all(promises);
    console.log(`🗑️ Dilemma caches invalidated${dilemmaId ? ` for ${dilemmaId}` : ''}`);
  }

  /**
   * Warm up cache with frequently accessed data
   */
  static async warmUpCache(): Promise<void> {
    console.log('🔥 Warming up cache...');

    try {
      await Promise.all([
        this.getCachedWorldState({ forceRefresh: true }),
        this.getCachedCurrentDilemma({ forceRefresh: true }),
        this.getCachedWorldTrends({ forceRefresh: true }),
      ]);

      console.log('✅ Cache warmed up successfully');
    } catch (error) {
      console.warn('⚠️ Cache warm-up failed:', error);
    }
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  static resetCacheStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalRequests: 0,
      lastReset: new Date(),
    };
  }

  /**
   * Update hit rate calculation
   */
  private static updateHitRate(): void {
    this.stats.hitRate =
      this.stats.totalRequests > 0 ? (this.stats.hits / this.stats.totalRequests) * 100 : 0;
  }

  /**
   * Get cache health metrics
   */
  static async getCacheHealth(): Promise<{
    isHealthy: boolean;
    stats: CacheStats;
    redisConnected: boolean;
    cacheSize: number;
  }> {
    try {
      // Test Redis connection by trying to get a key
      await redis.get('health_check');
      const redisConnected = true;

      // Estimate cache size (since we can't use keys() in Devvit)
      const cacheSize = 10; // Placeholder estimate

      const isHealthy = redisConnected && this.stats.hitRate > 20; // At least 20% hit rate

      return {
        isHealthy,
        stats: this.getCacheStats(),
        redisConnected,
        cacheSize,
      };
    } catch (error) {
      return {
        isHealthy: false,
        stats: this.getCacheStats(),
        redisConnected: false,
        cacheSize: 0,
      };
    }
  }

  /**
   * Batch cache operations for efficiency
   */
  static async batchGet<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const results = await Promise.all(keys.map((key) => this.get<T>(key)));
      return results;
    } catch (error) {
      console.warn('Batch cache get error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Batch cache set operations
   */
  static async batchSet<T>(entries: Array<{ key: string; data: T; ttl?: number }>): Promise<void> {
    try {
      await Promise.all(entries.map(({ key, data, ttl = 300 }) => this.set(key, data, ttl)));
    } catch (error) {
      console.warn('Batch cache set error:', error);
    }
  }

  /**
   * Cache middleware for Express routes
   */
  static middleware(cacheKey: string, ttl: number = 300) {
    return async (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
      const key = `${cacheKey}:${req.originalUrl}`;

      try {
        const cached = await this.get(key);
        if (cached) {
          res.json(cached);
          return;
        }

        // Override res.json to cache the response
        const originalJson = res.json;
        res.json = function (data: unknown) {
          if (res.statusCode === 200) {
            CacheService.set(key, data, ttl).catch(console.warn);
          }
          return originalJson.call(this, data);
        };

        next();
      } catch (error) {
        console.warn('Cache middleware error:', error);
        next();
      }
    };
  }
}
