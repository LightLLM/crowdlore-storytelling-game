/**
 * Dilemma balance testing and adjustment system
 */

import type {
  DilemmaData,
  DilemmaOption,
  WorldAttributeEffects,
} from '../../shared/types/index.js';

// Voter simulation parameters
const SIMULATION_CONFIG = {
  VOTER_COUNT: 100,
  MONOTONY_THRESHOLD: 0.7, // 70% dominance threshold
  MIN_BALANCE_SCORE: 0.6, // Minimum acceptable balance score
  MAX_ADJUSTMENT_ATTEMPTS: 3,
};

// Voter personality types for simulation
type VoterPersonality = {
  name: string;
  preferences: {
    stability: number; // -1 to 1, preference for stability changes
    curiosity: number; // -1 to 1, preference for curiosity changes
    survival: number; // -1 to 1, preference for survival changes
    reputation: number; // -1 to 1, preference for reputation changes
  };
  riskTolerance: number; // 0 to 1, willingness to take risks
  weight: number; // Population percentage (0 to 1)
};

// Simulated voter personalities
const VOTER_PERSONALITIES: VoterPersonality[] = [
  {
    name: 'Conservative',
    preferences: { stability: 0.8, curiosity: -0.2, survival: 0.6, reputation: 0.4 },
    riskTolerance: 0.2,
    weight: 0.25,
  },
  {
    name: 'Explorer',
    preferences: { stability: -0.3, curiosity: 0.9, survival: 0.1, reputation: 0.3 },
    riskTolerance: 0.8,
    weight: 0.2,
  },
  {
    name: 'Survivalist',
    preferences: { stability: 0.3, curiosity: 0.1, survival: 0.9, reputation: -0.1 },
    riskTolerance: 0.4,
    weight: 0.15,
  },
  {
    name: 'Diplomat',
    preferences: { stability: 0.5, curiosity: 0.2, survival: 0.2, reputation: 0.8 },
    riskTolerance: 0.3,
    weight: 0.15,
  },
  {
    name: 'Balanced',
    preferences: { stability: 0.1, curiosity: 0.1, survival: 0.1, reputation: 0.1 },
    riskTolerance: 0.5,
    weight: 0.25,
  },
];

type BalanceResult = {
  dilemma: DilemmaData;
  balanceScore: number;
  simulationResults: {
    optionVotes: { [optionId: string]: number };
    winningOption: string;
    dominancePercentage: number;
    isMonotonous: boolean;
  };
  adjustmentsMade: string[];
};

/**
 * DilemmaBalancer service class
 */
export class DilemmaBalancer {
  /**
   * Balance a dilemma through simulation and adjustment
   */
  async balanceDilemma(dilemma: DilemmaData): Promise<BalanceResult> {
    console.log(`⚖️ Balancing dilemma: ${dilemma.id}`);

    let currentDilemma = { ...dilemma };
    const adjustmentsMade: string[] = [];
    let attempts = 0;

    while (attempts < SIMULATION_CONFIG.MAX_ADJUSTMENT_ATTEMPTS) {
      // Run vote simulation
      const simulationResults = this.simulateVoting(currentDilemma);
      const balanceScore = this.calculateBalanceScore(simulationResults);

      console.log(
        `🎯 Attempt ${attempts + 1} - Balance: ${balanceScore}, Dominance: ${simulationResults.dominancePercentage}%`
      );

      // Check if balance is acceptable
      if (balanceScore >= SIMULATION_CONFIG.MIN_BALANCE_SCORE && !simulationResults.isMonotonous) {
        return {
          dilemma: currentDilemma,
          balanceScore,
          simulationResults,
          adjustmentsMade,
        };
      }

      // Apply adjustments if needed
      if (attempts < SIMULATION_CONFIG.MAX_ADJUSTMENT_ATTEMPTS - 1) {
        const adjustmentResult = this.adjustDilemmaBalance(currentDilemma, simulationResults);
        currentDilemma = adjustmentResult.dilemma;
        adjustmentsMade.push(...adjustmentResult.adjustments);
      }

      attempts++;
    }

    // Return final result even if not perfectly balanced
    const finalSimulation = this.simulateVoting(currentDilemma);
    const finalBalance = this.calculateBalanceScore(finalSimulation);

    console.log(
      `⚠️ Balance adjustment completed after ${attempts} attempts - Final balance: ${finalBalance}`
    );

    return {
      dilemma: currentDilemma,
      balanceScore: finalBalance,
      simulationResults: finalSimulation,
      adjustmentsMade,
    };
  }

