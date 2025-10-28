import { describe, it, expect } from 'vitest';

describe('World State Management', () => {
  describe('Attribute Updates', () => {
    it('applies attribute changes within bounds', () => {
      const updateAttributes = (
        currentState: Record<string, number>,
        changes: Record<string, number>
      ) => {
        const newState = { ...currentState };

        for (const [attribute, change] of Object.entries(changes)) {
          if (newState[attribute] !== undefined) {
            newState[attribute] = Math.max(-10, Math.min(10, newState[attribute] + change));
          }
        }

        return newState;
      };

      const currentState = { stability: 5, curiosity: -3, survival: 0, reputation: 8 };
      const changes = { stability: -2, curiosity: 3, survival: 1, reputation: -1 };

      const newState = updateAttributes(currentState, changes);

      expect(newState.stability).toBe(3);
      expect(newState.curiosity).toBe(0);
      expect(newState.survival).toBe(1);
      expect(newState.reputation).toBe(7);
    });

    it('enforces attribute bounds (-10 to +10)', () => {
      const clampAttribute = (value: number) => Math.max(-10, Math.min(10, value));

      expect(clampAttribute(15)).toBe(10);
      expect(clampAttribute(-15)).toBe(-10);
      expect(clampAttribute(5)).toBe(5);
      expect(clampAttribute(0)).toBe(0);
    });

    it('maintains attribute history', () => {
      const addToHistory = (history: string[], newEntry: string, maxLength = 100) => {
        const updatedHistory = [...history, newEntry];

        if (updatedHistory.length > maxLength) {
          return updatedHistory.slice(-maxLength);
        }

        return updatedHistory;
      };

      const history = Array(99).fill('Old entry');
      const newHistory = addToHistory(history, 'New entry');

      expect(newHistory).toHaveLength(100);
      expect(newHistory[newHistory.length - 1]).toBe('New entry');

      // Test overflow
      const overflowHistory = addToHistory(newHistory, 'Another entry');
      expect(overflowHistory).toHaveLength(100);
      expect(overflowHistory[0]).toBe('Old entry');
      expect(overflowHistory[overflowHistory.length - 1]).toBe('Another entry');
    });
  });

  describe('Lore Management', () => {
    it('adds new lore entries', () => {
      const addLoreEntry = (currentLore: string[], newEntry: string) => {
        return [...currentLore, newEntry];
      };

      const currentLore = ['The village was founded.', 'A stranger arrived.'];
      const newLore = addLoreEntry(currentLore, 'The people chose to explore.');

      expect(newLore).toHaveLength(3);
      expect(newLore[2]).toBe('The people chose to explore.');
    });

    it('maintains lore log size limit', () => {
      const maintainLoreLimit = (lore: string[], maxEntries = 100) => {
        if (lore.length > maxEntries) {
          return lore.slice(-maxEntries);
        }
        return lore;
      };

      const largeLore = Array(105).fill('Old lore entry');
      const trimmedLore = maintainLoreLimit(largeLore);

      expect(trimmedLore).toHaveLength(100);
      expect(trimmedLore[0]).toBe('Old lore entry');
    });
  });

  describe('State Validation', () => {
    it('returns default state when none exists', () => {
      const getDefaultState = () => ({
        stability: 0,
        curiosity: 0,
        survival: 0,
        reputation: 0,
      });

      const defaultState = getDefaultState();

      expect(defaultState.stability).toBe(0);
      expect(defaultState.curiosity).toBe(0);
      expect(defaultState.survival).toBe(0);
      expect(defaultState.reputation).toBe(0);
    });

    it('validates state structure', () => {
      const validateState = (state: any) => {
        const requiredAttributes = ['stability', 'curiosity', 'survival', 'reputation'];

        return requiredAttributes.every(
          (attr) => typeof state[attr] === 'number' && state[attr] >= -10 && state[attr] <= 10
        );
      };

      const validState = { stability: 3, curiosity: -2, survival: 5, reputation: 0 };
      const invalidState = { stability: 15, curiosity: 'invalid', survival: -2 };

      expect(validateState(validState)).toBe(true);
      expect(validateState(invalidState)).toBe(false);
    });
  });
});
