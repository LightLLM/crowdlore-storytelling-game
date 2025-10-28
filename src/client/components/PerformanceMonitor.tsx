/**
 * Performance monitoring component for CrowdLore client
 */

import React, { useState, useEffect, useCallback } from 'react';
import { batchedApiClient } from '../utils/requestBatcher.js';
import type { PerformanceMetrics } from '../utils/performanceUtils.js';

// PerformanceMetrics interface moved to performanceUtils.ts

interface PerformanceMonitorProps {
  enabled?: boolean;
  showDetails?: boolean;
  onMetricsUpdate?: (metrics: PerformanceMetrics) => void;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  enabled = false,
  showDetails = false,
  onMetricsUpdate,
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    apiResponseTime: 0,
    memoryUsage: 0,
    batchingStats: { pendingRequests: 0, isTimerActive: false },
    cacheHitRate: 0,
  });

  const [isVisible, setIsVisible] = useState(false);

  // Measure render performance
  const measureRenderTime = useCallback(() => {
    const startTime = performance.now();

    // Use requestAnimationFrame to measure actual render time
    requestAnimationFrame(() => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;

      setMetrics((prev) => ({ ...prev, renderTime }));
    });
  }, []);

  // Measure API response time
  const measureApiPerformance = useCallback(async () => {
    if (!enabled) return;

    try {
      const startTime = performance.now();

      // Make a lightweight API call to measure response time
      batchedApiClient.get('/ascii-themes', 1).catch(() => {}); // Low priority

      const endTime = performance.now();
      const apiResponseTime = endTime - startTime;

      setMetrics((prev) => ({ ...prev, apiResponseTime }));
    } catch (error) {
      console.warn('Performance monitoring API call failed:', error);
    }
  }, [enabled]);

  // Get memory usage (if available)
  const measureMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
      const memoryUsage = (memory?.usedJSHeapSize || 0) / 1024 / 1024; // Convert to MB
      setMetrics((prev) => ({ ...prev, memoryUsage }));
    }
  }, []);

  // Get batching statistics
  const updateBatchingStats = useCallback(() => {
    const batchingStats = batchedApiClient.getStats();
    setMetrics((prev) => ({ ...prev, batchingStats }));
  }, []);

  // Update all metrics
  const updateMetrics = useCallback(() => {
    measureRenderTime();
    measureMemoryUsage();
    updateBatchingStats();

    // Measure API performance less frequently
    if (Math.random() < 0.1) {
      // 10% chance
      void measureApiPerformance();
    }
  }, [measureRenderTime, measureMemoryUsage, updateBatchingStats, measureApiPerformance]);

  // Performance monitoring effect
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(updateMetrics, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, [enabled, updateMetrics]);

  // Call metrics update callback
  useEffect(() => {
    if (onMetricsUpdate) {
      onMetricsUpdate(metrics);
    }
  }, [metrics, onMetricsUpdate]);

  // Keyboard shortcut to toggle visibility
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'P') {
        setIsVisible((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  if (!enabled || (!isVisible && !showDetails)) {
    return null;
  }

  const getPerformanceColor = (value: number, thresholds: [number, number]) => {
    if (value <= thresholds[0]) return 'text-green-400';
    if (value <= thresholds[1]) return 'text-yellow-400';
    return 'text-red-400';
  };

  const formatNumber = (num: number, decimals: number = 1) => {
    return num.toFixed(decimals);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Toggle button */}
      {!showDetails && (
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-lg hover:bg-gray-700 transition-colors"
          title="Performance Monitor (Ctrl+Shift+P)"
        >
          📊 Perf
        </button>
      )}

      {/* Performance metrics panel */}
      {(isVisible || showDetails) && (
        <div className="bg-black/90 text-white p-4 rounded-lg text-xs font-mono max-w-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm">Performance</h3>
            {!showDetails && (
              <button
                onClick={() => setIsVisible(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <div className="space-y-2">
            {/* Render Performance */}
            <div className="flex justify-between">
              <span>Render:</span>
              <span className={getPerformanceColor(metrics.renderTime, [16, 33])}>
                {formatNumber(metrics.renderTime)}ms
              </span>
            </div>

            {/* API Response Time */}
            <div className="flex justify-between">
              <span>API:</span>
              <span className={getPerformanceColor(metrics.apiResponseTime, [200, 500])}>
                {formatNumber(metrics.apiResponseTime)}ms
              </span>
            </div>

            {/* Memory Usage */}
            {metrics.memoryUsage > 0 && (
              <div className="flex justify-between">
                <span>Memory:</span>
                <span className={getPerformanceColor(metrics.memoryUsage, [50, 100])}>
                  {formatNumber(metrics.memoryUsage)}MB
                </span>
              </div>
            )}

            {/* Cache Hit Rate */}
            <div className="flex justify-between">
              <span>Cache:</span>
              <span className={getPerformanceColor(100 - metrics.cacheHitRate, [20, 50])}>
                {formatNumber(metrics.cacheHitRate)}%
              </span>
            </div>

            {/* Batching Stats */}
            <div className="border-t border-gray-600 pt-2 mt-2">
              <div className="flex justify-between">
                <span>Pending:</span>
                <span
                  className={
                    metrics.batchingStats.pendingRequests > 5 ? 'text-yellow-400' : 'text-green-400'
                  }
                >
                  {metrics.batchingStats.pendingRequests}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Batching:</span>
                <span
                  className={
                    metrics.batchingStats.isTimerActive ? 'text-blue-400' : 'text-gray-400'
                  }
                >
                  {metrics.batchingStats.isTimerActive ? 'Active' : 'Idle'}
                </span>
              </div>
            </div>

            {/* Performance Tips */}
            {metrics.renderTime > 33 && (
              <div className="text-yellow-400 text-xs mt-2">⚠️ Slow rendering detected</div>
            )}

            {metrics.apiResponseTime > 500 && (
              <div className="text-red-400 text-xs mt-2">🐌 Slow API responses</div>
            )}

            {metrics.cacheHitRate < 50 && (
              <div className="text-orange-400 text-xs mt-2">📦 Low cache hit rate</div>
            )}
          </div>

          {/* Help text */}
          <div className="text-gray-500 text-xs mt-3 pt-2 border-t border-gray-600">
            Ctrl+Shift+P to toggle
          </div>
        </div>
      )}
    </div>
  );
};

// usePerformanceMonitoring hook moved to separate file

// PerformanceOptimizationSuggestions moved to separate file
