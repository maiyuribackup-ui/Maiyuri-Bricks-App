'use client';

import { Card, Badge, Button, Spinner } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import Link from 'next/link';

interface PriorityLead {
  id: string;
  name: string;
  contact?: string;
  status: string;
  aiScore: number;
  reason: string;
  suggestedAction: string;
  priority: 'critical' | 'high' | 'medium';
  daysInactive?: number;
}

interface AIPriorityActionsProps {
  leads: PriorityLead[];
  loading?: boolean;
  onAction?: (leadId: string, action: string) => void;
}

export function AIPriorityActions({
  leads,
  loading = false,
  onAction,
}: AIPriorityActionsProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <SparklesIcon className="h-5 w-5 text-purple-500" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            AI Priority Actions
          </h3>
        </div>
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5 text-purple-500" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            AI Priority Actions
          </h3>
        </div>
        <Badge variant="default" className="bg-purple-100 text-purple-700">
          {leads.length} leads
        </Badge>
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-8">
          <SparklesIcon className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No priority actions right now. Great job!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <PriorityLeadCard
              key={lead.id}
              lead={lead}
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function PriorityLeadCard({
  lead,
  onAction,
}: {
  lead: PriorityLead;
  onAction?: (leadId: string, action: string) => void;
}) {
  const priorityColors = {
    critical: 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20',
    high: 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20',
    medium: 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20',
  };

  const scoreColor = lead.aiScore >= 70
    ? 'text-green-600 bg-green-100'
    : lead.aiScore >= 40
    ? 'text-yellow-600 bg-yellow-100'
    : 'text-red-600 bg-red-100';

  return (
    <div
      className={cn(
        'relative rounded-lg border-l-4 p-4 transition-all hover:shadow-md',
        'bg-white dark:bg-slate-800',
        priorityColors[lead.priority]
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/leads/${lead.id}`}
              className="font-semibold text-slate-900 dark:text-white hover:text-blue-600 truncate"
            >
              {lead.name}
            </Link>
            <Badge
              variant={
                lead.status === 'hot' ? 'danger' :
                lead.status === 'follow_up' ? 'warning' :
                lead.status === 'new' ? 'success' : 'default'
              }
            >
              {lead.status.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
            {lead.reason}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Suggested:
            </span>
            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
              {lead.suggestedAction}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className={cn('px-2.5 py-1 rounded-full text-sm font-bold', scoreColor)}>
            {lead.aiScore}%
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onAction?.(lead.id, 'call')}
            >
              <PhoneIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onAction?.(lead.id, 'message')}
            >
              <MessageIcon className="h-3.5 w-3.5" />
            </Button>
            <Link href={`/leads/${lead.id}`}>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
              >
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Icons
function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

export default AIPriorityActions;
