/**
 * Task Runner for CrowdLore Automation
 * Handles background task execution and scheduling
 */

import { redis } from '@devvit/web/server';
import { AutomationEngine } from './automationEngine.js';
import type { DilemmaTheme } from '../../shared/types/dilemma.js';

// Redis keys for task runner state
const TASK_RUNNER_KEYS = {
  LAST_RUN: 'crowdlore:taskrunner:last_run',
  RUNNING: 'crowdlore:taskrunner:running',
  TASK_QUEUE: 'crowdlore:taskrunner:queue',
} as const;

export type TaskType = 'daily_cycle' | 'cleanup' | 'health_check' | 'maintenance';

export type Task = {
  id: string;
  type: TaskType;
  scheduledAt: Date;
  priority: number;
  params?: Record<string, unknown> | undefined;
};

export type TaskResult = {
  taskId: string;
  type: TaskType;
  success: boolean;
  startTime: Date;
  endTime: Date;
  duration: number;
  result?: Record<string, unknown>;
  error?: string;
};

/**
 * Background task runner for automated operations
 */
export class TaskRunner {
  private static readonly CHECK_INTERVAL_MINUTES = 5;
  private static readonly TASK_TIMEOUT_MINUTES = 30;

  /**
   * Check if task runner should execute tasks
   */
  static async shouldRun(): Promise<boolean> {
    try {
      // Check if already running
      const isRunning = await redis.get(TASK_RUNNER_KEYS.RUNNING);
      if (isRunning === 'true') {
        return false;
      }

      // Check if enough time has passed since last run
      const lastRunStr = await redis.get(TASK_RUNNER_KEYS.LAST_RUN);
      if (lastRunStr) {
        const lastRun = new Date(lastRunStr);
        const minutesSinceRun = (Date.now() - lastRun.getTime()) / (1000 * 60);
        return minutesSinceRun >= this.CHECK_INTERVAL_MINUTES;
      }

      return true;
    } catch (error) {
      console.error('❌ Error checking task runner status:', error);
      return false;
    }
  }

  /**
   * Set running state
   */
  static async setRunning(running: boolean): Promise<void> {
    try {
      if (running) {
        await redis.set(TASK_RUNNER_KEYS.RUNNING, 'true');
        await redis.expire(TASK_RUNNER_KEYS.RUNNING, this.TASK_TIMEOUT_MINUTES * 60);
      } else {
        await redis.del(TASK_RUNNER_KEYS.RUNNING);
        await redis.set(TASK_RUNNER_KEYS.LAST_RUN, new Date().toISOString());
      }
    } catch (error) {
      console.error('❌ Error setting task runner state:', error);
    }
  }

  /**
   * Add task to queue
   */
  static async queueTask(task: Omit<Task, 'id'>): Promise<string> {
    try {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const fullTask: Task = {
        id: taskId,
        ...task,
      };

      // Note: Devvit Redis doesn't support lpush, using set with timestamp-based key
      const queueKey = `${TASK_RUNNER_KEYS.TASK_QUEUE}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      await redis.set(queueKey, JSON.stringify(fullTask));
      console.log(`📋 Task queued: ${task.type} (${taskId})`);
      return taskId;
    } catch (error) {
      console.error('❌ Error queueing task:', error);
      throw error;
    }
  }

  /**
   * Get next task from queue
   */
  static async getNextTask(): Promise<Task | null> {
    try {
      // Note: Devvit Redis doesn't support rpop, using alternative approach
      // For now, return null as we can't implement proper queue without list operations
      const taskJson = null;
      if (!taskJson) {
        return null;
      }

      const task = JSON.parse(taskJson);
      task.scheduledAt = new Date(task.scheduledAt);
      return task;
    } catch (error) {
      console.error('❌ Error getting next task:', error);
      return null;
    }
  }

  /**
   * Execute a single task
   */
  static async executeTask(task: Task): Promise<TaskResult> {
    const startTime = new Date();
    const result: TaskResult = {
      taskId: task.id,
      type: task.type,
      success: false,
      startTime,
      endTime: startTime,
      duration: 0,
    };

    try {
      console.log(`⚡ Executing task: ${task.type} (${task.id})`);

      let taskResult: Record<string, unknown>;

      switch (task.type) {
        case 'daily_cycle':
          taskResult = await AutomationEngine.runAutomatedDailyCycle(
            task.params?.theme as DilemmaTheme
          );
          break;

        case 'cleanup':
          taskResult = await AutomationEngine.runDataCleanup();
          break;

        case 'health_check':
          taskResult = await AutomationEngine.runHealthCheck();
          break;

        case 'maintenance':
          taskResult = await AutomationEngine.runMaintenanceCycle();
          break;

        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      result.success = true;
      result.result = taskResult;
    } catch (error) {
      console.error(`❌ Task execution failed: ${task.type} (${task.id})`, error);
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    result.endTime = new Date();
    result.duration = result.endTime.getTime() - result.startTime.getTime();

    console.log(
      `${result.success ? '✅' : '❌'} Task completed: ${task.type} (${result.duration}ms)`
    );
    return result;
  }

  /**
   * Run task runner cycle
   */
  static async runCycle(): Promise<{
    executed: TaskResult[];
    queued: number;
    skipped: string[];
  }> {
    if (!(await this.shouldRun())) {
      return { executed: [], queued: 0, skipped: ['Task runner not ready'] };
    }

    try {
      await this.setRunning(true);
      console.log('🚀 Task runner cycle started');

      const executed: TaskResult[] = [];
      const skipped: string[] = [];

      // Queue automatic tasks based on automation engine checks
      let queuedCount = 0;

      // Check for daily cycle
      if (await AutomationEngine.shouldRunDailyCycle()) {
        await this.queueTask({
          type: 'daily_cycle',
          scheduledAt: new Date(),
          priority: 1,
        });
        queuedCount++;
      }

      // Check for cleanup
      if (await AutomationEngine.shouldRunCleanup()) {
        await this.queueTask({
          type: 'cleanup',
          scheduledAt: new Date(),
          priority: 2,
        });
        queuedCount++;
      }

      // Check for health check
      if (await AutomationEngine.shouldRunHealthCheck()) {
        await this.queueTask({
          type: 'health_check',
          scheduledAt: new Date(),
          priority: 3,
        });
        queuedCount++;
      }

      // Execute queued tasks
      let task = await this.getNextTask();
      while (task) {
        // Check if task is due
        if (task.scheduledAt.getTime() <= Date.now()) {
          const result = await this.executeTask(task);
          executed.push(result);
        } else {
          // Task not due yet, put it back
          await this.queueTask({
            type: task.type,
            scheduledAt: task.scheduledAt,
            priority: task.priority,
            params: task.params || {},
          });
          skipped.push(`Task ${task.type} not due yet`);
        }

        task = await this.getNextTask();
      }

      console.log(
        `✅ Task runner cycle completed: ${executed.length} executed, ${queuedCount} queued`
      );
      return { executed, queued: queuedCount, skipped };
    } catch (error) {
      console.error('❌ Error in task runner cycle:', error);
      return {
        executed: [],
        queued: 0,
        skipped: [`Task runner error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    } finally {
      await this.setRunning(false);
    }
  }

