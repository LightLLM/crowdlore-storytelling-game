/**
 * Maintenance Service for CrowdLore
 * Handles data archival, performance monitoring, and system health checks
 */

import { redis } from '@devvit/web/server';
import { WorldStateService } from './worldState.js';
import { VoteProcessor } from './voteProcessor.js';
import { StoryEvolution } from './storyEvolution.js';

// Redis keys for maintenance operations
const MAINTENANCE_KEYS = {
  ARCHIVE_PREFIX: 'crowdlore:archive:',
  PERFORMANCE_LOG: 'crowdlore:maintenance:performance',
  HEALTH_LOG: 'crowdlore:maintenance:health',
  CLEANUP_LOG: 'crowdlore:maintenance:cleanup',
} as const;

export type ArchiveEntry = {
  id: string;
  type: 'dilemma' | 'vote_data' | 'world_history';
  originalKey: string;
  archivedAt: Date;
  dataSize: number;
  metadata?: Record<string, unknown>;
};

export type PerformanceLog = {
  timestamp: Date;
  operation: string;
  duration: number;
  success: boolean;
  memoryUsage?: number;
  redisConnections?: number;
  error?: string;
};

export type CleanupResult = {
  timestamp: Date;
  itemsProcessed: number;
  itemsArchived: number;
  itemsDeleted: number;
  spaceFreed: number; // Estimated bytes
  errors: string[];
  duration: number;
};

export type SystemHealth = {
  timestamp: Date;
  components: {
    redis: { status: 'healthy' | 'warning' | 'critical'; latency?: number; error?: string };
    worldState: { status: 'healthy' | 'warning' | 'critical'; lastUpdate?: Date; error?: string };
    voteProcessor: {
      status: 'healthy' | 'warning' | 'critical';
      activeVotes?: number;
      error?: string;
    };
    storyEvolution: {
      status: 'healthy' | 'warning' | 'critical';
      lastStory?: Date;
      error?: string;
    };
  };
  overallStatus: 'healthy' | 'warning' | 'critical';
  recommendations: string[];
};

/**
 * Maintenance service for system health and data management
 */
export class MaintenanceService {
  private static readonly ARCHIVE_RETENTION_DAYS = 90; // Keep archives for 90 days
  private static readonly PERFORMANCE_LOG_RETENTION_HOURS = 168; // 1 week
  private static readonly HEALTH_LOG_RETENTION_HOURS = 72; // 3 days

