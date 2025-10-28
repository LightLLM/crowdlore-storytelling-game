/**
 * StoryEvolution service for generating lore entries and managing story progression
 */

import { redis } from '@devvit/web/server';
import { WorldStateService } from './worldState.js';
import { ASCIIGenerator } from './ASCIIGenerator.js';
import type {
  VoteResult,
  StoryOutcome,
  LoreEntry,
  WorldState,
  DilemmaOption,
  WorldAttributeEffects,
} from '../../shared/types/index.js';

// Redis keys for story data
const REDIS_KEYS = {
  STORY_OUTCOMES: 'crowdlore:story:outcomes',
  LORE_ENTRIES: 'crowdlore:story:lore_entries',
  CANONICAL_EVENTS: 'crowdlore:story:canonical_events',
} as const;

// Type for canonical events
type CanonicalEvent = {
  id: string;
  dilemmaId: string;
  timestamp: Date;
  winningOption: DilemmaOption;
  voteMetrics: {
    totalVotes: number;
    winningVotes: number;
    participationRate: number;
  };
  attributeChanges: WorldAttributeEffects;
  loreEntry: LoreEntry;
  summary: string;
};

/**
 * StoryEvolution service class for managing story progression and lore generation
 */
export class StoryEvolution {
  /**
   * Process a vote result and evolve the story
   */
  static async evolveStory(voteResult: VoteResult): Promise<StoryOutcome> {
    try {
      console.log(`📖 Evolving story for dilemma: ${voteResult.dilemmaId}`);

      // Generate lore entry based on the winning choice
      const loreEntry = await this.generateLoreEntry(voteResult);

      // Update world attributes
      await this.updateWorldState(
        voteResult.attributeChanges,
        loreEntry.text,
        voteResult.dilemmaId
      );

      // Generate ASCII scene for the outcome
      const asciiScene = await ASCIIGenerator.generateScene(voteResult);

      // Record canonical story event
      await this.recordCanonicalEvent(voteResult, loreEntry);

      // Create story outcome
      const storyOutcome: StoryOutcome = {
        id: `story-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        dilemmaId: voteResult.dilemmaId,
        voteResult,
        loreEntry,
        asciiScene,
        communityReaction: this.generateCommunityReaction(voteResult),
        createdAt: new Date(),
      };

      // Store story outcome
      await this.storeStoryOutcome(storyOutcome);

      console.log(`✅ Story evolved successfully: ${storyOutcome.id}`);
      return storyOutcome;
    } catch (error) {
      console.error('❌ Error evolving story:', error);
      throw new Error('Failed to evolve story');
    }
  }

  /**
   * Generate a lore entry based on the winning choice
   */
  static async generateLoreEntry(voteResult: VoteResult): Promise<LoreEntry> {
    try {
      const { winningOption, voteData, summary } = voteResult;

      // Determine significance based on vote margin and attribute effects
      const significance = this.determineLoreSignificance(winningOption, voteData);

      // Generate lore text based on the winning option and its effects
      const loreText = this.generateLoreText(winningOption, summary, significance);

      const loreEntry: LoreEntry = {
        id: `lore-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        dilemmaId: voteResult.dilemmaId,
        timestamp: new Date(),
        text: loreText,
        category: this.determineLoreCategory(winningOption),
        significance,
      };

      // Store lore entry
      await this.storeLoreEntry(loreEntry);

      console.log(`📝 Generated lore entry: ${loreEntry.text}`);
      return loreEntry;
    } catch (error) {
      console.error('❌ Error generating lore entry:', error);
      throw new Error('Failed to generate lore entry');
    }
  }

  /**
   * Update world state with attribute changes and lore entry
   */
  static async updateWorldState(
    attributeChanges: WorldAttributeEffects,
    loreText: string,
    dilemmaId: string
  ): Promise<WorldState> {
    try {
      console.log(`🌍 Updating world state with changes:`, attributeChanges);

      // Update world attributes and add lore entry with dilemmaId
      const updatedState = await WorldStateService.updateAttributes(
        attributeChanges,
        loreText,
        dilemmaId
      );

      console.log(`✅ World state updated successfully`);
      return updatedState;
    } catch (error) {
      console.error('❌ Error updating world state:', error);
      throw new Error('Failed to update world state');
    }
  }

