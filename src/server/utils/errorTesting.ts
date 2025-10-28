/**
 * Error testing utilities for CrowdLore
 * Used to test system behavior under various failure scenarios
 */

import { Request, Response } from 'express';
import { redis } from '@devvit/web/server';
import { APIError } from '../middleware/errorHandler.js';
import type { APIResponse } from '../../shared/types/api.js';

export interface ErrorTestScenario {
  name: string;
  description: string;
  execute: () => Promise<void>;
  cleanup?: () => Promise<void>;
}

export class ErrorTestingService {
  private static scenarios: Map<string, ErrorTestScenario> = new Map();
  private static activeTests: Set<string> = new Set();

  /**
   * Register error test scenarios
   */
  static registerScenarios(): void {
    // Redis connection failure
    this.scenarios.set('redis-failure', {
      name: 'Redis Connection Failure',
      description: 'Simulates Redis connection failure',
      execute: async () => {
        // Simulate Redis failure by throwing an error
        throw new APIError(503, 'SERVICE_UNAVAILABLE', 'Redis connection failed');
      },
    });

    // Network timeout simulation
    this.scenarios.set('network-timeout', {
      name: 'Network Timeout',
      description: 'Simulates network timeout scenarios',
      execute: async () => {
        // Simulate timeout by creating a long-running operation
        await new Promise((resolve) => setTimeout(resolve, 35000)); // Longer than request timeout
      },
    });

    // Memory pressure simulation
    this.scenarios.set('memory-pressure', {
      name: 'Memory Pressure',
      description: 'Simulates high memory usage',
      execute: async () => {
        const largeArray: string[] = [];
        try {
          // Create large objects to simulate memory pressure
          for (let i = 0; i < 100000; i++) {
            largeArray.push('x'.repeat(1000));
          }
          console.log('✅ Memory pressure scenario triggered');
        } finally {
          // Cleanup
          largeArray.length = 0;
        }
      },
    });

    // API validation errors
    this.scenarios.set('validation-errors', {
      name: 'Validation Errors',
      description: 'Tests various validation error scenarios',
      execute: async () => {
        const errors = [
          new APIError(400, 'VALIDATION_ERROR', 'Invalid dilemma ID format'),
          new APIError(400, 'VALIDATION_ERROR', 'Missing required field: optionId'),
          new APIError(422, 'CONTENT_MODERATION_FAILED', 'Content contains inappropriate material'),
        ];

        for (const error of errors) {
          console.log('✅ Validation error scenario:', error.message);
          throw error;
        }
      },
    });

    // Rate limiting simulation
    this.scenarios.set('rate-limiting', {
      name: 'Rate Limiting',
      description: 'Simulates rate limiting scenarios',
      execute: async () => {
        throw new APIError(429, 'RATE_LIMITED', 'Too many requests from this user');
      },
    });

    // Service unavailable
    this.scenarios.set('service-unavailable', {
      name: 'Service Unavailable',
      description: 'Simulates service unavailability',
      execute: async () => {
        throw new APIError(
          503,
          'SERVICE_UNAVAILABLE',
          'Dilemma generation service temporarily unavailable'
        );
      },
    });

    // Concurrent request handling
    this.scenarios.set('concurrent-load', {
      name: 'Concurrent Load',
      description: 'Tests system under concurrent request load',
      execute: async () => {
        const promises = [];
        for (let i = 0; i < 50; i++) {
          promises.push(this.simulateApiCall(i));
        }
        await Promise.all(promises);
        console.log('✅ Concurrent load scenario completed');
      },
    });

    // Data corruption simulation
    this.scenarios.set('data-corruption', {
      name: 'Data Corruption',
      description: 'Simulates corrupted data scenarios',
      execute: async () => {
        // Store invalid JSON in Redis
        await redis.set('crowdlore:test:corrupted', 'invalid-json-data{');

        try {
          const data = await redis.get('crowdlore:test:corrupted');
          JSON.parse(data || '');
        } catch (error) {
          console.log('✅ Data corruption scenario triggered:', error);
          throw new APIError(500, 'DATA_CORRUPTION', 'Corrupted data detected in storage');
        }
      },
      cleanup: async () => {
        await redis.del('crowdlore:test:corrupted');
      },
    });
  }

