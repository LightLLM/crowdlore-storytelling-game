/**
 * ASCIIGenerator service for creating ASCII art scenes based on story outcomes
 */

import type {
  ASCIIScene,
  ASCIIGenerationParams,
  VoteResult,
  DilemmaOption,
  WorldAttributeEffects,
} from '../../shared/types/index.js';

// ASCII art templates organized by theme
type ASCIITemplate = {
  lines: string[];
  variations: string[][];
  mood: 'positive' | 'negative' | 'neutral' | 'mysterious';
  description: string;
};

// Collection of ASCII templates for different themes
const ASCII_TEMPLATES: Record<string, ASCIITemplate[]> = {
  campfire: [
    {
      lines: [
        '    /\\   /\\',
        '   (  . .)  ',
        '    )   (   ',
        '   (  v  )  ',
        '  ^^  |  ^^',
        ' ^^^^^^^^^^^^',
      ],
      variations: [
        ['    /\\   /\\', '   (  ^ ^)  '],
        ['    /\\   /\\', '   (  - -)  '],
      ],
      mood: 'positive',
      description: 'A warm campfire brings the community together',
    },
    {
      lines: [
        '     ~ ~ ~',
        '   (  o o  )',
        '    )  .  (',
        '   (   v   )',
        '  ^^   |   ^^',
        ' ^^^^^^^^^^^^',
      ],
      variations: [['     ~ ~ ~', '   (  - -  )']],
      mood: 'neutral',
      description: 'The community gathers around flickering flames',
    },
  ],
  stars: [
    {
      lines: [
        '  *    .    *',
        '    *     *  ',
        ' .    *   .  ',
        '   *    .    ',
        '*    .    *  ',
        '  .    *   . ',
      ],
      variations: [
        ['  +    .    +', '    +     +  '],
        ['  ·    .    ·', '    ·     ·  '],
      ],
      mood: 'mysterious',
      description: 'Stars shine down on the world below',
    },
    {
      lines: [
        '     ★       ',
        '  *     *    ',
        '    ★     ★  ',
        ' *     *     ',
        '   ★     *   ',
        '*     ★      ',
      ],
      variations: [['     ☆       ', '  ·     ·    ']],
      mood: 'positive',
      description: 'Bright stars illuminate the night sky',
    },
  ],
  festival: [
    {
      lines: [
        '  🎪 🎪 🎪  ',
        ' \\o/ \\o/ \\o/',
        '  |   |   |  ',
        ' / \\ / \\ / \\',
        '~~~~~~~~~~~~',
        '  FESTIVAL!  ',
      ],
      variations: [['  ^^^  ^^^  ', ' \\o/  \\o/ \\o/']],
      mood: 'positive',
      description: 'The community celebrates with joy',
    },
    {
      lines: [
        '   🎭 🎭    ',
        '  ♪ ♫ ♪ ♫   ',
        ' \\o/ \\o/ \\o/',
        '  |   |   |  ',
        ' / \\ / \\ / \\',
        '~~~~~~~~~~~~',
      ],
      variations: [['   ^^^ ^^^   ', '  ♪ ♫ ♪ ♫   ']],
      mood: 'positive',
      description: 'Music and celebration fill the air',
    },
  ],
  exploration: [
    {
      lines: [
        '    /\\      ',
        '   /  \\     ',
        '  /____\\    ',
        ' |      |   ',
        ' |  []  |   ',
        ' |______|   ',
        '~~~~~~~~~~~~',
      ],
      variations: [['    /\\      ', '   /  \\     ', '  /    \\    ']],
      mood: 'neutral',
      description: 'A new structure rises from the ground',
    },
    {
      lines: [
        '     ?       ',
        '   .-"-.     ',
        '  /     \\    ',
        ' |   ?   |   ',
        '  \\     /    ',
        "   `-.-'     ",
        '     ?       ',
      ],
      variations: [['     !       ', '   .-"-.     ']],
      mood: 'mysterious',
      description: 'Unknown mysteries await discovery',
    },
  ],
  nature: [
    {
      lines: [
        '    🌳🌳    ',
        '   🌳🌳🌳   ',
        '  🌳🌳🌳🌳  ',
        ' ~~~~~~~~~~~',
        '    🌿🌿    ',
        '   🌿🌿🌿   ',
      ],
      variations: [['    ^^^     ', '   ^^^^^    ', '  ^^^^^^^   ']],
      mood: 'positive',
      description: 'Nature flourishes in harmony',
    },
    {
      lines: [
        '     ☁️      ',
        '   ☁️☁️☁️   ',
        '  ☁️☁️☁️☁️  ',
        '     |       ',
        '     |       ',
        ' ~~~~~~~~~~~',
      ],
      variations: [['     ^^^     ', '   ^^^^^    ']],
      mood: 'neutral',
      description: 'Clouds gather in the sky above',
    },
  ],
  conflict: [
    {
      lines: [
        '   ⚔️ ⚔️    ',
        '  /  X  \\   ',
        ' |   !   |  ',
        '  \\  !  /   ',
        '   \\   /    ',
        '    \\_/     ',
      ],
      variations: [['   >< ><    ', '  /  X  \\   ']],
      mood: 'negative',
      description: 'Tension and conflict arise',
    },
    {
      lines: [
        '    ⚡⚡     ',
        '   ⚡⚡⚡    ',
        '  ~~~~~~~~  ',
        '   DANGER   ',
        '  ~~~~~~~~  ',
        '            ',
      ],
      variations: [['    ><><    ', '   ><><><   ']],
      mood: 'negative',
      description: 'Danger threatens the community',
    },
  ],
  discovery: [
    {
      lines: [
        '    💎       ',
        '   /|\\      ',
        '  / | \\     ',
        ' /  |  \\    ',
        '/___|___\\   ',
        '    |       ',
      ],
      variations: [['    ◊       ', '   /|\\      ']],
      mood: 'positive',
      description: 'A precious discovery is made',
    },
    {
      lines: [
        '   📜📜     ',
        '  .-""-.    ',
        ' /      \\   ',
        '| WISDOM |  ',
        ' \\      /   ',
        '  `-""-\'    ',
      ],
      variations: [['   ^^^^     ', '  .-""-.    ']],
      mood: 'mysterious',
      description: 'Ancient knowledge is uncovered',
    },
  ],
  community: [
    {
      lines: [
        '  👥👥👥   ',
        ' \\o/\\o/\\o/ ',
        '  | | | |   ',
        ' /|\\|/|\\|  ',
        '~~~~~~~~~~~',
        ' TOGETHER!  ',
      ],
      variations: [['  ^^^  ^^^  ', ' \\o/ \\o/ \\o/']],
      mood: 'positive',
      description: 'The community stands united',
    },
    {
      lines: [
        '    🏠      ',
        '   /  \\     ',
        '  /____\\    ',
        ' |  []  |   ',
        ' |______|   ',
        '~~~~~~~~~~~~',
      ],
      variations: [['    ^^^     ', '   /  \\     ']],
      mood: 'neutral',
      description: 'Home provides safety and comfort',
    },
  ],
};

