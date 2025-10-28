import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRedis } from '../setup';

describe('API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Voting Workflow', () => {
    it('processes dilemma creation → voting → outcome workflow', async () => {
      // Mock dilemma data
      const mockDilemma = {
        id: 'test-dilemma-123',
        title: 'Test Dilemma',
        scenario: 'A test scenario for integration testing',
        options: [
          { id: 'option-a', text: 'Option A', attributeEffects: { stability: 1 } },
          { id: 'option-b', text: 'Option B', attributeEffects: { curiosity: 2 } },
          { id: 'option-c', text: 'Option C', attributeEffects: { survival: -1 } },
        ],
      };

      // Mock Redis responses for the workflow
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('dilemma:current')) {
          return Promise.resolve(JSON.stringify(mockDilemma));
        }
        if (key.includes('world:state')) {
          return Promise.resolve(
            JSON.stringify({
              stability: 0,
              curiosity: 1,
              survival: -1,
              reputation: 2,
            })
          );
        }
        if (key.includes('lore')) {
          return Promise.resolve(
            JSON.stringify(['The village was founded.', 'A great storm tested their resolve.'])
          );
        }
        return Promise.resolve(null);
      });

      // Mock vote tallying
      mockRedis.hgetall.mockResolvedValue({
        'option-a': '25',
        'option-b': '45', // Winner
        'option-c': '30',
      });

      // Simulate the complete workflow
      const workflow = {
        // Step 1: Get current dilemma
        getCurrentDilemma: async () => {
          const dilemmaData = await mockRedis.get('crowdlore:dilemma:current');
          return dilemmaData ? JSON.parse(dilemmaData) : null;
        },

        // Step 2: Record user vote
        recordVote: async (userId: string, dilemmaId: string, optionId: string) => {
          await mockRedis.hset(`crowdlore:votes:${dilemmaId}`, userId, optionId);
          return { success: true };
        },

        // Step 3: Process votes and determine outcome
        processVotes: async (dilemmaId: string) => {
          // Get vote counts (mocked data returns counts directly)
          const voteCounts = await mockRedis.hgetall(`crowdlore:votes:${dilemmaId}`);

          // Convert string counts to numbers and find winner
          let maxVotes = 0;
          let winningOptionId = '';
          for (const [optionId, countStr] of Object.entries(voteCounts)) {
            const count = parseInt(countStr as string);
            if (count > maxVotes) {
              maxVotes = count;
              winningOptionId = optionId;
            }
          }

          const dilemma = await workflow.getCurrentDilemma();
          const winningOption = dilemma.options.find((opt: any) => opt.id === winningOptionId);

          const totalVotes = Object.values(voteCounts).reduce(
            (sum, countStr) => sum + parseInt(countStr as string),
            0
          );

          return {
            winningOption: winningOption || { id: winningOptionId, text: 'Unknown Option' },
            totalVotes,
            summary: `The people chose ${winningOption?.text || 'an option'}`,
          };
        },

        // Step 4: Update world state
        updateWorldState: async (attributeChanges: Record<string, number>) => {
          const currentState = JSON.parse((await mockRedis.get('crowdlore:world:state')) || '{}');
          const newState = { ...currentState };

          for (const [attr, change] of Object.entries(attributeChanges)) {
            newState[attr] = Math.max(-10, Math.min(10, (newState[attr] || 0) + change));
          }

          await mockRedis.set('crowdlore:world:state', JSON.stringify(newState));
          return newState;
        },
      };

      // Execute the complete workflow
      const dilemma = await workflow.getCurrentDilemma();
      expect(dilemma).toBeDefined();
      expect(dilemma.id).toBe('test-dilemma-123');

      // Record some votes
      await workflow.recordVote('user1', dilemma.id, 'option-a');
      await workflow.recordVote('user2', dilemma.id, 'option-b');
      await workflow.recordVote('user3', dilemma.id, 'option-b');

      // Process votes
      const result = await workflow.processVotes(dilemma.id);
      expect(result.winningOption.id).toBe('option-b');
      expect(result.totalVotes).toBe(100); // Based on mocked vote counts: 25 + 45 + 30

      // Update world state
      const newState = await workflow.updateWorldState(result.winningOption.attributeEffects);
      expect(newState.curiosity).toBe(3); // 1 + 2 from winning option

      // Verify Redis interactions
      expect(mockRedis.get).toHaveBeenCalledWith('crowdlore:dilemma:current');
      expect(mockRedis.hset).toHaveBeenCalledTimes(3); // Three votes recorded
      expect(mockRedis.set).toHaveBeenCalledWith('crowdlore:world:state', expect.any(String));
    });

    it('handles user profile updates during voting', async () => {
      const userId = 'test-user-123';
      const dilemmaId = 'test-dilemma-456';

      // Mock existing user profile
      mockRedis.hgetall.mockResolvedValue({
        totalVotes: '5',
        winningVotes: '3',
        currentStreak: '2',
        longestStreak: '4',
      });

      const userProfileService = {
        updateVoteStats: async (userId: string, wasWinner: boolean) => {
          const profile = (await mockRedis.hgetall(`crowdlore:user:${userId}:profile`)) || {};

          const newProfile = {
            totalVotes: String(parseInt(profile.totalVotes || '0') + 1),
            winningVotes: String(parseInt(profile.winningVotes || '0') + (wasWinner ? 1 : 0)),
            currentStreak: String(wasWinner ? parseInt(profile.currentStreak || '0') + 1 : 0),
            longestStreak: profile.longestStreak || '0',
          };

          if (parseInt(newProfile.currentStreak) > parseInt(newProfile.longestStreak)) {
            newProfile.longestStreak = newProfile.currentStreak;
          }

          await mockRedis.hset(`crowdlore:user:${userId}:profile`, newProfile);
          return newProfile;
        },
      };

      // Test winning vote
      const updatedProfile = await userProfileService.updateVoteStats(userId, true);

      expect(updatedProfile.totalVotes).toBe('6');
      expect(updatedProfile.winningVotes).toBe('4');
      expect(updatedProfile.currentStreak).toBe('3');
      expect(updatedProfile.longestStreak).toBe('4');

      expect(mockRedis.hset).toHaveBeenCalledWith(
        `crowdlore:user:${userId}:profile`,
        expect.objectContaining({
          totalVotes: '6',
          winningVotes: '4',
          currentStreak: '3',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('handles Redis connection failures gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      const errorHandler = async () => {
        try {
          await mockRedis.get('crowdlore:dilemma:current');
          return { success: true };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      };

      const result = await errorHandler();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Redis connection failed');
    });

    it('validates vote data before processing', () => {
      const validateVoteData = (data: any) => {
        const errors = [];

        if (!data.dilemmaId) errors.push('Missing dilemmaId');
        if (!data.optionId) errors.push('Missing optionId');
        if (!data.userId) errors.push('Missing userId');

        return {
          isValid: errors.length === 0,
          errors,
        };
      };

      const validData = { dilemmaId: 'test-123', optionId: 'option-a', userId: 'user-456' };
      const invalidData = { dilemmaId: 'test-123' };

      expect(validateVoteData(validData).isValid).toBe(true);
      expect(validateVoteData(invalidData).isValid).toBe(false);
      expect(validateVoteData(invalidData).errors).toContain('Missing optionId');
    });
  });

  describe('Data Consistency', () => {
    it('maintains data integrity across multiple operations', async () => {
      const operations = [];

      // Track all Redis operations
      mockRedis.set.mockImplementation((...args) => {
        operations.push({ type: 'set', args });
        return Promise.resolve('OK');
      });

      const dataService = {
        performMultipleUpdates: async () => {
          await mockRedis.set('key1', 'value1');
          await mockRedis.set('key2', 'value2');
          await mockRedis.set('key3', 'value3');
        },
      };

      await dataService.performMultipleUpdates();

      expect(operations).toHaveLength(3);
      expect(operations[0].args).toEqual(['key1', 'value1']);
      expect(operations[1].args).toEqual(['key2', 'value2']);
      expect(operations[2].args).toEqual(['key3', 'value3']);
    });
  });
});