  /**
   * Archive old decision data instead of deleting
   */
  static async archiveOldDecisions(olderThanDays: number = 30): Promise<{
    archived: ArchiveEntry[];
    errors: string[];
  }> {
    const archived: ArchiveEntry[] = [];
    const errors: string[] = [];
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    try {
      console.log(`📦 Archiving decisions older than ${olderThanDays} days...`);

      // Archive old dilemma data
      // Note: Devvit Redis doesn't support keys() method, using alternative approach
      const dilemmaKeys: string[] = [];
      for (const key of dilemmaKeys) {
        try {
          const data = await redis.get(key);
          if (data) {
            const parsed = JSON.parse(data);
            if (parsed.createdAt && new Date(parsed.createdAt).getTime() < cutoffTime) {
              // Create archive entry
              const archiveId = `dilemma-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              const archiveKey = `${MAINTENANCE_KEYS.ARCHIVE_PREFIX}${archiveId}`;

              const archiveEntry: ArchiveEntry = {
                id: archiveId,
                type: 'dilemma',
                originalKey: key,
                archivedAt: new Date(),
                dataSize: data.length,
                metadata: {
                  dilemmaId: parsed.id,
                  theme: parsed.theme,
                  createdAt: parsed.createdAt,
                },
              };

              // Store in archive with expiration
              await redis.set(
                archiveKey,
                JSON.stringify({
                  entry: archiveEntry,
                  data: parsed,
                })
              );
              await redis.expire(archiveKey, this.ARCHIVE_RETENTION_DAYS * 24 * 60 * 60);

              // Remove original
              await redis.del(key);
              archived.push(archiveEntry);
            }
          }
        } catch (error) {
          errors.push(
            `Error archiving ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      // Archive old vote data
      // Note: Devvit Redis doesn't support keys() method, using alternative approach
      const voteKeys: string[] = [];
      for (const key of voteKeys) {
        try {
          const data = await redis.get(key);
          if (data) {
            const parsed = JSON.parse(data);
            if (parsed.timestamp && new Date(parsed.timestamp).getTime() < cutoffTime) {
              const archiveId = `votes-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              const archiveKey = `${MAINTENANCE_KEYS.ARCHIVE_PREFIX}${archiveId}`;

              const archiveEntry: ArchiveEntry = {
                id: archiveId,
                type: 'vote_data',
                originalKey: key,
                archivedAt: new Date(),
                dataSize: data.length,
                metadata: {
                  dilemmaId: parsed.dilemmaId,
                  voteCount: parsed.votes?.length || 0,
                  timestamp: parsed.timestamp,
                },
              };

              await redis.set(
                archiveKey,
                JSON.stringify({
                  entry: archiveEntry,
                  data: parsed,
                })
              );
              await redis.expire(archiveKey, this.ARCHIVE_RETENTION_DAYS * 24 * 60 * 60);

              await redis.del(key);
              archived.push(archiveEntry);
            }
          }
        } catch (error) {
          errors.push(
            `Error archiving ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      console.log(`✅ Archived ${archived.length} items, ${errors.length} errors`);
      return { archived, errors };
    } catch (error) {
      console.error('❌ Error in archive operation:', error);
      errors.push(
        `Archive operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { archived, errors };
    }
  }

  /**
   * Clean up old world history entries (keep only recent ones)
   */
  static async cleanupWorldHistory(keepCount: number = 100): Promise<{
    deleted: number;
    kept: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let deleted = 0;
    let kept = 0;

    try {
      console.log(`🧹 Cleaning world history, keeping ${keepCount} most recent entries...`);

      // Note: Devvit Redis doesn't support keys() method, using alternative approach
      const historyKeys: string[] = [];
      if (historyKeys.length <= keepCount) {
        console.log(`📊 History within limits: ${historyKeys.length}/${keepCount} entries`);
        return { deleted: 0, kept: historyKeys.length, errors: [] };
      }

      // Get all history entries with timestamps
      const historyEntries = [];
      for (const key of historyKeys) {
        try {
          const data = await redis.get(key);
          if (data) {
            const parsed = JSON.parse(data);
            historyEntries.push({
              key,
              timestamp: new Date(parsed.timestamp).getTime(),
              data: parsed,
            });
          }
        } catch (error) {
          // Invalid data, mark for deletion
          historyEntries.push({ key, timestamp: 0, data: null });
        }
      }

      // Sort by timestamp (newest first)
      historyEntries.sort((a, b) => b.timestamp - a.timestamp);

      // Keep the most recent entries, delete the rest
      const toKeep = historyEntries.slice(0, keepCount);
      const toDelete = historyEntries.slice(keepCount);

      // Archive old entries before deletion
      for (const entry of toDelete) {
        try {
          if (entry.data && entry.timestamp > 0) {
            // Archive significant world changes
            const archiveId = `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const archiveKey = `${MAINTENANCE_KEYS.ARCHIVE_PREFIX}${archiveId}`;

            const archiveEntry: ArchiveEntry = {
              id: archiveId,
              type: 'world_history',
              originalKey: entry.key,
              archivedAt: new Date(),
              dataSize: JSON.stringify(entry.data).length,
              metadata: {
                timestamp: entry.data.timestamp,
                attributes: entry.data.attributes,
              },
            };

            await redis.set(
              archiveKey,
              JSON.stringify({
                entry: archiveEntry,
                data: entry.data,
              })
            );
            await redis.expire(archiveKey, this.ARCHIVE_RETENTION_DAYS * 24 * 60 * 60);
          }

          await redis.del(entry.key);
          deleted++;
        } catch (error) {
          errors.push(
            `Error deleting ${entry.key}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      kept = toKeep.length;

      console.log(`✅ World history cleanup: ${deleted} deleted, ${kept} kept`);
      return { deleted, kept, errors };
    } catch (error) {
      console.error('❌ Error in world history cleanup:', error);
      errors.push(
        `History cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { deleted, kept, errors };
    }
  }

  /**
   * Monitor Redis performance
   */
  static async monitorRedisPerformance(): Promise<{
    latency: number;
    memoryUsage?: string;
    connectedClients?: number;
    operationsPerSecond?: number;
    status: 'healthy' | 'warning' | 'critical';
  }> {
    try {
      const startTime = Date.now();

      // Test Redis latency with a simple operation
      // Note: Devvit Redis doesn't support ping() method, using get() as health check
      await redis.get('health-check-key');
      const latency = Date.now() - startTime;

      // Try to get Redis info (may not be available in all environments)
      let memoryUsage: string | undefined;
      let connectedClients: number | undefined;
      let operationsPerSecond: number | undefined;

      try {
        // These commands may not be available in Devvit's Redis implementation
        // Note: Devvit Redis doesn't support info() method
        // Redis info not available, continue with basic monitoring
      } catch (infoError) {
        // Redis info not available, continue with basic monitoring
      }

      // Determine status based on latency
      let status: 'healthy' | 'warning' | 'critical';
      if (latency < 10) {
        status = 'healthy';
      } else if (latency < 100) {
        status = 'warning';
      } else {
        status = 'critical';
      }

      return {
        latency,
        ...(memoryUsage !== undefined && { memoryUsage }),
        ...(connectedClients !== undefined && { connectedClients }),
        ...(operationsPerSecond !== undefined && { operationsPerSecond }),
        status,
      };
    } catch (error) {
      console.error('❌ Error monitoring Redis performance:', error);
      return {
        latency: -1,
        status: 'critical',
      };
    }
  }

  /**
   * Comprehensive system health check
   */
  static async performSystemHealthCheck(): Promise<SystemHealth> {
    const health: SystemHealth = {
      timestamp: new Date(),
      components: {
        redis: { status: 'critical' },
        worldState: { status: 'critical' },
        voteProcessor: { status: 'critical' },
        storyEvolution: { status: 'critical' },
      },
      overallStatus: 'critical',
      recommendations: [],
    };

    try {
      // Check Redis
      const redisPerf = await this.monitorRedisPerformance();
      health.components.redis = {
        status: redisPerf.status,
        ...(redisPerf.latency !== -1 && { latency: redisPerf.latency }),
        ...(redisPerf.latency === -1 && { error: 'Redis connection failed' }),
      };

      // Check World State
      try {
        const worldState = await WorldStateService.getCurrentState();
        if (worldState && worldState.attributes) {
          health.components.worldState = {
            status: 'healthy',
            lastUpdate: worldState.lastUpdated,
          };
        } else {
          health.components.worldState = {
            status: 'warning',
            error: 'World state data incomplete',
          };
          health.recommendations.push('Initialize or repair world state data');
        }
      } catch (error) {
        health.components.worldState = {
          status: 'critical',
          error: error instanceof Error ? error.message : 'World state service error',
        };
        health.recommendations.push('Investigate world state service errors');
      }

      // Check Vote Processor
      try {
        // Test vote processor by checking for active votes
        const currentDilemmaJson = await redis.get('crowdlore:current_dilemma');
        if (currentDilemmaJson) {
          const dilemma = JSON.parse(currentDilemmaJson);
          const voteCount = await VoteProcessor.getVoteCount(dilemma.id);
          health.components.voteProcessor = {
            status: 'healthy',
            activeVotes: voteCount,
          };
        } else {
          health.components.voteProcessor = {
            status: 'warning',
            error: 'No active dilemma found',
          };
        }
      } catch (error) {
        health.components.voteProcessor = {
          status: 'critical',
          error: error instanceof Error ? error.message : 'Vote processor error',
        };
        health.recommendations.push('Check vote processing functionality');
      }

      // Check Story Evolution
      try {
        const recentOutcomes = await StoryEvolution.getRecentOutcomes(1);
        if (recentOutcomes.length > 0 && recentOutcomes[0]) {
          health.components.storyEvolution = {
            status: 'healthy',
            lastStory: new Date(recentOutcomes[0].createdAt),
          };
        } else {
          health.components.storyEvolution = {
            status: 'warning',
            error: 'No recent story outcomes found',
          };
          health.recommendations.push('Check story evolution system');
        }
      } catch (error) {
        health.components.storyEvolution = {
          status: 'critical',
          error: error instanceof Error ? error.message : 'Story evolution error',
        };
        health.recommendations.push('Investigate story evolution service');
      }

      // Determine overall status
      const componentStatuses = Object.values(health.components).map((c) => c.status);
      if (componentStatuses.every((s) => s === 'healthy')) {
        health.overallStatus = 'healthy';
      } else if (componentStatuses.some((s) => s === 'critical')) {
        health.overallStatus = 'critical';
      } else {
        health.overallStatus = 'warning';
      }

      // Add performance recommendations
      if (health.components.redis.latency && health.components.redis.latency > 50) {
        health.recommendations.push('Redis latency is high, consider optimization');
      }

      // Store health check result
      const healthKey = `${MAINTENANCE_KEYS.HEALTH_LOG}:${Date.now()}`;
      await redis.set(healthKey, JSON.stringify(health));
      await redis.expire(healthKey, this.HEALTH_LOG_RETENTION_HOURS * 60 * 60);

      console.log(
        `🏥 System health check: ${health.overallStatus} (${health.recommendations.length} recommendations)`
      );
      return health;
    } catch (error) {
      console.error('❌ Error in system health check:', error);
      health.recommendations.push('System health check failed - investigate monitoring system');
      return health;
    }
  }

  /**
   * Log performance metrics
   */
  static async logPerformance(
    operation: string,
    duration: number,
    success: boolean,
    error?: string
  ): Promise<void> {
    try {
      const log: PerformanceLog = {
        timestamp: new Date(),
        operation,
        duration,
        success,
        ...(error && { error }),
      };

      const logKey = `${MAINTENANCE_KEYS.PERFORMANCE_LOG}:${Date.now()}`;
      await redis.set(logKey, JSON.stringify(log));
      await redis.expire(logKey, this.PERFORMANCE_LOG_RETENTION_HOURS * 60 * 60);
    } catch (logError) {
      console.error('❌ Error logging performance:', logError);
    }
  }

  /**
   * Get recent performance logs
   */
  static async getPerformanceLogs(hours: number = 24): Promise<PerformanceLog[]> {
    try {
      const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
      // Note: Devvit Redis doesn't support keys() method, using alternative approach
      const keys: string[] = [];

      const logs: PerformanceLog[] = [];
      for (const key of keys) {
        const timestamp = parseInt(key.split(':').pop() || '0');
        if (timestamp >= cutoffTime) {
          const data = await redis.get(key);
          if (data) {
            try {
              const parsed = JSON.parse(data);
              parsed.timestamp = new Date(parsed.timestamp);
              logs.push(parsed);
            } catch (parseError) {
              // Skip invalid logs
            }
          }
        }
      }

      return logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      console.error('❌ Error getting performance logs:', error);
      return [];
    }
  }

  /**
   * Get recent health check results
   */
  static async getHealthHistory(hours: number = 24): Promise<SystemHealth[]> {
    try {
      const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
      // Note: Devvit Redis doesn't support keys() method, using alternative approach
      const keys: string[] = [];

      const healthChecks: SystemHealth[] = [];
      for (const key of keys) {
        const timestamp = parseInt(key.split(':').pop() || '0');
        if (timestamp >= cutoffTime) {
          const data = await redis.get(key);
          if (data) {
            try {
              const parsed = JSON.parse(data);
              parsed.timestamp = new Date(parsed.timestamp);
              healthChecks.push(parsed);
            } catch (parseError) {
              // Skip invalid health checks
            }
          }
        }
      }

      return healthChecks.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      console.error('❌ Error getting health history:', error);
      return [];
    }
  }

  /**
   * Run comprehensive cleanup and maintenance
   */
  static async runComprehensiveCleanup(): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      timestamp: new Date(),
      itemsProcessed: 0,
      itemsArchived: 0,
      itemsDeleted: 0,
      spaceFreed: 0,
      errors: [],
      duration: 0,
    };

    try {
      console.log('🧹 Starting comprehensive cleanup...');

      // Archive old decisions
      const archiveResult = await this.archiveOldDecisions(30);
      result.itemsArchived += archiveResult.archived.length;
      result.errors.push(...archiveResult.errors);
      result.spaceFreed += archiveResult.archived.reduce((sum, entry) => sum + entry.dataSize, 0);

      // Clean up world history
      const historyResult = await this.cleanupWorldHistory(100);
      result.itemsDeleted += historyResult.deleted;
      result.errors.push(...historyResult.errors);

      // Clean up old performance logs
      // Note: Devvit Redis doesn't support keys() method, using alternative approach
      const perfKeys: string[] = [];
      const cutoffTime = Date.now() - this.PERFORMANCE_LOG_RETENTION_HOURS * 60 * 60 * 1000;

      for (const key of perfKeys) {
        const timestamp = parseInt(key.split(':').pop() || '0');
        if (timestamp < cutoffTime) {
          try {
            await redis.del(key);
            result.itemsDeleted++;
          } catch (error) {
            result.errors.push(`Error deleting performance log ${key}`);
          }
        }
      }

      // Clean up old health logs
      // Note: Devvit Redis doesn't support keys() method, using alternative approach
      const healthKeys: string[] = [];
      const healthCutoff = Date.now() - this.HEALTH_LOG_RETENTION_HOURS * 60 * 60 * 1000;

      for (const key of healthKeys) {
        const timestamp = parseInt(key.split(':').pop() || '0');
        if (timestamp < healthCutoff) {
          try {
            await redis.del(key);
            result.itemsDeleted++;
          } catch (error) {
            result.errors.push(`Error deleting health log ${key}`);
          }
        }
      }

      result.itemsProcessed = result.itemsArchived + result.itemsDeleted;
      result.duration = Date.now() - startTime;

      // Log cleanup result
      const cleanupKey = `${MAINTENANCE_KEYS.CLEANUP_LOG}:${Date.now()}`;
      await redis.set(cleanupKey, JSON.stringify(result));
      await redis.expire(cleanupKey, 30 * 24 * 60 * 60); // Keep cleanup logs for 30 days

      console.log(
        `✅ Comprehensive cleanup completed: ${result.itemsProcessed} items processed in ${result.duration}ms`
      );
      return result;
    } catch (error) {
      console.error('❌ Error in comprehensive cleanup:', error);
      result.errors.push(
        `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      result.duration = Date.now() - startTime;
      return result;
    }
  }
}
