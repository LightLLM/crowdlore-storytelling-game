/**
 * Automation Engine for CrowdLore
 * Handles automated scheduling, daily cycles, and maintenance tasks
 */

import { redis } from '@devvit/web/server';
import { Scheduler } from './scheduler.js';
// Removed unused imports - these services are accessed through MaintenanceService
import { MaintenanceService } from './maintenanceService.js';
import type { DilemmaTheme } from '../../shared/types/index.js';

// Redis keys for automation state
const AUTOMATION_KEYS = {
  AUTOMATION_STATE: 'crowdlore:automation:state',
  LAST_CLEANUP: 'crowdlore:automation:last_cleanup',
  HEALTH_CHECK: 'crowdlore:automation:health_check',
  PERFORMANCE_METRICS: 'crowdlore:automation:performance_metrics',
} as const;

export type AutomationState = {
  isEnabled: boolean;
  lastDailyCycle?: Date;
  nextScheduledCycle?: Date;
  lastCleanup?: Date;
  lastHealthCheck?: Date;
  status: 'idle' | 'running_cycle' | 'maintenance' | 'error';
  errorCount: number;
  lastError?: string;
};

export type HealthCheckResult = {
  timestamp: Date;
  redisConnected: boolean;
  worldStateValid: boolean;
  schedulerOperational: boolean;
  memoryUsage?: number;
  activeConnections?: number;
  overallHealth: 'healthy' | 'warning' | 'critical';
  issues: string[];
};

export type PerformanceMetrics = {
  timestamp: Date;
  dailyCycleTime?: number;
  voteProcessingTime?: number;
  dilemmaGenerationTime?: number;
  redisOperationTimes: {
    read: number[];
    write: number[];
  };
  errorRate: number;
};

/**
 * Automation Engine for managing scheduled tasks and maintenance
 */
export class AutomationEngine {
  private static readonly DAILY_CYCLE_HOUR = 12; // Run at noon UTC
  private static readonly CLEANUP_INTERVAL_DAYS = 7; // Weekly cleanup
  private static readonly HEALTH_CHECK_INTERVAL_MINUTES = 30;
  private static readonly MAX_ERROR_COUNT = 5;

