'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Badge, Spinner } from '@maiyuri/ui';
import { format, startOfDay, isEqual, subDays } from 'date-fns';
import type { Note, CallRecording } from '@maiyuri/shared';
import { CallRecordingCard } from './CallRecordingCard';
import { OdooSyncCard } from '../odoo/OdooSyncCard';

// Activity types for the timeline
type ActivityType = 'note' | 'call' | 'odoo_sync';

interface OdooSyncLog {
  id: string;
  lead_id: string;
  sync_type: 'lead_push' | 'lead_pull' | 'quote_pull';
  status: 'success' | 'error';
  odoo_response: {
    quotes?: Array<{
      number: string;
      amount: number;
      state: string;
      date: string;
    }>;
    latestQuote?: string;
    latestOrder?: string;
  };
  error_message?: string;
  created_at: string;
}

interface Activity {
  type: ActivityType;
  id: string;
  timestamp: Date;
  data: Note | CallRecording | OdooSyncLog;
}

interface DateGroup {
  label: string;
  activities: Activity[];
}

interface LeadActivityTimelineProps {
  notes: Note[];
  callRecordings: CallRecording[];
  leadId: string;
  loading?: boolean;
  onAddNote?: () => void;
  onAddAudio?: () => void;
  showNoteForm?: boolean;
  showAudioUpload?: boolean;
}

type FilterType = 'all' | 'notes' | 'calls' | 'syncs';

