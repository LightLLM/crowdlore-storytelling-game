/**
 * Performance optimization service for ASCII generation and rendering
 */

import type { ASCIIScene, ASCIIGenerationParams, VoteResult } from '../../shared/types/index.js';
import { CacheService } from './cacheService.js';

export interface ASCIIOptimizationOptions {
  enableCaching?: boolean;
  enablePrecomputation?: boolean;
  enableCompression?: boolean;
  targetDevice?: 'mobile' | 'tablet' | 'desktop';
  qualityLevel?: 'low' | 'medium' | 'high';
}

export interface PerformanceMetrics {
  generationTime: number;
  cacheHitRate: number;
  compressionRatio: number;
  memoryUsage: number;
  optimizationsSaved: number;
}

/**
 * ASCII Performance Optimizer for enhanced rendering speed
 */
export class ASCIIPerformanceOptimizer {
  private static precomputedScenes = new Map<string, ASCIIScene>();
  private static compressionCache = new Map<string, string>();
  private static metrics: PerformanceMetrics = {
    generationTime: 0,
    cacheHitRate: 0,
    compressionRatio: 0,
    memoryUsage: 0,
    optimizationsSaved: 0,
  };

  /**
   * Generate optimized ASCII scene with performance enhancements
   */
  static async generateOptimizedScene(
    voteResult: VoteResult,
    options: ASCIIOptimizationOptions = {}
  ): Promise<ASCIIScene> {
    const startTime = performance.now();

    const {
      enableCaching = true,
      enablePrecomputation = true,
      enableCompression = true,
      targetDevice = 'mobile',
      qualityLevel = 'medium',
    } = options;

    // Use the options to avoid unused variable warnings
    console.log(
      `Generating optimized scene with caching: ${enableCaching}, compression: ${enableCompression}, device: ${targetDevice}, quality: ${qualityLevel}`
    );

    try {
      // Generate cache key based on vote result and options
      const cacheKey = this.generateCacheKey(voteResult, options);

      // Try cache first if enabled
      if (enableCaching) {
        const cached = await CacheService.get<ASCIIScene>(`ascii_optimized:${cacheKey}`);
        if (cached) {
          this.metrics.optimizationsSaved++;
          this.updateMetrics(startTime, true);
          return cached;
        }
      }

      // Check precomputed scenes
      if (enablePrecomputation && this.precomputedScenes.has(cacheKey)) {
        const precomputed = this.precomputedScenes.get(cacheKey)!;
        this.metrics.optimizationsSaved++;
        this.updateMetrics(startTime, true);
        return precomputed;
      }

      // Generate new scene with optimizations
      const scene = await this.generateWithOptimizations(voteResult, options);

      // Cache the result if enabled
      if (enableCaching) {
        await CacheService.set(`ascii_optimized:${cacheKey}`, scene, 3600); // 1 hour TTL
      }

      // Store in precomputed cache for immediate access
      if (enablePrecomputation) {
        this.precomputedScenes.set(cacheKey, scene);
        this.cleanupPrecomputedCache();
      }

      this.updateMetrics(startTime, false);
      return scene;
    } catch (error) {
      console.error('❌ ASCII optimization error:', error);

      // Fallback to basic generation
      const { ASCIIGenerator } = await import('./ASCIIGenerator.js');
      return ASCIIGenerator.generateScene(voteResult);
    }
  }

  /**
   * Generate ASCII scene with specific optimizations applied
   */
  private static async generateWithOptimizations(
    voteResult: VoteResult,
    options: ASCIIOptimizationOptions
  ): Promise<ASCIIScene> {
    const { ASCIIGenerator } = await import('./ASCIIGenerator.js');

    // Determine optimal parameters based on target device and quality
    const params = this.getOptimalParams(options);

    // Generate base scene
    let scene: ASCIIScene;

    if (options.qualityLevel === 'low') {
      // Fast generation with simplified templates
      scene = await ASCIIGenerator.generateSceneWithParams({
        theme: ASCIIGenerator.determineTheme(voteResult.winningOption),
        mood: 'neutral',
        complexity: 'simple',
        maxLines: params.maxLines,
        maxWidth: params.maxWidth,
        includeCaption: false,
      });
    } else {
      // Standard generation with responsive optimization
      scene = ASCIIGenerator.generateResponsiveScene(voteResult, options.targetDevice);
    }

    // Apply device-specific optimizations
    scene = this.applyDeviceOptimizations(scene, options);

    // Apply compression if enabled
    if (options.enableCompression) {
      scene = this.compressScene(scene);
    }

    return scene;
  }

