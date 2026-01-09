'use client';

import { Card } from '@maiyuri/ui';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DataPoint {
  name: string;
  current: number;
  previous?: number;
}

interface ConversionChartProps {
  data: DataPoint[];
  title?: string;
  loading?: boolean;
  showLegend?: boolean;
}

export function ConversionChart({
  data,
  title = 'Conversion Over Time',
  loading = false,
  showLegend = true,
}: ConversionChartProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
        <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        {title}
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#64748b', fontSize: 12 }}
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 12 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              formatter={(value: number) => [`${value}%`, '']}
            />
            {showLegend && <Legend />}
            <Line
              name="This Period"
              type="monotone"
              dataKey="current"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ r: 4, fill: '#3b82f6' }}
              activeDot={{ r: 6, fill: '#3b82f6' }}
            />
            {data.some(d => d.previous !== undefined) && (
              <Line
                name="Last Period"
                type="monotone"
                dataKey="previous"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: '#94a3b8' }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default ConversionChart;