  /**
   * Simulate voting with ~100 random voters
   */
  private simulateVoting(dilemma: DilemmaData): {
    optionVotes: { [optionId: string]: number };
    winningOption: string;
    dominancePercentage: number;
    isMonotonous: boolean;
  } {
    const optionVotes: { [optionId: string]: number } = {};

    // Initialize vote counts
    dilemma.options.forEach((option) => {
      optionVotes[option.id] = 0;
    });

    // Generate voters based on personality distribution
    const voters = this.generateVoters();

    // Each voter evaluates options and votes
    for (const voter of voters) {
      const chosenOption = this.simulateVoterChoice(dilemma.options, voter);
      const currentVotes = optionVotes[chosenOption.id];
      if (currentVotes !== undefined) {
        optionVotes[chosenOption.id] = currentVotes + 1;
      }
    }

    // Find winning option
    const sortedOptions = Object.entries(optionVotes).sort(([, a], [, b]) => b - a);
    const winningOption = sortedOptions[0]![0];
    const winningVotes = sortedOptions[0]![1];
    const totalVotes = voters.length;

    const dominancePercentage = Math.round((winningVotes / totalVotes) * 100);
    const isMonotonous = dominancePercentage >= SIMULATION_CONFIG.MONOTONY_THRESHOLD * 100;

    return {
      optionVotes,
      winningOption,
      dominancePercentage,
      isMonotonous,
    };
  }

  /**
   * Generate simulated voters based on personality distribution
   */
  private generateVoters(): VoterPersonality[] {
    const voters: VoterPersonality[] = [];

    for (const personality of VOTER_PERSONALITIES) {
      const count = Math.round(SIMULATION_CONFIG.VOTER_COUNT * personality.weight);
      for (let i = 0; i < count; i++) {
        // Add some randomness to each voter while maintaining personality base
        const randomizedVoter: VoterPersonality = {
          ...personality,
          preferences: {
            stability: this.addRandomness(personality.preferences.stability, 0.2),
            curiosity: this.addRandomness(personality.preferences.curiosity, 0.2),
            survival: this.addRandomness(personality.preferences.survival, 0.2),
            reputation: this.addRandomness(personality.preferences.reputation, 0.2),
          },
          riskTolerance: this.addRandomness(personality.riskTolerance, 0.1),
        };
        voters.push(randomizedVoter);
      }
    }

    return voters;
  }

  /**
   * Add randomness to a value within bounds
   */
  private addRandomness(value: number, variance: number): number {
    const randomOffset = (Math.random() - 0.5) * 2 * variance;
    return Math.max(-1, Math.min(1, value + randomOffset));
  }

  /**
   * Simulate how a voter would choose between options
   */
  private simulateVoterChoice(
    options: readonly DilemmaOption[],
    voter: VoterPersonality
  ): DilemmaOption {
    if (options.length === 0) {
      throw new Error('No options provided for voter choice simulation');
    }

    let bestOption: DilemmaOption = options[0]!; // Non-null assertion since we checked length
    let bestScore = -Infinity;

    for (const option of options) {
      const score = this.calculateOptionScore(option, voter);
      if (score > bestScore) {
        bestScore = score;
        bestOption = option;
      }
    }

    return bestOption;
  }

