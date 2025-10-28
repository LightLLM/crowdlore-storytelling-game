import { describe, it, expect } from 'vitest';

describe('Core Game Logic', () => {
  describe('World Attribute Validation', () => {
    it('validates attribute bounds (-10 to +10)', () => {
      const clampAttribute = (value: number): number => {
        return Math.max(-10, Math.min(10, value));
      };

      expect(clampAttribute(15)).toBe(10);
      expect(clampAttribute(-15)).toBe(-10);
      expect(clampAttribute(5)).toBe(5);
      expect(clampAttribute(0)).toBe(0);
    });

    it('validates attribute effect limits (-3 to +3)', () => {
      const validateEffect = (effect: number): boolean => {
        return effect >= -3 && effect <= 3;
      };

      expect(validateEffect(3)).toBe(true);
      expect(validateEffect(-3)).toBe(true);
      expect(validateEffect(0)).toBe(true);
      expect(validateEffect(4)).toBe(false);
      expect(validateEffect(-4)).toBe(false);
    });

    it('applies attribute changes correctly', () => {
      const applyChanges = (current: Record<string, number>, changes: Record<string, number>) => {
        const result = { ...current };
        for (const [key, change] of Object.entries(changes)) {
          if (result[key] !== undefined) {
            result[key] = Math.max(-10, Math.min(10, result[key] + change));
          }
        }
        return result;
      };

      const currentState = { stability: 5, curiosity: -2, survival: 0, reputation: 8 };
      const changes = { stability: -2, curiosity: 3, survival: 1, reputation: -1 };

      const newState = applyChanges(currentState, changes);

      expect(newState.stability).toBe(3);
      expect(newState.curiosity).toBe(1);
      expect(newState.survival).toBe(1);
      expect(newState.reputation).toBe(7);
    });
  });

  describe('Vote Processing Logic', () => {
    it('determines winning option correctly', () => {
      const determineWinner = (votes: Record<string, number>) => {
        let maxVotes = 0;
        let winner = '';

        for (const [option, count] of Object.entries(votes)) {
          if (count > maxVotes) {
            maxVotes = count;
            winner = option;
          }
        }

        return { winner, votes: maxVotes };
      };

      const voteData = {
        'option-a': 45,
        'option-b': 30,
        'option-c': 25,
      };

      const result = determineWinner(voteData);
      expect(result.winner).toBe('option-a');
      expect(result.votes).toBe(45);
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

    it('handles tie votes consistently', () => {
      const handleTie = (votes: Record<string, number>) => {
        const maxVotes = Math.max(...Object.values(votes));
        const winners = Object.entries(votes)
          .filter(([, count]) => count === maxVotes)
          .map(([option]) => option);

        // Return first option in case of tie (consistent behavior)
        return winners.sort()[0];
      };

      const tieVotes = {
        'option-a': 33,
        'option-b': 33,
        'option-c': 34,
      };

      const winner = handleTie(tieVotes);
      expect(winner).toBe('option-c');

      const perfectTie = {
        'option-a': 33,
        'option-b': 33,
        'option-c': 33,
      };

      const tieWinner = handleTie(perfectTie);
      expect(tieWinner).toBe('option-a'); // First alphabetically
    });
  });

  describe('User Statistics Logic', () => {
    it('calculates winning percentage correctly', () => {
      const calculateWinningPercentage = (totalVotes: number, winningVotes: number): number => {
        if (totalVotes === 0) return 0;
        return Math.round((winningVotes / totalVotes) * 100);
      };

      expect(calculateWinningPercentage(10, 6)).toBe(60);
      expect(calculateWinningPercentage(20, 12)).toBe(60);
      expect(calculateWinningPercentage(0, 0)).toBe(0);
      expect(calculateWinningPercentage(3, 1)).toBe(33);
    });

    it('tracks voting streaks correctly', () => {
      const updateStreak = (currentStreak: number, longestStreak: number, wasWinner: boolean) => {
        if (wasWinner) {
          const newStreak = currentStreak + 1;
          return {
            currentStreak: newStreak,
            longestStreak: Math.max(longestStreak, newStreak),
          };
        } else {
          return {
            currentStreak: 0,
            longestStreak,
          };
        }
      };

      // Test winning vote
      let result = updateStreak(2, 5, true);
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(5);

      // Test new longest streak
      result = updateStreak(4, 4, true);
      expect(result.currentStreak).toBe(5);
      expect(result.longestStreak).toBe(5);

      // Test losing vote
      result = updateStreak(3, 5, false);
      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(5);
    });
  });

  describe('Content Validation Logic', () => {
    it('validates ASCII art constraints', () => {
      const validateASCII = (lines: string[]): boolean => {
        if (lines.length < 4 || lines.length > 12) return false;

        for (const line of lines) {
          if (line.length > 24) return false;
        }

        return true;
      };

      const validASCII = ['    /\\    ', '   /  \\   ', '  /____\\  ', ' |      | '];

      const tooShort = ['  /\\  ', ' /  \\ '];
      const tooLong = Array(15).fill('  line  ');
      const tooWide = ['This line is definitely way too long for ASCII art'];

      expect(validateASCII(validASCII)).toBe(true);
      expect(validateASCII(tooShort)).toBe(false);
      expect(validateASCII(tooLong)).toBe(false);
      expect(validateASCII(tooWide)).toBe(false);
    });

    it('filters inappropriate content', () => {
      const containsInappropriateContent = (text: string): boolean => {
        const inappropriateTerms = ['trump', 'biden', 'sex', 'hate', 'kill'];
        const lowerText = text.toLowerCase();
        return inappropriateTerms.some((term) => lowerText.includes(term));
      };

      expect(containsInappropriateContent('The village explores peacefully')).toBe(false);
      expect(containsInappropriateContent('Political content about Trump')).toBe(true);
      expect(containsInappropriateContent('Hateful message')).toBe(true);
      expect(containsInappropriateContent('Build a bridge')).toBe(false);
    });
  });

  describe('Leaderboard Logic', () => {
    it('sorts leaderboard entries correctly', () => {
      const sortLeaderboard = (entries: Array<{ userId: string; score: number }>) => {
        return entries
          .sort((a, b) => b.score - a.score)
          .map((entry, index) => ({
            ...entry,
            rank: index + 1,
          }));
      };

      const unsortedEntries = [
        { userId: 'user2', score: 120 },
        { userId: 'user1', score: 150 },
        { userId: 'user3', score: 100 },
      ];

      const sorted = sortLeaderboard(unsortedEntries);

      expect(sorted[0].userId).toBe('user1');
      expect(sorted[0].rank).toBe(1);
      expect(sorted[1].userId).toBe('user2');
      expect(sorted[1].rank).toBe(2);
      expect(sorted[2].userId).toBe('user3');
      expect(sorted[2].rank).toBe(3);
    });

    it('calculates rank changes correctly', () => {
      const calculateRankChange = (currentRank: number, previousRank: number): number => {
        if (previousRank === 0) return 0; // New entry
        return previousRank - currentRank; // Positive = moved up, negative = moved down
      };

      expect(calculateRankChange(1, 3)).toBe(2); // Moved up 2 positions
      expect(calculateRankChange(3, 1)).toBe(-2); // Moved down 2 positions
      expect(calculateRankChange(2, 2)).toBe(0); // No change
      expect(calculateRankChange(1, 0)).toBe(0); // New entry
    });
  });
});
