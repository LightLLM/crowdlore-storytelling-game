import { describe, it, expect } from 'vitest';

describe('Dilemma Generation Logic', () => {
  describe('Content Validation', () => {
    it('validates appropriate content', () => {
      const validateContent = (content: string) => {
        const inappropriateTerms = ['trump', 'biden', 'sex', 'hate', 'kill'];
        const lowerContent = content.toLowerCase();
        const hasInappropriate = inappropriateTerms.some((term) => lowerContent.includes(term));

        return {
          isAppropriate: !hasInappropriate,
          flags: hasInappropriate
            ? [
                {
                  type: 'inappropriate',
                  term: inappropriateTerms.find((term) => lowerContent.includes(term)),
                },
              ]
            : [],
        };
      };

      const appropriateContent = 'The village discovers a mysterious cave';
      const inappropriateContent = 'This contains political content about Trump';

      expect(validateContent(appropriateContent).isAppropriate).toBe(true);
      expect(validateContent(inappropriateContent).isAppropriate).toBe(false);
      expect(validateContent(inappropriateContent).flags).toHaveLength(1);
    });

    it('validates attribute effect constraints', () => {
      const validateAttributeEffects = (effects: Record<string, number>) => {
        return Object.values(effects).every((value) => value >= -3 && value <= 3);
      };

      const validEffects = { stability: 2, curiosity: -1, survival: 3 };
      const invalidEffects = { stability: 5, curiosity: -4, survival: 1 };

      expect(validateAttributeEffects(validEffects)).toBe(true);
      expect(validateAttributeEffects(invalidEffects)).toBe(false);
    });

    it('ensures three balanced options', () => {
      const validateOptions = (options: Array<{ attributeEffects: Record<string, number> }>) => {
        if (options.length !== 3) return false;

        // Check that options have different effects
        const effectStrings = options.map((opt) => JSON.stringify(opt.attributeEffects));
        const uniqueEffects = new Set(effectStrings);

        return uniqueEffects.size === 3;
      };

      const balancedOptions = [
        { attributeEffects: { stability: 2, curiosity: -1 } },
        { attributeEffects: { curiosity: 2, survival: -1 } },
        { attributeEffects: { survival: 2, reputation: -1 } },
      ];

      const unbalancedOptions = [
        { attributeEffects: { stability: 2 } },
        { attributeEffects: { stability: 2 } },
        { attributeEffects: { stability: 2 } },
      ];

      expect(validateOptions(balancedOptions)).toBe(true);
      expect(validateOptions(unbalancedOptions)).toBe(false);
    });
  });
});
