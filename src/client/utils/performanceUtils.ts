/**
 * Performance monitoring utilities
 */

import React from 'react';
import { batchedApiClient } from './requestBatcher.js';

export interface PerformanceMetrics {
  renderTime: number;
  apiResponseTime: number;
  memoryUsage: number;
  batchingStats: {
    pendingRequests: number;
    isTimerActive: boolean;
  };
  cacheHitRate: number;
}

/**
 * Hook for performance monitoring
 */
export function usePerformanceMonitoring(enabled: boolean = false) {
  const [metrics, setMetrics] = React.useState<PerformanceMetrics | null>(null);
  const [isOptimal, setIsOptimal] = React.useState(true);

  const handleMetricsUpdate = React.useCallback((newMetrics: PerformanceMetrics) => {
    setMetrics(newMetrics);

    // Determine if performance is optimal
    const optimal =
      newMetrics.renderTime <= 33 && // 30fps or better
      newMetrics.apiResponseTime <= 500 && // Under 500ms
      newMetrics.cacheHitRate >= 50; // At least 50% cache hit rate

    setIsOptimal(optimal);
  }, []);

  return {
    metrics,
    isOptimal,
    createPerformanceMonitor: (props: Record<string, unknown>) => ({
      ...props,
      enabled,
      onMetricsUpdate: handleMetricsUpdate,
    }),
  };
}

/**
 * Utility functions for common batching patterns
 */
export const BatchingUtils = {
  /**
   * Batch load world state and current dilemma
   */
  async loadGameState(priority: number = 10) {
    return batchedApiClient.batchRequests([
      { endpoint: '/world-state', priority },
      { endpoint: '/current-dilemma', priority },
    ]);
  },

  /**
   * Batch load multiple dilemma results
   */
  async loadDilemmaResults(dilemmaIds: string[], priority: number = 5) {
    return batchedApiClient.batchRequests(
      dilemmaIds.map((id) => ({
        endpoint: `/vote-results/${id}`,
        priority,
      }))
    );
  },

  /**
   * Batch load ASCII scenes
   */
  async loadASCIIScenes(dilemmaIds: string[], priority: number = 3) {
    return batchedApiClient.batchRequests(
      dilemmaIds.map((id) => ({
        endpoint: `/ascii-scene/${id}`,
        priority,
      }))
    );
  },

  /**
   * Preload common data with low priority
   */
  async preloadCommonData() {
    return batchedApiClient.batchRequests([
      { endpoint: '/ascii-themes', priority: 1 },
      { endpoint: '/world-history?limit=5', priority: 1 },
    ]);
  },
};