  /**
   * Calculate how appealing an option is to a specific voter
   */
  private calculateOptionScore(option: DilemmaOption, voter: VoterPersonality): number {
    let score = 0;

    // Score based on attribute effects matching voter preferences
    for (const [attribute, effect] of Object.entries(option.attributeEffects)) {
      if (effect !== undefined) {
        const preference = voter.preferences[attribute as keyof typeof voter.preferences];
        // Positive effect + positive preference = good score
        // Negative effect + negative preference = good score
        score += effect * preference;
      }
    }

    // Factor in risk tolerance
    const totalAbsoluteEffects = Object.values(option.attributeEffects)
      .filter((effect) => effect !== undefined)
      .reduce((sum, effect) => sum + Math.abs(effect!), 0);

    const riskFactor = totalAbsoluteEffects * (voter.riskTolerance - 0.5);
    score += riskFactor;

    // Add some randomness to prevent perfect predictability
    score += (Math.random() - 0.5) * 0.5;

    return score;
  }

  /**
   * Calculate balance score from simulation results
   */
  private calculateBalanceScore(simulationResults: {
    optionVotes: { [optionId: string]: number };
    dominancePercentage: number;
    isMonotonous: boolean;
  }): number {
    const votes = Object.values(simulationResults.optionVotes);
    const totalVotes = votes.reduce((sum, count) => sum + count, 0);

    if (totalVotes === 0) return 0;

    // Calculate vote distribution balance (closer to equal = higher score)
    const expectedVotes = totalVotes / votes.length;
    const variance =
      votes.reduce((sum, count) => sum + Math.pow(count - expectedVotes, 2), 0) / votes.length;
    const standardDeviation = Math.sqrt(variance);

    // Convert to balance score (0-1, higher is more balanced)
    const maxPossibleStdDev = totalVotes / 2; // Maximum when all votes go to one option
    const distributionScore = Math.max(0, 1 - standardDeviation / maxPossibleStdDev);

    // Penalty for monotony
    const monotonyPenalty = simulationResults.isMonotonous ? 0.3 : 0;

    // Final balance score
    const balanceScore = Math.max(0, distributionScore - monotonyPenalty);

    return Math.round(balanceScore * 100) / 100;
  }

  /**
   * Adjust dilemma to improve balance
   */
  private adjustDilemmaBalance(
    dilemma: DilemmaData,
    simulationResults: {
      optionVotes: { [optionId: string]: number };
      winningOption: string;
      dominancePercentage: number;
      isMonotonous: boolean;
    }
  ): { dilemma: DilemmaData; adjustments: string[] } {
    const adjustments: string[] = [];
    const adjustedDilemma = { ...dilemma };

    // Find the dominant option and weaker options
    const sortedOptions = Object.entries(simulationResults.optionVotes).sort(
      ([, a], [, b]) => b - a
    );

    const dominantOptionId = sortedOptions[0]![0];
    const weakestOptionId = sortedOptions[sortedOptions.length - 1]![0];

    // Adjust options to improve balance
    adjustedDilemma.options = dilemma.options.map((option) => {
      if (option.id === dominantOptionId) {
        // Make dominant option slightly less appealing
        const adjustedOption = this.reduceOptionAppeal(option);
        adjustments.push(`Reduced appeal of dominant option: ${option.text}`);
        return adjustedOption;
      } else if (option.id === weakestOptionId) {
        // Make weakest option more appealing
        const adjustedOption = this.increaseOptionAppeal(option);
        adjustments.push(`Increased appeal of weak option: ${option.text}`);
        return adjustedOption;
      }
      return option;
    }) as [DilemmaOption, DilemmaOption, DilemmaOption];

    return { dilemma: adjustedDilemma, adjustments };
  }