export function LeadActivityTimeline({
  notes,
  callRecordings,
  leadId,
  loading = false,
  onAddNote,
  onAddAudio,
  showNoteForm = false,
  showAudioUpload = false,
}: LeadActivityTimelineProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  // Fetch sync logs
  const { data: syncLogs = [] } = useQuery<OdooSyncLog[]>({
    queryKey: ['odoo-sync-logs', leadId],
    queryFn: async () => {
      const response = await fetch(`/api/odoo/sync/${leadId}`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.recentLogs || [];
    },
  });

  // Merge and sort activities
  const activities = useMemo(() => {
    const merged: Activity[] = [];

    // Add notes
    if (filter === 'all' || filter === 'notes') {
      notes.forEach((note) => {
        merged.push({
          type: 'note',
          id: note.id,
          timestamp: new Date(note.created_at),
          data: note,
        });
      });
    }

    // Add call recordings
    if (filter === 'all' || filter === 'calls') {
      callRecordings.forEach((recording) => {
        merged.push({
          type: 'call',
          id: recording.id,
          timestamp: new Date(recording.created_at),
          data: recording,
        });
      });
    }

    // Add sync logs
    if (filter === 'all' || filter === 'syncs') {
      syncLogs
        .filter((log) => log.sync_type === 'quote_pull' && log.status === 'success')
        .forEach((log) => {
          merged.push({
            type: 'odoo_sync',
            id: log.id,
            timestamp: new Date(log.created_at),
            data: log,
          });
        });
    }

    // Sort by timestamp descending (newest first)
    return merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [notes, callRecordings, syncLogs, filter]);

  // Group activities by date
  const dateGroups = useMemo(() => {
    const groups: DateGroup[] = [];
    const groupMap = new Map<string, Activity[]>();
    const today = startOfDay(new Date());
    const yesterday = startOfDay(subDays(today, 1));

    activities.forEach((activity) => {
      const activityDate = startOfDay(activity.timestamp);
      let label: string;

      if (isEqual(activityDate, today)) {
        label = 'Today';
      } else if (isEqual(activityDate, yesterday)) {
        label = 'Yesterday';
      } else {
        label = format(activityDate, 'MMM d, yyyy');
      }

      if (!groupMap.has(label)) {
        groupMap.set(label, []);
      }
      groupMap.get(label)!.push(activity);
    });

    // Convert map to array, maintaining order (most recent first)
    groupMap.forEach((activities, label) => {
      groups.push({ label, activities });
    });

    return groups;
  }, [activities]);

  const totalCount = notes.length + callRecordings.length + syncLogs.filter((log) => log.sync_type === 'quote_pull' && log.status === 'success').length;

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Lead Activity
          </h2>
          <Badge variant="default">
            {totalCount} {totalCount === 1 ? 'item' : 'items'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Dropdown */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterType)}
            className="text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Activity</option>
            <option value="notes">Notes Only</option>
            <option value="calls">Calls Only</option>
            <option value="syncs">Odoo Syncs</option>
          </select>

          {/* Action Buttons */}
          {onAddAudio && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onAddAudio}
            >
              <MicrophoneIcon className="h-4 w-4 mr-1" />
              {showAudioUpload ? 'Cancel' : 'Audio'}
            </Button>
          )}
          {onAddNote && (
            <Button size="sm" onClick={onAddNote}>
              {showNoteForm ? 'Cancel' : 'Add Note'}
            </Button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : activities.length === 0 ? (
        /* Empty State */
        <div className="text-center py-8">
          <EmptyIcon className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {filter === 'all'
              ? 'No activity yet. Add a note or upload a call recording to get started.'
              : filter === 'notes'
              ? 'No notes yet. Add your first note above.'
              : 'No call recordings yet.'}
          </p>
        </div>
      ) : (
        /* Timeline */
        <div className="space-y-6">
          {dateGroups.map((group) => (
            <div key={group.label}>
              {/* Date Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>

              {/* Activities for this date */}
              <div className="relative pl-6">
                {/* Vertical timeline line */}
                <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-700" />

                <div className="space-y-4">
                  {group.activities.map((activity, index) => (
                    <TimelineItem
                      key={`${activity.type}-${activity.id}`}
                      activity={activity}
                      isLast={index === group.activities.length - 1}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Timeline Item Component
interface TimelineItemProps {
  activity: Activity;
  isLast: boolean;
}

function TimelineItem({ activity }: TimelineItemProps) {
  const timeString = format(activity.timestamp, 'h:mm a');

  const dotConfig = activity.type === 'call'
    ? { bg: 'bg-emerald-500', icon: <PhoneIcon className="h-3 w-3 text-white" /> }
    : activity.type === 'odoo_sync'
    ? { bg: 'bg-orange-500', icon: <SyncIcon className="h-3 w-3 text-white" /> }
    : { bg: 'bg-blue-500', icon: <DocumentIcon className="h-3 w-3 text-white" /> };

  return (
    <div className="relative flex gap-4">
      {/* Timeline Dot */}
      <div className={`absolute -left-4 w-5 h-5 rounded-full ${dotConfig.bg} flex items-center justify-center ring-4 ring-white dark:ring-slate-800`}>
        {dotConfig.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Time and Type Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            {timeString}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {activity.type === 'call' ? 'Call Recording' : activity.type === 'odoo_sync' ? 'Odoo Sync' : 'Note'}
          </span>
        </div>

        {/* Activity Content */}
        {activity.type === 'call' ? (
          <CallRecordingCard recording={activity.data as CallRecording} />
        ) : activity.type === 'odoo_sync' ? (
          <OdooSyncCard syncLog={activity.data as OdooSyncLog} />
        ) : (
          <NoteCard note={activity.data as Note} />
        )}
      </div>
    </div>
  );
}

// Simple Note Card (inline, not the full NoteCard component)
interface NoteCardProps {
  note: Note;
}

function NoteCard({ note }: NoteCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      {/* Note text */}
      <p className={`text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap ${!isExpanded && note.text.length > 200 ? 'line-clamp-3' : ''}`}>
        {note.text}
      </p>
      {note.text.length > 200 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-600 hover:text-blue-700 mt-1"
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {/* Confidence badge */}
      {note.confidence_score && (
        <div className="mt-2">
          <Badge
            variant={
              note.confidence_score >= 0.7 ? 'success' :
              note.confidence_score >= 0.4 ? 'warning' : 'danger'
            }
          >
            {Math.round(note.confidence_score * 100)}% confidence
          </Badge>
        </div>
      )}

      {/* AI Summary */}
      {note.ai_summary && (
        <div className="mt-3 p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-sm">
          <span className="font-medium text-purple-700 dark:text-purple-300">AI Summary: </span>
          <span className="text-purple-900 dark:text-purple-100">{note.ai_summary}</span>
        </div>
      )}
    </div>
  );
}

// Icons
function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}

function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

export default LeadActivityTimeline;