  /**
   * Execute a specific error test scenario
   */
  static async executeScenario(scenarioName: string): Promise<{
    success: boolean;
    error?: string;
    duration: number;
  }> {
    const scenario = this.scenarios.get(scenarioName);
    if (!scenario) {
      throw new Error(`Unknown test scenario: ${scenarioName}`);
    }

    if (this.activeTests.has(scenarioName)) {
      throw new Error(`Test scenario ${scenarioName} is already running`);
    }

    this.activeTests.add(scenarioName);
    const startTime = Date.now();

    try {
      console.log(`🧪 Starting error test scenario: ${scenario.name}`);
      await scenario.execute();

      const duration = Date.now() - startTime;
      console.log(`✅ Error test scenario completed: ${scenario.name} (${duration}ms)`);

      return { success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.log(
        `❌ Error test scenario failed: ${scenario.name} - ${errorMessage} (${duration}ms)`
      );

      return { success: false, error: errorMessage, duration };
    } finally {
      // Cleanup
      if (scenario.cleanup) {
        try {
          await scenario.cleanup();
        } catch (cleanupError) {
          console.warn(`⚠️ Cleanup failed for ${scenario.name}:`, cleanupError);
        }
      }

      this.activeTests.delete(scenarioName);
    }
  }

  /**
   * Get all available test scenarios
   */
  static getScenarios(): { name: string; description: string }[] {
    return Array.from(this.scenarios.entries()).map(([name, scenario]) => ({
      name,
      description: scenario.description,
    }));
  }

  /**
   * Get currently active tests
   */
  static getActiveTests(): string[] {
    return Array.from(this.activeTests);
  }

  /**
   * Run comprehensive error testing suite
   */
  static async runComprehensiveTest(): Promise<{
    totalTests: number;
    passed: number;
    failed: number;
    results: Array<{
      scenario: string;
      success: boolean;
      error?: string;
      duration: number;
    }>;
  }> {
    const scenarios = Array.from(this.scenarios.keys());
    const results = [];
    let passed = 0;
    let failed = 0;

    console.log('🧪 Starting comprehensive error testing suite...');

    for (const scenarioName of scenarios) {
      try {
        const result = await this.executeScenario(scenarioName);
        results.push({ scenario: scenarioName, ...result });

        if (result.success) {
          passed++;
        } else {
          failed++;
        }

        // Wait between tests to avoid overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        failed++;
        results.push({
          scenario: scenarioName,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: 0,
        });
      }
    }

    console.log(`✅ Comprehensive error testing completed: ${passed} passed, ${failed} failed`);

    return {
      totalTests: scenarios.length,
      passed,
      failed,
      results,
    };
  }

  /**
   * Simulate API call for load testing
   */
  private static async simulateApiCall(index: number): Promise<void> {
    const delay = Math.random() * 100; // Random delay 0-100ms
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Simulate some work without Redis operations
    const data = { index, timestamp: Date.now() };
    console.log(`Load test ${index}:`, data);
  }

  /**
   * Create error test endpoint handler
   */
  static createTestEndpoint() {
    return async (req: Request, res: Response): Promise<void> => {
      const { scenario, action } = req.body;

      try {
        if (action === 'list') {
          const scenarios = this.getScenarios();
          const activeTests = this.getActiveTests();

          const response: APIResponse<{
            scenarios: typeof scenarios;
            activeTests: string[];
          }> = {
            success: true,
            data: { scenarios, activeTests },
            timestamp: new Date(),
            requestId: `test-${Date.now()}`,
          };

          res.json(response);
          return;
        }

        if (action === 'run-all') {
          const results = await this.runComprehensiveTest();

          const response: APIResponse<typeof results> = {
            success: true,
            data: results,
            timestamp: new Date(),
            requestId: `test-${Date.now()}`,
          };

          res.json(response);
          return;
        }

        if (action === 'run' && scenario) {
          const result = await this.executeScenario(scenario);

          const response: APIResponse<typeof result> = {
            success: true,
            data: result,
            timestamp: new Date(),
            requestId: `test-${Date.now()}`,
          };

          res.json(response);
          return;
        }

        throw new APIError(400, 'VALIDATION_ERROR', 'Invalid test action or missing scenario');
      } catch (error) {
        if (error instanceof APIError) {
          throw error;
        }

        throw new APIError(500, 'INTERNAL_ERROR', 'Error testing failed');
      }
    };
  }
}

// Initialize scenarios
ErrorTestingService.registerScenarios();
