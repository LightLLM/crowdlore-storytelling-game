/**
 * DilemmaGenerator service for creating balanced story scenarios
 */

import type {
  DilemmaData,
  DilemmaOption,
  DilemmaTheme,
  DilemmaGenerationResult,
  WorldAttributeEffects,
} from '../../shared/types/index.js';
import { ContentModerator } from './contentModerator.js';
import { DilemmaBalancer } from './dilemmaBalancer.js';

// Types for dilemma templates
type BaseOption = {
  text: string;
  effects: WorldAttributeEffects;
};

type DilemmaTemplate = {
  title: string;
  scenario: string;
  baseOptions: BaseOption[];
};

// Scenario templates for different themes
const SCENARIO_TEMPLATES = {
  exploration: [
    {
      title: 'The Glowing Portal',
      scenario:
        'Your scouts have discovered a shimmering portal deep in the forest. Strange lights dance within it, and whispers of unknown languages drift through. Some say it could lead to great treasures, others fear it might bring danger to your people.',
      baseOptions: [
        {
          text: 'Send a small expedition through the portal',
          effects: { curiosity: 2, stability: -1, survival: 1 },
        },
        {
          text: 'Study the portal from a safe distance',
          effects: { curiosity: 1, stability: 1, reputation: 1 },
        },
        {
          text: 'Seal the portal with protective barriers',
          effects: { stability: 2, survival: 1, curiosity: -2 },
        },
      ],
    },
    {
      title: 'The Floating Islands',
      scenario:
        'Massive islands have appeared floating in the sky above your territory. They cast strange shadows and seem to pulse with an otherworldly energy. Your people are both amazed and concerned about what this phenomenon might mean.',
      baseOptions: [
        {
          text: 'Build towers to reach the floating islands',
          effects: { curiosity: 3, stability: -1, reputation: 1 },
        },
        {
          text: 'Document and observe the phenomenon',
          effects: { curiosity: 1, stability: 1, survival: 1 },
        },
        {
          text: 'Prepare defenses in case of danger',
          effects: { stability: 1, survival: 2, curiosity: -1 },
        },
      ],
    },
    {
      title: 'The Crystal Caverns',
      scenario:
        'Deep underground, your miners have uncovered vast caverns filled with luminescent crystals. The crystals hum with energy and seem to respond to touch, but their purpose and potential dangers remain unknown.',
      baseOptions: [
        {
          text: 'Harvest the crystals for their energy',
          effects: { curiosity: 2, survival: 1, stability: -1 },
        },
        {
          text: 'Study the crystals before taking action',
          effects: { curiosity: 2, stability: 1, reputation: 1 },
        },
        {
          text: 'Seal the caverns to prevent accidents',
          effects: { stability: 2, survival: 1, curiosity: -2 },
        },
      ],
    },
  ],
  diplomacy: [
    {
      title: 'The Neighboring Tribe',
      scenario:
        'A delegation from a neighboring tribe has arrived at your borders. They claim their lands are being threatened by strange creatures and seek an alliance. However, some of your advisors suspect this might be a trap or manipulation.',
      baseOptions: [
        {
          text: 'Form a military alliance with the tribe',
          effects: { reputation: 2, survival: 1, stability: -1 },
        },
        {
          text: 'Offer limited aid while staying neutral',
          effects: { reputation: 1, stability: 1, curiosity: 1 },
        },
        {
          text: 'Politely decline and strengthen your borders',
          effects: { stability: 2, survival: 1, reputation: -1 },
        },
      ],
    },
    {
      title: 'The Trade Dispute',
      scenario:
        'Two merchant guilds in your territory are locked in a bitter dispute over trading routes. Their conflict is disrupting commerce and threatening to escalate into violence. Both sides demand your intervention and support.',
      baseOptions: [
        {
          text: 'Side with the guild offering better terms',
          effects: { survival: 2, reputation: -1, stability: -1 },
        },
        {
          text: 'Mediate a compromise between both guilds',
          effects: { stability: 2, reputation: 1, curiosity: 1 },
        },
        {
          text: 'Establish new trade rules for everyone',
          effects: { stability: 1, reputation: 2, survival: 1 },
        },
      ],
    },
  ],
  humor: [
    {
      title: 'The Great Pie Shortage',
      scenario:
        'A mysterious blight has affected all the fruit trees in your region, leading to a critical shortage of pies just before the annual Harvest Festival. Your people are devastated, and some are threatening to cancel the celebration entirely.',
      baseOptions: [
        {
          text: 'Import exotic fruits from distant lands',
          effects: { curiosity: 2, survival: -1, reputation: 1 },
        },
        {
          text: 'Declare a new tradition of vegetable pies',
          effects: { stability: 1, curiosity: 1, reputation: 1 },
        },
        {
          text: 'Focus the festival on other activities',
          effects: { stability: 2, reputation: 1, survival: 1 },
        },
      ],
    },
    {
      title: 'The Singing Stones',
      scenario:
        'Strange stones throughout your territory have begun singing opera at dawn each day. While beautiful, the performances are so loud they wake everyone up. Some love it, others are losing sleep and demanding action.',
      baseOptions: [
        {
          text: 'Embrace the stones as a natural wonder',
          effects: { curiosity: 2, reputation: 1, stability: -1 },
        },
        {
          text: 'Study the stones to understand them better',
          effects: { curiosity: 3, stability: 1, survival: 1 },
        },
        {
          text: 'Find a way to muffle the morning concerts',
          effects: { stability: 2, survival: 1, curiosity: -1 },
        },
      ],
    },
  ],
  discovery: [
    {
      title: 'The Ancient Library',
      scenario:
        'Construction workers have uncovered the ruins of an ancient library buried beneath your settlement. The scrolls and books within appear to contain knowledge from a lost civilization, but some texts seem to glow with an eerie light.',
      baseOptions: [
        {
          text: 'Study all the ancient texts immediately',
          effects: { curiosity: 3, reputation: 1, stability: -1 },
        },
        {
          text: 'Carefully preserve and catalog everything',
          effects: { curiosity: 2, stability: 1, reputation: 1 },
        },
        {
          text: 'Seal dangerous texts and study safe ones',
          effects: { stability: 2, survival: 1, curiosity: 1 },
        },
      ],
    },
    {
      title: 'The Time Capsule',
      scenario:
        'Your archaeologists have discovered what appears to be a time capsule from the future, containing strange devices and warnings about events that have not yet occurred. The implications are both exciting and terrifying.',
      baseOptions: [
        {
          text: 'Use the future knowledge to prepare',
          effects: { survival: 2, curiosity: 1, stability: -1 },
        },
        {
          text: 'Study the devices to understand them',
          effects: { curiosity: 3, reputation: 1, survival: 1 },
        },
        {
          text: 'Hide the capsule to avoid paradoxes',
          effects: { stability: 2, survival: 1, curiosity: -2 },
        },
      ],
    },
  ],
  survival: [
    {
      title: 'The Harsh Winter',
      scenario:
        'An unexpectedly severe winter has struck your territory. Food supplies are running low, and the cold is more intense than anyone can remember. Your people look to you for leadership in these desperate times.',
      baseOptions: [
        {
          text: 'Organize hunting parties for fresh game',
          effects: { survival: 2, stability: -1, reputation: 1 },
        },
        {
          text: 'Ration existing supplies carefully',
          effects: { survival: 1, stability: 2, reputation: 1 },
        },
        {
          text: 'Seek aid from neighboring communities',
          effects: { survival: 2, reputation: -1, stability: 1 },
        },
      ],
    },
    {
      title: 'The Poisoned Wells',
      scenario:
        'Several water sources in your territory have become contaminated with an unknown substance. People are falling ill, and panic is beginning to spread. You must act quickly to protect your community.',
      baseOptions: [
        {
          text: 'Search for new water sources immediately',
          effects: { survival: 2, curiosity: 1, stability: -1 },
        },
        {
          text: 'Focus on treating the contaminated water',
          effects: { survival: 3, stability: 1, reputation: 1 },
        },
        {
          text: 'Evacuate to safer areas temporarily',
          effects: { survival: 1, stability: -1, reputation: 2 },
        },
      ],
    },
  ],
  mystery: [
    {
      title: 'The Vanishing People',
      scenario:
        'Several members of your community have mysteriously disappeared without a trace. There are no signs of struggle, and witnesses report seeing strange lights in the area where they were last seen. Fear is growing among your people.',
      baseOptions: [
        {
          text: 'Investigate the strange lights personally',
          effects: { curiosity: 2, reputation: 1, stability: -1 },
        },
        {
          text: 'Organize search parties with protection',
          effects: { survival: 1, stability: 1, reputation: 2 },
        },
        {
          text: 'Establish a curfew and safety protocols',
          effects: { stability: 2, survival: 2, curiosity: -1 },
        },
      ],
    },
    {
      title: 'The Whispering Shadows',
      scenario:
        'Shadows in your territory have begun moving independently and seem to whisper secrets to those who listen closely. Some people claim to have learned valuable information, while others report disturbing visions.',
      baseOptions: [
        {
          text: 'Encourage people to listen to the shadows',
          effects: { curiosity: 3, reputation: 1, stability: -2 },
        },
        {
          text: 'Study the phenomenon scientifically',
          effects: { curiosity: 2, stability: 1, survival: 1 },
        },
        {
          text: 'Ward against the shadows with light',
          effects: { stability: 2, survival: 1, curiosity: -1 },
        },
      ],
    },
  ],
  community: [
    {
      title: 'The Festival Dispute',
      scenario:
        'Your annual harvest festival is approaching, but two factions in your community have very different visions for how it should be celebrated. One group wants a traditional ceremony, while the other pushes for modern innovations. The disagreement is dividing your people.',
      baseOptions: [
        {
          text: 'Support the traditional ceremony approach',
          effects: { stability: 2, reputation: 1, curiosity: -1 },
        },
        {
          text: 'Embrace the modern innovations',
          effects: { curiosity: 2, reputation: 1, stability: -1 },
        },
        {
          text: 'Create a compromise blending both approaches',
          effects: { stability: 1, reputation: 2, survival: 1 },
        },
      ],
    },
    {
      title: 'The Resource Sharing Crisis',
      scenario:
        'A shortage of essential supplies has created tension in your community. Some families have more than they need while others struggle. People are looking to you to decide how resources should be distributed fairly.',
      baseOptions: [
        {
          text: 'Implement equal distribution for everyone',
          effects: { stability: 2, survival: 1, reputation: 1 },
        },
        {
          text: 'Allow families to keep what they have',
          effects: { survival: -1, stability: -1, reputation: 2 },
        },
        {
          text: 'Create a merit-based sharing system',
          effects: { survival: 2, stability: 1, reputation: -1 },
        },
      ],
    },
  ],
  trade: [
    {
      title: 'The Exotic Merchant',
      scenario:
        'A traveling merchant has arrived with rare goods from distant lands, offering to trade for your local specialties. However, some of your advisors worry that becoming dependent on foreign trade might weaken your self-sufficiency.',
      baseOptions: [
        {
          text: 'Establish regular trade relationships',
          effects: { survival: 2, reputation: 2, stability: -1 },
        },
        {
          text: 'Make a one-time trade for essentials only',
          effects: { survival: 1, stability: 1, curiosity: 1 },
        },
        {
          text: 'Politely decline to maintain independence',
          effects: { stability: 2, survival: -1, reputation: 1 },
        },
      ],
    },
    {
      title: 'The Trade Route Opportunity',
      scenario:
        'Your scouts have discovered a potential new trade route that could bring prosperity to your territory. However, establishing it would require significant resources and might attract unwanted attention from competitors.',
      baseOptions: [
        {
          text: 'Invest heavily in developing the trade route',
          effects: { survival: 3, reputation: 1, stability: -1 },
        },
        {
          text: 'Develop the route gradually and carefully',
          effects: { survival: 1, stability: 2, reputation: 1 },
        },
        {
          text: 'Keep the route secret for now',
          effects: { stability: 1, curiosity: 1, survival: 1 },
        },
      ],
    },
  ],
};