/**
 * ASCIIGenerator service class for creating themed ASCII art scenes
 */
export class ASCIIGenerator {
  /**
   * Generate ASCII scene based on story outcome
   */
  static async generateScene(voteResult: VoteResult): Promise<ASCIIScene> {
    try {
      console.log(`🎨 Generating ASCII scene for dilemma: ${voteResult.dilemmaId}`);

      // Determine theme based on winning option and effects
      const theme = this.determineTheme(voteResult.winningOption);

      // Determine mood based on attribute effects
      const mood = this.determineMood(voteResult.winningOption.attributeEffects);

      // Generate ASCII art
      const asciiArt = this.generateASCIIArt(theme, mood);

      // Generate caption
      const caption = this.generateCaption(voteResult, theme, mood);

      const scene: ASCIIScene = {
        lines: asciiArt.lines,
        caption,
        maxWidth: 24,
        theme,
        generatedAt: new Date(),
      };

      console.log(`✅ ASCII scene generated - Theme: ${theme}, Lines: ${scene.lines.length}`);
      return scene;
    } catch (error) {
      console.error('❌ Error generating ASCII scene:', error);

      // Return fallback scene
      return this.generateFallbackScene();
    }
  }

  /**
   * Generate ASCII scene with specific parameters
   */
  static async generateSceneWithParams(params: ASCIIGenerationParams): Promise<ASCIIScene> {
    try {
      console.log(`🎨 Generating ASCII scene with params:`, params);

      const asciiArt = this.generateASCIIArt(params.theme, params.mood, params.complexity);

      // Ensure lines fit within constraints
      const constrainedLines = this.constrainLines(
        asciiArt.lines,
        params.maxLines,
        params.maxWidth
      );

      const scene: ASCIIScene = {
        lines: constrainedLines,
        caption: params.includeCaption ? asciiArt.description : '',
        maxWidth: params.maxWidth,
        theme: params.theme,
        generatedAt: new Date(),
      };

      return scene;
    } catch (error) {
      console.error('❌ Error generating ASCII scene with params:', error);
      return this.generateFallbackScene();
    }
  }

