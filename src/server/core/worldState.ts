/**
 * WorldState service for Redis operations in CrowdLore
 */

import { redis } from '@devvit/web/server';
import type {
  WorldState,
  WorldAttributes,
  WorldAttributeEffects,
  WorldHistoryEntry,
} from '../../shared/types/index.js';

// Redis keys for world state data
const REDIS_KEYS = {
  WORLD_ATTRIBUTES: 'crowdlore:world:attributes',
  LORE_LOG: 'crowdlore:world:lore_log',
  WORLD_VERSION: 'crowdlore:world:version',
  WORLD_LAST_UPDATED: 'crowdlore:world:last_updated',
  WORLD_HISTORY: 'crowdlore:world:history',
} as const;

// Default world state for initialization
const DEFAULT_WORLD_ATTRIBUTES: WorldAttributes = {
  stability: 0,
  curiosity: 0,
  survival: 0,
  reputation: 0,
};

const DEFAULT_LORE_LOG = [
  'In the beginning, your people settled in this mysterious land, ready to face whatever challenges await.',
  'The community looks to you for guidance as they navigate the unknown paths ahead.',
  'Every decision shapes the destiny of your world and the stories that will be told for generations.',
];

/**
 * WorldState service class for managing world data in Redis
 */
export class WorldStateService {
  /**
   * Initialize world state with default values if not exists
   */
  static async initialize(): Promise<WorldState> {
    console.log('🌍 Initializing world state...');

    try {
      // Check if world state already exists
      const existingAttributes = await redis.get(REDIS_KEYS.WORLD_ATTRIBUTES);

      if (existingAttributes) {
        console.log('✅ World state already exists, loading current state');
        return await this.getCurrentState();
      }

      // Initialize with default values
      const initialState: WorldState = {
        attributes: DEFAULT_WORLD_ATTRIBUTES,
        loreLog: DEFAULT_LORE_LOG,
        lastUpdated: new Date(),
        version: 1,
      };

      await this.saveWorldState(initialState);
      console.log('🆕 World state initialized with default values');

      return initialState;
    } catch (error) {
      console.error('❌ Error initializing world state:', error);
      throw new Error('Failed to initialize world state');
    }
  }

  /**
   * Get current world state from Redis
   */
  static async getCurrentState(): Promise<WorldState> {
    try {
      const [attributesJson, loreLogJson, versionStr, lastUpdatedStr] = await Promise.all([
        redis.get(REDIS_KEYS.WORLD_ATTRIBUTES),
        redis.get(REDIS_KEYS.LORE_LOG),
        redis.get(REDIS_KEYS.WORLD_VERSION),
        redis.get(REDIS_KEYS.WORLD_LAST_UPDATED),
      ]);

      const attributes: WorldAttributes = attributesJson
        ? JSON.parse(attributesJson)
        : DEFAULT_WORLD_ATTRIBUTES;

      const loreLog: string[] = loreLogJson ? JSON.parse(loreLogJson) : DEFAULT_LORE_LOG;

      const version = versionStr ? parseInt(versionStr) : 1;
      const lastUpdated = lastUpdatedStr ? new Date(lastUpdatedStr) : new Date();

      return {
        attributes,
        loreLog,
        lastUpdated,
        version,
      };
    } catch (error) {
      console.error('❌ Error getting current world state:', error);
      throw new Error('Failed to retrieve world state');
    }
  }

  /**
   * Save complete world state to Redis
   */
  static async saveWorldState(worldState: WorldState): Promise<void> {
    try {
      // Use individual Redis operations instead of pipeline for Devvit compatibility
      await Promise.all([
        redis.set(REDIS_KEYS.WORLD_ATTRIBUTES, JSON.stringify(worldState.attributes)),
        redis.set(REDIS_KEYS.LORE_LOG, JSON.stringify(worldState.loreLog)),
        redis.set(REDIS_KEYS.WORLD_VERSION, worldState.version.toString()),
        redis.set(REDIS_KEYS.WORLD_LAST_UPDATED, worldState.lastUpdated.toISOString()),
      ]);
      console.log('💾 World state saved successfully');
    } catch (error) {
      console.error('❌ Error saving world state:', error);
      throw new Error('Failed to save world state');
    }
  }

  /**
   * Update world attributes with effects and bounds checking
   */
  static async updateAttributes(
    effects: WorldAttributeEffects,
    loreEntry?: string,
    dilemmaId?: string
  ): Promise<WorldState> {
    try {
      const currentState = await this.getCurrentState();
      const newAttributes = { ...currentState.attributes };

      // Apply effects with bounds checking (-10 to +10)
      for (const [attribute, effect] of Object.entries(effects)) {
        if (effect !== undefined && attribute in newAttributes) {
          const currentValue = newAttributes[attribute as keyof WorldAttributes];
          const newValue = Math.max(-10, Math.min(10, currentValue + effect));
          newAttributes[attribute as keyof WorldAttributes] = newValue;

          console.log(`📊 ${attribute}: ${currentValue} + ${effect} = ${newValue}`);
        }
      }

      // Update lore log if provided
      const newLoreLog = loreEntry ? [...currentState.loreLog, loreEntry] : currentState.loreLog;

      // Keep only last 50 lore entries to prevent unbounded growth
      if (newLoreLog.length > 50) {
        newLoreLog.splice(0, newLoreLog.length - 50);
      }

      const updatedState: WorldState = {
        attributes: newAttributes,
        loreLog: newLoreLog,
        lastUpdated: new Date(),
        version: currentState.version + 1,
      };

      await this.saveWorldState(updatedState);

      // Invalidate cache after update
      const { CacheService } = await import('./cacheService.js');
      await CacheService.invalidateWorldState();

      // Save to history if there were attribute changes
      if (Object.keys(effects).length > 0) {
        await this.addToHistory({
          timestamp: updatedState.lastUpdated,
          dilemmaId: dilemmaId || '',
          attributesBefore: currentState.attributes,
          attributesAfter: newAttributes,
          changes: effects,
          loreEntry: loreEntry || '',
        });
      }

      return updatedState;
    } catch (error) {
      console.error('❌ Error updating world attributes:', error);
      throw new Error('Failed to update world attributes');
    }
  }