  /**
   * Reduce option appeal by adjusting effects
   */
  private reduceOptionAppeal(option: DilemmaOption): DilemmaOption {
    const adjustedEffects = { ...option.attributeEffects };

    // Slightly reduce positive effects or increase negative effects
    for (const [attribute, effect] of Object.entries(adjustedEffects)) {
      if (effect !== undefined && effect > 0) {
        // Reduce positive effects by 1 (but not below 0)
        adjustedEffects[attribute as keyof WorldAttributeEffects] = Math.max(0, effect - 1);
      } else if (effect !== undefined && effect === 0) {
        // Add small negative effect
        adjustedEffects[attribute as keyof WorldAttributeEffects] = -1;
      }
    }

    return {
      ...option,
      attributeEffects: adjustedEffects,
    };
  }

  /**
   * Increase option appeal by adjusting effects
   */
  private increaseOptionAppeal(option: DilemmaOption): DilemmaOption {
    const adjustedEffects = { ...option.attributeEffects };

    // Slightly increase positive effects or reduce negative effects
    for (const [attribute, effect] of Object.entries(adjustedEffects)) {
      if (effect !== undefined && effect < 0) {
        // Reduce negative effects by 1 (but not above 0)
        adjustedEffects[attribute as keyof WorldAttributeEffects] = Math.min(0, effect + 1);
      } else if (effect !== undefined && effect === 0) {
        // Add small positive effect
        adjustedEffects[attribute as keyof WorldAttributeEffects] = 1;
      } else if (effect !== undefined && effect > 0 && effect < 3) {
        // Increase positive effects by 1 (but not above 3)
        adjustedEffects[attribute as keyof WorldAttributeEffects] = Math.min(3, effect + 1);
      }
    }

    return {
      ...option,
      attributeEffects: adjustedEffects,
    };
  }

  /**
   * Detect monotony in voting patterns
   */
  detectMonotony(simulationResults: { optionVotes: { [optionId: string]: number } }): {
    isMonotonous: boolean;
    dominantOption: string | null;
    dominancePercentage: number;
  } {
    const votes = Object.entries(simulationResults.optionVotes);
    const totalVotes = votes.reduce((sum, [, count]) => sum + count, 0);

    if (totalVotes === 0) {
      return { isMonotonous: false, dominantOption: null, dominancePercentage: 0 };
    }

    // Find the option with the most votes
    const sortedVotes = votes.sort(([, a], [, b]) => b - a);
    const [dominantOption, dominantVotes] = sortedVotes[0]!;
    const dominancePercentage = (dominantVotes / totalVotes) * 100;

    const isMonotonous = dominancePercentage >= SIMULATION_CONFIG.MONOTONY_THRESHOLD * 100;

    return {
      isMonotonous,
      dominantOption,
      dominancePercentage: Math.round(dominancePercentage),
    };
  }

  /**
   * Generate balance report for a dilemma
   */
  generateBalanceReport(dilemma: DilemmaData): {
    balanceScore: number;
    simulationResults: {
      optionVotes: { [optionId: string]: number };
      winningOption: string;
      dominancePercentage: number;
      isMonotonous: boolean;
    };
    recommendations: string[];
    isBalanced: boolean;
  } {
    const simulationResults = this.simulateVoting(dilemma);
    const balanceScore = this.calculateBalanceScore(simulationResults);
    const monotonyCheck = this.detectMonotony(simulationResults);

    const recommendations: string[] = [];

    if (monotonyCheck.isMonotonous) {
      recommendations.push(
        `Option "${monotonyCheck.dominantOption}" dominates with ${monotonyCheck.dominancePercentage}% - consider rebalancing`
      );
    }

    if (balanceScore < 0.6) {
      recommendations.push('Overall balance is low - consider adjusting option effects');
    }

    if (balanceScore >= 0.8) {
      recommendations.push('Excellent balance - options are well-distributed');
    }

    return {
      balanceScore,
      simulationResults,
      recommendations,
      isBalanced:
        balanceScore >= SIMULATION_CONFIG.MIN_BALANCE_SCORE && !monotonyCheck.isMonotonous,
    };
  }
}
