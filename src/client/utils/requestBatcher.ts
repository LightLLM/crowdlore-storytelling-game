/**
 * Request batching utility for optimizing multiple API calls
 */

import { apiClient } from './apiClient.js';
// Removed unused import

export interface BatchRequest {
  id: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  priority?: number;
}

export interface BatchResponse<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface BatchOptions {
  maxBatchSize?: number;
  batchDelay?: number;
  maxWaitTime?: number;
  enablePriority?: boolean;
}

/**
 * Request batcher for optimizing multiple API calls
 */
export class RequestBatcher {
  private pendingRequests: Map<string, BatchRequest> = new Map();
  private pendingPromises: Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
  > = new Map();
  private batchTimer: number | null = null;
  private options: Required<BatchOptions>;

  constructor(options: BatchOptions = {}) {
    this.options = {
      maxBatchSize: 10,
      batchDelay: 50, // 50ms delay to collect requests
      maxWaitTime: 1000, // Maximum 1 second wait
      enablePriority: true,
      ...options,
    };
  }

  /**
   * Add request to batch queue
   */
  async request<T = unknown>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: unknown,
    priority: number = 5
  ): Promise<T> {
    const id = this.generateRequestId(endpoint, method, body);

    // Check if identical request is already pending
    if (this.pendingPromises.has(id)) {
      // Return the existing promise
      return new Promise<T>((resolve, reject) => {
        const existing = this.pendingPromises.get(id)!;
        existing.resolve = resolve as (value: unknown) => void;
        existing.reject = reject;
      });
    }

    const request: BatchRequest = {
      id,
      endpoint,
      method,
      body,
      priority: this.options.enablePriority ? priority : 5,
    };

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, request);
      this.pendingPromises.set(id, { resolve: resolve as (value: unknown) => void, reject });

      this.scheduleBatch();
    });
  }

  /**
   * Schedule batch execution
   */
  private scheduleBatch(): void {
    // Clear existing timer
    if (this.batchTimer) {
      window.clearTimeout(this.batchTimer);
    }

    // Execute immediately if batch is full
    if (this.pendingRequests.size >= this.options.maxBatchSize) {
      void this.executeBatch();
      return;
    }

    // Schedule batch execution
    this.batchTimer = window.setTimeout(() => {
      void this.executeBatch();
    }, this.options.batchDelay);
  }

  /**
   * Execute batch of requests
   */
  private async executeBatch(): Promise<void> {
    if (this.pendingRequests.size === 0) return;

    const requests = Array.from(this.pendingRequests.values());
    const promises = Array.from(this.pendingPromises.entries());

    // Clear pending requests
    this.pendingRequests.clear();
    this.pendingPromises.clear();
    this.batchTimer = null;

    // Sort by priority if enabled
    if (this.options.enablePriority) {
      requests.sort((a, b) => (b.priority || 5) - (a.priority || 5));
    }

    console.log(`📦 Executing batch of ${requests.length} requests`);

    try {
      // Execute requests in parallel with concurrency control
      const results = await this.executeRequestsInParallel(requests);

      // Resolve promises with results
      for (const [id, { resolve, reject }] of promises) {
        const result = results.find((r) => r.id === id);
        if (result) {
          if (result.success) {
            resolve(result.data);
          } else {
            reject(new Error(result.error?.message || 'Request failed'));
          }
        } else {
          reject(new Error('Request not found in batch results'));
        }
      }
    } catch (error) {
      // Reject all promises on batch failure
      for (const [, { reject }] of promises) {
        reject(error);
      }
    }
  }

  /**
   * Execute requests in parallel with concurrency control
   */
  private async executeRequestsInParallel(requests: BatchRequest[]): Promise<BatchResponse[]> {
    const concurrencyLimit = 5;
    const results: BatchResponse[] = [];

    // Process requests in chunks
    for (let i = 0; i < requests.length; i += concurrencyLimit) {
      const chunk = requests.slice(i, i + concurrencyLimit);
      const chunkResults = await Promise.allSettled(
        chunk.map((request) => this.executeRequest(request))
      );

      // Process chunk results
      for (let j = 0; j < chunkResults.length; j++) {
        const result = chunkResults[j];
        const request = chunk[j]!;

        if (result && result.status === 'fulfilled') {
          results.push(result.value);
        } else if (result && result.status === 'rejected') {
          results.push({
            id: request.id,
            success: false,
            error: {
              code: 'BATCH_REQUEST_FAILED',
              message: result.reason?.message || 'Request failed',
            },
          });
        } else {
          results.push({
            id: request.id,
            success: false,
            error: {
              code: 'BATCH_REQUEST_FAILED',
              message: 'Unknown error occurred',
            },
          });
        }
      }
    }

    return results;
  }

  /**
   * Execute individual request
   */
  private async executeRequest(request: BatchRequest): Promise<BatchResponse> {
    try {
      let data: unknown;

      switch (request.method) {
        case 'GET':
          data = await apiClient.get(request.endpoint);
          break;
        case 'POST':
          data = await apiClient.post(request.endpoint, request.body);
          break;
        case 'PUT':
          data = await apiClient.put(request.endpoint, request.body);
          break;
        case 'DELETE':
          data = await apiClient.delete(request.endpoint);
          break;
        default:
          throw new Error(`Unsupported method: ${request.method}`);
      }

      return {
        id: request.id,
        success: true,
        data,
      };
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      return {
        id: request.id,
        success: false,
        error: {
          code: err.code || 'REQUEST_FAILED',
          message: err.message || 'Request failed',
        },
      };
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(endpoint: string, method: string, body?: unknown): string {
    const bodyHash = body ? JSON.stringify(body) : '';
    const combined = `${method}:${endpoint}:${bodyHash}`;

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `req_${Math.abs(hash)}_${Date.now()}`;
  }

  /**
   * Get batch statistics
   */
  getBatchStats(): {
    pendingRequests: number;
    isTimerActive: boolean;
    options: Required<BatchOptions>;
  } {
    return {
      pendingRequests: this.pendingRequests.size,
      isTimerActive: this.batchTimer !== null,
      options: this.options,
    };
  }

  /**
   * Clear all pending requests
   */
  clearPending(): void {
    // Reject all pending promises
    for (const [, { reject }] of this.pendingPromises) {
      reject(new Error('Batch cleared'));
    }

    this.pendingRequests.clear();
    this.pendingPromises.clear();

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Force execute current batch immediately
   */
  async flush(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    await this.executeBatch();
  }
}

// Create default batcher instance
export const defaultBatcher = new RequestBatcher({
  maxBatchSize: 8,
  batchDelay: 100,
  maxWaitTime: 2000,
  enablePriority: true,
});

/**
 * Batched API client wrapper
 */
export class BatchedApiClient {
  constructor(private batcher: RequestBatcher = defaultBatcher) {}

  /**
   * Batched GET request
   */
  async get<T = unknown>(endpoint: string, priority?: number): Promise<T> {
    return this.batcher.request<T>(endpoint, 'GET', undefined, priority);
  }

  /**
   * Batched POST request
   */
  async post<T = unknown>(endpoint: string, body?: unknown, priority?: number): Promise<T> {
    return this.batcher.request<T>(endpoint, 'POST', body, priority);
  }

  /**
   * Batched PUT request
   */
  async put<T = unknown>(endpoint: string, body?: unknown, priority?: number): Promise<T> {
    return this.batcher.request<T>(endpoint, 'PUT', body, priority);
  }

  /**
   * Batched DELETE request
   */
  async delete<T = unknown>(endpoint: string, priority?: number): Promise<T> {
    return this.batcher.request<T>(endpoint, 'DELETE', undefined, priority);
  }

  /**
   * Batch multiple requests of different types
   */
  async batchRequests<T = unknown>(
    requests: Array<{
      endpoint: string;
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
      priority?: number;
    }>
  ): Promise<T[]> {
    const promises = requests.map((req) =>
      this.batcher.request<T>(req.endpoint, req.method || 'GET', req.body, req.priority)
    );

    return Promise.all(promises);
  }

  /**
   * Get batcher statistics
   */
  getStats() {
    return this.batcher.getBatchStats();
  }

  /**
   * Force flush pending requests
   */
  async flush(): Promise<void> {
    return this.batcher.flush();
  }
}

// Create default batched API client
export const batchedApiClient = new BatchedApiClient();

/**
 * React hook for batched API calls
 */
export function useBatchedApi() {
  const [batcher] = React.useState(
    () =>
      new RequestBatcher({
        maxBatchSize: 5,
        batchDelay: 150,
        enablePriority: true,
      })
  );

  const batchedClient = React.useMemo(() => new BatchedApiClient(batcher), [batcher]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      batcher.clearPending();
    };
  }, [batcher]);

  return {
    get: batchedClient.get.bind(batchedClient),
    post: batchedClient.post.bind(batchedClient),
    put: batchedClient.put.bind(batchedClient),
    delete: batchedClient.delete.bind(batchedClient),
    batchRequests: batchedClient.batchRequests.bind(batchedClient),
    flush: batchedClient.flush.bind(batchedClient),
    getStats: batchedClient.getStats.bind(batchedClient),
  };
}

// Import React for the hook
import React from 'react';

// BatchingUtils moved to performanceUtils.ts
