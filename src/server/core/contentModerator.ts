/**
 * Content moderation system for CrowdLore dilemmas
 */

import type { DilemmaData, ContentFlag, ModerationResult } from '../../shared/types/index.js';

// Inappropriate content patterns to detect and filter
const CONTENT_FILTERS = {
  political: [
    // Political terms and figures
    /\b(democrat|republican|liberal|conservative|trump|biden|election|vote|politics|government|congress|senate)\b/gi,
    /\b(left-wing|right-wing|socialism|capitalism|communism|fascism|nazi|antifa)\b/gi,
    /\b(president|politician|political|campaign|ballot|referendum)\b/gi,
  ],
  sexual: [
    // Sexual content
    /\b(sex|sexual|porn|nude|naked|breast|penis|vagina|orgasm|masturbat)\b/gi,
    /\b(erotic|seductive|arousal|intimate|sensual|lust|desire)\b/gi,
    /\b(adult|xxx|nsfw|explicit|mature)\b/gi,
  ],
  hateful: [
    // Hate speech and discriminatory language
    /\b(hate|hatred|racist|racism|sexist|sexism|homophobic|transphobic)\b/gi,
    /\b(nazi|hitler|genocide|ethnic cleansing|supremacist)\b/gi,
    /\b(terrorist|terrorism|extremist|radical|militant)\b/gi,
    // Slurs and offensive terms (using partial matches to avoid explicit content)
    /\b(f[a4]gg[o0]t|n[i1]gg[e3]r|ch[i1]nk|sp[i1]ck|k[i1]k[e3])\b/gi,
  ],
  personal: [
    // Personal information
    /\b(\d{3}-\d{2}-\d{4}|\d{3}\.\d{2}\.\d{4})\b/g, // SSN patterns
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
    /\b\d{3}-\d{3}-\d{4}\b/g, // Phone numbers
    /\b\d{1,5}\s\w+\s(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)\b/gi, // Addresses
  ],
  brand: [
    // Real brands and companies
    /\b(apple|google|microsoft|amazon|facebook|meta|twitter|tesla|nike|coca-cola|pepsi|mcdonalds|walmart|disney)\b/gi,
    /\b(iphone|android|windows|xbox|playstation|nintendo|starbucks|uber|netflix|youtube)\b/gi,
    /\b(ford|toyota|honda|bmw|mercedes|volkswagen|chevrolet|dodge)\b/gi,
  ],
  inappropriate: [
    // Violence and disturbing content
    /\b(kill|murder|death|die|suicide|torture|violence|blood|gore|weapon|gun|knife|bomb)\b/gi,
    /\b(drug|cocaine|heroin|marijuana|meth|alcohol|drunk|addiction)\b/gi,
    /\b(curse|damn|hell|shit|fuck|bitch|ass|crap)\b/gi,
  ],
};

// Neutral replacement phrases for different content types
const REPLACEMENT_PHRASES = {
  political: [
    'the governing council',
    'the leadership',
    'the authorities',
    'the ruling body',
    'the administration',
  ],
  sexual: [
    'romantic feelings',
    'personal relationships',
    'intimate connections',
    'emotional bonds',
    'companionship',
  ],
  hateful: ['disagreement', 'conflict', 'tension', 'opposition', 'rivalry'],
  personal: [
    '[personal information]',
    '[contact details]',
    '[private data]',
    '[confidential info]',
  ],
  brand: [
    'a well-known company',
    'a major organization',
    'a popular brand',
    'a large corporation',
    'a famous enterprise',
  ],
  inappropriate: ['conflict', 'challenge', 'difficulty', 'problem', 'obstacle'],
};

/**
 * ContentModerator service class
 */
export class ContentModerator {
  /**
   * Moderate complete dilemma content
   */
  async moderateContent(dilemma: DilemmaData): Promise<{
    dilemma: DilemmaData;
    flags: ContentFlag[];
    isAppropriate: boolean;
  }> {
    console.log(`🛡️ Moderating dilemma: ${dilemma.id}`);

    const allFlags: ContentFlag[] = [];
    const moderatedDilemma = { ...dilemma };

    // Moderate title
    const titleResult = this.moderateText(dilemma.title, 'title');
    allFlags.push(...titleResult.flags);
    moderatedDilemma.title = titleResult.sanitizedContent;

    // Moderate scenario
    const scenarioResult = this.moderateText(dilemma.scenario, 'scenario');
    allFlags.push(...scenarioResult.flags);
    moderatedDilemma.scenario = scenarioResult.sanitizedContent;

    // Moderate options
    moderatedDilemma.options = dilemma.options.map((option, index) => {
      const textResult = this.moderateText(option.text, `option-${index}-text`);
      const descResult = this.moderateText(option.description, `option-${index}-description`);

      allFlags.push(...textResult.flags, ...descResult.flags);

      // Moderate pros and cons
      const moderatedPros = option.pros.map((pro, proIndex) => {
        const proResult = this.moderateText(pro, `option-${index}-pro-${proIndex}`);
        allFlags.push(...proResult.flags);
        return proResult.sanitizedContent;
      });

      const moderatedCons = option.cons.map((con, conIndex) => {
        const conResult = this.moderateText(con, `option-${index}-con-${conIndex}`);
        allFlags.push(...conResult.flags);
        return conResult.sanitizedContent;
      });

      return {
        ...option,
        text: textResult.sanitizedContent,
        description: descResult.sanitizedContent,
        pros: moderatedPros,
        cons: moderatedCons,
      };
    }) as [(typeof dilemma.options)[0], (typeof dilemma.options)[1], (typeof dilemma.options)[2]];

    // Determine if content is appropriate
    const highSeverityFlags = allFlags.filter((flag) => flag.severity === 'high');
    const isAppropriate = highSeverityFlags.length === 0;

    console.log(
      `🔍 Moderation complete - Flags: ${allFlags.length}, Appropriate: ${isAppropriate}`
    );

    return {
      dilemma: moderatedDilemma,
      flags: allFlags,
      isAppropriate,
    };
  }