  /**
   * Determine theme based on winning option characteristics
   */
  static determineTheme(winningOption: DilemmaOption): string {
    const text = winningOption.text.toLowerCase();
    const effects = winningOption.attributeEffects;

    // Check for specific keywords in option text
    if (text.includes('explore') || text.includes('investigate') || text.includes('search')) {
      return 'exploration';
    }

    if (text.includes('celebrate') || text.includes('festival') || text.includes('party')) {
      return 'festival';
    }

    if (text.includes('gather') || text.includes('together') || text.includes('unite')) {
      return 'community';
    }

    if (text.includes('study') || text.includes('discover') || text.includes('learn')) {
      return 'discovery';
    }

    if (text.includes('nature') || text.includes('forest') || text.includes('tree')) {
      return 'nature';
    }

    if (text.includes('fire') || text.includes('camp') || text.includes('warm')) {
      return 'campfire';
    }

    // Determine theme based on attribute effects
    if ((effects.curiosity || 0) >= 2) {
      return 'discovery';
    }

    if ((effects.stability || 0) >= 2) {
      return 'community';
    }

    if ((effects.survival || 0) >= 2) {
      return 'nature';
    }

    if ((effects.reputation || 0) >= 2) {
      return 'festival';
    }

    // Check for negative effects indicating conflict
    const hasNegativeEffects = Object.values(effects).some((v) => (v || 0) < -1);
    if (hasNegativeEffects) {
      return 'conflict';
    }

    // Default themes
    const defaultThemes = ['stars', 'campfire', 'nature'];
    return defaultThemes[Math.floor(Math.random() * defaultThemes.length)]!;
  }

  /**
   * Determine mood based on attribute effects
   */
  static determineMood(
    effects: WorldAttributeEffects
  ): 'positive' | 'negative' | 'neutral' | 'mysterious' {
    const totalPositive = Object.values(effects).reduce(
      (sum, val) => sum + Math.max(val || 0, 0),
      0
    );
    const totalNegative = Object.values(effects).reduce(
      (sum, val) => sum + Math.min(val || 0, 0),
      0
    );

    // Strong positive effects
    if (totalPositive >= 4) {
      return 'positive';
    }

    // Strong negative effects
    if (totalNegative <= -3) {
      return 'negative';
    }

    // High curiosity suggests mystery
    if ((effects.curiosity || 0) >= 2) {
      return 'mysterious';
    }

    // Balanced or minor effects
    return 'neutral';
  }

