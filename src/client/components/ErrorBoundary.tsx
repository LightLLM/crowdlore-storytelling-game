/**
 * Error Boundary component for CrowdLore
 * Provides comprehensive error handling with retry mechanisms
 */

import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
  isRetrying: boolean;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  maxRetries?: number;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeout: number | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRetrying: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🚨 Error Boundary caught an error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });

    this.setState({
      error,
      errorInfo,
    });

    // Call optional error callback
    this.props.onError?.(error, errorInfo);

    // Log error to server for monitoring
    this.logErrorToServer(error, errorInfo).catch(console.error);
  }

  override componentWillUnmount() {
    if (this.retryTimeout) {
      window.clearTimeout(this.retryTimeout);
    }
  }

  private async logErrorToServer(error: Error, errorInfo: React.ErrorInfo) {
    try {
      await fetch('/api/log-client-error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (logError) {
      console.error('Failed to log error to server:', logError);
    }
  }

  private handleRetry = () => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries) {
      console.warn('Max retry attempts reached');
      return;
    }

    this.setState({
      isRetrying: true,
    });

    // Add delay before retry to prevent rapid retries
    this.retryTimeout = window.setTimeout(
      () => {
        this.setState({
          hasError: false,
          error: null,
          errorInfo: null,
          retryCount: retryCount + 1,
          isRetrying: false,
        });
      },
      1000 * (retryCount + 1)
    ); // Exponential backoff
  };

  private handleReload = () => {
    window.location.reload();
  };

  override render() {
    const { hasError, error, retryCount, isRetrying } = this.state;
    const { children, fallback, maxRetries = 3 } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-sm rounded-lg border border-red-500/30 p-6 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold mb-4 text-red-400">Something went wrong</h2>
            <p className="text-gray-300 mb-6">
              CrowdLore encountered an unexpected error. Don't worry - your progress is safe.
            </p>

            {error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300">
                  Error Details
                </summary>
                <div className="mt-2 p-3 bg-slate-900/50 rounded text-xs font-mono text-red-300 overflow-auto max-h-32">
                  {error.message}
                </div>
              </details>
            )}

            <div className="space-y-3">
              {retryCount < maxRetries && (
                <button
                  onClick={this.handleRetry}
                  disabled={isRetrying}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  {isRetrying ? (
                    <span className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Retrying...
                    </span>
                  ) : (
                    `Try Again ${retryCount > 0 ? `(${retryCount}/${maxRetries})` : ''}`
                  )}
                </button>
              )}

              <button
                onClick={this.handleReload}
                className="w-full bg-slate-600 hover:bg-slate-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Reload Page
              </button>

              {retryCount >= maxRetries && (
                <div className="text-sm text-gray-400 mt-4">
                  If the problem persists, try refreshing the page or check back later.
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Hook for handling async errors in functional components
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const handleError = React.useCallback((error: Error) => {
    console.error('🚨 Async error caught:', error);
    setError(error);
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  // Throw error to be caught by Error Boundary
  if (error) {
    throw error;
  }

  return { handleError, clearError };
}

/**
 * Higher-order component for wrapping components with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}
