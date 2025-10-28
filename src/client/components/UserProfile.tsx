/**
 * UserProfile component for CrowdLore
 * Displays individual user statistics, achievements, and profile information
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  UserProfile as UserProfileType,
  UserStats,
  Achievement,
  UserRankInfo,
  LeaderboardCategory,
} from '../../shared/types/index.js';
import { AchievementGrid } from './AchievementGrid.js';

interface UserProfileProps {
  userId?: string;
  className?: string;
  onClose?: () => void;
}

export const UserProfile = ({ userId, className = '', onClose }: UserProfileProps) => {
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [rankings, setRankings] = useState<Record<LeaderboardCategory, UserRankInfo>>(
    {} as Record<LeaderboardCategory, UserRankInfo>
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'achievements' | 'rankings'>('overview');

  // Load user profile data
  const loadProfile = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      // Load profile
      const profileResponse = await fetch('/api/user/profile');
      if (!profileResponse.ok) {
        throw new Error('Failed to load profile');
      }
      const profileData = await profileResponse.json();
      if (profileData.success) {
        setProfile(profileData.data.profile);
      }

      // Load stats
      const statsResponse = await fetch('/api/user/stats');
      if (!statsResponse.ok) {
        throw new Error('Failed to load stats');
      }
      const statsData = await statsResponse.json();
      if (statsData.success) {
        setStats(statsData.data.stats);
      }

      // Load rankings for all categories
      const categories: LeaderboardCategory[] = [
        'totalVotes',
        'winningPercentage',
        'currentStreak',
        'longestStreak',
        'achievements',
        'averageImpact',
      ];

      const rankingPromises = categories.map(async (category) => {
        try {
          const response = await fetch(`/api/user/rank?category=${category}&timeframe=allTime`);
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              return { category, rankInfo: data.data };
            }
          }
        } catch (err) {
          console.error(`Error loading ranking for ${category}:`, err);
        }
        return null;
      });

      const rankingResults = await Promise.all(rankingPromises);
      const newRankings: Record<LeaderboardCategory, UserRankInfo> = {} as Record<
        LeaderboardCategory,
        UserRankInfo
      >;

      rankingResults.forEach((result) => {
        if (result) {
          newRankings[result.category] = result.rankInfo;
        }
      });

      setRankings(newRankings);
    } catch (err) {
      console.error('Error loading profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [userId, loadProfile]);

  // Calculate days since joining
  const getDaysSinceJoining = (joinDate: Date): number => {
    return Math.floor((Date.now() - new Date(joinDate).getTime()) / (1000 * 60 * 60 * 24));
  };

  // Get achievement category counts
  const getAchievementCategoryCounts = (achievements: Achievement[]) => {
    const counts: Record<string, number> = {};
    achievements.forEach((achievement) => {
      counts[achievement.category] = (counts[achievement.category] || 0) + 1;
    });
    return counts;
  };

  // Get rank badge
  const getRankBadge = (rank: number): string => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    if (rank <= 10) return '🏆';
    if (rank <= 25) return '⭐';
    return '📊';
  };

  // Get percentile color
  const getPercentileColor = (percentile: number): string => {
    if (percentile >= 90) return 'text-yellow-400';
    if (percentile >= 75) return 'text-green-400';
    if (percentile >= 50) return 'text-blue-400';
    if (percentile >= 25) return 'text-purple-400';
    return 'text-gray-400';
  };

  if (loading) {
    return (
      <div className={`bg-black/30 rounded-xl border border-purple-800/30 p-6 ${className}`}>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-black/30 rounded-xl border border-purple-800/30 p-6 ${className}`}>
        <div className="text-center py-8">
          <div className="text-red-400 mb-4">⚠️ Error loading profile</div>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <button
            onClick={loadProfile}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!profile || !stats) {
    return (
      <div className={`bg-black/30 rounded-xl border border-purple-800/30 p-6 ${className}`}>
        <div className="text-center py-8 text-gray-400">
          <div className="text-4xl mb-4">👤</div>
          <p>Profile not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-black/30 rounded-xl border border-purple-800/30 p-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-purple-300 mb-2">👤 {profile.username}</h2>
          <div className="text-sm text-gray-400">
            Member for {getDaysSinceJoining(profile.joinDate)} days
          </div>
        </div>

        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'overview', label: 'Overview', icon: '📊' },
          { key: 'achievements', label: 'Achievements', icon: '🏆' },
          { key: 'rankings', label: 'Rankings', icon: '📈' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-800/30 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{stats.totalVotes}</div>
              <div className="text-sm text-gray-400">Total Votes</div>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400">
                {stats.winningPercentage.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-400">Win Rate</div>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-400">{stats.currentStreak}</div>
              <div className="text-sm text-gray-400">Current Streak</div>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">{stats.achievementCount}</div>
              <div className="text-sm text-gray-400">Achievements</div>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="bg-slate-800/30 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-purple-200 mb-4">Detailed Statistics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Winning Votes:</span>
                <span className="text-white font-medium">{stats.winningVotes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Longest Streak:</span>
                <span className="text-white font-medium">{stats.longestStreak}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Average Impact:</span>
                <span className="text-white font-medium">{stats.averageImpact.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Participation Days:</span>
                <span className="text-white font-medium">{stats.participationDays}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Last Active:</span>
                <span className="text-white font-medium">
                  {new Date(stats.lastActiveDate).toLocaleDateString()}
                </span>
              </div>
              {stats.favoriteAttribute && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Favorite Attribute:</span>
                  <span className="text-white font-medium capitalize">
                    {stats.favoriteAttribute}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Achievements Tab */}
      {activeTab === 'achievements' && (
        <div className="space-y-6">
          {profile.achievements.length > 0 ? (
            <>
              {/* Achievement Summary */}
              <div className="bg-slate-800/30 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-purple-200 mb-4">Achievement Summary</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  {Object.entries(getAchievementCategoryCounts(profile.achievements)).map(
                    ([category, count]) => (
                      <div key={category} className="text-center">
                        <div className="text-xl font-bold text-white">{count}</div>
                        <div className="text-gray-400 capitalize">{category}</div>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Achievement Grid */}
              <AchievementGrid
                achievements={profile.achievements}
                showCategories={true}
                size="large"
              />
            </>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-4">🏆</div>
              <p>No achievements yet</p>
              <p className="text-sm mt-2">Start voting to unlock achievements!</p>
            </div>
          )}
        </div>
      )}

      {/* Rankings Tab */}
      {activeTab === 'rankings' && (
        <div className="space-y-4">
          {Object.entries(rankings).map(([category, rankInfo]) => (
            <div key={category} className="bg-slate-800/30 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-medium text-white capitalize">
                    {category.replace(/([A-Z])/g, ' $1').trim()}
                  </h4>
                  <div className="text-sm text-gray-400">
                    Score:{' '}
                    {category === 'winningPercentage' || category === 'averageImpact'
                      ? rankInfo.score.toFixed(2)
                      : Math.round(rankInfo.score)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center text-lg font-bold text-white">
                    <span className="mr-2">{getRankBadge(rankInfo.rank)}</span>#{rankInfo.rank}
                  </div>
                  <div className={`text-sm font-medium ${getPercentileColor(rankInfo.percentile)}`}>
                    Top {rankInfo.percentile.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-400">of {rankInfo.totalUsers} players</div>
                </div>
              </div>
            </div>
          ))}

          {Object.keys(rankings).length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-4">📈</div>
              <p>No ranking data available</p>
              <p className="text-sm mt-2">Participate in voting to get ranked!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
