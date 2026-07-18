import { useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { formatINR } from '@/hooks/use-dashboard';
import {
  istToday,
  useDailyReport,
  type CountSection,
  type DailyReport,
  type SourceStatus,
} from '@/hooks/use-daily-report';
import { SkeletonList } from '@/ui';

/**
 * 📊 Daily Operations Briefing — the web daily report, natively.
 * "Export PDF" opens the print-styled web page (browser → Save as PDF);
 * "Share" sends a text summary via WhatsApp/Telegram/anything.
 */

const WEB_REPORT_URL = 'https://mb.maiyuri.com/daily-report';

const fmtQty = (n: number) => Math.round(n).toLocaleString('en-IN');

const addDays = (dateISO: string, days: number): string => {
  const d = new Date(`${dateISO}T12:00:00Z`); // noon avoids DST/offset edges
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const prettyDate = (dateISO: string): string =>
  new Date(`${dateISO}T12:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

function StatusDot({ status }: { status: SourceStatus }) {
  const colour =
    status === 'live'
      ? 'bg-green-500'
      : status === 'error'
        ? 'bg-red-500'
        : 'bg-slate-300';
  return <View className={`h-2 w-2 rounded-full ${colour}`} />;
}

function Section({
  title,
  status,
  note,
  children,
}: {
  title: string;
  status: SourceStatus;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-base font-bold text-ink">{title}</Text>
        <StatusDot status={status} />
      </View>
      {status === 'live' ? (
        children
      ) : (
        <Text className="text-sm text-slate-400">
          {note ?? (status === 'error' ? 'Source failed' : 'Not connected yet')}
        </Text>
      )}
    </View>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View className="flex-1">
      <Text className={`text-xl font-bold ${tone ?? 'text-ink'}`}>{value}</Text>
      <Text className="text-xs text-slate-500">{label}</Text>
    </View>
  );
}

function CountTile({ title, section }: { title: string; section: CountSection }) {
  return (
    <View className="mb-3 w-[48.5%] rounded-xl border border-slate-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-ink">{title}</Text>
        <StatusDot status={section.status} />
      </View>
      {section.status === 'live' ? (
        <Text className="mt-1 text-2xl font-bold text-ink">{section.primary}</Text>
      ) : (
        <Text className="mt-1 text-xs text-slate-400">{section.note ?? 'Pending'}</Text>
      )}
    </View>
  );
}

/** Compact text summary for the share sheet (WhatsApp-friendly). */
function buildSummary(r: DailyReport): string {
  const lines = [`📊 Maiyuri Daily Report — ${prettyDate(r.date)}`];
  if (r.finance.status === 'live') {
    lines.push(
      `💰 Invoiced ${formatINR(r.finance.invoiced)} · Expenses ${formatINR(r.finance.expenses)} · Net ${formatINR(r.finance.net)}`,
    );
  }
  if (r.receivables.status === 'live') {
    lines.push(
      `🧾 Outstanding ${formatINR(r.receivables.outstanding)} (overdue ${formatINR(r.receivables.overdue)} / ${r.receivables.overdueCount})`,
    );
  }
  if (r.production.status === 'live') {
    lines.push(
      `🏭 Production ${fmtQty(r.production.actualUnits)}/${fmtQty(r.production.plannedUnits)} (${r.production.pct}%)`,
    );
  }
  if (r.deliveries.status === 'live') {
    lines.push(`🚚 Deliveries ${r.deliveries.completed}/${r.deliveries.planned}`);
  }
  if (r.leads.status === 'live') {
    lines.push(
      `📈 Leads +${r.leads.newLeads} new · ${r.leads.hot} hot · ${r.leads.followupsDue} follow-ups due`,
    );
  }
  lines.push(`\nFull report: ${WEB_REPORT_URL}?date=${r.date}`);
  return lines.join('\n');
}

export default function DailyReportScreen() {
  const [date, setDate] = useState(istToday());
  const query = useDailyReport(date, true);
  const report = query.data?.data;
  const isToday = date === istToday();

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="p-4 pb-10"
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
        />
      }
    >
      {/* Date switcher */}
      <View className="mb-3 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white p-2">
        <Pressable
          onPress={() => setDate((d) => addDays(d, -1))}
          className="h-10 w-10 items-center justify-center rounded-lg active:bg-slate-100"
        >
          <Text className="text-lg text-ink">‹</Text>
        </Pressable>
        <Text className="text-base font-bold text-ink">
          {prettyDate(date)}
          {isToday ? ' · today' : ''}
        </Text>
        <Pressable
          onPress={() => setDate((d) => addDays(d, 1))}
          disabled={isToday}
          className={`h-10 w-10 items-center justify-center rounded-lg ${isToday ? 'opacity-30' : 'active:bg-slate-100'}`}
        >
          <Text className="text-lg text-ink">›</Text>
        </Pressable>
      </View>

      {/* Actions */}
      <View className="mb-3 flex-row">
        <Pressable
          onPress={() => void Linking.openURL(`${WEB_REPORT_URL}?date=${date}`)}
          className="mr-2 flex-1 items-center rounded-xl bg-ink px-4 py-3 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-white">⤓ Export PDF</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (report) void Share.share({ message: buildSummary(report) });
          }}
          disabled={!report}
          className={`flex-1 items-center rounded-xl px-4 py-3 ${report ? 'bg-brand active:opacity-80' : 'bg-slate-200'}`}
        >
          <Text className="text-sm font-semibold text-ink">📤 Share summary</Text>
        </Pressable>
      </View>

      {query.isLoading ? (
        <SkeletonList count={6} />
      ) : !report ? (
        <View className="items-center rounded-xl border border-slate-200 bg-white p-6">
          <Text className="text-center text-sm text-red-500">
            {query.error instanceof Error
              ? query.error.message
              : "Couldn't load the report"}
          </Text>
          <Pressable
            onPress={() => void query.refetch()}
            className="mt-3 rounded-xl bg-brand px-5 py-2.5 active:opacity-80"
          >
            <Text className="font-semibold text-ink">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Finance */}
          <Section title="💰 Finance" status={report.finance.status} note={report.finance.note}>
            <View className="flex-row">
              <Metric label="Invoiced" value={formatINR(report.finance.invoiced)} />
              <Metric label="Expenses" value={formatINR(report.finance.expenses)} />
              <Metric
                label="Net"
                value={formatINR(report.finance.net)}
                tone={report.finance.net >= 0 ? 'text-green-600' : 'text-red-600'}
              />
            </View>
            {report.finance.topInvoices.length ? (
              <View className="mt-3 border-t border-slate-100 pt-2">
                {report.finance.topInvoices.slice(0, 3).map((inv) => (
                  <View key={inv.ref} className="flex-row justify-between py-0.5">
                    <Text className="flex-1 pr-2 text-xs text-slate-500" numberOfLines={1}>
                      {inv.ref} · {inv.party}
                    </Text>
                    <Text className="text-xs font-semibold text-ink">
                      {formatINR(inv.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Section>

          {/* Receivables */}
          <Section
            title="🧾 Receivables"
            status={report.receivables.status}
            note={report.receivables.note}
          >
            <View className="flex-row">
              <Metric label="Outstanding" value={formatINR(report.receivables.outstanding)} />
              <Metric
                label={`Overdue (${report.receivables.overdueCount})`}
                value={formatINR(report.receivables.overdue)}
                tone="text-red-600"
              />
            </View>
            {report.receivables.topDebtors.length ? (
              <View className="mt-3 border-t border-slate-100 pt-2">
                {report.receivables.topDebtors.slice(0, 3).map((d) => (
                  <View key={d.customer} className="flex-row justify-between py-0.5">
                    <Text className="flex-1 pr-2 text-xs text-slate-500" numberOfLines={1}>
                      {d.customer} · {d.oldestDays}d
                    </Text>
                    <Text className="text-xs font-semibold text-ink">{formatINR(d.due)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Section>

          {/* Production */}
          <Section
            title="🏭 Production"
            status={report.production.status}
            note={report.production.note}
          >
            <View className="flex-row">
              <Metric label="Planned" value={fmtQty(report.production.plannedUnits)} />
              <Metric label="Actual" value={fmtQty(report.production.actualUnits)} />
              <Metric
                label="Achieved"
                value={`${report.production.pct}%`}
                tone={report.production.pct >= 90 ? 'text-green-600' : 'text-amber-600'}
              />
            </View>
          </Section>

          {/* Deliveries */}
          <Section
            title="🚚 Deliveries"
            status={report.deliveries.status}
            note={report.deliveries.note}
          >
            <View className="flex-row">
              <Metric label="Planned" value={String(report.deliveries.planned)} />
              <Metric label="Completed" value={String(report.deliveries.completed)} />
              <Metric label="Rolled over" value={String(report.deliveries.rolledOver)} />
            </View>
            {report.deliveries.tripKm > 0 ? (
              <Text className="mt-2 text-xs text-slate-500">
                {fmtQty(report.deliveries.tripKm)} km driven · diesel{' '}
                {formatINR(report.deliveries.dieselCost)}
              </Text>
            ) : null}
          </Section>

          {/* Leads */}
          <Section title="📈 Leads" status={report.leads.status} note={report.leads.note}>
            <View className="flex-row">
              <Metric label="New" value={String(report.leads.newLeads)} />
              <Metric label="Hot" value={String(report.leads.hot)} tone="text-red-600" />
              <Metric label="Follow-ups due" value={String(report.leads.followupsDue)} />
            </View>
          </Section>

          {/* Small tiles */}
          <View className="flex-row flex-wrap justify-between">
            <CountTile title="📞 Calls" section={report.calls} />
            <CountTile title="💬 WhatsApp" section={report.whatsapp} />
            <CountTile title="✅ Tasks" section={report.tasks} />
          </View>

          <Text className="mt-1 text-center text-xs text-slate-400">
            Generated {new Date(report.generatedAt).toLocaleTimeString('en-IN')} ·
            pull down to refresh
          </Text>
        </>
      )}
    </ScrollView>
  );
}