  /**
   * Record a canonical story event for historical tracking
   */
  static async recordCanonicalEvent(voteResult: VoteResult, loreEntry: LoreEntry): Promise<void> {
    try {
      const canonicalEvent = {
        id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        dilemmaId: voteResult.dilemmaId,
        timestamp: new Date(),
        winningOption: voteResult.winningOption,
        voteMetrics: {
          totalVotes: voteResult.voteData.totalVotes,
          winningVotes: voteResult.voteData.optionVotes[voteResult.winningOption.id] || 0,
          participationRate: voteResult.participationRate,
        },
        attributeChanges: voteResult.attributeChanges,
        loreEntry: loreEntry,
        summary: voteResult.summary,
      };

      // Get existing canonical events
      const eventsJson = await redis.get(REDIS_KEYS.CANONICAL_EVENTS);
      const events = eventsJson ? JSON.parse(eventsJson) : [];

      // Add new event
      events.push(canonicalEvent);

      // Keep only last 100 events to prevent unbounded growth
      if (events.length > 100) {
        events.splice(0, events.length - 100);
      }

      // Store updated events
      await redis.set(REDIS_KEYS.CANONICAL_EVENTS, JSON.stringify(events));

      console.log(`📚 Canonical event recorded: ${canonicalEvent.id}`);
    } catch (error) {
      console.error('❌ Error recording canonical event:', error);
      throw new Error('Failed to record canonical event');
    }
  }

  /**
   * Generate lore text based on winning option and context
   */
  static generateLoreText(
    winningOption: DilemmaOption,
    summary: string,
    significance: LoreEntry['significance']
  ): string {
    // Extract the action from the summary for more natural lore text
    const actionMatch = summary.match(/chose to (.+?)\./);
    const action = actionMatch ? actionMatch[1] : winningOption.text.toLowerCase();

    // Generate lore based on significance and attribute effects
    const effects = winningOption.attributeEffects;
    const majorEffects = Object.entries(effects).filter(([_, value]) => Math.abs(value || 0) >= 2);

    let loreText = `The community ${action}.`;

    // Add consequence based on major attribute effects
    if (majorEffects.length > 0) {
      const firstEffect = majorEffects[0];
      if (firstEffect) {
        const [attribute, value] = firstEffect;
        const direction = (value || 0) > 0 ? 'increased' : 'decreased';
        const intensity = Math.abs(value || 0) >= 3 ? 'dramatically' : 'significantly';

        switch (attribute) {
          case 'stability':
            loreText += ` This ${intensity} ${direction === 'increased' ? 'strengthened' : 'disrupted'} the stability of their world.`;
            break;
          case 'curiosity':
            loreText += ` This ${intensity} ${direction === 'increased' ? 'sparked' : 'dampened'} their sense of exploration and wonder.`;
            break;
          case 'survival':
            loreText += ` This ${intensity} ${direction === 'increased' ? 'improved' : 'threatened'} their chances of survival.`;
            break;
          case 'reputation':
            loreText += ` This ${intensity} ${direction === 'increased' ? 'enhanced' : 'damaged'} their standing with others.`;
            break;
        }
      }
    }

    // Add significance-based flavor text
    if (significance === 'pivotal') {
      loreText += ' This decision would be remembered for generations to come.';
    } else if (significance === 'major') {
      loreText += ' The effects of this choice rippled throughout their society.';
    }

    return loreText;
  }

  /**
   * Determine the significance of a lore entry
   */
  static determineLoreSignificance(
    winningOption: DilemmaOption,
    voteData: VoteResult['voteData']
  ): LoreEntry['significance'] {
    const effects = winningOption.attributeEffects;
    const maxEffect = Math.max(...Object.values(effects).map((v) => Math.abs(v || 0)));
    const totalVotes = voteData.totalVotes;

    // High participation + major effects = pivotal
    if (totalVotes >= 50 && maxEffect >= 3) {
      return 'pivotal';
    }

    // Moderate participation or major effects = major
    if (totalVotes >= 20 || maxEffect >= 2) {
      return 'major';
    }

    return 'minor';
  }