  /**
   * Generate ASCII art for given theme and mood
   */
  static generateASCIIArt(
    theme: string,
    mood: 'positive' | 'negative' | 'neutral' | 'mysterious',
    complexity: 'simple' | 'moderate' | 'detailed' = 'moderate'
  ): { lines: string[]; description: string } {
    // Get templates for the theme
    const templates = ASCII_TEMPLATES[theme] || ASCII_TEMPLATES.stars!;

    // Filter templates by mood preference
    const moodTemplates = templates.filter((t) => t.mood === mood);
    const availableTemplates = moodTemplates.length > 0 ? moodTemplates : templates;

    // Select random template
    const template = availableTemplates[Math.floor(Math.random() * availableTemplates.length)]!;

    // Apply variations based on complexity
    let lines = [...template.lines];

    if (complexity === 'simple' && template.variations.length > 0) {
      // Use simpler variations
      const variation = template.variations[0];
      if (variation) {
        lines = lines.map((line, index) => variation[index] || line);
      }
    } else if (complexity === 'detailed') {
      // Add extra details or use more complex variations
      if (template.variations.length > 1) {
        const variation = template.variations[template.variations.length - 1];
        if (variation) {
          lines = lines.map((line, index) => variation[index] || line);
        }
      }
    }

    return {
      lines,
      description: template.description,
    };
  }

  /**
   * Generate caption for the ASCII scene
   */
  static generateCaption(
    voteResult: VoteResult,
    _theme: string,
    mood: 'positive' | 'negative' | 'neutral' | 'mysterious'
  ): string {
    const { winningOption, summary } = voteResult;

    // Extract action from summary
    const actionMatch = summary.match(/chose to (.+?)\./);
    const action = actionMatch ? actionMatch[1] : winningOption.text.toLowerCase();

    // Generate caption based on theme and mood
    const captions = {
      positive: [
        `The community's choice to ${action} brings hope and prosperity.`,
        `A bright future unfolds as the people ${action}.`,
        `Joy spreads throughout the land after choosing to ${action}.`,
      ],
      negative: [
        `Dark clouds gather as the community ${action}.`,
        `The decision to ${action} brings unforeseen challenges.`,
        `Tension fills the air after choosing to ${action}.`,
      ],
      neutral: [
        `The community moves forward, having chosen to ${action}.`,
        `A new chapter begins as the people ${action}.`,
        `The world changes as the community ${action}.`,
      ],
      mysterious: [
        `Strange energies stir as the community ${action}.`,
        `The unknown beckons after choosing to ${action}.`,
        `Mysteries deepen as the people ${action}.`,
      ],
    };

    const moodCaptions = captions[mood];
    return moodCaptions[Math.floor(Math.random() * moodCaptions.length)]!;
  }

  /**
   * Constrain ASCII lines to fit within specified limits
   */
  static constrainLines(lines: string[], maxLines: number, maxWidth: number): string[] {
    // Limit number of lines
    let constrainedLines = lines.slice(0, maxLines);

    // Ensure minimum lines (pad with empty lines if needed)
    const minLines = 4;
    while (constrainedLines.length < minLines && constrainedLines.length < maxLines) {
      constrainedLines.push('');
    }

    // Constrain width of each line
    constrainedLines = constrainedLines.map((line) => {
      if (line.length > maxWidth) {
        return line.substring(0, maxWidth);
      }
      return line;
    });

    return constrainedLines;
  }

  /**
   * Generate fallback scene for error cases
   */
  static generateFallbackScene(): ASCIIScene {
    return {
      lines: [
        '    ⭐      ',
        '  ⭐ ⭐ ⭐  ',
        '    ⭐      ',
        '            ',
        ' The story  ',
        ' continues  ',
      ],
      caption: "The community's story unfolds...",
      maxWidth: 24,
      theme: 'default',
      generatedAt: new Date(),
    };
  }

  /**
   * Validate ASCII art to avoid copyrighted symbols
   */
  static validateASCIIArt(lines: string[]): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    // List of potentially copyrighted or problematic symbols
    const problematicSymbols = [
      '©',
      '®',
      '™', // Copyright symbols
      '🎮',
      '🎯',
      '🎲', // Gaming symbols that might be trademarked
      '🏢',
      '🏪',
      '🏬', // Building symbols that might represent brands
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      for (const symbol of problematicSymbols) {
        if (line.includes(symbol)) {
          issues.push(`Line ${i + 1} contains potentially copyrighted symbol: ${symbol}`);
        }
      }

      // Check line length
      if (line.length > 24) {
        issues.push(`Line ${i + 1} exceeds maximum width of 24 characters`);
      }
    }

