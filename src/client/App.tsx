import { useState, useEffect, useCallback } from 'react';
import { navigateTo } from '@devvit/web/client';
import type {
  DilemmaData,
  WorldState,
  CurrentDilemmaResponse,
  WorldStateResponse,
  VoteRequest,
  VoteResponse,
  Achievement,
} from '../shared/types/index.js';
import {
  DilemmaDisplay,
  WorldStatus,
  SplashScreen,
  ErrorBoundary,
  useErrorHandler,
  PerformanceMonitor,
  UserProfile,
  Leaderboard,
  AchievementNotification,
} from './components/index.js';
import { usePerformanceMonitoring } from './utils/performanceUtils.js';
import { apiClient, handleApiError } from './utils/apiClient.js';
import { batchedApiClient } from './utils/requestBatcher.js';
import { BatchingUtils } from './utils/performanceUtils.js';

const AppContent = () => {
  console.log('🚀 CrowdLore App loaded');

  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [currentDilemma, setCurrentDilemma] = useState<DilemmaData | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(86400); // 24 hours in seconds
  const [showWorldDetails, setShowWorldDetails] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [achievementNotifications, setAchievementNotifications] = useState<
    Array<{
      id: string;
      achievement: Achievement;
      timestamp: Date;
    }>
  >([]);
  const [userStats, setUserStats] = useState<{ currentStreak: number; totalVotes: number } | null>(
    null
  );

  // Performance monitoring
  const { metrics, isOptimal, createPerformanceMonitor } = usePerformanceMonitoring(
    window.location.search.includes('debug=true')
  );

  // Format time remaining as hours:minutes:seconds
  const formatTimeRemaining = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const { handleError } = useErrorHandler();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // API Functions with batching optimization
  const fetchCurrentDilemma = useCallback(async (): Promise<void> => {
    try {
      const data = await batchedApiClient.get<CurrentDilemmaResponse['data']>(
        '/current-dilemma',
        10
      );

      if (data) {
        setCurrentDilemma(data.dilemma);
        setTimeRemaining(data.timeRemaining);
        setHasVoted(data.hasUserVoted);
        console.log('📊 Current dilemma loaded:', data.dilemma?.title);
      } else {
        setCurrentDilemma(null);
      }

      // Clear any previous error
      setErrorMessage(null);
    } catch (error) {
      const errorMsg = handleApiError(error);
      setErrorMessage(errorMsg);
      setCurrentDilemma(null);
      handleError(error as Error);
    }
  }, [handleError]);

  const fetchWorldState = useCallback(async (): Promise<void> => {
    try {
      const data = await batchedApiClient.get<WorldStateResponse['data']>('/world-state', 8);

      if (data) {
        setWorldState(data.worldState);
        console.log('🌍 World state loaded:', data.worldState.attributes);
      }
    } catch (error) {
      const errorMsg = handleApiError(error);
      console.error('❌ Error fetching world state:', errorMsg);
      // Don't show error for world state as it's not critical
    }
  }, []);

  // Optimized batch loading of initial data
  const loadInitialDataBatched = useCallback(async (): Promise<void> => {
    try {
      const [worldData, dilemmaData] = await BatchingUtils.loadGameState(10);

      if (worldData && typeof worldData === 'object' && 'worldState' in worldData) {
        const worldResponse = worldData as WorldStateResponse['data'];
        if (worldResponse?.worldState) {
          setWorldState(worldResponse.worldState);
          console.log('🌍 World state loaded via batch:', worldResponse.worldState.attributes);
        }
      }

      if (dilemmaData && typeof dilemmaData === 'object' && 'dilemma' in dilemmaData) {
        const dilemmaResponse = dilemmaData as CurrentDilemmaResponse['data'];
        if (dilemmaResponse) {
          setCurrentDilemma(dilemmaResponse.dilemma);
          setTimeRemaining(dilemmaResponse.timeRemaining);
          setHasVoted(dilemmaResponse.hasUserVoted);
          console.log('📊 Current dilemma loaded via batch:', dilemmaResponse.dilemma?.title);
        }
      }

      setErrorMessage(null);
    } catch (error) {
      const errorMsg = handleApiError(error);
      setErrorMessage(errorMsg);
      console.error('❌ Error in batch loading:', errorMsg);
    }
  }, []);

  // Load user stats for streak indicators
  const loadUserStats = useCallback(async (): Promise<void> => {
    try {
      const response = await apiClient.get<{
        stats: { currentStreak: number; totalVotes: number };
      }>('/user/stats');
      if (response) {
        setUserStats(response.stats);
      }
    } catch (error) {
      // Silently fail for user stats as it's not critical
      console.warn('Could not load user stats:', error);
    }
  }, []);

  // Handle voting for a dilemma option
  const handleVote = async (optionId: string) => {
    if (!currentDilemma || hasVoted || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const voteRequest: VoteRequest = {
        dilemmaId: currentDilemma.id,
        optionId,
      };

      const data = await apiClient.post<VoteResponse['data']>('/vote', voteRequest);

      if (data) {
        setSelectedOption(optionId);
        setHasVoted(true);
        setTimeRemaining(data.timeRemaining);

        // Reload user stats after voting
        await loadUserStats();

        console.log('✅ Vote submitted for option:', optionId);
      }
    } catch (error) {
      const errorMsg = handleApiError(error);
      setErrorMessage(errorMsg);
      console.error('❌ Error submitting vote:', errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Timer countdown effect
  useEffect(() => {
    if (!currentDilemma || hasVoted) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentDilemma, hasVoted]);

  // Load initial data from API with batching optimization
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        // Use batched loading for better performance
        await loadInitialDataBatched();

        // Load user stats
        await loadUserStats();

        // Preload common data with low priority
        BatchingUtils.preloadCommonData().catch(console.warn);

        console.log('📊 Initial data loaded with batching');
      } catch (error) {
        console.error('❌ Error loading initial data:', error);
        // Fallback to individual requests
        try {
          await Promise.all([fetchCurrentDilemma(), fetchWorldState(), loadUserStats()]);
        } catch (fallbackError) {
          console.error('❌ Fallback loading also failed:', fallbackError);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadInitialData();
  }, [loadInitialDataBatched, fetchCurrentDilemma, fetchWorldState, loadUserStats]);

  // Show splash screen on first load
  if (showSplash && !isLoading) {
    return (
      <SplashScreen
        worldState={worldState}
        currentDilemma={currentDilemma}
        onEnterGame={() => setShowSplash(false)}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Header */}
      <header className="flex-shrink-0 p-4 sm:p-6 border-b border-purple-800/30">
        <div className="max-w-4xl mx-auto">
          {/* Navigation */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowUserProfile(!showUserProfile);
                  setShowLeaderboard(false);
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  showUserProfile
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'
                }`}
              >
                👤 Profile
              </button>
              <button
                onClick={() => {
                  setShowLeaderboard(!showLeaderboard);
                  setShowUserProfile(false);
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  showLeaderboard
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'
                }`}
              >
                🏆 Leaderboard
              </button>
            </div>

            <div className="flex gap-2 items-center">
              {/* Streak Indicator */}
              {userStats && userStats.currentStreak > 0 && (
                <div className="px-3 py-2 bg-gradient-to-r from-orange-600 to-red-600 rounded-lg text-sm font-medium text-white">
                  🔥 {userStats.currentStreak} streak
                </div>
              )}

              {/* Vote Count Badge */}
              {userStats && userStats.totalVotes > 0 && (
                <div className="px-3 py-2 bg-slate-700/50 rounded-lg text-sm font-medium text-gray-300">
                  📊 {userStats.totalVotes} votes
                </div>
              )}

              <button
                onClick={() => setShowWorldDetails(!showWorldDetails)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  showWorldDetails
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'
                }`}
              >
                🌍 World
              </button>
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              CrowdLore
            </h1>
            <p className="text-sm sm:text-base text-gray-300 mb-4">
              Shape the story together through collective decisions
            </p>

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-500/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-red-300 text-sm">{errorMessage}</p>
                  <button
                    onClick={() => setErrorMessage(null)}
                    className="text-red-400 hover:text-red-300 ml-2"
                  >
                    ✕
                  </button>
                </div>
                <button
                  onClick={() => {
                    setErrorMessage(null);
                    void fetchCurrentDilemma();
                  }}
                  className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* World Status */}
            {worldState && (
              <WorldStatus
                worldState={worldState}
                showDetails={showWorldDetails}
                onToggleDetails={() => setShowWorldDetails(!showWorldDetails)}
              />
            )}

            {/* Time Remaining */}
            {currentDilemma && !hasVoted && (
              <div className="text-center">
                <div className="text-sm text-gray-400">Voting ends in</div>
                <div className="text-xl font-mono font-bold text-yellow-400">
                  {formatTimeRemaining(timeRemaining)}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Achievement Notifications */}
          {achievementNotifications.map((notification) => (
            <AchievementNotification
              key={notification.id}
              achievement={notification.achievement}
              onClose={() => {
                setAchievementNotifications((prev) => prev.filter((n) => n.id !== notification.id));
              }}
            />
          ))}

          {/* User Profile Display */}
          {showUserProfile && (
            <UserProfile className="mb-6" onClose={() => setShowUserProfile(false)} />
          )}

          {/* Leaderboard Display */}
          {showLeaderboard && (
            <Leaderboard className="mb-6" onClose={() => setShowLeaderboard(false)} />
          )}

          {/* Loading State */}
          {isLoading && !showUserProfile && !showLeaderboard && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading the world's next chapter...</p>
            </div>
          )}

          {/* Current Dilemma */}
          {currentDilemma && !isLoading && !showUserProfile && !showLeaderboard && (
            <DilemmaDisplay
              dilemma={currentDilemma}
              selectedOption={selectedOption}
              hasVoted={hasVoted}
              isLoading={isLoading}
              showDetails={showWorldDetails}
              onVote={handleVote}
            />
          )}

          {/* No Active Dilemma */}
          {!currentDilemma &&
            !isLoading &&
            !errorMessage &&
            !showUserProfile &&
            !showLeaderboard && (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🌟</div>
                <h2 className="text-2xl font-bold mb-4 text-purple-300">The World Awaits</h2>
                <p className="text-gray-400 mb-6">
                  No active dilemmas at the moment. The next chapter of your world's story is being
                  prepared...
                </p>
                <div className="text-sm text-gray-500">
                  Check back soon for new decisions to make!
                </div>
              </div>
            )}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 p-4 border-t border-purple-800/30">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-xs text-gray-500">
            Built for Reddit with ❤️ ·{' '}
            <button
              className="underline hover:text-purple-400 transition-colors"
              onClick={() => navigateTo('https://www.reddit.com/r/Devvit')}
            >
              r/Devvit
            </button>
            {metrics && !isOptimal && (
              <span className="ml-2 text-yellow-400">⚠️ Performance issues detected</span>
            )}
          </div>
        </div>
      </footer>

      {/* Performance Monitor */}
      <PerformanceMonitor {...createPerformanceMonitor({})} />
    </div>
  );
};

export const App = () => {
  return (
    <ErrorBoundary
      maxRetries={3}
      onError={(error, errorInfo) => {
        console.error('🚨 App Error Boundary triggered:', {
          error: error.message,
          componentStack: errorInfo.componentStack,
        });
      }}
    >
      <AppContent />
    </ErrorBoundary>
  );
};
