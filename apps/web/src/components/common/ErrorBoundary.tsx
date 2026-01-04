'use client';

import { Component, type ReactNode } from 'react';
import { Button, Card } from '@maiyuri/ui';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="p-6 text-center">
          <ErrorIcon className="h-12 w-12 mx-auto text-red-500" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
            Something went wrong
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={this.handleRetry}>Try Again</Button>
            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </Button>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

export default ErrorBoundary;
