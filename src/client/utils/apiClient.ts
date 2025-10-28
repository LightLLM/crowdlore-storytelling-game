/**
 * API Client with comprehensive error handling and retry mechanisms
 */

import type { APIResponse } from '../../shared/types/api.js';

export interface ApiClientOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  onError?: (error: ApiError) => void;
  onRetry?: (attempt: number, error: Error) => void;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly requestId: string | undefined;
  public readonly isRetryable: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.requestId = requestId;

    // Determine if error is retryable
    this.isRetryable = this.determineRetryability(statusCode, code);
  }

  private determineRetryability(statusCode: number, code: string): boolean {
    // Don't retry client errors (4xx) except for specific cases
    if (statusCode >= 400 && statusCode < 500) {
      return ['TIMEOUT', 'RATE_LIMITED'].includes(code);
    }

    // Retry server errors (5xx) and network errors
    return statusCode >= 500 || code === 'NETWORK_ERROR';
  }
}

export class NetworkError extends ApiError {
  constructor(message: string = 'Network request failed') {
    super(0, 'NETWORK_ERROR', message);
  }
}

export class TimeoutError extends ApiError {
  constructor(message: string = 'Request timeout') {
    super(408, 'TIMEOUT', message);
  }
}

class ApiClient {
  private readonly options: Required<ApiClientOptions>;

  constructor(options: ApiClientOptions = {}) {
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      onError: () => {},
      onRetry: () => {},
      ...options,
    };
  }

  /**
   * Make an API request with comprehensive error handling
   */
  async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
    customOptions: Partial<ApiClientOptions> = {}
  ): Promise<T> {
    const mergedOptions = { ...this.options, ...customOptions };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= mergedOptions.maxRetries; attempt++) {
      try {
        const result = await this.makeRequest<T>(endpoint, options, mergedOptions);
        return result;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on last attempt or non-retryable errors
        if (
          attempt === mergedOptions.maxRetries ||
          (error instanceof ApiError && !error.isRetryable)
        ) {
          break;
        }

        // Call retry callback
        mergedOptions.onRetry(attempt + 1, error as Error);

        // Wait before retry with exponential backoff
        const delay = mergedOptions.retryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    // Call error callback
    if (lastError instanceof ApiError) {
      mergedOptions.onError(lastError);
    }

    throw lastError || new Error('Unknown error occurred');
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit,
    mergedOptions: Required<ApiClientOptions>
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), mergedOptions.timeout);

    try {
      const response = await fetch(`/api${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new ApiError(
          response.status,
          'INVALID_RESPONSE',
          'Server returned non-JSON response'
        );
      }

      const data: APIResponse<T> = await response.json();

      // Handle API error responses
      if (!data.success) {
        throw new ApiError(
          response.status,
          data.error?.code || 'UNKNOWN_ERROR',
          data.error?.message || 'Unknown error occurred',
          data.error?.details,
          data.requestId
        );
      }

      return data.data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TimeoutError();
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new NetworkError('Failed to connect to server');
      }

      // Re-throw API errors
      if (error instanceof ApiError) {
        throw error;
      }

      // Wrap unknown errors
      throw new ApiError(
        500,
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * GET request
   */
  async get<T = unknown>(
    endpoint: string,
    options: Omit<RequestInit, 'method'> = {},
    customOptions?: Partial<ApiClientOptions>
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' }, customOptions);
  }

  /**
   * POST request
   */
  async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options: Omit<RequestInit, 'method' | 'body'> = {},
    customOptions?: Partial<ApiClientOptions>
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        ...options,
        method: 'POST',
        body: body ? JSON.stringify(body) : null,
      },
      customOptions
    );
  }

  /**
   * PUT request
   */
  async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options: Omit<RequestInit, 'method' | 'body'> = {},
    customOptions?: Partial<ApiClientOptions>
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        ...options,
        method: 'PUT',
        body: body ? JSON.stringify(body) : null,
      },
      customOptions
    );
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(
    endpoint: string,
    options: Omit<RequestInit, 'method'> = {},
    customOptions?: Partial<ApiClientOptions>
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' }, customOptions);
  }
}

// Create default API client instance
export const apiClient = new ApiClient({
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
  onError: (error) => {
    console.error('🚨 API Error:', {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      requestId: error.requestId,
      details: error.details,
    });
  },
  onRetry: (attempt, error) => {
    console.warn(`🔄 API Retry attempt ${attempt}:`, error.message);
  },
});

/**
 * Utility function for handling API errors in components
 */
export function handleApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return 'Unable to connect to the server. Please check your internet connection.';
      case 'TIMEOUT':
        return 'Request timed out. Please try again.';
      case 'RATE_LIMITED':
        return 'Too many requests. Please wait a moment before trying again.';
      case 'UNAUTHORIZED':
        return 'Authentication required. Please refresh the page.';
      case 'VALIDATION_ERROR':
        return 'Invalid request data. Please check your input.';
      case 'NOT_FOUND':
        return 'The requested resource was not found.';
      case 'SERVICE_UNAVAILABLE':
        return 'Service temporarily unavailable. Please try again later.';
      default:
        return error.message || 'An unexpected error occurred.';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown error occurred.';
}

/**
 * React hook for API calls with error handling
 */
export function useApiCall<T = unknown>() {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const execute = React.useCallback(async (apiCall: () => Promise<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiCall();
      setData(result);
      return result;
    } catch (err) {
      const errorMessage = handleApiError(err);
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = React.useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, execute, reset };
}

// Import React for the hook
import React from 'react';
