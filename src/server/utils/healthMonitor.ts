/**
 * Health monitoring service for CrowdLore
 * Monitors system health and provides recovery mechanisms
 */

import { redis } from '@devvit/web/server';
import { ErrorLogger, ErrorRecovery } from '../middleware/errorHandler.js';

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  responseTime: number;
  lastCheck: Date;
  details?: Record<string, unknown>;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  uptime: number;
  errorRate: number;
  lastUpdate: Date;
}

export class HealthMonitorService {
  private static checks: Map<string, () => Promise<HealthCheck>> = new Map();
  private static lastHealthCheck: SystemHealth | null = null;
  private static healthHistory: SystemHealth[] = [];
  private static maxHistorySize = 100;

  /**
   * Register health check functions
   */
  static registerHealthChecks(): void {
    // Redis health check
    this.checks.set('redis', async (): Promise<HealthCheck> => {
      const startTime = Date.now();

      try {
        await redis.get('ping'); // Test connection
        const responseTime = Date.now() - startTime;

        return {
          name: 'Redis Connection',
          status: responseTime < 100 ? 'healthy' : 'degraded',
          message: responseTime < 100 ? 'Connection healthy' : 'Connection slow',
          responseTime,
          lastCheck: new Date(),
          details: { responseTime },
        };
      } catch (error) {
        return {
          name: 'Redis Connection',
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Connection failed',
          responseTime: Date.now() - startTime,
          lastCheck: new Date(),
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
        };
      }
    });

    // Memory usage check
    this.checks.set('memory', async (): Promise<HealthCheck> => {
      const startTime = Date.now();

      try {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        const usagePercent = (heapUsedMB / heapTotalMB) * 100;

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        let message = `Memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${usagePercent.toFixed(1)}%)`;

        if (usagePercent > 90) {
          status = 'unhealthy';
          message = `High memory usage: ${usagePercent.toFixed(1)}%`;
        } else if (usagePercent > 75) {
          status = 'degraded';
          message = `Elevated memory usage: ${usagePercent.toFixed(1)}%`;
        }

        return {
          name: 'Memory Usage',
          status,
          message,
          responseTime: Date.now() - startTime,
          lastCheck: new Date(),
          details: {
            heapUsed: heapUsedMB,
            heapTotal: heapTotalMB,
            usagePercent: usagePercent.toFixed(1),
            rss: Math.round(memUsage.rss / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024),
          },
        };
      } catch (error) {
        return {
          name: 'Memory Usage',
          status: 'unhealthy',
          message: 'Failed to check memory usage',
          responseTime: Date.now() - startTime,
          lastCheck: new Date(),
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
        };
      }
    });

    // Error rate check
    this.checks.set('errors', async (): Promise<HealthCheck> => {
      const startTime = Date.now();

      try {
        const errorStats = ErrorLogger.getErrorStats();
        const recentErrors = errorStats.filter(
          (stat) => Date.now() - stat.lastOccurrence < 5 * 60 * 1000 // Last 5 minutes
        );

        const totalRecentErrors = recentErrors.reduce((sum, stat) => sum + stat.count, 0);

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        let message = `${totalRecentErrors} errors in last 5 minutes`;

        if (totalRecentErrors > 50) {
          status = 'unhealthy';
          message = `High error rate: ${totalRecentErrors} errors in last 5 minutes`;
        } else if (totalRecentErrors > 10) {
          status = 'degraded';
          message = `Elevated error rate: ${totalRecentErrors} errors in last 5 minutes`;
        }

        return {
          name: 'Error Rate',
          status,
          message,
          responseTime: Date.now() - startTime,
          lastCheck: new Date(),
          details: {
            recentErrors: totalRecentErrors,
            totalErrorTypes: errorStats.length,
            topErrors: recentErrors.slice(0, 3).map((stat) => ({
              type: stat.errorKey,
              count: stat.count,
            })),
          },
        };
      } catch (error) {
        return {
          name: 'Error Rate',
          status: 'unhealthy',
          message: 'Failed to check error rate',
          responseTime: Date.now() - startTime,
          lastCheck: new Date(),
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
        };
      }
    });

    // World state integrity check
    this.checks.set('worldstate', async (): Promise<HealthCheck> => {
      const startTime = Date.now();

      try {
        const worldStateJson = await redis.get('crowdlore:world:state');

        if (!worldStateJson) {
          return {
            name: 'World State',
            status: 'degraded',
            message: 'World state not initialized',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: { initialized: false },
          };
        }

        const worldState = JSON.parse(worldStateJson);
        const hasValidAttributes =
          worldState.attributes &&
          typeof worldState.attributes.stability === 'number' &&
          typeof worldState.attributes.curiosity === 'number' &&
          typeof worldState.attributes.survival === 'number' &&
          typeof worldState.attributes.reputation === 'number';

        if (!hasValidAttributes) {
          return {
            name: 'World State',
            status: 'unhealthy',
            message: 'World state data corrupted',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: { corrupted: true, attributes: worldState.attributes },
          };
        }

        return {
          name: 'World State',
          status: 'healthy',
          message: 'World state integrity verified',
          responseTime: Date.now() - startTime,
          lastCheck: new Date(),
          details: {
            initialized: true,
            attributes: worldState.attributes,
            lastUpdated: worldState.lastUpdated,
          },
        };
      } catch (error) {
        return {
          name: 'World State',
          status: 'unhealthy',
          message: 'Failed to verify world state',
          responseTime: Date.now() - startTime,
          lastCheck: new Date(),
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
        };
      }
    });
  }