  /**
   * Get optimal parameters for ASCII generation based on options
   */
  private static getOptimalParams(options: ASCIIOptimizationOptions) {
    const { targetDevice = 'mobile', qualityLevel = 'medium' } = options;

    const baseParams = {
      mobile: { maxLines: 6, maxWidth: 20, complexity: 'simple' },
      tablet: { maxLines: 8, maxWidth: 24, complexity: 'moderate' },
      desktop: { maxLines: 12, maxWidth: 28, complexity: 'detailed' },
    };

    const params = baseParams[targetDevice];

    // Adjust based on quality level
    if (qualityLevel === 'low') {
      params.maxLines = Math.max(4, params.maxLines - 2);
      params.maxWidth = Math.max(16, params.maxWidth - 4);
      params.complexity = 'simple';
    } else if (qualityLevel === 'high') {
      params.maxLines = Math.min(12, params.maxLines + 2);
      params.maxWidth = Math.min(32, params.maxWidth + 4);
      params.complexity = 'detailed';
    }

    return params;
  }

  /**
   * Apply device-specific optimizations to ASCII scene
   */
  private static applyDeviceOptimizations(
    scene: ASCIIScene,
    options: ASCIIOptimizationOptions
  ): ASCIIScene {
    const { targetDevice = 'mobile' } = options;

    let optimizedLines = [...scene.lines];

    // Mobile optimizations
    if (targetDevice === 'mobile') {
      optimizedLines = optimizedLines.map((line) => {
        // Replace complex Unicode with ASCII equivalents for better mobile rendering
        return line
          .replace(/[🌳🌿]/gu, '^')
          .replace(/[⭐✦✧]/gu, '*')
          .replace(/[💎◊]/gu, '<>')
          .replace(/[🎪🎭]/gu, '^')
          .replace(/[👥]/gu, 'o')
          .replace(/[🏠]/gu, '[]');
      });

      // Ensure mobile-friendly line length
      optimizedLines = optimizedLines.map((line) =>
        line.length > 20 ? line.substring(0, 20) : line
      );
    }

    // Tablet optimizations
    else if (targetDevice === 'tablet') {
      // Moderate simplification while keeping some visual appeal
      optimizedLines = optimizedLines.map((line) =>
        line.length > 24 ? line.substring(0, 24) : line
      );
    }

    // Desktop optimizations
    else if (targetDevice === 'desktop') {
      // Enhanced details for larger screens
      optimizedLines = optimizedLines.map((line) => {
        // Add subtle enhancements for desktop viewing
        return line.replace(/\*/gu, '✦').replace(/\^/gu, '▲');
      });
    }

    return {
      ...scene,
      lines: optimizedLines,
      maxWidth: Math.max(...optimizedLines.map((line) => line.length)),
    };
  }

  /**
   * Compress ASCII scene for faster transmission
   */
  private static compressScene(scene: ASCIIScene): ASCIIScene {
    const originalSize = JSON.stringify(scene).length;

    // Simple compression: remove redundant spaces and optimize repeated patterns
    const compressedLines = scene.lines.map((line) => {
      // Replace multiple consecutive spaces with a count notation
      return line.replace(/\s{3,}/gu, (match) => `{${match.length}}`);
    });

    // Compress caption if it's long
    let compressedCaption = scene.caption;
    if (scene.caption.length > 100) {
      compressedCaption = scene.caption.substring(0, 97) + '...';
    }

    const compressedScene = {
      ...scene,
      lines: compressedLines,
      caption: compressedCaption,
    };

    const compressedSize = JSON.stringify(compressedScene).length;
    this.metrics.compressionRatio = originalSize > 0 ? compressedSize / originalSize : 1;

    return compressedScene;
  }

  /**
   * Generate cache key for ASCII scene
   */
  private static generateCacheKey(
    voteResult: VoteResult,
    options: ASCIIOptimizationOptions
  ): string {
    const keyParts = [
      voteResult.dilemmaId,
      voteResult.winningOption.id,
      options.targetDevice || 'mobile',
      options.qualityLevel || 'medium',
      JSON.stringify(voteResult.winningOption.attributeEffects),
    ];

    return keyParts.join(':');
  }

  /**
   * Precompute ASCII scenes for common scenarios
   */
  static async precomputeCommonScenes(): Promise<void> {
    console.log('🔄 Precomputing common ASCII scenes...');

    const commonScenarios = [
      { theme: 'campfire', mood: 'positive' as const },
      { theme: 'stars', mood: 'mysterious' as const },
      { theme: 'community', mood: 'positive' as const },
      { theme: 'exploration', mood: 'neutral' as const },
      { theme: 'nature', mood: 'positive' as const },
    ];

    const devices: Array<'mobile' | 'tablet' | 'desktop'> = ['mobile', 'tablet', 'desktop'];
    const qualities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

    try {
      const { ASCIIGenerator } = await import('./ASCIIGenerator.js');

      for (const scenario of commonScenarios) {
        for (const device of devices) {
          for (const quality of qualities) {
            const params: ASCIIGenerationParams = {
              theme: scenario.theme,
              mood: scenario.mood,
              complexity:
                quality === 'low' ? 'simple' : quality === 'high' ? 'detailed' : 'moderate',
              maxLines: device === 'mobile' ? 6 : device === 'tablet' ? 8 : 12,
              maxWidth: device === 'mobile' ? 20 : device === 'tablet' ? 24 : 28,
              includeCaption: quality !== 'low',
            };

            const scene = await ASCIIGenerator.generateSceneWithParams(params);
            const cacheKey = `precomputed:${scenario.theme}:${scenario.mood}:${device}:${quality}`;

            this.precomputedScenes.set(cacheKey, scene);
          }
        }
      }

      console.log(`✅ Precomputed ${this.precomputedScenes.size} ASCII scenes`);
    } catch (error) {
      console.error('❌ Error precomputing ASCII scenes:', error);
    }
  }

