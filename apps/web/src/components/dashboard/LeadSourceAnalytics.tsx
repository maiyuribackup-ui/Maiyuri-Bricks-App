'use client';

import { Card } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface LeadSource {
  source: string;
  label: string;
  count: number;
  converted: number;
  conversionRate: number;
  color: string;
}

interface LeadSourceAnalyticsProps {
  sources: LeadSource[];
  title?: string;
  loading?: boolean;
}

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

export function LeadSourceAnalytics({
  sources,
  title = 'Lead Sources',
  loading = false,
}: LeadSourceAnalyticsProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
        <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      </Card>
    );
  }

  const totalLeads = sources.reduce((sum, s) => sum + s.count, 0);
  const chartData = sources.map((s, i) => ({
    name: s.label,
    value: s.count,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Total: {totalLeads}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: 'none',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
                formatter={(value: number) => [`${value} leads`, 'Count']}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Source Details */}
        <div className="space-y-3">
          {sources.map((source, index) => (
            <div
              key={source.source}
              className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {source.label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {source.count} leads • {source.converted} converted
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    'text-sm font-semibold',
                    source.conversionRate >= 30
                      ? 'text-green-600'
                      : source.conversionRate >= 15
                      ? 'text-yellow-600'
                      : 'text-slate-600'
                  )}
                >
                  {source.conversionRate}%
                </span>
                <p className="text-[10px] text-slate-400">conversion</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function getDefaultLeadSources(): LeadSource[] {
  return [
    { source: 'referral', label: 'Referral', count: 0, converted: 0, conversionRate: 0, color: '#3b82f6' },
    { source: 'website', label: 'Website', count: 0, converted: 0, conversionRate: 0, color: '#22c55e' },
    { source: 'walk_in', label: 'Walk-in', count: 0, converted: 0, conversionRate: 0, color: '#f59e0b' },
    { source: 'phone', label: 'Phone Call', count: 0, converted: 0, conversionRate: 0, color: '#ef4444' },
    { source: 'social', label: 'Social Media', count: 0, converted: 0, conversionRate: 0, color: '#8b5cf6' },
    { source: 'other', label: 'Other', count: 0, converted: 0, conversionRate: 0, color: '#06b6d4' },
  ];
}

export default LeadSourceAnalytics;
