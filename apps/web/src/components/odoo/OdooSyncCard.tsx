'use client';

import { CheckCircleIcon, DocumentTextIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Badge, Card } from '@maiyuri/ui';

interface OdooQuote {
  // New format (transformed)
  number?: string;
  amount?: number;
  // Old format (raw Odoo fields)
  name?: string;
  amount_total?: number;
  // Common fields
  id?: number;
  state?: string;
  date?: string;
  date_order?: string;
}

interface OdooSyncCardProps {
  syncLog: {
    id: string;
    sync_type: string;
    status: string;
    created_at: string;
    odoo_response?: {
      quotes?: OdooQuote[];
      latestQuote?: string;
      latestOrder?: string;
    };
  };
}

// Helper to normalize quote data from various formats
function normalizeQuote(quote: OdooQuote | number | string | unknown): OdooQuote {
  // Handle primitive values (old format might just be IDs)
  if (typeof quote === 'number') {
    return { id: quote };
  }
  if (typeof quote === 'string') {
    return { name: quote };
  }
  if (!quote || typeof quote !== 'object') {
    return {};
  }
  return quote as OdooQuote;
}

// Helper to get quote number from either format
function getQuoteNumber(quote: OdooQuote | unknown): string {
  const q = normalizeQuote(quote);
  return q.number || q.name || (q.id ? `#${q.id}` : 'N/A');
}

// Helper to get quote amount from either format
function getQuoteAmount(quote: OdooQuote | unknown): number {
  const q = normalizeQuote(quote);
  return q.amount ?? q.amount_total ?? 0;
}

// Helper to get quote state
function getQuoteState(quote: OdooQuote | unknown): string | undefined {
  const q = normalizeQuote(quote);
  return q.state;
}

export function OdooSyncCard({ syncLog }: OdooSyncCardProps) {
  const { odoo_response } = syncLog;
  const quotes = odoo_response?.quotes || [];

  return (
    <Card className="p-4 border-l-4 border-l-orange-500 bg-orange-50 dark:bg-orange-900/10">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <ArrowPathIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Quotes Synced from Odoo
            </h4>
            <Badge variant="success" className="ml-2">
              <CheckCircleIcon className="h-3 w-3 mr-1" />
              Success
            </Badge>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
            {new Date(syncLog.created_at).toLocaleString('en-IN', {
              dateStyle: 'medium',
              timeStyle: 'short'
            })}
          </p>

          {quotes.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Found {quotes.length} quote(s):
              </p>

              <div className="space-y-1.5">
                {quotes.map((quote, idx) => {
                  const state = getQuoteState(quote);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center gap-2">
                        <DocumentTextIcon className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-medium">{getQuoteNumber(quote)}</span>
                        {state && (
                          <Badge variant="default" className="text-xs">
                            {state}
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm font-bold text-emerald-600">
                        ₹{getQuoteAmount(quote).toLocaleString('en-IN')}
                      </span>
                    </div>
                  );
                })}
              </div>

              {odoo_response?.latestQuote && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Latest: {odoo_response.latestQuote}
                  {odoo_response?.latestOrder && ` • Order: ${odoo_response.latestOrder}`}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No quotes found for this lead in Odoo
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