  /**
   * Clean up precomputed cache to prevent memory leaks
   */
  private static cleanupPrecomputedCache(): void {
    const maxCacheSize = 100;

    if (this.precomputedScenes.size > maxCacheSize) {
      // Remove oldest entries (simple FIFO)
      const entries = Array.from(this.precomputedScenes.entries());
      const toRemove = entries.slice(0, entries.length - maxCacheSize);

      for (const [key] of toRemove) {
        this.precomputedScenes.delete(key);
      }
    }
  }

  /**
   * Update performance metrics
   */
  private static updateMetrics(startTime: number, wasCacheHit: boolean): void {
    const endTime = performance.now();
    this.metrics.generationTime = endTime - startTime;

    // Update cache hit rate (simple moving average)
    const currentHitRate = wasCacheHit ? 100 : 0;
    this.metrics.cacheHitRate = this.metrics.cacheHitRate * 0.9 + currentHitRate * 0.1;

    // Estimate memory usage
    this.metrics.memoryUsage = this.precomputedScenes.size * 1024; // Rough estimate in bytes
  }

  /**
   * Get performance metrics
   */
  static getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset performance metrics
   */
  static resetMetrics(): void {
    this.metrics = {
      generationTime: 0,
      cacheHitRate: 0,
      compressionRatio: 0,
      memoryUsage: 0,
      optimizationsSaved: 0,
    };
  }

  /**
   * Clear all optimization caches
   */
  static clearCaches(): void {
    this.precomputedScenes.clear();
    this.compressionCache.clear();
    console.log('🗑️ ASCII optimization caches cleared');
  }

  /**
   * Batch generate multiple ASCII scenes efficiently
   */
  static async batchGenerateScenes(
    voteResults: VoteResult[],
    options: ASCIIOptimizationOptions = {}
  ): Promise<ASCIIScene[]> {
    console.log(`🎨 Batch generating ${voteResults.length} ASCII scenes...`);

    const startTime = performance.now();

    try {
      // Process in parallel with concurrency limit
      const concurrencyLimit = 5;
      const results: ASCIIScene[] = [];

      for (let i = 0; i < voteResults.length; i += concurrencyLimit) {
        const batch = voteResults.slice(i, i + concurrencyLimit);
        const batchResults = await Promise.all(
          batch.map((voteResult) => this.generateOptimizedScene(voteResult, options))
        );
        results.push(...batchResults);
      }

      const endTime = performance.now();
      console.log(`✅ Batch generated ${results.length} scenes in ${endTime - startTime}ms`);

      return results;
    } catch (error) {
      console.error('❌ Batch ASCII generation error:', error);
      throw error;
    }
  }

  /**
   * Optimize existing ASCII scene for different target device
   */
  static optimizeSceneForDevice(
    scene: ASCIIScene,
    targetDevice: 'mobile' | 'tablet' | 'desktop'
  ): ASCIIScene {
    const options: ASCIIOptimizationOptions = {
      targetDevice,
      enableCaching: false,
      enablePrecomputation: false,
    };

    return this.applyDeviceOptimizations(scene, options);
  }

  /**
   * Get optimization recommendations for a scene
   */
  static getOptimizationRecommendations(scene: ASCIIScene): {
    recommendations: string[];
    estimatedSavings: number;
    currentScore: number;
  } {
    const recommendations: string[] = [];
    let estimatedSavings = 0;
    let currentScore = 100;

    // Check line count
    if (scene.lines.length > 10) {
      recommendations.push('Consider reducing line count for mobile devices');
      estimatedSavings += 15;
      currentScore -= 10;
    }

    // Check line width
    const maxWidth = Math.max(...scene.lines.map((line) => line.length));
    if (maxWidth > 24) {
      recommendations.push('Consider reducing line width for better mobile display');
      estimatedSavings += 20;
      currentScore -= 15;
    }

    // Check Unicode complexity
    const hasComplexUnicode = scene.lines.some((line) => /[^\u0020-\u007E]/u.test(line));
    if (hasComplexUnicode) {
      recommendations.push('Replace Unicode characters with ASCII for better compatibility');
      estimatedSavings += 10;
      currentScore -= 5;
    }

    // Check caption length
    if (scene.caption.length > 100) {
      recommendations.push('Consider shortening caption for faster loading');
      estimatedSavings += 5;
      currentScore -= 3;
    }

    return {
      recommendations,
      estimatedSavings,
      currentScore: Math.max(0, currentScore),
    };
  }
}