  /**
   * Determine the category of a lore entry
   */
  static determineLoreCategory(winningOption: DilemmaOption): LoreEntry['category'] {
    const effects = winningOption.attributeEffects;

    // Check for discovery (high curiosity gain)
    if ((effects.curiosity || 0) >= 2) {
      return 'discovery';
    }

    // Check for world change (multiple significant effects)
    const significantEffects = Object.values(effects).filter((v) => Math.abs(v || 0) >= 2);
    if (significantEffects.length >= 2) {
      return 'world_change';
    }

    // Check for consequence (negative effects)
    const hasNegativeEffects = Object.values(effects).some((v) => (v || 0) < 0);
    if (hasNegativeEffects) {
      return 'consequence';
    }

    return 'decision';
  }

  /**
   * Generate community reaction text
   */
  static generateCommunityReaction(voteResult: VoteResult): string {
    const { voteData, winningOption } = voteResult;
    const totalVotes = voteData.totalVotes;
    const winningVotes = voteData.optionVotes[winningOption.id] || 0;
    const percentage = totalVotes > 0 ? (winningVotes / totalVotes) * 100 : 0;

    if (percentage >= 80) {
      return 'The community was united in their decision, with overwhelming support for this path.';
    } else if (percentage >= 65) {
      return 'A strong majority of the community supported this choice, though some dissent remained.';
    } else if (percentage >= 55) {
      return 'The community reached a consensus after much deliberation and discussion.';
    } else {
      return 'The decision was closely contested, with the community split on the best path forward.';
    }
  }

  /**
   * Store a story outcome
   */
  static async storeStoryOutcome(storyOutcome: StoryOutcome): Promise<void> {
    try {
      const outcomesJson = await redis.get(REDIS_KEYS.STORY_OUTCOMES);
      const outcomes = outcomesJson ? JSON.parse(outcomesJson) : [];

      outcomes.push(storyOutcome);

      // Keep only last 50 outcomes
      if (outcomes.length > 50) {
        outcomes.splice(0, outcomes.length - 50);
      }

      await redis.set(REDIS_KEYS.STORY_OUTCOMES, JSON.stringify(outcomes));
      console.log(`💾 Story outcome stored: ${storyOutcome.id}`);
    } catch (error) {
      console.error('❌ Error storing story outcome:', error);
      throw new Error('Failed to store story outcome');
    }
  }

  /**
   * Store a lore entry
   */
  static async storeLoreEntry(loreEntry: LoreEntry): Promise<void> {
    try {
      const entriesJson = await redis.get(REDIS_KEYS.LORE_ENTRIES);
      const entries = entriesJson ? JSON.parse(entriesJson) : [];

      entries.push(loreEntry);

      // Keep only last 100 entries
      if (entries.length > 100) {
        entries.splice(0, entries.length - 100);
      }

      await redis.set(REDIS_KEYS.LORE_ENTRIES, JSON.stringify(entries));
      console.log(`📝 Lore entry stored: ${loreEntry.id}`);
    } catch (error) {
      console.error('❌ Error storing lore entry:', error);
      throw new Error('Failed to store lore entry');
    }
  }

  /**
   * Get recent story outcomes
   */
  static async getRecentOutcomes(limit = 10): Promise<StoryOutcome[]> {
    try {
      const outcomesJson = await redis.get(REDIS_KEYS.STORY_OUTCOMES);
      const outcomes: StoryOutcome[] = outcomesJson ? JSON.parse(outcomesJson) : [];

      return outcomes.slice(-limit).reverse(); // Most recent first
    } catch (error) {
      console.error('❌ Error getting recent outcomes:', error);
      return [];
    }
  }

  /**
   * Get recent lore entries
   */
  static async getRecentLoreEntries(limit = 20): Promise<LoreEntry[]> {
    try {
      const entriesJson = await redis.get(REDIS_KEYS.LORE_ENTRIES);
      const entries: LoreEntry[] = entriesJson ? JSON.parse(entriesJson) : [];

      return entries.slice(-limit).reverse(); // Most recent first
    } catch (error) {
      console.error('❌ Error getting recent lore entries:', error);
      return [];
    }
  }

  /**
   * Get canonical events history
   */
  static async getCanonicalEvents(limit = 20): Promise<CanonicalEvent[]> {
    try {
      const eventsJson = await redis.get(REDIS_KEYS.CANONICAL_EVENTS);
      const events = eventsJson ? JSON.parse(eventsJson) : [];

      return events.slice(-limit).reverse(); // Most recent first
    } catch (error) {
      console.error('❌ Error getting canonical events:', error);
      return [];
    }
  }
}
