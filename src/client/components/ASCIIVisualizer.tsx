/**
 * ASCIIVisualizer component for rendering ASCII art with animations and responsive scaling
 */

import React, { useState, useEffect, useRef } from 'react';
import type { ASCIIScene } from '../../shared/types/story.js';

// Props for the ASCIIVisualizer component
type ASCIIVisualizerProps = {
  scene: ASCIIScene;
  animated?: boolean;
  animationType?: 'fade' | 'slide' | 'sparkle' | 'pulse';
  responsive?: boolean;
  className?: string;
  onAnimationComplete?: () => void;
};

// Animation frame data
type AnimationData = {
  frames: string[][];
  currentFrame: number;
  duration: number;
  isPlaying: boolean;
};

/**
 * ASCIIVisualizer component with responsive rendering and animation support
 */
export const ASCIIVisualizer: React.FC<ASCIIVisualizerProps> = ({
  scene,
  animated = false,
  animationType = 'fade',
  responsive = true,
  className = '',
  onAnimationComplete,
}) => {
  const [animationData, setAnimationData] = useState<AnimationData | null>(null);
  const [screenSize, setScreenSize] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const [optimizedScene, setOptimizedScene] = useState<ASCIIScene>(scene);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  // Detect screen size for responsive rendering
  useEffect(() => {
    const detectScreenSize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
      } else if (width < 1024) {
        setScreenSize('tablet');
      } else {
        setScreenSize('desktop');
      }
    };

    detectScreenSize();
    window.addEventListener('resize', detectScreenSize);
    return () => window.removeEventListener('resize', detectScreenSize);
  }, []);

  // Optimize scene for current screen size
  useEffect(() => {
    if (responsive) {
      const optimized = optimizeSceneForScreen(scene, screenSize);
      setOptimizedScene(optimized);
    } else {
      setOptimizedScene(scene);
    }
  }, [scene, screenSize, responsive]);

  // Initialize animation if enabled
  useEffect(() => {
    if (animated) {
      const frames = generateAnimationFrames(optimizedScene.lines, animationType);
      setAnimationData({
        frames,
        currentFrame: 0,
        duration: getAnimationDuration(animationType),
        isPlaying: true,
      });
    } else {
      setAnimationData(null);
    }
  }, [animated, animationType, optimizedScene]);

  // Handle animation playback
  useEffect(() => {
    if (animationData && animationData.isPlaying) {
      const frameInterval = animationData.duration / animationData.frames.length;

      animationRef.current = window.setInterval(() => {
        setAnimationData((prev) => {
          if (!prev) return null;

          const nextFrame = prev.currentFrame + 1;
          if (nextFrame >= prev.frames.length) {
            // Animation complete
            onAnimationComplete?.();
            return {
              ...prev,
              currentFrame: prev.frames.length - 1,
              isPlaying: false,
            };
          }

          return {
            ...prev,
            currentFrame: nextFrame,
          };
        });
      }, frameInterval);

      return () => {
        if (animationRef.current) {
          window.clearInterval(animationRef.current);
        }
      };
    }
  }, [animationData, onAnimationComplete]);

  // Get current lines to display
  const getCurrentLines = (): string[] => {
    if (animationData && animationData.frames[animationData.currentFrame]) {
      return animationData.frames[animationData.currentFrame]!;
    }
    return optimizedScene.lines;
  };

  // Get responsive font size
  const getFontSize = (): string => {
    switch (screenSize) {
      case 'mobile':
        return '0.75rem';
      case 'tablet':
        return '0.875rem';
      case 'desktop':
        return '1rem';
      default:
        return '0.875rem';
    }
  };

  // Get responsive line height
  const getLineHeight = (): string => {
    switch (screenSize) {
      case 'mobile':
        return '1.1';
      case 'tablet':
        return '1.2';
      case 'desktop':
        return '1.3';
      default:
        return '1.2';
    }
  };

  const currentLines = getCurrentLines();

  return (
    <div
      ref={containerRef}
      className={`ascii-visualizer ${className}`}
      style={{
        fontFamily: 'monospace',
        fontSize: getFontSize(),
        lineHeight: getLineHeight(),
        whiteSpace: 'pre',
        textAlign: 'center',
        padding: '1rem',
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        maxWidth: '100%',
        overflow: 'hidden',
      }}
      role="img"
      aria-label={optimizedScene.caption || 'ASCII art visualization'}
    >
      {/* ASCII Art Display */}
      <div
        className="ascii-art"
        style={{
          marginBottom: optimizedScene.caption ? '0.5rem' : '0',
          color: '#333',
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
        }}
      >
        {currentLines.map((line, index) => (
          <div
            key={index}
            className="ascii-line"
            style={{
              minHeight: '1em',
              display: 'block',
            }}
          >
            {line || '\u00A0'} {/* Non-breaking space for empty lines */}
          </div>
        ))}
      </div>

      {/* Caption */}
      {optimizedScene.caption && (
        <div
          className="ascii-caption"
          style={{
            fontSize: '0.875em',
            color: '#666',
            fontStyle: 'italic',
            marginTop: '0.5rem',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {optimizedScene.caption}
        </div>
      )}

      {/* Animation Controls (for debugging) */}
      {typeof window !== 'undefined' &&
        window.location.hostname === 'localhost' &&
        animationData && (
          <div
            className="animation-debug"
            style={{
              marginTop: '0.5rem',
              fontSize: '0.75rem',
              color: '#999',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            Frame: {animationData.currentFrame + 1}/{animationData.frames.length}
            {animationData.isPlaying ? ' (Playing)' : ' (Complete)'}
          </div>
        )}
    </div>
  );
};

/**
 * Optimize ASCII scene for different screen sizes
 */
function optimizeSceneForScreen(
  scene: ASCIIScene,
  screenSize: 'mobile' | 'tablet' | 'desktop'
): ASCIIScene {
  const params = getScreenParams(screenSize);

  let optimizedLines = [...scene.lines];

  // Constrain dimensions
  optimizedLines = constrainLines(optimizedLines, params.maxLines, params.maxWidth);

  // Simplify for mobile
  if (screenSize === 'mobile') {
    optimizedLines = optimizedLines.map((line) => simplifyForMobile(line));
  }

  // Optimize spacing
  optimizedLines = optimizeSpacing(optimizedLines, params.fontSize);

  return {
    ...scene,
    lines: optimizedLines,
    maxWidth: params.maxWidth,
  };
}

/**
 * Get screen-specific parameters
 */
function getScreenParams(screenSize: 'mobile' | 'tablet' | 'desktop') {
  switch (screenSize) {
    case 'mobile':
      return { maxWidth: 20, maxLines: 6, fontSize: 'small' };
    case 'tablet':
      return { maxWidth: 24, maxLines: 8, fontSize: 'medium' };
    case 'desktop':
      return { maxWidth: 28, maxLines: 12, fontSize: 'large' };
    default:
      return { maxWidth: 24, maxLines: 8, fontSize: 'medium' };
  }
}

/**
 * Constrain ASCII lines to fit within limits
 */
function constrainLines(lines: string[], maxLines: number, maxWidth: number): string[] {
  let constrainedLines = lines.slice(0, maxLines);

  // Ensure minimum lines
  const minLines = 4;
  while (constrainedLines.length < minLines && constrainedLines.length < maxLines) {
    constrainedLines.push('');
  }

  // Constrain width
  constrainedLines = constrainedLines.map((line) => {
    if (line.length > maxWidth) {
      return line.substring(0, maxWidth);
    }
    return line;
  });

  return constrainedLines;
}

/**
 * Simplify ASCII art for mobile displays
 */
function simplifyForMobile(line: string): string {
  const mobileReplacements: Record<string, string> = {
    '🌳': '^',
    '🌿': '~',
    '⭐': '*',
    '💎': '◊',
    '📜': '=',
    '🎪': '^',
    '🎭': 'o',
    '👥': 'o',
    '🏠': '[]',
    '⚔️': 'X',
    '⚡': '!',
    '☁️': '~',
    '♪': '♪',
    '♫': '♫',
  };

  let simplifiedLine = line;
  for (const [complex, simple] of Object.entries(mobileReplacements)) {
    simplifiedLine = simplifiedLine.replace(new RegExp(complex, 'g'), simple);
  }

  return simplifiedLine;
}

/**
 * Optimize spacing for different font sizes
 */
function optimizeSpacing(lines: string[], fontSize: string): string[] {
  if (fontSize === 'small') {
    // Reduce spacing for mobile
    return lines.map((line) => line.replace(/  +/g, ' '));
  } else if (fontSize === 'large') {
    // Add extra spacing for desktop
    return lines.map((line) => line.replace(/ /g, '  '));
  }

  return lines; // Keep original spacing for medium
}

/**
 * Generate animation frames for ASCII art
 */
function generateAnimationFrames(
  baseLines: string[],
  animationType: 'fade' | 'slide' | 'sparkle' | 'pulse'
): string[][] {
  const frames: string[][] = [];
  const frameCount = 4;

  switch (animationType) {
    case 'fade':
      for (let frame = 0; frame < frameCount; frame++) {
        const revealPercent = (frame + 1) / frameCount;
        const frameLines = baseLines.map((line) => applyFadeEffect(line, revealPercent));
        frames.push(frameLines);
      }
      break;

    case 'slide':
      for (let frame = 0; frame < frameCount; frame++) {
        const slideOffset =
          Math.max(0, baseLines[0]?.length || 0) -
          Math.floor((frame + 1) * ((baseLines[0]?.length || 0) / frameCount));
        const frameLines = baseLines.map((line) => applySlideEffect(line, slideOffset));
        frames.push(frameLines);
      }
      break;

    case 'sparkle':
      for (let frame = 0; frame < frameCount; frame++) {
        const frameLines = baseLines.map((line) => applySparkleEffect(line, frame));
        frames.push(frameLines);
      }
      break;

    case 'pulse':
      for (let frame = 0; frame < frameCount; frame++) {
        const isEmphasized = frame % 2 === 0;
        const frameLines = baseLines.map((line) => applyPulseEffect(line, isEmphasized));
        frames.push(frameLines);
      }
      break;

    default:
      frames.push(baseLines);
  }

  return frames;
}

/**
 * Apply fade effect to a line
 */
function applyFadeEffect(line: string, revealPercent: number): string {
  const revealLength = Math.floor(line.length * revealPercent);
  return line.substring(0, revealLength) + ' '.repeat(line.length - revealLength);
}

/**
 * Apply slide effect to a line
 */
function applySlideEffect(line: string, slideOffset: number): string {
  if (slideOffset <= 0) return line;
  return ' '.repeat(Math.min(slideOffset, line.length)) + line.substring(slideOffset);
}

/**
 * Apply sparkle effect to a line
 */
function applySparkleEffect(line: string, frame: number): string {
  let sparkledLine = line;

  const sparkleChars = ['*', '·', '✦', '✧'];
  const sparkleCount = Math.floor(line.length * 0.1);

  for (let i = 0; i < sparkleCount; i++) {
    const position = Math.floor(Math.random() * line.length);
    const sparkleChar = sparkleChars[(frame + i) % sparkleChars.length];

    if (sparkleChar && line[position] === ' ') {
      sparkledLine =
        sparkledLine.substring(0, position) + sparkleChar + sparkledLine.substring(position + 1);
    }
  }

  return sparkledLine;
}

/**
 * Apply pulse effect to a line
 */
function applyPulseEffect(line: string, isEmphasized: boolean): string {
  if (!isEmphasized) return line;

  return line.replace(/\*/g, '★').replace(/\./g, '●').replace(/o/g, 'O').replace(/\^/g, '▲');
}

/**
 * Get animation duration in milliseconds
 */
function getAnimationDuration(animationType: 'fade' | 'slide' | 'sparkle' | 'pulse'): number {
  switch (animationType) {
    case 'fade':
      return 2000;
    case 'slide':
      return 1500;
    case 'sparkle':
      return 3000;
    case 'pulse':
      return 1000;
    default:
      return 2000;
  }
}

export default ASCIIVisualizer;
