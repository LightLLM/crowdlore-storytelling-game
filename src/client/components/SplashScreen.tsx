/**
 * SplashScreen component for CrowdLore
 * Engaging entry point with animated world preview
 */

import type { WorldState, DilemmaData } from '../../shared/types/index.js';

interface SplashScreenProps {
  worldState: WorldState | null;
  currentDilemma: DilemmaData | null;
  onEnterGame: () => void;
}

export const SplashScreen = ({ worldState, currentDilemma, onEnterGame }: SplashScreenProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl mx-auto text-center">
        {/* Animated Logo */}
        <div className="mb-8">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent animate-pulse">
            CrowdLore
          </h1>
          <div className="text-lg sm:text-xl text-gray-300 mb-6">
            Shape the story together through collective decisions
          </div>
        </div>

        {/* World Preview */}
        {worldState && (
          <div className="bg-black/30 rounded-xl border border-purple-800/30 p-6 mb-8">
            <h2 className="text-xl font-bold mb-4 text-purple-300">Your World Awaits</h2>

            {/* Mini World Status */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {Object.entries(worldState.attributes).map(([key, value]) => (
                <div key={key} className="text-center">
                  <div className="capitalize text-sm font-medium text-gray-400 mb-1">{key}</div>
                  <div
                    className={`text-2xl font-bold ${
                      value >= 5
                        ? 'text-green-400'
                        : value >= 0
                          ? 'text-yellow-400'
                          : value >= -5
                            ? 'text-orange-400'
                            : 'text-red-400'
                    }`}
                  >
                    {value > 0 ? '+' : ''}
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Lore Teaser */}
            {worldState.loreLog.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
                <p className="text-gray-300 text-sm italic">
                  "{worldState.loreLog[worldState.loreLog.length - 1]}"
                </p>
              </div>
            )}
          </div>
        )}

        {/* Current Decision Teaser */}
        {currentDilemma && (
          <div className="bg-black/30 rounded-xl border border-purple-800/30 p-6 mb-8">
            <h3 className="text-lg font-bold mb-3 text-purple-300">A Decision Awaits</h3>
            <div className="inline-block px-3 py-1 bg-purple-900/50 rounded-full text-sm text-purple-300 mb-3">
              {currentDilemma.theme}
            </div>
            <h4 className="text-xl font-semibold mb-3 text-white">{currentDilemma.title}</h4>
            <p className="text-gray-300 text-sm mb-4 line-clamp-3">{currentDilemma.scenario}</p>
            <div className="text-sm text-yellow-400 font-medium">
              Your choice will shape the world's destiny
            </div>
          </div>
        )}

        {/* Call to Action */}
        <div className="space-y-4">
          <button
            onClick={onEnterGame}
            className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold text-lg rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            🌟 Join the Story
          </button>

          <div className="text-sm text-gray-400">Every decision matters • Every voice counts</div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div className="space-y-2">
            <div className="text-3xl">🗳️</div>
            <div className="text-sm font-medium text-purple-300">Vote Together</div>
            <div className="text-xs text-gray-400">
              Make collective decisions that shape your world
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-3xl">📚</div>
            <div className="text-sm font-medium text-purple-300">Build Lore</div>
            <div className="text-xs text-gray-400">
              Create an evolving story through your choices
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-3xl">🌍</div>
            <div className="text-sm font-medium text-purple-300">Watch It Grow</div>
            <div className="text-xs text-gray-400">See how your world develops over time</div>
          </div>
        </div>

        {/* Loading State */}
        {!worldState && !currentDilemma && (
          <div className="mt-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading your world...</p>
          </div>
        )}
      </div>
    </div>
  );
};
