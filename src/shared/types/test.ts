// Test-specific types and utilities
export type MockFunction<T extends (...args: unknown[]) => unknown> = T & {
  mockResolvedValue: (value: Awaited<ReturnType<T>>) => void;
  mockRejectedValue: (error: Error) => void;
  mockImplementation: (fn: T) => void;
  mockClear: () => void;
};

export type TestDilemma = {
  id: string;
  title: string;
  scenario: string;
  theme: string;
  options: Array<{
    id: string;
    text: string;
    description: string;
    attributeEffects: Record<string, number>;
    pros: string[];
    cons: string[];
  }>;
};

export type TestWorldState = {
  attributes: {
    stability: number;
    curiosity: number;
    survival: number;
    reputation: number;
  };
  loreLog: string[];
  lastUpdated: number;
};

export type TestUserProfile = {
  totalVotes: number;
  winningVotes: number;
  currentStreak: number;
  longestStreak: number;
  achievements: string[];
  joinDate: number;
};

export type TestVoteResult = {
  winningOption: {
    id: string;
    text: string;
    attributeEffects: Record<string, number>;
  };
  totalVotes: number;
  voteDistribution: Record<string, number>;
  summary: string;
};
