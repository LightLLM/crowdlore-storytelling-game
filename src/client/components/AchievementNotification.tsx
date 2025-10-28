/**
 * AchievementNotification - Toast notification for new achievements
 */

import React, { useEffect, useState } from 'react';
import type { Achievement } from '../../shared/types/index.js';

type AchievementNotificationProps = {
  achievement: Achievement | null;
  onClose: () => void;
  duration?: number;
};

export const AchievementNotification: React.FC<AchievementNotificationProps> = ({
  achievement,
  onClose,
  duration = 5000,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (achievement) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for fade out animation
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [achievement, duration, onClose]);

  if (!achievement) return null;

  const categoryColors = {
    participation: 'bg-blue-500',
    accuracy: 'bg-green-500',
    streak: 'bg-yellow-500',
    impact: 'bg-purple-500',
    milestone: 'bg-red-500',
  };

  return (
    <div
      className={`
        fixed top-4 right-4 z-50
        bg-white rounded-lg shadow-xl border-l-4 ${categoryColors[achievement.category].replace('bg-', 'border-')}
        p-4 max-w-sm
        transform transition-all duration-300 ease-in-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      <div className="flex items-start space-x-3">
        {/* Achievement icon */}
        <div
          className={`
            w-10 h-10 rounded-full flex items-center justify-center
            ${categoryColors[achievement.category]} text-white font-bold text-sm
          `}
        >
          {achievement.name.charAt(0)}
        </div>

        {/* Achievement details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Achievement Unlocked!</p>
            <button
              onClick={() => {
                setIsVisible(false);
                setTimeout(onClose, 300);
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
          <p className="text-sm font-medium text-gray-800 mt-1">{achievement.name}</p>
          <p className="text-xs text-gray-600 mt-1">{achievement.description}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 w-full bg-gray-200 rounded-full h-1">
        <div
          className={`h-1 rounded-full ${categoryColors[achievement.category]} transition-all duration-300 ease-out`}
          style={{
            width: isVisible ? '100%' : '0%',
            transitionDelay: '0.5s',
          }}
        />
      </div>
    </div>
  );
};
