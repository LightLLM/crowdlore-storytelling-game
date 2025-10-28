import { context, reddit } from '@devvit/web/server';
import { WorldStateService } from './worldState.js';
import { DilemmaGenerator } from './dilemmaGenerator.js';
import type { DilemmaData } from '../../shared/types/index.js';

/**
 * Create a new CrowdLore post with current world context and dilemma
 */
export const createPost = async () => {
  const { subredditName } = context;
  if (!subredditName) {
    throw new Error('subredditName is required');
  }

  try {
    // Initialize world state if needed
    await WorldStateService.initialize();
    const worldState = await WorldStateService.getCurrentState();

    // Generate post title with world context
    const postTitle = generatePostTitle(worldState);
    const postDescription = generatePostDescription(worldState);

    return await reddit.submitCustomPost({
      splash: {
        // Engaging splash screen for CrowdLore
        appDisplayName: 'CrowdLore',
        buttonLabel: '🌟 Join the Story',
        description: postDescription,
        heading: postTitle,
        // TODO: Add custom background and icon assets
        // backgroundUri: 'crowdlore-background.png',
        // appIconUri: 'crowdlore-icon.png',
      },
      postData: {
        worldVersion: worldState.version,
        createdAt: new Date().toISOString(),
        postType: 'daily_dilemma',
      },
      subredditName: subredditName,
      title: postTitle,
    });
  } catch (error) {
    console.error('❌ Error creating CrowdLore post:', error);
    throw new Error('Failed to create CrowdLore post');
  }
};

/**
 * Create a daily dilemma post with generated content and voting instructions
 */
export const createDailyDilemmaPost = async (theme?: string) => {
  const { subredditName } = context;
  if (!subredditName) {
    throw new Error('subredditName is required');
  }

  try {
    console.log('🎭 Creating daily dilemma post...');

    // Initialize world state
    await WorldStateService.initialize();
    const worldState = await WorldStateService.getCurrentState();

    // Generate new dilemma
    const generationResult = await DilemmaGenerator.generateDailyDilemma(
      theme as import('../../shared/types/index.js').DilemmaTheme
    );
    const dilemma = generationResult.dilemma;

    // Generate post content with dilemma and voting instructions
    const postTitle = generateDilemmaPostTitle(dilemma, worldState);
    const postDescription = generateDilemmaPostDescription(dilemma, worldState);

    // Create the post with dilemma data
    const post = await reddit.submitCustomPost({
      splash: {
        appDisplayName: 'CrowdLore',
        buttonLabel: '🗳️ Make Your Choice',
        description: postDescription,
        heading: postTitle,
      },
      postData: {
        worldVersion: worldState.version,
        dilemmaId: dilemma.id,
        createdAt: new Date().toISOString(),
        postType: 'daily_dilemma',
        expiresAt: dilemma.expiresAt.toISOString(),
      },
      subredditName: subredditName,
      title: postTitle,
    });

    console.log(`✅ Daily dilemma post created: ${post.id} with dilemma: ${dilemma.id}`);
    return { post, dilemma };
  } catch (error) {
    console.error('❌ Error creating daily dilemma post:', error);
    throw new Error('Failed to create daily dilemma post');
  }
};

/**
 * Generate an engaging post title based on world state
 */
function generatePostTitle(worldState: import('../../shared/types/index.js').WorldState): string {
  const { attributes } = worldState;

  // Find the most extreme attribute (positive or negative)
  const entries = Object.entries(attributes);
  const mostExtreme = entries.reduce(
    (max, [attr, val]) =>
      Math.abs(val) > Math.abs(max.value) ? { attribute: attr, value: val } : max,
    { attribute: entries[0]![0], value: entries[0]![1] }
  );

  // Generate contextual titles based on world state
  if (mostExtreme.value >= 7) {
    return `🌟 CrowdLore: Your ${mostExtreme.attribute} is thriving! What's next?`;
  } else if (mostExtreme.value <= -7) {
    return `⚠️ CrowdLore: Your ${mostExtreme.attribute} is in crisis! Urgent decisions needed`;
  } else if (mostExtreme.value >= 4) {
    return `📈 CrowdLore: Your world grows stronger - new challenges await`;
  } else if (mostExtreme.value <= -4) {
    return `📉 CrowdLore: Difficult times call for wise choices`;
  } else {
    return `🎭 CrowdLore: Your world's story continues - what path will you choose?`;
  }
}

/**
 * Generate an engaging post description based on world state
 */
function generatePostDescription(
  worldState: import('../../shared/types/index.js').WorldState
): string {
  const recentLore = worldState.loreLog[worldState.loreLog.length - 1];
  const totalDecisions = worldState.loreLog.length;

  if (recentLore) {
    return `After ${totalDecisions} collective decisions, your world has evolved. "${recentLore}" Shape the next chapter of your community's destiny through collaborative storytelling.`;
  } else {
    return `Begin your world's journey through collective decision-making. Every choice shapes your community's destiny in this collaborative storytelling experience.`;
  }
}

/**
 * Generate an engaging post title for a dilemma
 */
function generateDilemmaPostTitle(
  dilemma: DilemmaData,
  worldState: import('../../shared/types/index.js').WorldState
): string {
  const totalDecisions = worldState.loreLog.length;

  // Create contextual titles based on dilemma theme and world state
  const themeEmojis: Record<import('../../shared/types/index.js').DilemmaTheme, string> = {
    exploration: '🗺️',
    diplomacy: '🤝',
    humor: '😄',
    discovery: '🔍',
    survival: '⚔️',
    mystery: '🔮',
    community: '🏘️',
    trade: '💰',
  };

  const emoji = themeEmojis[dilemma.theme] || '🎭';

  if (totalDecisions === 0) {
    return `${emoji} CrowdLore: Begin Your World's Journey - ${dilemma.title}`;
  } else if (totalDecisions < 5) {
    return `${emoji} CrowdLore: Early Choices Shape Destiny - ${dilemma.title}`;
  } else {
    return `${emoji} CrowdLore: Day ${totalDecisions + 1} - ${dilemma.title}`;
  }
}

/**
 * Generate an engaging post description for a dilemma with voting instructions
 */
function generateDilemmaPostDescription(
  dilemma: DilemmaData,
  worldState: import('../../shared/types/index.js').WorldState
): string {
  const recentLore = worldState.loreLog[worldState.loreLog.length - 1];
  const totalDecisions = worldState.loreLog.length;

  let contextText = '';
  if (recentLore && totalDecisions > 0) {
    contextText = `After ${totalDecisions} collective decisions: "${recentLore}" `;
  }

  const votingInstructions = `

🗳️ HOW TO VOTE:
• Open the app to see all three options
• Each choice affects your world's attributes
• Vote by clicking your preferred option
• Voting ends in 24 hours

Your choice matters in this collaborative story!`;

  return `${contextText}${dilemma.scenario}${votingInstructions}`;
}

/**
 * Create a daily dilemma post (for scheduled posting)
 */
export const createDailyPost = async (): Promise<{ id: string; dilemmaId?: string }> => {
  console.log('🗓️ Creating daily CrowdLore post...');

  try {
    const result = await createDailyDilemmaPost();
    console.log('✅ Daily post created successfully:', result.post.id);
    return {
      id: result.post.id,
      dilemmaId: result.dilemma.id,
    };
  } catch (error) {
    console.error('❌ Failed to create daily post:', error);
    throw error;
  }
};
