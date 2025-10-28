import { describe, it, expect } from 'vitest';

describe('Vote Processing Logic', () => {
  describe('Vote Tallying', () => {
    it('determines winning option correctly', () => {
      const processVotes = (votes: Record<string, number>) => {
        let maxVotes = 0;
        let winningOption = '';
        const totalVotes = Object.values(votes).reduce((sum, count) => sum + count, 0);

        for (const [optionId, count] of Object.entries(votes)) {
          if (count > maxVotes) {
            maxVotes = count;
            winningOption = optionId;
          }
        }

        return {
          winningOption: { id: winningOption },
          totalVotes,
          summary: `The people chose ${winningOption} with ${maxVotes} votes`,
        };
      };

      const voteData = {
        'option-a': 45,
        'option-b': 30,
        'option-c': 25,
      };

      const result = processVotes(voteData);
      expect(result.winningOption.id).toBe('option-a');
      expect(result.totalVotes).toBe(100);
      expect(result.summary).toContain('option-a');
    });

    it('handles tie votes consistently', () => {
      const handleTieVotes = (votes: Record<string, number>) => {
        const maxVotes = Math.max(...Object.values(votes));
        const winners = Object.entries(votes)
          .filter(([, count]) => count === maxVotes)
          .map(([option]) => option);

        // Return first option alphabetically for consistency
        return winners.sort()[0];
      };

      const tieVotes = {
        'option-a': 33,
        'option-b': 33,
        'option-c': 34,
      };

      const perfectTie = {
        'option-a': 33,
        'option-b': 33,
        'option-c': 33,
      };

      expect(handleTieVotes(tieVotes)).toBe('option-c');
      expect(handleTieVotes(perfectTie)).toBe('option-a');
    });

    it('calculates vote percentages correctly', () => {
      const calculatePercentages = (votes: Record<string, number>) => {
        const total = Object.values(votes).reduce((sum, count) => sum + count, 0);
        const percentages: Record<string, number> = {};

        for (const [option, count] of Object.entries(votes)) {
          percentages[option] = Math.round((count / total) * 100);
        }

        return percentages;
      };

      const voteData = {
        'option-a': 50,
        'option-b': 30,
        'option-c': 20,
      };

      const percentages = calculatePercentages(voteData);
      expect(percentages['option-a']).toBe(50);
      expect(percentages['option-b']).toBe(30);
      expect(percentages['option-c']).toBe(20);
    });
  });

  describe('User Statistics Updates', () => {
    it('tracks user voting statistics', () => {
      const updateUserStats = (
        currentStats: {
          totalVotes: number;
          winningVotes: number;
          currentStreak: number;
          longestStreak: number;
        },
        wasWinner: boolean
      ) => {
        const newStats = {
          totalVotes: currentStats.totalVotes + 1,
          winningVotes: currentStats.winningVotes + (wasWinner ? 1 : 0),
          currentStreak: wasWinner ? currentStats.currentStreak + 1 : 0,
          longestStreak: currentStats.longestStreak,
        };

        if (newStats.currentStreak > newStats.longestStreak) {
          newStats.longestStreak = newStats.currentStreak;
        }

        return newStats;
      };

      const initialStats = { totalVotes: 5, winningVotes: 3, currentStreak: 2, longestStreak: 4 };

      // Test winning vote
      const afterWin = updateUserStats(initialStats, true);
      expect(afterWin.totalVotes).toBe(6);
      expect(afterWin.winningVotes).toBe(4);
      expect(afterWin.currentStreak).toBe(3);
      expect(afterWin.longestStreak).toBe(4);

      // Test losing vote
      const afterLoss = updateUserStats(initialStats, false);
      expect(afterLoss.totalVotes).toBe(6);
      expect(afterLoss.winningVotes).toBe(3);
      expect(afterLoss.currentStreak).toBe(0);
      expect(afterLoss.longestStreak).toBe(4);
    });
  });
});
