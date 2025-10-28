/**
 * AchievementGrid - Grid display of user achievements
 */

import React from 'react';
import { AchievementBadge } from './AchievementBadge.js';
import type { Achievement, AchievementCategory } from '../../shared/types/index.js';

type AchievementGridProps = {
  achievements: Achievement[];
  maxDisplay?: number;
  showCategories?: boolean;
  size?: 'small' | 'medium' | 'large';
};

export const AchievementGrid: React.FC<AchievementGridProps> = ({
  achievements,
  maxDisplay,
  showCategories = false,
  size = 'medium',
}) => {
  const displayAchievements = maxDisplay ? achievements.slice(0, maxDisplay) : achievements;

  if (showCategories) {
    // Group achievements by category
    const groupedAchievements = displayAchievements.reduce(
      (groups, achievement) => {
        const category = achievement.category;
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(achievement);
        return groups;
      },
      {} as Record<AchievementCategory, Achievement[]>
    );

    const categoryNames: Record<AchievementCategory, string> = {
      participation: 'Participation',
      accuracy: 'Accuracy',
      streak: 'Streaks',
      impact: 'Impact',
      milestone: 'Milestones',
    };

    return (
      <div className="space-y-6">
        {Object.entries(groupedAchievements).map(([category, categoryAchievements]) => (
          <div key={category}>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              {categoryNames[category as AchievementCategory]}
            </h3>
            <div className="flex flex-wrap gap-3">
              {categoryAchievements.map((achievement) => (
                <AchievementBadge key={achievement.id} achievement={achievement} size={size} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {displayAchievements.map((achievement) => (
        <AchievementBadge key={achievement.id} achievement={achievement} size={size} />
      ))}
      {maxDisplay && achievements.length > maxDisplay && (
        <div
          className={`
          ${size === 'small' ? 'w-8 h-8 text-xs' : size === 'large' ? 'w-16 h-16 text-base' : 'w-12 h-12 text-sm'}
          bg-gray-300 rounded-full flex items-center justify-center text-gray-600 font-bold
        `}
        >
          +{achievements.length - maxDisplay}
        </div>
      )}
    </div>
  );
};