  /**
   * Perform comprehensive health check
   */
  static async performHealthCheck(): Promise<SystemHealth> {
    const startTime = Date.now();
    const checks: HealthCheck[] = [];

    // Run all health checks in parallel
    const checkPromises = Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
      try {
        return await checkFn();
      } catch (error) {
        return {
          name,
          status: 'unhealthy' as const,
          message: error instanceof Error ? error.message : 'Health check failed',
          responseTime: 0,
          lastCheck: new Date(),
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
        };
      }
    });

    const checkResults = await Promise.all(checkPromises);
    checks.push(...checkResults);

    // Determine overall health
    const unhealthyCount = checks.filter((check) => check.status === 'unhealthy').length;
    const degradedCount = checks.filter((check) => check.status === 'degraded').length;

    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthyCount > 0) {
      overall = 'unhealthy';
    } else if (degradedCount > 0) {
      overall = 'degraded';
    }

    // Calculate error rate
    const errorStats = ErrorLogger.getErrorStats();
    const recentErrors = errorStats.filter(
      (stat) => Date.now() - stat.lastOccurrence < 5 * 60 * 1000
    );
    const errorRate = recentErrors.reduce((sum, stat) => sum + stat.count, 0);

    const health: SystemHealth = {
      overall,
      checks,
      uptime: process.uptime(),
      errorRate,
      lastUpdate: new Date(),
    };

    // Store in history
    this.healthHistory.push(health);
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }

    this.lastHealthCheck = health;

    // Log health status
    const duration = Date.now() - startTime;
    console.log(`🏥 Health check completed in ${duration}ms - Overall: ${overall}`);

    // Attempt recovery for unhealthy services
    if (overall === 'unhealthy') {
      await this.attemptRecovery(checks);
    }

    return health;
  }

  /**
   * Get last health check result
   */
  static getLastHealthCheck(): SystemHealth | null {
    return this.lastHealthCheck;
  }

  /**
   * Get health history
   */
  static getHealthHistory(limit: number = 50): SystemHealth[] {
    return this.healthHistory.slice(-limit);
  }

  /**
   * Attempt recovery for failed services
   */
  private static async attemptRecovery(checks: HealthCheck[]): Promise<void> {
    const unhealthyChecks = checks.filter((check) => check.status === 'unhealthy');

    for (const check of unhealthyChecks) {
      try {
        switch (check.name) {
          case 'Redis Connection':
            console.log('🔧 Attempting Redis recovery...');
            await ErrorRecovery.recoverRedisConnection();
            break;

          case 'World State':
            console.log('🔧 Attempting world state recovery...');
            await ErrorRecovery.recoverService('WorldState', async () => {
              const { WorldStateService } = await import('../core/worldState.js');
              await WorldStateService.initialize();
            });
            break;

          default:
            console.log(`⚠️ No recovery procedure for ${check.name}`);
        }
      } catch (error) {
        console.error(`❌ Recovery failed for ${check.name}:`, error);
      }
    }
  }

  /**
   * Start periodic health monitoring
   */
  static startPeriodicMonitoring(
    intervalMs: number = 5 * 60 * 1000
  ): ReturnType<typeof setInterval> {
    console.log(`🏥 Starting periodic health monitoring (every ${intervalMs / 1000}s)`);

    return setInterval(async () => {
      try {
        await this.performHealthCheck();

        // Clean up old error statistics
        ErrorLogger.clearOldStats();
      } catch (error) {
        console.error('❌ Periodic health check failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Get system metrics for monitoring
   */
  static getSystemMetrics(): {
    uptime: number;
    memory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
      arrayBuffers: number;
    };
    errorRate: number;
    healthStatus: string;
    lastHealthCheck: Date | null;
  } {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      errorRate: this.lastHealthCheck?.errorRate || 0,
      healthStatus: this.lastHealthCheck?.overall || 'unknown',
      lastHealthCheck: this.lastHealthCheck?.lastUpdate || null,
    };
  }
}

// Initialize health checks
HealthMonitorService.registerHealthChecks();
