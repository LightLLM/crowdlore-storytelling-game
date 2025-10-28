/**
 * Leaderboard component for CrowdLore
 * Displays user rankings across different categories and timeframes
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  LeaderboardData,
  LeaderboardCategory,
  TimeFrame,
  LeaderboardEntry,
  UserRankInfo,
} from '../../shared/types/index.js';

interface LeaderboardProps {
  currentUserId?: string;
  className?: string;
  onClose?: () => void;
}

export const Leaderboard = ({ currentUserId, className = '', onClose }: LeaderboardProps) => {
  const [selectedCategory, setSelectedCategory] = useState<LeaderboardCategory>('totalVotes');
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeFrame>('allTime');
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  const [userRankInfo, setUserRankInfo] = useState<UserRankInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Category display names and descriptions
  const categoryInfo: Record<
    LeaderboardCategory,
    { name: string; description: string; icon: string }
  > = {
    totalVotes: {
      name: 'Total Votes',
      description: 'Most active participants',
      icon: '🗳️',
    },
    winningPercentage: {
      name: 'Win Rate',
      description: 'Highest winning percentage',
      icon: '🎯',
    },
    currentStreak: {
      name: 'Current Streak',
      description: 'Longest current winning streak',
      icon: '🔥',
    },
    longestStreak: {
      name: 'Best Streak',
      description: 'Longest winning streak ever',
      icon: '⚡',
    },
    achievements: {
      name: 'Achievements',
      description: 'Most achievements unlocked',
      icon: '🏆',
    },
    averageImpact: {
      name: 'World Impact',
      description: 'Highest average world impact',
      icon: '🌍',
    },
  };

  // Timeframe display names
  const timeframeInfo: Record<TimeFrame, { name: string; description: string }> = {
    allTime: { name: 'All Time', description: 'Since the beginning' },
    monthly: { name: 'This Month', description: 'Current month rankings' },
    weekly: { name: 'This Week', description: 'Current week rankings' },
  };

  // Load leaderboard data
  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/leaderboard?category=${selectedCategory}&timeframe=${selectedTimeframe}&limit=50`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setLeaderboardData(data.data);
      } else {
        throw new Error(data.error?.message || 'Failed to load leaderboard');
      }
    } catch (err) {
      console.error('Error loading leaderboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedTimeframe]);

  // Load user rank info
  const loadUserRankInfo = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const response = await fetch(
        `/api/user/rank?category=${selectedCategory}&timeframe=${selectedTimeframe}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUserRankInfo(data.data);
        }
      }
    } catch (err) {
      console.error('Error loading user rank info:', err);
    }
  }, [currentUserId, selectedCategory, selectedTimeframe]);

  // Load data when category or timeframe changes
  useEffect(() => {
    void loadLeaderboard();
    void loadUserRankInfo();
  }, [selectedCategory, selectedTimeframe, currentUserId, loadLeaderboard, loadUserRankInfo]);

  // Format score based on category
  const formatScore = (score: number, category: LeaderboardCategory): string => {
    switch (category) {
      case 'winningPercentage':
        return `${score.toFixed(1)}%`;
      case 'averageImpact':
        return score.toFixed(2);
      default:
        return score.toString();
    }
  };

  // Get rank change indicator
  const getRankChangeIndicator = (change: number) => {
    if (change > 0) return <span className="text-green-400">↗ +{change}</span>;
    if (change < 0) return <span className="text-red-400">↘ {change}</span>;
    return <span className="text-gray-400">—</span>;
  };

  // Get user position styling
  const getUserPositionStyling = (entry: LeaderboardEntry) => {
    if (currentUserId && entry.userId === currentUserId) {
      return 'bg-purple-900/30 border-purple-500/50 border';
    }
    return 'bg-slate-800/30';
  };

  return (
    <div className={`bg-black/30 rounded-xl border border-purple-800/30 p-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center flex-1">
          <h2 className="text-2xl font-bold text-purple-300 mb-4 sm:mb-0">🏆 Leaderboard</h2>

          {/* User Rank Info */}
          {userRankInfo && (
            <div className="bg-purple-900/20 rounded-lg p-3 text-sm">
              <div className="text-purple-200 font-medium">Your Rank</div>
              <div className="text-white">
                #{userRankInfo.rank} of {userRankInfo.totalUsers}
              </div>
              <div className="text-gray-300">
                {formatScore(userRankInfo.score, selectedCategory)} • Top{' '}
                {userRankInfo.percentile.toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors ml-4"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category Selection */}
      <div className="mb-4">
        <div className="text-sm font-medium text-purple-200 mb-2">Category</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(categoryInfo).map(([key, info]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key as LeaderboardCategory)}
              className={`p-3 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === key
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'
              }`}
            >
              <div className="text-lg mb-1">{info.icon}</div>
              <div>{info.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Timeframe Selection */}
      <div className="mb-6">
        <div className="text-sm font-medium text-purple-200 mb-2">Timeframe</div>
        <div className="flex gap-2">
          {Object.entries(timeframeInfo).map(([key, info]) => (
            <button
              key={key}
              onClick={() => setSelectedTimeframe(key as TimeFrame)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedTimeframe === key
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'
              }`}
            >
              {info.name}
            </button>
          ))}
        </div>
      </div>

      {/* Category Description */}
      <div className="mb-4 p-3 bg-slate-800/30 rounded-lg">
        <div className="text-sm text-gray-300">
          <span className="text-lg mr-2">{categoryInfo[selectedCategory].icon}</span>
          {categoryInfo[selectedCategory].description}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading leaderboard...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-8">
          <div className="text-red-400 mb-4">⚠️ Error loading leaderboard</div>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <button
            onClick={loadLeaderboard}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Leaderboard Entries */}
      {!loading && !error && leaderboardData && (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
            <div className="col-span-1">Rank</div>
            <div className="col-span-6">Player</div>
            <div className="col-span-3 text-right">Score</div>
            <div className="col-span-2 text-right">Change</div>
          </div>

          {/* Entries */}
          {leaderboardData.entries.map((entry) => (
            <div
              key={entry.userId}
              className={`grid grid-cols-12 gap-3 px-4 py-3 rounded-lg transition-all hover:bg-slate-700/30 ${getUserPositionStyling(entry)}`}
            >
              {/* Rank */}
              <div className="col-span-1 flex items-center">
                <div className="flex items-center">
                  {entry.badge && <span className="text-lg mr-1">{entry.badge}</span>}
                  <span className="font-bold text-white">#{entry.rank}</span>
                </div>
              </div>

              {/* Player */}
              <div className="col-span-6 flex items-center">
                <div>
                  <div className="font-medium text-white truncate">
                    {entry.username}
                    {currentUserId === entry.userId && (
                      <span className="ml-2 text-xs text-purple-400">(You)</span>
                    )}
                  </div>
                  {entry.rank <= 3 && (
                    <div className="text-xs text-gray-400">
                      {entry.rank === 1 && 'Champion'}
                      {entry.rank === 2 && 'Runner-up'}
                      {entry.rank === 3 && 'Third Place'}
                    </div>
                  )}
                </div>
              </div>

              {/* Score */}
              <div className="col-span-3 flex items-center justify-end">
                <span className="font-bold text-white">
                  {formatScore(entry.score, selectedCategory)}
                </span>
              </div>

              {/* Change */}
              <div className="col-span-2 flex items-center justify-end text-sm">
                {getRankChangeIndicator(entry.change)}
              </div>
            </div>
          ))}

          {/* Empty State */}
          {leaderboardData.entries.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-4">📊</div>
              <p>No rankings available yet</p>
              <p className="text-sm mt-2">Be the first to participate!</p>
            </div>
          )}
        </div>
      )}

      {/* Footer Info */}
      {leaderboardData && (
        <div className="mt-6 pt-4 border-t border-slate-700/50 text-xs text-gray-400 text-center">
          <p>
            Showing top {leaderboardData.entries.length} of {leaderboardData.totalUsers} players
          </p>
          <p className="mt-1">Last updated: {leaderboardData.lastUpdated.toLocaleTimeString()}</p>
        </div>
      )}
    </div>
  );
};
