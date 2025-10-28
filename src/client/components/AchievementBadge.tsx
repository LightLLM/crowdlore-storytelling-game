/**
 * AchievementBadge - Individual achievement badge component
 */

import React from 'react';
import type { Achievement } from '../../shared/types/index.js';

type AchievementBadgeProps = {
  achievement: Achievement;
  size?: 'small' | 'medium' | 'large';
  showTooltip?: boolean;
};

export const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  achievement,
  size = 'medium',
  showTooltip = true,
}) => {
  const sizeClasses = {
    small: 'w-8 h-8 text-xs',
    medium: 'w-12 h-12 text-sm',
    large: 'w-16 h-16 text-base',
  };

  const categoryColors = {
    participation: 'bg-blue-500',
    accuracy: 'bg-green-500',
    streak: 'bg-yellow-500',
    impact: 'bg-purple-500',
    milestone: 'bg-red-500',
  };

  return (
    <div className="relative group">
      <div
        className={`
          ${sizeClasses[size]}
          ${categoryColors[achievement.category]}
          rounded-full
          flex items-center justify-center
          text-white font-bold
          shadow-lg
          transition-transform hover:scale-110
          cursor-pointer
        `}
        title={showTooltip ? `${achievement.name}: ${achievement.description}` : undefined}
      >
        {/* Achievement icon - using first letter of name as placeholder */}
        <span className="select-none">{achievement.name.charAt(0)}</span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
          <div className="font-semibold">{achievement.name}</div>
          <div className="text-xs text-gray-300">{achievement.description}</div>
          <div className="text-xs text-gray-400">
            Unlocked: {achievement.unlockedAt.toLocaleDateString()}
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};
