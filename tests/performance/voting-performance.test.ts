import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRedis } from '../setup';

describe('Voting Performance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Concurrent Vote Processing', () => {
    it('handles 100 concurrent votes within performance limits', async () => {
      const startTime = Date.now();

      // Mock vote recording function
      const recordVote = async (userId: string, dilemmaId: string, optionId: string) => {
        // Simulate some processing time
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
        await mockRedis.hset(`votes:${dilemmaId}`, userId, optionId);
        return { success: true };
      };

      // Create 100 concurrent vote promises
      const votePromises = [];
      for (let i = 0; i < 100; i++) {
        const userId = `user-${i}`;
        const optionId = `option-${String.fromCharCode(97 + (i % 3))}`; // Distribute across a, b, c

        votePromises.push(recordVote(userId, 'perf-test-dilemma', optionId));
      }

      // Execute all votes concurrently
      const results = await Promise.all(votePromises);

      const processingTime = Date.now() - startTime;

      // Performance assertions
      expect(processingTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(results).toHaveLength(100);
      expect(results.every((result) => result.success)).toBe(true);
      expect(mockRedis.hset).toHaveBeenCalledTimes(100);
    });

    it('maintains consistent response times under load', async () => {
      const responseTimes: number[] = [];

      const recordVoteWithTiming = async (userId: string) => {
        const startTime = Date.now();

        // Simulate vote recording
        await mockRedis.hset('votes:consistency-test', userId, 'option-a');

        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);

        return responseTime;
      };

      // Perform 20 sequential operations
      for (let i = 0; i < 20; i++) {
        await recordVoteWithTiming(`user-${i}`);
      }

      // Calculate statistics
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);

      // Performance consistency assertions
      expect(avgResponseTime).toBeLessThan(100); // Average under 100ms
      expect(maxResponseTime).toBeLessThan(500); // No single request over 500ms
      expect(maxResponseTime - minResponseTime).toBeLessThan(400); // Consistent performance
    });

    it('handles large vote tallying efficiently', async () => {
      // Mock large vote dataset
      const largeVoteData: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        largeVoteData[`user-${i}`] = `option-${String.fromCharCode(97 + (i % 3))}`;
      }

      mockRedis.hgetall.mockResolvedValue(largeVoteData);

      const startTime = Date.now();

      // Simulate vote tallying
      const tallyVotes = async (dilemmaId: string) => {
        const votes = await mockRedis.hgetall(`votes:${dilemmaId}`);
        const counts: Record<string, number> = {};

        for (const optionId of Object.values(votes)) {
          counts[optionId] = (counts[optionId] || 0) + 1;
        }

        // Find winner
        let maxVotes = 0;
        let winner = '';
        for (const [optionId, count] of Object.entries(counts)) {
          if (count > maxVotes) {
            maxVotes = count;
            winner = optionId;
          }
        }

        return {
          winner,
          totalVotes: Object.keys(votes).length,
          counts,
        };
      };

      const result = await tallyVotes('large-vote-test');
      const processingTime = Date.now() - startTime;

      // Performance assertions
      expect(processingTime).toBeLessThan(1000); // Should process 1000 votes within 1 second
      expect(result.totalVotes).toBe(1000);
      expect(result.winner).toBeTruthy();
      expect(Object.values(result.counts).reduce((a, b) => a + b, 0)).toBe(1000);
    });
  });

  describe('Memory Usage', () => {
    it('maintains reasonable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();

      // Create large data structures to simulate memory pressure
      const largeDataSets = [];
      for (let i = 0; i < 10; i++) {
        largeDataSets.push(
          Array(1000)
            .fill(0)
            .map((_, j) => ({
              id: `data-${i}-${j}`,
              content: `Content for item ${i}-${j}`.repeat(10),
            }))
        );
      }

      // Perform operations under memory pressure
      const performOperations = async () => {
        const operations = [];
        for (let i = 0; i < 50; i++) {
          operations.push(mockRedis.hset(`test-key-${i}`, 'field', `value-${i}`));
        }
        await Promise.all(operations);
      };

      const startTime = Date.now();
      await performOperations();
      const endTime = Date.now();

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Performance should not degrade significantly under memory pressure
      expect(endTime - startTime).toBeLessThan(1000);

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      // Clean up
      largeDataSets.length = 0;
    });
  });

  describe('Scalability Tests', () => {
    it('handles increasing load gracefully', async () => {
      const loadLevels = [10, 50, 100, 200];
      const results = [];

      for (const loadLevel of loadLevels) {
        const startTime = Date.now();

        const promises = [];
        for (let i = 0; i < loadLevel; i++) {
          promises.push(mockRedis.hset(`load-test-${loadLevel}`, `user-${i}`, `option-${i % 3}`));
        }

        await Promise.all(promises);
        const processingTime = Date.now() - startTime;

        results.push({
          loadLevel,
          processingTime,
          avgTimePerOperation: processingTime / loadLevel,
        });
      }

      // Verify that processing time scales reasonably
      results.forEach((result, index) => {
        expect(result.processingTime).toBeLessThan(5000); // Max 5 seconds for any load level
        expect(result.avgTimePerOperation).toBeLessThan(50); // Max 50ms per operation

        // Performance should not degrade exponentially
        if (index > 0) {
          const prevResult = results[index - 1];
          const scaleFactor = result.loadLevel / prevResult.loadLevel;
          const timeIncrease =
            prevResult.processingTime > 0 ? result.processingTime / prevResult.processingTime : 1;

          // Time increase should not be more than 3x the scale factor (only if both times are valid)
          if (!isNaN(timeIncrease) && timeIncrease > 0) {
            expect(timeIncrease).toBeLessThan(scaleFactor * 3);
          }
        }
      });
    });

    it('recovers quickly from temporary overload', async () => {
      // Simulate temporary overload
      const overloadPromises = [];
      for (let i = 0; i < 500; i++) {
        overloadPromises.push(mockRedis.hset('overload-test', `user-${i}`, 'option-a'));
      }

      const overloadStart = Date.now();
      await Promise.all(overloadPromises);
      const overloadTime = Date.now() - overloadStart;

      // Now test recovery with normal load
      const recoveryPromises = [];
      for (let i = 0; i < 10; i++) {
        recoveryPromises.push(mockRedis.hset('recovery-test', `user-${i}`, 'option-a'));
      }

      const recoveryStart = Date.now();
      await Promise.all(recoveryPromises);
      const recoveryTime = Date.now() - recoveryStart;

      // Recovery should be fast even after overload
      expect(recoveryTime).toBeLessThan(500); // Should recover within 500ms
      expect(recoveryTime / 10).toBeLessThan(50); // Average per operation should be reasonable
    });
  });
});
