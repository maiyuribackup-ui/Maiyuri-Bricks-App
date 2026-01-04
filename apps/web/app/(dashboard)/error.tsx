'use client';

import { useEffect } from 'react';
import { Button, Card } from '@maiyuri/ui';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <ErrorIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {error.message || 'An unexpected error occurred while loading this page.'}
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
          <Button onClick={reset}>Try Again</Button>
          <Button
            variant="secondary"
            onClick={() => (window.location.href = '/dashboard')}
          >
            Go to Dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
