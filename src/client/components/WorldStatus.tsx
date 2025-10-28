/**
 * WorldStatus component for CrowdLore
 * Displays world attributes, trends, and lore history
 */

import { useState, useEffect } from 'react';
import type { WorldState, ASCIISceneResponse } from '../../shared/types/index.js';
import { ASCIIVisualizer } from './ASCIIVisualizer.js';

interface WorldStatusProps {
  worldState: WorldState;
  showDetails: boolean;
  onToggleDetails: () => void;
}

type RecentOutcome = {
  dilemmaId: string;
  title: string;
  outcome: string;
  timestamp: Date;
};

export const WorldStatus = ({ worldState, showDetails, onToggleDetails }: WorldStatusProps) => {
  const [recentOutcomes, setRecentOutcomes] = useState<RecentOutcome[]>([]);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [asciiScene, setAsciiScene] = useState<ASCIISceneResponse['data'] | null>(null);
  const [loadingScene, setLoadingScene] = useState(false);

  // Get attribute color based on value
  const getAttributeColor = (value: number): string => {
    if (value >= 5) return 'text-green-400';
    if (value >= 0) return 'text-yellow-400';
    if (value >= -5) return 'text-orange-400';
    return 'text-red-400';
  };

  // Get attribute bar width percentage
  const getAttributeBarWidth = (value: number): number => {
    return ((value + 10) / 20) * 100; // Convert -10 to +10 range to 0-100%
  };

  // Load ASCII scene for a specific outcome
  const loadAsciiScene = async (dilemmaId: string) => {
    if (selectedOutcome === dilemmaId && asciiScene) {
      // Toggle off if already selected
      setSelectedOutcome(null);
      setAsciiScene(null);
      return;
    }

    setLoadingScene(true);
    setSelectedOutcome(dilemmaId);

    try {
      const response = await fetch(`/api/ascii-scene/${dilemmaId}`);
      const data: ASCIISceneResponse = await response.json();

      if (data.success && data.data) {
        setAsciiScene(data.data);
      } else {
        console.error('Failed to load ASCII scene:', data.error?.message);
        setAsciiScene(null);
      }
    } catch (error) {
      console.error('Error loading ASCII scene:', error);
      setAsciiScene(null);
    } finally {
      setLoadingScene(false);
    }
  };

  // Mock recent outcomes for demonstration (in real app, this would come from API)
  useEffect(() => {
    const mockOutcomes: RecentOutcome[] = [
      {
        dilemmaId: 'demo-1',
        title: 'The Mysterious Cave',
        outcome: 'The people chose to explore the glowing cave, discovering ancient crystals.',
        timestamp: new Date(Date.now() - 86400000), // 1 day ago
      },
      {
        dilemmaId: 'demo-2',
        title: 'The Traveling Merchant',
        outcome: 'Reddit decided to trade with the merchant, gaining valuable supplies.',
        timestamp: new Date(Date.now() - 172800000), // 2 days ago
      },
    ];
    setRecentOutcomes(mockOutcomes);
  }, []);

  return (
    <>
      {/* World Status Bar */}
      <div className="bg-black/20 rounded-lg p-3 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">World Status</span>
          <button
            onClick={onToggleDetails}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {Object.entries(worldState.attributes).map(([key, value]) => (
            <div key={key} className="text-center">
              <div className="capitalize font-medium mb-1">{key}</div>
              <div className={`text-lg font-bold ${getAttributeColor(value)}`}>
                {value > 0 ? '+' : ''}
                {value}
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    value >= 0
                      ? 'bg-gradient-to-r from-green-500 to-blue-500'
                      : 'bg-gradient-to-r from-red-500 to-orange-500'
                  }`}
                  style={{ width: `${getAttributeBarWidth(value)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* World Lore Log */}
      {showDetails && (
        <div className="bg-black/30 rounded-xl border border-purple-800/30 p-6 mb-6">
          <h3 className="text-xl font-bold mb-4 text-purple-300">Recent History</h3>

          {/* Recent Story Outcomes with ASCII Visualization */}
          <div className="space-y-4 mb-6">
            <h4 className="text-lg font-semibold text-purple-200">Recent Outcomes</h4>
            {recentOutcomes.map((outcome) => (
              <div key={outcome.dilemmaId} className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h5 className="font-medium text-white">{outcome.title}</h5>
                  <button
                    onClick={() => loadAsciiScene(outcome.dilemmaId)}
                    disabled={loadingScene}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50"
                  >
                    {selectedOutcome === outcome.dilemmaId ? 'Hide Scene' : 'View Scene'}
                  </button>
                </div>
                <p className="text-gray-200 text-sm mb-2">{outcome.outcome}</p>
                <div className="text-xs text-gray-400">
                  {outcome.timestamp.toLocaleDateString()}
                </div>

                {/* ASCII Scene Visualization */}
                {selectedOutcome === outcome.dilemmaId && (
                  <div className="mt-4">
                    {loadingScene ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-400">Loading scene...</p>
                      </div>
                    ) : asciiScene ? (
                      <ASCIIVisualizer
                        scene={asciiScene.scene}
                        animated={true}
                        animationType="fade"
                        responsive={true}
                        className="mt-2"
                        onAnimationComplete={() => console.log('ASCII animation complete')}
                      />
                    ) : (
                      <div className="text-center py-4 text-gray-400 text-sm">
                        Scene not available
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Traditional Lore Log */}
          <div className="space-y-3">
            <h4 className="text-lg font-semibold text-purple-200">World Events</h4>
            {worldState.loreLog
              .slice(-5)
              .reverse()
              .map((entry, index) => (
                <div key={index} className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-gray-200 text-sm">{entry}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
};