    // Check total lines
    if (lines.length > 12) {
      issues.push(`ASCII art has ${lines.length} lines, maximum is 12`);
    }

    if (lines.length < 4) {
      issues.push(`ASCII art has ${lines.length} lines, minimum is 4`);
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get available themes
   */
  static getAvailableThemes(): string[] {
    return Object.keys(ASCII_TEMPLATES);
  }

  /**
   * Get template count for a theme
   */
  static getTemplateCount(theme: string): number {
    return ASCII_TEMPLATES[theme]?.length || 0;
  }

  /**
   * Preview ASCII template
   */
  static previewTemplate(theme: string, templateIndex = 0): ASCIIScene | null {
    const templates = ASCII_TEMPLATES[theme];
    if (!templates || !templates[templateIndex]) {
      return null;
    }

    const template = templates[templateIndex]!;
    return {
      lines: [...template.lines],
      caption: template.description,
      maxWidth: 24,
      theme,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate responsive ASCII scene optimized for different screen sizes
   */
  static generateResponsiveScene(
    voteResult: VoteResult,
    screenSize: 'mobile' | 'tablet' | 'desktop' = 'mobile'
  ): ASCIIScene {
    try {
      console.log(`📱 Generating responsive ASCII scene for ${screenSize}`);

      const theme = this.determineTheme(voteResult.winningOption);
      const mood = this.determineMood(voteResult.winningOption.attributeEffects);

      // Adjust parameters based on screen size
      const params = this.getResponsiveParams(screenSize);

      const asciiArt = this.generateASCIIArt(theme, mood, params.complexity);
      const scaledLines = this.scaleASCIIForScreen(asciiArt.lines, params);
      const caption = this.generateCaption(voteResult, theme, mood);

      const scene: ASCIIScene = {
        lines: scaledLines,
        caption,
        maxWidth: params.maxWidth,
        theme,
        generatedAt: new Date(),
      };

      console.log(`✅ Responsive ASCII scene generated for ${screenSize}`);
      return scene;
    } catch (error) {
      console.error('❌ Error generating responsive ASCII scene:', error);
      return this.generateFallbackScene();
    }
  }

  /**
   * Get responsive parameters based on screen size
   */
  static getResponsiveParams(screenSize: 'mobile' | 'tablet' | 'desktop') {
    switch (screenSize) {
      case 'mobile':
        return {
          maxWidth: 20,
          maxLines: 6,
          complexity: 'simple' as const,
          fontSize: 'small',
        };
      case 'tablet':
        return {
          maxWidth: 24,
          maxLines: 8,
          complexity: 'moderate' as const,
          fontSize: 'medium',
        };
      case 'desktop':
        return {
          maxWidth: 28,
          maxLines: 12,
          complexity: 'detailed' as const,
          fontSize: 'large',
        };
      default:
        return {
          maxWidth: 24,
          maxLines: 8,
          complexity: 'moderate' as const,
          fontSize: 'medium',
        };
    }
  }

  /**
   * Scale ASCII art for different screen sizes
   */
  static scaleASCIIForScreen(
    lines: string[],
    params: { maxWidth: number; maxLines: number; fontSize: string }
  ): string[] {
    let scaledLines = [...lines];

    // Constrain to screen size limits
    scaledLines = this.constrainLines(scaledLines, params.maxLines, params.maxWidth);

    // For mobile, simplify complex characters
    if (params.fontSize === 'small') {
      scaledLines = scaledLines.map((line) => this.simplifyForMobile(line));
    }

    // Ensure proper spacing for readability
    scaledLines = this.optimizeSpacing(scaledLines, params.fontSize);

    return scaledLines;
  }

  /**
   * Simplify ASCII art for mobile displays
   */
  static simplifyForMobile(line: string): string {
    // Replace complex Unicode characters with simpler alternatives
    const mobileReplacements: Record<string, string> = {
      '🌳': '^',
      '🌿': '~',
      '⭐': '*',
      '💎': '◊',
      '📜': '=',
      '🎪': '^',
      '🎭': 'o',
      '👥': 'o',
      '🏠': '[]',
      '⚔️': 'X',
      '⚡': '!',
      '☁️': '~',
      '♪': '♪',
      '♫': '♫',
    };

    let simplifiedLine = line;
    for (const [complex, simple] of Object.entries(mobileReplacements)) {
      simplifiedLine = simplifiedLine.replace(new RegExp(complex, 'g'), simple);
    }

    return simplifiedLine;
  }

  /**
   * Optimize spacing for different font sizes
   */
  static optimizeSpacing(lines: string[], fontSize: string): string[] {
    if (fontSize === 'small') {
      // Reduce spacing for mobile
      return lines.map((line) => line.replace(/  +/g, ' '));
    } else if (fontSize === 'large') {
      // Add extra spacing for desktop
      return lines.map((line) => line.replace(/ /g, '  '));
    }

    return lines; // Keep original spacing for medium
  }

  /**
   * Generate animated ASCII scene with frame data
   */
  static async generateAnimatedScene(
    voteResult: VoteResult,
    animationType: 'fade' | 'slide' | 'sparkle' | 'pulse' = 'fade'
  ): Promise<{
    scene: ASCIIScene;
    animationFrames: string[][];
    animationDuration: number;
  }> {
    try {
      console.log(`✨ Generating animated ASCII scene with ${animationType} effect`);

      const baseScene = await this.generateScene(voteResult);
      const animationFrames = this.generateAnimationFrames(baseScene.lines, animationType);

      return {
        scene: baseScene,
        animationFrames,
        animationDuration: this.getAnimationDuration(animationType),
      };
    } catch (error) {
      console.error('❌ Error generating animated ASCII scene:', error);
      const fallbackScene = this.generateFallbackScene();
      return {
        scene: fallbackScene,
        animationFrames: [fallbackScene.lines],
        animationDuration: 0,
      };
    }
  }

  /**
   * Generate animation frames for ASCII art
   */
  static generateAnimationFrames(
    baseLines: string[],
    animationType: 'fade' | 'slide' | 'sparkle' | 'pulse'
  ): string[][] {
    const frames: string[][] = [];
    const frameCount = 4;

    switch (animationType) {
      case 'fade':
        // Fade in effect - gradually reveal characters
        for (let frame = 0; frame < frameCount; frame++) {
          const revealPercent = (frame + 1) / frameCount;
          const frameLines = baseLines.map((line) => this.applyFadeEffect(line, revealPercent));
          frames.push(frameLines);
        }
        break;

      case 'slide':
        // Slide in from left effect
        for (let frame = 0; frame < frameCount; frame++) {
          const slideOffset =
            Math.max(0, baseLines[0]?.length || 0) -
            Math.floor((frame + 1) * ((baseLines[0]?.length || 0) / frameCount));
          const frameLines = baseLines.map((line) => this.applySlideEffect(line, slideOffset));
          frames.push(frameLines);
        }
        break;

      case 'sparkle':
        // Sparkle effect - add random sparkles
        for (let frame = 0; frame < frameCount; frame++) {
          const frameLines = baseLines.map((line) => this.applySparkleEffect(line, frame));
          frames.push(frameLines);
        }
        break;

      case 'pulse':
        // Pulse effect - alternate between normal and emphasized
        for (let frame = 0; frame < frameCount; frame++) {
          const isEmphasized = frame % 2 === 0;
          const frameLines = baseLines.map((line) => this.applyPulseEffect(line, isEmphasized));
          frames.push(frameLines);
        }
        break;

      default:
        frames.push(baseLines);
    }

    return frames;
  }

  /**
   * Apply fade effect to a line
   */
  static applyFadeEffect(line: string, revealPercent: number): string {
    const revealLength = Math.floor(line.length * revealPercent);
    return line.substring(0, revealLength) + ' '.repeat(line.length - revealLength);
  }

  /**
   * Apply slide effect to a line
   */
  static applySlideEffect(line: string, slideOffset: number): string {
    if (slideOffset <= 0) return line;
    return ' '.repeat(Math.min(slideOffset, line.length)) + line.substring(slideOffset);
  }

  /**
   * Apply sparkle effect to a line
   */
  static applySparkleEffect(line: string, frame: number): string {
    let sparkledLine = line;

    // Add sparkles at random positions
    const sparkleChars = ['*', '·', '✦', '✧'];
    const sparkleCount = Math.floor(line.length * 0.1); // 10% of characters

    for (let i = 0; i < sparkleCount; i++) {
      const position = Math.floor(Math.random() * line.length);
      const sparkleChar = sparkleChars[(frame + i) % sparkleChars.length];

      if (sparkleChar && line[position] === ' ') {
        sparkledLine =
          sparkledLine.substring(0, position) + sparkleChar + sparkledLine.substring(position + 1);
      }
    }

    return sparkledLine;
  }

  /**
   * Apply pulse effect to a line
   */
  static applyPulseEffect(line: string, isEmphasized: boolean): string {
    if (!isEmphasized) return line;

    // Emphasize by replacing certain characters
    return line.replace(/\*/g, '★').replace(/\./g, '●').replace(/o/g, 'O').replace(/\^/g, '▲');
  }

  /**
   * Get animation duration in milliseconds
   */
  static getAnimationDuration(animationType: 'fade' | 'slide' | 'sparkle' | 'pulse'): number {
    switch (animationType) {
      case 'fade':
        return 2000;
      case 'slide':
        return 1500;
      case 'sparkle':
        return 3000;
      case 'pulse':
        return 1000;
      default:
        return 2000;
    }
  }

  /**
   * Enhanced ASCII art validation with comprehensive checks
   */
  static validateASCIIArtEnhanced(lines: string[]): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
    score: number;
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // Basic validation from original method
    const basicValidation = this.validateASCIIArt(lines);
    issues.push(...basicValidation.issues);

    // Additional enhanced validations

    // Check for readability
    const readabilityScore = this.assessReadability(lines);
    if (readabilityScore < 70) {
      issues.push('ASCII art may be difficult to read on small screens');
      suggestions.push('Consider simplifying complex characters for better mobile readability');
      score -= 20;
    }

    // Check for balanced composition
    const balanceScore = this.assessBalance(lines);
    if (balanceScore < 60) {
      issues.push('ASCII art composition appears unbalanced');
      suggestions.push('Consider centering or redistributing elements for better visual balance');
      score -= 15;
    }

    // Check for appropriate density
    const densityScore = this.assessDensity(lines);
    if (densityScore < 50) {
      issues.push('ASCII art is too sparse or too dense');
      suggestions.push('Adjust character density for optimal visual impact');
      score -= 10;
    }

    // Check for animation compatibility
    if (!this.isAnimationCompatible(lines)) {
      suggestions.push('ASCII art could be enhanced with animation effects');
      score -= 5;
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions,
      score: Math.max(0, score),
    };
  }

  /**
   * Assess readability of ASCII art
   */
  static assessReadability(lines: string[]): number {
    let readabilityScore = 100;

    for (const line of lines) {
      // Check for overly complex Unicode characters
      const complexChars = line.match(/[^\u0020-\u007E]/g);
      if (complexChars && complexChars.length > line.length * 0.3) {
        readabilityScore -= 20;
      }

      // Check for excessive character variety
      const uniqueChars = new Set(line.split(''));
      if (uniqueChars.size > 8) {
        readabilityScore -= 10;
      }
    }

    return Math.max(0, readabilityScore);
  }

  /**
   * Assess visual balance of ASCII art
   */
  static assessBalance(lines: string[]): number {
    if (lines.length === 0) return 0;

    let balanceScore = 100;

    // Check horizontal balance
    const leftHeavy = lines.filter((line) => {
      const leftHalf = line.substring(0, Math.floor(line.length / 2));
      const rightHalf = line.substring(Math.floor(line.length / 2));
      const leftDensity = leftHalf.replace(/\s/g, '').length;
      const rightDensity = rightHalf.replace(/\s/g, '').length;
      return leftDensity > rightDensity * 2;
    });

    if (leftHeavy.length > lines.length * 0.7) {
      balanceScore -= 30;
    }

    // Check vertical balance
    const topHalf = lines.slice(0, Math.floor(lines.length / 2));
    const bottomHalf = lines.slice(Math.floor(lines.length / 2));

    const topDensity = topHalf.join('').replace(/\s/g, '').length;
    const bottomDensity = bottomHalf.join('').replace(/\s/g, '').length;

    if (topDensity > bottomDensity * 2 || bottomDensity > topDensity * 2) {
      balanceScore -= 20;
    }

    return Math.max(0, balanceScore);
  }

  /**
   * Assess character density of ASCII art
   */
  static assessDensity(lines: string[]): number {
    if (lines.length === 0) return 0;

    const totalChars = lines.join('').length;
    const nonSpaceChars = lines.join('').replace(/\s/g, '').length;
    const density = nonSpaceChars / totalChars;

    // Optimal density is between 0.3 and 0.7
    if (density >= 0.3 && density <= 0.7) {
      return 100;
    } else if (density < 0.2 || density > 0.8) {
      return 20;
    } else {
      return 60;
    }
  }

  /**
   * Check if ASCII art is compatible with animations
   */
  static isAnimationCompatible(lines: string[]): boolean {
    // ASCII art is animation-compatible if it has:
    // 1. Sufficient non-space characters
    // 2. Varied character types
    // 3. Reasonable dimensions

    const nonSpaceChars = lines.join('').replace(/\s/g, '').length;
    const uniqueChars = new Set(lines.join('').split(''));

    return nonSpaceChars >= 10 && uniqueChars.size >= 3 && lines.length >= 4 && lines.length <= 12;
  }

  /**
   * Optimize ASCII art for performance and visual appeal
   */
  static optimizeASCIIArt(
    lines: string[],
    targetScreen: 'mobile' | 'tablet' | 'desktop' = 'mobile'
  ): {
    optimizedLines: string[];
    optimizations: string[];
    performanceScore: number;
  } {
    const optimizations: string[] = [];
    let optimizedLines = [...lines];
    let performanceScore = 100;

    // Get target parameters
    const params = this.getResponsiveParams(targetScreen);

    // Optimize for screen size
    if (optimizedLines.some((line) => line.length > params.maxWidth)) {
      optimizedLines = this.constrainLines(optimizedLines, params.maxLines, params.maxWidth);
      optimizations.push(`Constrained to ${params.maxWidth} characters width`);
    }

    // Simplify for mobile if needed
    if (targetScreen === 'mobile') {
      const originalComplexity = optimizedLines.join('').match(/[^\u0020-\u007E]/g)?.length || 0;
      optimizedLines = optimizedLines.map((line) => this.simplifyForMobile(line));
      const newComplexity = optimizedLines.join('').match(/[^\u0020-\u007E]/g)?.length || 0;

      if (newComplexity < originalComplexity) {
        optimizations.push('Simplified Unicode characters for mobile compatibility');
        performanceScore += 10;
      }
    }

    // Optimize spacing
    const originalSpacing = optimizedLines.join('').match(/\s+/g)?.length || 0;
    optimizedLines = this.optimizeSpacing(optimizedLines, params.fontSize);
    const newSpacing = optimizedLines.join('').match(/\s+/g)?.length || 0;

    if (newSpacing !== originalSpacing) {
      optimizations.push(`Optimized spacing for ${params.fontSize} font size`);
      performanceScore += 5;
    }

    // Remove empty trailing lines
    while (optimizedLines.length > 0 && optimizedLines[optimizedLines.length - 1]?.trim() === '') {
      optimizedLines.pop();
      optimizations.push('Removed empty trailing lines');
      performanceScore += 2;
    }

    return {
      optimizedLines,
      optimizations,
      performanceScore: Math.min(100, performanceScore),
    };
  }
}
