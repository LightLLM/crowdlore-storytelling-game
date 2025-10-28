/**
 * DilemmaDisplay component for CrowdLore
 * Displays the current dilemma with voting options
 */

import type { DilemmaData } from '../../shared/types/index.js';

interface DilemmaDisplayProps {
  dilemma: DilemmaData;
  selectedOption: string | null;
  hasVoted: boolean;
  isLoading: boolean;
  showDetails: boolean;
  onVote: (optionId: string) => void;
}

export const DilemmaDisplay = ({
  dilemma,
  selectedOption,
  hasVoted,
  isLoading,
  showDetails,
  onVote,
}: DilemmaDisplayProps) => {
  return (
    <div className="bg-black/30 rounded-xl border border-purple-800/30 p-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-purple-300">{dilemma.title}</h2>
        <div className="inline-block px-3 py-1 bg-purple-900/50 rounded-full text-sm text-purple-300 mb-4">
          {dilemma.theme}
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 mb-6">
        <p className="text-gray-200 leading-relaxed text-center">{dilemma.scenario}</p>
      </div>

      {/* Voting Options */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-center mb-4">
          {hasVoted ? 'Your Choice:' : 'Choose Your Path:'}
        </h3>

        {dilemma.options.map((option, index) => (
          <div
            key={option.id}
            className={`border rounded-lg p-4 transition-all duration-200 ${
              hasVoted
                ? selectedOption === option.id
                  ? 'border-green-500 bg-green-900/20'
                  : 'border-gray-600 bg-gray-800/20 opacity-60'
                : isLoading
                  ? 'border-gray-600 bg-gray-800/20 opacity-50 cursor-not-allowed'
                  : 'border-purple-600 bg-purple-900/20 hover:bg-purple-800/30 cursor-pointer'
            }`}
            onClick={() => !hasVoted && !isLoading && onVote(option.id)}
          >
            <div className="flex items-start space-x-3">
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  hasVoted && selectedOption === option.id
                    ? 'bg-green-500 text-white'
                    : isLoading
                      ? 'bg-gray-600 text-gray-300'
                      : 'bg-purple-600 text-white'
                }`}
              >
                {isLoading && selectedOption === option.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  String.fromCharCode(65 + index)
                )}
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-white mb-2">{option.text}</h4>
                <p className="text-gray-300 text-sm mb-3">{option.description}</p>

                {/* Attribute Effects Preview */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(option.attributeEffects).map(([attr, effect]) => (
                    <span
                      key={attr}
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        effect > 0 ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
                      }`}
                    >
                      {attr}: {effect > 0 ? '+' : ''}
                      {effect}
                    </span>
                  ))}
                </div>

                {/* Show details when expanded */}
                {showDetails && (
                  <div className="grid sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-green-400 font-medium mb-1">Pros:</div>
                      <ul className="text-gray-300 space-y-1">
                        {option.pros.map((pro, i) => (
                          <li key={i}>• {pro}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-red-400 font-medium mb-1">Cons:</div>
                      <ul className="text-gray-300 space-y-1">
                        {option.cons.map((con, i) => (
                          <li key={i}>• {con}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Vote Status */}
      {hasVoted && (
        <div className="text-center mt-6 p-4 bg-green-900/20 border border-green-700 rounded-lg">
          <div className="text-green-400 font-semibold mb-2">✅ Vote Submitted!</div>
          <p className="text-sm text-gray-300">
            Your choice will help shape the world's destiny. Check back to see the outcome!
          </p>
        </div>
      )}
    </div>
  );
};
