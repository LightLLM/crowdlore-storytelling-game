import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock Redis client
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  keys: vi.fn(),
  hget: vi.fn(),
  hset: vi.fn(),
  hdel: vi.fn(),
  hgetall: vi.fn(),
  zadd: vi.fn(),
  zrange: vi.fn(),
  zrevrange: vi.fn(),
  zrem: vi.fn(),
  zscore: vi.fn(),
  zcard: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  flushall: vi.fn(),
};

// Mock Devvit context
const mockContext = {
  redis: mockRedis,
  userId: 'test-user-123',
  subredditName: 'test-subreddit',
  postId: 'test-post-123',
};

// Global mocks - avoid importing @devvit/web directly in tests
global.fetch = vi.fn();

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Export mocks for use in tests
export { mockRedis, mockContext };