/**
 * DilemmaGenerator service class
 */
export class DilemmaGenerator {
  private static contentModerator = new ContentModerator();
  private static balancer = new DilemmaBalancer();

  /**
   * Generate a new dilemma with specified theme or random theme
   */
  static async generateDailyDilemma(theme?: DilemmaTheme): Promise<DilemmaGenerationResult> {
    try {
      console.log(`🎲 Generating dilemma${theme ? ` with theme: ${theme}` : ' with random theme'}`);

      // Select theme if not provided
      const selectedTheme = theme || this.selectRandomTheme();
      console.log(`📖 Selected theme: ${selectedTheme}`);

      // Get template for theme
      const template = this.selectTemplate(selectedTheme);

      // Generate base dilemma
      const baseDilemma = this.createBaseDilemma(template, selectedTheme);

      // Apply content moderation
      const moderationResult = await this.contentModerator.moderateContent(baseDilemma);

      // Apply balance testing and adjustments
      const balancedDilemma = await this.balancer.balanceDilemma(moderationResult.dilemma);

      const result: DilemmaGenerationResult = {
        dilemma: balancedDilemma.dilemma,
        balanceScore: balancedDilemma.balanceScore,
        moderationFlags: moderationResult.flags,
        isApproved: moderationResult.isAppropriate && balancedDilemma.balanceScore >= 0.6,
      };

      console.log(
        `✅ Dilemma generated - Balance: ${result.balanceScore}, Approved: ${result.isApproved}`
      );
      return result;
    } catch (error) {
      console.error('❌ Error generating dilemma:', error);
      throw new Error('Failed to generate dilemma');
    }
  }