  /**
   * Get queue status
   */
  static async getQueueStatus(): Promise<{
    queueLength: number;
    isRunning: boolean;
    lastRun?: Date;
    nextRun?: Date;
  }> {
    try {
      // Note: Devvit Redis doesn't support llen, using alternative approach
      const queueLength = 0;
      const isRunning = (await redis.get(TASK_RUNNER_KEYS.RUNNING)) === 'true';

      let lastRun: Date | undefined;
      const lastRunStr = await redis.get(TASK_RUNNER_KEYS.LAST_RUN);
      if (lastRunStr) {
        lastRun = new Date(lastRunStr);
      }

      let nextRun: Date | undefined;
      if (lastRun) {
        nextRun = new Date(lastRun.getTime() + this.CHECK_INTERVAL_MINUTES * 60 * 1000);
      }

      return {
        queueLength,
        isRunning,
        ...(lastRun && { lastRun }),
        ...(nextRun && { nextRun }),
      };
    } catch (error) {
      console.error('❌ Error getting queue status:', error);
      return { queueLength: 0, isRunning: false };
    }
  }

  /**
   * Clear task queue
   */
  static async clearQueue(): Promise<number> {
    try {
      // Note: Devvit Redis doesn't support llen, using alternative approach
      const length = 0;
      await redis.del(TASK_RUNNER_KEYS.TASK_QUEUE);
      console.log(`🗑️ Task queue cleared: ${length} tasks removed`);
      return length;
    } catch (error) {
      console.error('❌ Error clearing task queue:', error);
      return 0;
    }
  }

  /**
   * Schedule a task for future execution
   */
  static async scheduleTask(
    type: TaskType,
    scheduledAt: Date,
    priority: number = 5,
    params?: Record<string, unknown>
  ): Promise<string> {
    return this.queueTask({
      type,
      scheduledAt,
      priority,
      params: params || {},
    });
  }

  /**
   * Schedule daily cycle for specific time
   */
  static async scheduleDailyCycle(scheduledAt: Date, theme?: string): Promise<string> {
    return this.scheduleTask('daily_cycle', scheduledAt, 1, { theme });
  }

  /**
   * Schedule cleanup for specific time
   */
  static async scheduleCleanup(scheduledAt: Date): Promise<string> {
    return this.scheduleTask('cleanup', scheduledAt, 2);
  }

  /**
   * Force run maintenance cycle immediately
   */
  static async forceMaintenanceCycle(): Promise<TaskResult> {
    const task: Task = {
      id: `force-maintenance-${Date.now()}`,
      type: 'maintenance',
      scheduledAt: new Date(),
      priority: 0,
    };

    return this.executeTask(task);
  }
}