  /**
   * Moderate individual text content
   */
  moderateText(content: string, location: string): ModerationResult {
    const flags: ContentFlag[] = [];
    let sanitizedContent = content;
    let hasHighSeverityFlag = false;

    // Check each content filter category
    for (const [category, patterns] of Object.entries(CONTENT_FILTERS)) {
      for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) {
          for (const match of matches) {
            const severity = this.determineSeverity(
              category as keyof typeof CONTENT_FILTERS,
              match
            );

            flags.push({
              type: category as ContentFlag['type'],
              severity,
              location,
              originalText: match,
              suggestedReplacement: this.getReplacementPhrase(
                category as keyof typeof CONTENT_FILTERS
              ),
            });

            if (severity === 'high') {
              hasHighSeverityFlag = true;
            }

            // Replace inappropriate content
            sanitizedContent = sanitizedContent.replace(
              new RegExp(this.escapeRegExp(match), 'gi'),
              this.getReplacementPhrase(category as keyof typeof CONTENT_FILTERS)
            );
          }
        }
      }
    }

    return {
      isAppropriate: !hasHighSeverityFlag,
      flags,
      sanitizedContent,
      confidence: this.calculateConfidence(flags.length, content.length),
    };
  }

  /**
   * Determine severity of flagged content
   */
  private determineSeverity(
    category: keyof typeof CONTENT_FILTERS,
    match: string
  ): ContentFlag['severity'] {
    // High severity categories
    if (category === 'hateful' || category === 'personal') {
      return 'high';
    }

    // Medium severity for explicit content
    if (category === 'sexual' || category === 'inappropriate') {
      // Check for more explicit terms
      const explicitTerms = ['fuck', 'shit', 'kill', 'murder', 'death'];
      if (explicitTerms.some((term) => match.toLowerCase().includes(term))) {
        return 'high';
      }
      return 'medium';
    }

    // Low severity for brands and mild political content
    return 'low';
  }

  /**
   * Get appropriate replacement phrase for content category
   */
  private getReplacementPhrase(category: keyof typeof CONTENT_FILTERS): string {
    const phrases = REPLACEMENT_PHRASES[category];
    if (!phrases || phrases.length === 0) {
      return '[content removed]';
    }

    const randomIndex = Math.floor(Math.random() * phrases.length);
    return phrases[randomIndex]!;
  }

  /**
   * Calculate confidence score for moderation decision
   */
  private calculateConfidence(flagCount: number, contentLength: number): number {
    if (contentLength === 0) return 1.0;

    // Base confidence starts high
    let confidence = 0.95;

    // Reduce confidence based on flag density
    const flagDensity = flagCount / (contentLength / 100); // flags per 100 characters
    confidence -= flagDensity * 0.1;

    // Ensure confidence stays within bounds
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Escape special regex characters
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Validate that content meets brand-neutral standards
   */
  validateBrandNeutral(content: string): { isNeutral: boolean; violations: string[] } {
    const violations: string[] = [];

    // Check for real-world references
    const realWorldPatterns = [
      /\b(earth|america|usa|europe|asia|africa|australia)\b/gi,
      /\b(english|spanish|french|german|chinese|japanese)\b/gi,
      /\b(christian|muslim|jewish|hindu|buddhist|catholic)\b/gi,
      /\b(dollar|euro|pound|yen|bitcoin|cryptocurrency)\b/gi,
    ];

    for (const pattern of realWorldPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        violations.push(...matches);
      }
    }

    return {
      isNeutral: violations.length === 0,
      violations,
    };
  }

  /**
   * Replace inappropriate content with neutral placeholders
   */
  replaceInappropriate(content: string): string {
    let sanitized = content;

    // Apply all content filters
    for (const [category, patterns] of Object.entries(CONTENT_FILTERS)) {
      for (const pattern of patterns) {
        const replacement = this.getReplacementPhrase(category as keyof typeof CONTENT_FILTERS);
        sanitized = sanitized.replace(pattern, replacement);
      }
    }

    return sanitized;
  }

  /**
   * Flag risky content that might need human review
   */
  flagRiskyContent(content: string): ContentFlag[] {
    const flags: ContentFlag[] = [];

    // Patterns that might need human review
    const riskyPatterns = [
      { pattern: /\b(war|battle|fight|attack|invasion)\b/gi, type: 'inappropriate' as const },
      {
        pattern: /\b(religion|god|allah|jesus|buddha|prophet)\b/gi,
        type: 'inappropriate' as const,
      },
      { pattern: /\b(money|cash|profit|wealth|rich|poor)\b/gi, type: 'brand' as const },
      { pattern: /\b(real|actual|true|fact|reality)\b/gi, type: 'brand' as const },
    ];

    for (const { pattern, type } of riskyPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          flags.push({
            type,
            severity: 'low',
            location: 'content-review',
            originalText: match,
            suggestedReplacement: 'Consider alternative phrasing',
          });
        }
      }
    }

    return flags;
  }
}
