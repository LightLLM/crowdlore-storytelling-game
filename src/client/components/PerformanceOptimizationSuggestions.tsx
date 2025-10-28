/**
 * Performance optimization suggestions component
 */

import React from 'react';
import type { PerformanceMetrics } from '../utils/performanceUtils.js';

export const PerformanceOptimizationSuggestions: React.FC<{
  metrics: PerformanceMetrics;
  onApplyOptimization?: (optimization: string) => void;
}> = ({ metrics, onApplyOptimization }) => {
  const suggestions = [];

  if (metrics.renderTime > 33) {
    suggestions.push({
      issue: 'Slow rendering',
      suggestion: 'Consider reducing visual complexity or enabling performance mode',
      action: 'enable-performance-mode',
    });
  }

  if (metrics.apiResponseTime > 500) {
    suggestions.push({
      issue: 'Slow API responses',
      suggestion: 'Enable request batching and increase cache usage',
      action: 'optimize-api-calls',
    });
  }

  if (metrics.cacheHitRate < 50) {
    suggestions.push({
      issue: 'Low cache efficiency',
      suggestion: 'Warm up cache and enable aggressive caching',
      action: 'warm-cache',
    });
  }

  if (suggestions.length === 0) {
    return <div className="text-green-400 text-sm">✅ Performance is optimal!</div>;
  }

  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-yellow-400">Performance Suggestions:</h4>
      {suggestions.map((suggestion, index) => (
        <div key={index} className="bg-yellow-900/20 p-2 rounded text-sm">
          <div className="font-medium text-yellow-300">{suggestion.issue}</div>
          <div className="text-gray-300 text-xs mt-1">{suggestion.suggestion}</div>
          {onApplyOptimization && (
            <button
              onClick={() => onApplyOptimization(suggestion.action)}
              className="mt-2 px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-500"
            >
              Apply Fix
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
