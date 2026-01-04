import { Spinner } from '@maiyuri/ui';

export default function DashboardLoading() {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="text-center">
        <Spinner size="lg" />
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Loading...
        </p>
      </div>
    </div>
  );
}