  /**
   * Add entry to lore log
   */
  static async addLoreEntry(entry: string): Promise<WorldState> {
    try {
      const currentState = await this.getCurrentState();
      const newLoreLog = [...currentState.loreLog, entry];

      // Keep only last 50 entries
      if (newLoreLog.length > 50) {
        newLoreLog.splice(0, newLoreLog.length - 50);
      }

      const updatedState: WorldState = {
        ...currentState,
        loreLog: newLoreLog,
        lastUpdated: new Date(),
        version: currentState.version + 1,
      };

      await this.saveWorldState(updatedState);

      // Invalidate cache after update
      const { CacheService } = await import('./cacheService.js');
      await CacheService.invalidateWorldState();

      return updatedState;
    } catch (error) {
      console.error('❌ Error adding lore entry:', error);
      throw new Error('Failed to add lore entry');
    }
  }

  /**
   * Reset world state to default values
   */
  static async resetWorldState(): Promise<WorldState> {
    try {
      console.log('🔄 Resetting world state to defaults...');

      const resetState: WorldState = {
        attributes: DEFAULT_WORLD_ATTRIBUTES,
        loreLog: DEFAULT_LORE_LOG,
        lastUpdated: new Date(),
        version: 1,
      };

      await this.saveWorldState(resetState);

      // Clear history
      await redis.del(REDIS_KEYS.WORLD_HISTORY);

      console.log('✅ World state reset successfully');
      return resetState;
    } catch (error) {
      console.error('❌ Error resetting world state:', error);
      throw new Error('Failed to reset world state');
    }
  }

  /**
   * Add entry to world history
   */
  static async addToHistory(entry: WorldHistoryEntry): Promise<void> {
    try {
      const historyJson = await redis.get(REDIS_KEYS.WORLD_HISTORY);
      const history: WorldHistoryEntry[] = historyJson ? JSON.parse(historyJson) : [];

      history.push(entry);

      // Keep only last 100 history entries
      if (history.length > 100) {
        history.splice(0, history.length - 100);
      }

      await redis.set(REDIS_KEYS.WORLD_HISTORY, JSON.stringify(history));
      console.log('📚 Added entry to world history');
    } catch (error) {
      console.error('❌ Error adding to world history:', error);
      throw new Error('Failed to add to world history');
    }
  }

  /**
   * Get world history entries
   */
  static async getHistory(limit = 20): Promise<WorldHistoryEntry[]> {
    try {
      const historyJson = await redis.get(REDIS_KEYS.WORLD_HISTORY);
      const history: WorldHistoryEntry[] = historyJson ? JSON.parse(historyJson) : [];

      // Return most recent entries first
      return history.slice(-limit).reverse();
    } catch (error) {
      console.error('❌ Error getting world history:', error);
      throw new Error('Failed to retrieve world history');
    }
  }

  /**
   * Get paginated world history entries
   */
  static async getPaginatedHistory(
    page = 1,
    pageSize = 20
  ): Promise<{
    history: WorldHistoryEntry[];
    totalEntries: number;
    page: number;
    pageSize: number;
  }> {
    try {
      const historyJson = await redis.get(REDIS_KEYS.WORLD_HISTORY);
      const fullHistory: WorldHistoryEntry[] = historyJson ? JSON.parse(historyJson) : [];

      // Sort by timestamp descending (most recent first)
      const sortedHistory = fullHistory.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const totalEntries = sortedHistory.length;
      const offset = (page - 1) * pageSize;
      const paginatedHistory = sortedHistory.slice(offset, offset + pageSize);

      return {
        history: paginatedHistory,
        totalEntries,
        page,
        pageSize,
      };
    } catch (error) {
      console.error('❌ Error getting paginated world history:', error);
      throw new Error('Failed to retrieve paginated world history');
    }
  }

  /**
   * Get attribute trends (last 10 changes)
   */
  static async getAttributeTrends(): Promise<
    Record<keyof WorldAttributes, { change: number; direction: 'up' | 'down' | 'stable' }>
  > {
    try {
      const history = await this.getHistory(10);
      const trends: Record<
        keyof WorldAttributes,
        { change: number; direction: 'up' | 'down' | 'stable' }
      > = {
        stability: { change: 0, direction: 'stable' },
        curiosity: { change: 0, direction: 'stable' },
        survival: { change: 0, direction: 'stable' },
        reputation: { change: 0, direction: 'stable' },
      };

      // Calculate total changes over recent history
      for (const entry of history) {
        for (const [attr, change] of Object.entries(entry.changes)) {
          if (attr in trends && change !== undefined) {
            trends[attr as keyof WorldAttributes].change += change;
          }
        }
      }

      // Determine direction
      for (const attr of Object.keys(trends) as Array<keyof WorldAttributes>) {
        const change = trends[attr].change;
        if (change > 0) {
          trends[attr].direction = 'up';
        } else if (change < 0) {
          trends[attr].direction = 'down';
        } else {
          trends[attr].direction = 'stable';
        }
      }

      return trends;
    } catch (error) {
      console.error('❌ Error getting attribute trends:', error);
      throw new Error('Failed to get attribute trends');
    }
  }
}