  /**
   * Select a random theme from available themes
   */
  private static selectRandomTheme(): DilemmaTheme {
    const themes = Object.keys(SCENARIO_TEMPLATES) as DilemmaTheme[];
    const randomIndex = Math.floor(Math.random() * themes.length);
    return themes[randomIndex]!;
  }

  /**
   * Select a template from the specified theme
   */
  private static selectTemplate(theme: DilemmaTheme) {
    const templates = SCENARIO_TEMPLATES[theme];
    if (!templates || templates.length === 0) {
      throw new Error(`No templates available for theme: ${theme}`);
    }

    const randomIndex = Math.floor(Math.random() * templates.length);
    return templates[randomIndex]!;
  }

  /**
   * Create base dilemma from template
   */
  private static createBaseDilemma(template: DilemmaTemplate, theme: DilemmaTheme): DilemmaData {
    const dilemmaId = `dilemma-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    // Ensure we have exactly 3 options
    const baseOptions = template.baseOptions.slice(0, 3);
    if (baseOptions.length < 3) {
      throw new Error(`Template must have at least 3 options, got ${baseOptions.length}`);
    }

    // Create options with enhanced descriptions
    const options: [DilemmaOption, DilemmaOption, DilemmaOption] = baseOptions.map(
      (baseOption: BaseOption, index: number) => {
        const optionId = `${dilemmaId}-option-${String.fromCharCode(97 + index)}`; // a, b, c

        // Generate pros and cons based on effects
        const pros = this.generatePros(baseOption.effects);
        const cons = this.generateCons(baseOption.effects);

        return {
          id: optionId,
          text: baseOption.text,
          description: this.generateOptionDescription(baseOption.text, baseOption.effects),
          attributeEffects: baseOption.effects,
          pros,
          cons,
        };
      }
    ) as [DilemmaOption, DilemmaOption, DilemmaOption];

    return {
      id: dilemmaId,
      title: template.title,
      scenario: template.scenario,
      theme,
      options,
      createdAt: now,
      expiresAt,
      isActive: true,
    };
  }

  /**
   * Generate option description based on text and effects
   */
  private static generateOptionDescription(text: string, effects: WorldAttributeEffects): string {
    const effectDescriptions: string[] = [];

    for (const [attribute, value] of Object.entries(effects)) {
      if (value !== undefined && value !== 0) {
        const direction = value > 0 ? 'increase' : 'decrease';
        const magnitude =
          Math.abs(value) === 1
            ? 'slightly'
            : Math.abs(value) === 2
              ? 'moderately'
              : 'significantly';
        effectDescriptions.push(`${magnitude} ${direction} ${attribute}`);
      }
    }

    if (effectDescriptions.length === 0) {
      return `Choose to ${text.toLowerCase()}`;
    }

    return `This choice will ${effectDescriptions.join(', ')}`;
  }

  /**
   * Generate pros based on positive effects
   */
  private static generatePros(effects: WorldAttributeEffects): string[] {
    const pros: string[] = [];

    for (const [attribute, value] of Object.entries(effects)) {
      if (value !== undefined && value > 0) {
        switch (attribute) {
          case 'stability':
            pros.push(
              value >= 2 ? 'Greatly improves community stability' : 'Enhances social order'
            );
            break;
          case 'curiosity':
            pros.push(value >= 2 ? 'Opens new avenues for discovery' : 'Encourages exploration');
            break;
          case 'survival':
            pros.push(
              value >= 2 ? 'Significantly improves survival chances' : 'Helps secure resources'
            );
            break;
          case 'reputation':
            pros.push(
              value >= 2 ? 'Greatly enhances standing with others' : 'Improves community reputation'
            );
            break;
        }
      }
    }

    // Add at least one generic pro if none from effects
    if (pros.length === 0) {
      pros.push('Provides a clear path forward');
    }

    return pros;
  }

  /**
   * Generate cons based on negative effects
   */
  private static generateCons(effects: WorldAttributeEffects): string[] {
    const cons: string[] = [];

    for (const [attribute, value] of Object.entries(effects)) {
      if (value !== undefined && value < 0) {
        switch (attribute) {
          case 'stability':
            cons.push(
              Math.abs(value) >= 2
                ? 'May cause significant unrest'
                : 'Could create some instability'
            );
            break;
          case 'curiosity':
            cons.push(
              Math.abs(value) >= 2
                ? 'Severely limits future opportunities'
                : 'Reduces exploration potential'
            );
            break;
          case 'survival':
            cons.push(
              Math.abs(value) >= 2 ? 'Poses serious survival risks' : 'May compromise safety'
            );
            break;
          case 'reputation':
            cons.push(
              Math.abs(value) >= 2
                ? 'Could damage relationships significantly'
                : 'Might harm standing with others'
            );
            break;
        }
      }
    }

    // Add at least one generic con if none from effects
    if (cons.length === 0) {
      cons.push('Involves some degree of risk');
    }

    return cons;
  }

  /**
   * Validate dilemma structure and content
   */
  static validateDilemma(dilemma: DilemmaData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!dilemma.id || dilemma.id.trim() === '') {
      errors.push('Dilemma ID is required');
    }

    if (!dilemma.title || dilemma.title.trim() === '') {
      errors.push('Dilemma title is required');
    }

    if (!dilemma.scenario || dilemma.scenario.trim() === '') {
      errors.push('Dilemma scenario is required');
    }

    // Check scenario length (should be concise)
    if (dilemma.scenario.length > 500) {
      errors.push('Scenario should be 500 characters or less');
    }

    // Check options
    if (!dilemma.options || dilemma.options.length !== 3) {
      errors.push('Dilemma must have exactly 3 options');
    } else {
      dilemma.options.forEach((option, index) => {
        if (!option.id || option.id.trim() === '') {
          errors.push(`Option ${index + 1} ID is required`);
        }

        if (!option.text || option.text.trim() === '') {
          errors.push(`Option ${index + 1} text is required`);
        }

        if (!option.attributeEffects || Object.keys(option.attributeEffects).length === 0) {
          errors.push(`Option ${index + 1} must have attribute effects`);
        }

        // Validate effect ranges
        for (const [attr, effect] of Object.entries(option.attributeEffects)) {
          if (effect !== undefined && (effect < -3 || effect > 3)) {
            errors.push(`Option ${index + 1} ${attr} effect must be between -3 and 3`);
          }
        }
      });
    }

    // Check dates
    if (dilemma.expiresAt <= dilemma.createdAt) {
      errors.push('Expiration date must be after creation date');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
