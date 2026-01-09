'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Input, Spinner } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import type { ArchiveConfig } from '@maiyuri/shared';
import { useArchiveConfig, useUpdateArchiveConfig } from '@/hooks/useArchive';

interface ArchiveConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ArchiveConfigPanel({ isOpen, onClose }: ArchiveConfigPanelProps) {
  const { data: config, isLoading, error } = useArchiveConfig();
  const updateMutation = useUpdateArchiveConfig();

  const [formData, setFormData] = useState<ArchiveConfig | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData(config);
      setHasChanges(false);
    }
  }, [config]);

  const handleDaysChange = (key: keyof ArchiveConfig, days: number) => {
    if (!formData) return;
    setFormData({
      ...formData,
      [key]: { ...formData[key], days },
    });
    setHasChanges(true);
  };

  const handleEnabledChange = (key: keyof ArchiveConfig, enabled: boolean) => {
    if (!formData) return;
    setFormData({
      ...formData,
      [key]: { ...formData[key], enabled },
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!formData) return;
    await updateMutation.mutateAsync(formData);
    setHasChanges(false);
  };

  const handleReset = () => {
    if (config) {
      setFormData(config);
      setHasChanges(false);
    }
  };

  if (!isOpen) return null;

  const isSaving = updateMutation.isPending;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Archive Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-800"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-500">Failed to load configuration</p>
            </div>
          ) : formData ? (
            <div className="space-y-6">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Configure when leads should be suggested for archiving based on their status and inactivity.
              </p>

              {/* Converted Leads */}
              <ThresholdCard
                title="Converted Leads"
                description="Archive leads that have been converted for a certain number of days"
                color="green"
                days={formData.converted_days.days}
                enabled={formData.converted_days.enabled}
                onDaysChange={(days) => handleDaysChange('converted_days', days)}
                onEnabledChange={(enabled) => handleEnabledChange('converted_days', enabled)}
              />

              {/* Lost Leads */}
              <ThresholdCard
                title="Lost Leads"
                description="Archive leads that have been marked as lost"
                color="red"
                days={formData.lost_days.days}
                enabled={formData.lost_days.enabled}
                onDaysChange={(days) => handleDaysChange('lost_days', days)}
                onEnabledChange={(enabled) => handleEnabledChange('lost_days', enabled)}
              />

              {/* Cold Leads */}
              <ThresholdCard
                title="Cold/Inactive Leads"
                description="Archive leads with no activity (notes, updates)"
                color="blue"
                days={formData.cold_inactivity_days.days}
                enabled={formData.cold_inactivity_days.enabled}
                onDaysChange={(days) => handleDaysChange('cold_inactivity_days', days)}
                onEnabledChange={(enabled) => handleEnabledChange('cold_inactivity_days', enabled)}
              />
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        {formData && (
          <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-700">
            <div className="flex gap-3">
              <Button
                className="flex-1"
                variant="primary"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
              >
                {isSaving ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={handleReset}
                disabled={!hasChanges || isSaving}
              >
                Reset
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Threshold Card Component
function ThresholdCard({
  title,
  description,
  color,
  days,
  enabled,
  onDaysChange,
  onEnabledChange,
}: {
  title: string;
  description: string;
  color: 'green' | 'red' | 'blue';
  days: number;
  enabled: boolean;
  onDaysChange: (days: number) => void;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const colorClasses = {
    green: 'border-green-200 dark:border-green-800',
    red: 'border-red-200 dark:border-red-800',
    blue: 'border-blue-200 dark:border-blue-800',
  };

  const iconColors = {
    green: 'text-green-500',
    red: 'text-red-500',
    blue: 'text-blue-500',
  };

  return (
    <Card className={cn('p-4', colorClasses[color])}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5', iconColors[color])}>
            {color === 'green' && <CheckIcon className="h-5 w-5" />}
            {color === 'red' && <XIcon className="h-5 w-5" />}
            {color === 'blue' && <SnowflakeIcon className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">{title}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-amber-500 peer-checked:after:translate-x-full dark:bg-slate-700"></div>
        </label>
      </div>

      {enabled && (
        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-400">After</span>
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => onDaysChange(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
            className="w-20 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-center text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
          <span className="text-sm text-slate-600 dark:text-slate-400">days</span>
        </div>
      )}
    </Card>
  );
}

// Icon Components
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SnowflakeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m0-18l-3 3m3-3l3 3m-3 15l-3-3m3 3l3-3M3 12h18M3 12l3-3m-3 3l3 3m15-3l-3-3m3 3l-3 3" />
    </svg>
  );
}

export default ArchiveConfigPanel;