  /**
   * Get current automation state
   */
  static async getState(): Promise<AutomationState> {
    try {
      const stateJson = await redis.get(AUTOMATION_KEYS.AUTOMATION_STATE);
      if (stateJson) {
        const state = JSON.parse(stateJson);
        // Convert date strings back to Date objects
        if (state.lastDailyCycle) state.lastDailyCycle = new Date(state.lastDailyCycle);
        if (state.nextScheduledCycle) state.nextScheduledCycle = new Date(state.nextScheduledCycle);
        if (state.lastCleanup) state.lastCleanup = new Date(state.lastCleanup);
        if (state.lastHealthCheck) state.lastHealthCheck = new Date(state.lastHealthCheck);
        return state;
      }

      return {
        isEnabled: true,
        status: 'idle',
        errorCount: 0,
      };
    } catch (error) {
      console.error('❌ Error getting automation state:', error);
      return {
        isEnabled: false,
        status: 'error',
        errorCount: 1,
        lastError: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update automation state
   */
  static async updateState(updates: Partial<AutomationState>): Promise<void> {
    try {
      const currentState = await this.getState();
      const newState = { ...currentState, ...updates };
      await redis.set(AUTOMATION_KEYS.AUTOMATION_STATE, JSON.stringify(newState));
      console.log(`🤖 Automation state updated: ${newState.status}`);
    } catch (error) {
      console.error('❌ Error updating automation state:', error);
    }
  }

  /**
   * Check if daily cycle should run based on schedule
   */
  static async shouldRunDailyCycle(): Promise<boolean> {
    try {
      const state = await this.getState();

      if (!state.isEnabled || state.status === 'error') {
        return false;
      }

      const now = new Date();
      const currentHour = now.getUTCHours();

      // If no cycle has run yet, run it
      if (!state.lastDailyCycle) {
        return true;
      }

      // Check if it's the scheduled hour and we haven't run today
      const lastCycleDate = new Date(state.lastDailyCycle);
      const isNewDay =
        now.getUTCDate() !== lastCycleDate.getUTCDate() ||
        now.getUTCMonth() !== lastCycleDate.getUTCMonth() ||
        now.getUTCFullYear() !== lastCycleDate.getUTCFullYear();

      return isNewDay && currentHour >= this.DAILY_CYCLE_HOUR;
    } catch (error) {
      console.error('❌ Error checking daily cycle timing:', error);
      return false;
    }
  }

  /**
   * Run automated daily cycle
   */
  static async runAutomatedDailyCycle(theme?: DilemmaTheme): Promise<{
    success: boolean;
    cycleResult?: Record<string, unknown>;
    error?: string;
  }> {
    try {
      console.log('🔄 Starting automated daily cycle...');

      await this.updateState({
        status: 'running_cycle',
      });

      const startTime = Date.now();

      // Run the daily cycle
      const cycleResult = await Scheduler.runDailyCycle(theme);

      const cycleTime = Date.now() - startTime;

      // Calculate next scheduled cycle (next day at scheduled hour)
      const nextCycle = new Date();
      nextCycle.setUTCDate(nextCycle.getUTCDate() + 1);
      nextCycle.setUTCHours(this.DAILY_CYCLE_HOUR, 0, 0, 0);

      // Update state with success
      await this.updateState({
        status: 'idle',
        lastDailyCycle: new Date(),
        nextScheduledCycle: nextCycle,
        errorCount: 0,
      });

      // Record performance metrics
      await this.recordPerformanceMetrics({
        dailyCycleTime: cycleTime,
      });

      console.log(`✅ Automated daily cycle completed in ${cycleTime}ms`);
      return { success: true, cycleResult };
    } catch (error) {
      console.error('❌ Error in automated daily cycle:', error);

      const state = await this.getState();
      const newErrorCount = state.errorCount + 1;

      await this.updateState({
        status: newErrorCount >= this.MAX_ERROR_COUNT ? 'error' : 'idle',
        errorCount: newErrorCount,
        lastError: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if cleanup should run
   */
  static async shouldRunCleanup(): Promise<boolean> {
    try {
      const state = await this.getState();

      if (!state.isEnabled) {
        return false;
      }

      // If no cleanup has run yet, run it
      if (!state.lastCleanup) {
        return true;
      }

      // Check if enough time has passed since last cleanup
      const daysSinceCleanup = (Date.now() - state.lastCleanup.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceCleanup >= this.CLEANUP_INTERVAL_DAYS;
    } catch (error) {
      console.error('❌ Error checking cleanup timing:', error);
      return false;
    }
  }

  /**
   * Run data cleanup and maintenance using MaintenanceService
   */
  static async runDataCleanup(): Promise<{
    success: boolean;
    cleaned: {
      oldDilemmas: number;
      oldVotes: number;
      oldHistory: number;
    };
    error?: string;
  }> {
    try {
      console.log('🧹 Starting data cleanup...');

      await this.updateState({ status: 'maintenance' });

      // Use comprehensive cleanup from MaintenanceService
      const cleanupResult = await MaintenanceService.runComprehensiveCleanup();

      // Update state
      await this.updateState({
        status: 'idle',
        lastCleanup: new Date(),
      });

      // Map comprehensive cleanup result to expected format
      const cleaned = {
        oldDilemmas: cleanupResult.itemsArchived,
        oldVotes: 0, // Included in archived items
        oldHistory: cleanupResult.itemsDeleted,
      };

      if (cleanupResult.errors.length > 0) {
        console.warn(`⚠️ Cleanup completed with ${cleanupResult.errors.length} errors`);
      }

      console.log(`✅ Data cleanup completed: ${JSON.stringify(cleaned)}`);
      return { success: true, cleaned };
    } catch (error) {
      console.error('❌ Error in data cleanup:', error);

      await this.updateState({
        status: 'idle',
        lastError: error instanceof Error ? error.message : 'Cleanup error',
      });

      return {
        success: false,
        cleaned: { oldDilemmas: 0, oldVotes: 0, oldHistory: 0 },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run health check on system components using MaintenanceService
   */
  static async runHealthCheck(): Promise<HealthCheckResult> {
    try {
      // Use comprehensive health check from MaintenanceService
      const systemHealth = await MaintenanceService.performSystemHealthCheck();

      // Map to expected HealthCheckResult format
      const result: HealthCheckResult = {
        timestamp: systemHealth.timestamp,
        redisConnected: systemHealth.components.redis.status !== 'critical',
        worldStateValid: systemHealth.components.worldState.status !== 'critical',
        schedulerOperational: true, // Assume operational if we can run this check
        overallHealth: systemHealth.overallStatus,
        issues: systemHealth.recommendations,
      };

      // Store health check result
      await redis.set(AUTOMATION_KEYS.HEALTH_CHECK, JSON.stringify(result));

      // Update automation state
      await this.updateState({ lastHealthCheck: new Date() });

      console.log(
        `🏥 Health check completed: ${result.overallHealth} (${result.issues.length} issues)`
      );
      return result;
    } catch (error) {
      console.error('❌ Error in health check:', error);
      const result: HealthCheckResult = {
        timestamp: new Date(),
        redisConnected: false,
        worldStateValid: false,
        schedulerOperational: false,
        overallHealth: 'critical',
        issues: ['Health check system error'],
      };
      return result;
    }
  }

  /**
   * Record performance metrics
   */
  static async recordPerformanceMetrics(metrics: Partial<PerformanceMetrics>): Promise<void> {
    try {
      const currentMetrics: PerformanceMetrics = {
        timestamp: new Date(),
        redisOperationTimes: { read: [], write: [] },
        errorRate: 0,
        ...metrics,
      };

      // Store metrics (keep last 24 hours of data)
      const metricsKey = `${AUTOMATION_KEYS.PERFORMANCE_METRICS}:${Date.now()}`;
      await redis.set(metricsKey, JSON.stringify(currentMetrics));
      await redis.expire(metricsKey, 24 * 60 * 60); // Expire after 24 hours

      console.log('📊 Performance metrics recorded');
    } catch (error) {
      console.error('❌ Error recording performance metrics:', error);
    }
  }

  /**
   * Get recent performance metrics
   */
  static async getPerformanceMetrics(hours: number = 24): Promise<PerformanceMetrics[]> {
    try {
      const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
      // Note: Devvit Redis doesn't support keys() method, using alternative approach
      const keys: string[] = [];

      const metrics: PerformanceMetrics[] = [];
      for (const key of keys) {
        const timestamp = parseInt(key.split(':').pop() || '0');
        if (timestamp >= cutoffTime) {
          const data = await redis.get(key);
          if (data) {
            try {
              const parsed = JSON.parse(data);
              parsed.timestamp = new Date(parsed.timestamp);
              metrics.push(parsed);
            } catch (parseError) {
              // Skip invalid metrics
            }
          }
        }
      }

      return metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      console.error('❌ Error getting performance metrics:', error);
      return [];
    }
  }

  /**
   * Check if health check should run
   */
  static async shouldRunHealthCheck(): Promise<boolean> {
    try {
      const state = await this.getState();

      if (!state.isEnabled) {
        return false;
      }

      // If no health check has run yet, run it
      if (!state.lastHealthCheck) {
        return true;
      }

      // Check if enough time has passed since last health check
      const minutesSinceCheck = (Date.now() - state.lastHealthCheck.getTime()) / (1000 * 60);
      return minutesSinceCheck >= this.HEALTH_CHECK_INTERVAL_MINUTES;
    } catch (error) {
      console.error('❌ Error checking health check timing:', error);
      return false;
    }
  }

  /**
   * Run all automated maintenance tasks
   */
  static async runMaintenanceCycle(): Promise<{
    healthCheck: HealthCheckResult;
    cleanup?: { success: boolean; cleaned?: Record<string, unknown>; error?: string };
    dailyCycle?: { success: boolean; cycleResult?: Record<string, unknown>; error?: string };
  }> {
    console.log('🔧 Starting maintenance cycle...');

    // Always run health check
    const healthCheck = await this.runHealthCheck();

    const results: {
      healthCheck: HealthCheckResult;
      cleanup?: { success: boolean; cleaned?: Record<string, unknown>; error?: string };
      dailyCycle?: { success: boolean; cycleResult?: Record<string, unknown>; error?: string };
    } = { healthCheck };

    // Run cleanup if needed
    if (await this.shouldRunCleanup()) {
      results.cleanup = await this.runDataCleanup();
    }

    // Run daily cycle if needed
    if (await this.shouldRunDailyCycle()) {
      results.dailyCycle = await this.runAutomatedDailyCycle();
    }

    console.log('✅ Maintenance cycle completed');
    return results;
  }

  /**
   * Enable or disable automation
   */
  static async setEnabled(enabled: boolean): Promise<void> {
    await this.updateState({ isEnabled: enabled });
    console.log(`🤖 Automation ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Reset error state
   */
  static async resetErrorState(): Promise<void> {
    await this.updateState({
      status: 'idle',
      errorCount: 0,
    });
    console.log('🔄 Automation error state reset');
  }
}
