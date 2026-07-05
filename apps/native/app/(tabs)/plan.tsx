import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useActivatePlan,
  useActivePlan,
  useGeneratePlan,
  usePlanningInputs,
  usePromiseDate,
  useRefreshInputs,
  useUpdatePlanItem,
  useVariance,
  type DraftPlan,
  type OpenOrder,
  type PlanItem,
} from '@/hooks/use-ops-planning';

// ---------------- helpers ----------------

const fmtQty = (n: number) => Number(n).toLocaleString('en-IN');
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
const isSunday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-base font-bold text-ink">{title}</Text>
      {children}
    </View>
  );
}

// ---------------- Plan segment ----------------

function OrderCard({
  order,
  selected,
  onToggle,
}: {
  order: OpenOrder;
  selected: boolean;
  onToggle: () => void;
}) {
  const remainingLines = order.lines.filter(
    (l) => l.finished_good_id && l.qty_ordered - l.qty_delivered > 0,
  );
  return (
    <Pressable
      onPress={onToggle}
      className={`mb-2 rounded-xl border p-3.5 ${
        selected ? 'border-brand bg-orange-50' : 'border-slate-200 bg-white'
      } active:opacity-70`}
    >
      <View className="flex-row items-center">
        <View
          className={`mr-3 h-6 w-6 items-center justify-center rounded-md border-2 ${
            selected ? 'border-brand bg-brand' : 'border-slate-300 bg-white'
          }`}
        >
          {selected ? <Text className="text-xs font-bold text-white">✓</Text> : null}
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="font-semibold text-ink" numberOfLines={1}>
              {order.name} · {order.partner_name ?? 'Customer'}
            </Text>
            <Text className="ml-2 text-xs text-slate-400">{fmtDate(order.date_order)}</Text>
          </View>
          {remainingLines.map((l, i) => (
            <Text key={i} className="mt-0.5 text-sm text-slate-600" numberOfLines={1}>
              {fmtQty(l.qty_ordered - l.qty_delivered)} × {l.product_name}
              {l.qty_delivered > 0 ? (
                <Text className="text-xs text-slate-400">
                  {'  '}({fmtQty(l.qty_delivered)} delivered)
                </Text>
              ) : null}
            </Text>
          ))}
          {order.commitment_date ? (
            <Text className="mt-1 text-xs font-medium text-purple-600">
              📅 Committed: {fmtDate(order.commitment_date)}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function DraftPreview({
  draft,
  onActivate,
  onDiscard,
  activating,
  activateError,
}: {
  draft: DraftPlan;
  onActivate: () => void;
  onDiscard: () => void;
  activating: boolean;
  activateError: string | null;
}) {
  const byDate = useMemo(() => {
    const map = new Map<string, typeof draft.items>();
    for (const item of draft.items) {
      const arr = map.get(item.item_date) ?? [];
      arr.push(item);
      map.set(item.item_date, arr);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [draft]);

  return (
    <View className="rounded-2xl border-2 border-brand bg-white p-4">
      <Text className="text-lg font-bold text-ink">📝 Draft: {draft.name}</Text>
      <Text className="mt-1 text-sm text-slate-500">
        🏭 {fmtQty(draft.totals.production_units)} units in {draft.totals.production_runs} runs ·
        🚚 {draft.totals.deliveries} deliveries
      </Text>

      {draft.ai_rationale ? (
        <View className="mt-3 rounded-xl bg-violet-50 p-3">
          <Text className="text-xs font-semibold uppercase tracking-wider text-violet-400">
            {draft.ai_used ? '✨ AI rationale' : 'ℹ️ Plan logic'}
          </Text>
          <Text className="mt-1 text-sm leading-5 text-violet-900">{draft.ai_rationale}</Text>
        </View>
      ) : null}

      {draft.warnings.length > 0 ? (
        <View className="mt-3 rounded-xl bg-red-50 p-3">
          {draft.warnings.map((w, i) => (
            <Text key={i} className="mb-1 text-xs text-red-600">
              ⚠️ {w.message}
            </Text>
          ))}
        </View>
      ) : null}

      <Text className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Delivery promises
      </Text>
      {draft.promises.map((p) => (
        <View key={p.order_ref} className="mb-1 flex-row items-center">
          <Text className="flex-1 text-sm text-slate-700" numberOfLines={1}>
            {p.order_ref} · {p.customer_name}
          </Text>
          <Text
            className={`text-sm font-semibold ${p.late_vs_commitment ? 'text-red-500' : 'text-green-600'}`}
          >
            {p.promised_delivery_date ? fmtDate(p.promised_delivery_date) : '—'}
          </Text>
        </View>
      ))}

      <Text className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Day by day
      </Text>
      {byDate.map(([date, items]) => (
        <View key={date} className="mb-2 rounded-lg bg-slate-50 p-2.5">
          <Text className="mb-1 text-xs font-bold text-slate-500">
            {new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </Text>
          {items.map((i, idx) => (
            <Text key={idx} className="text-sm text-slate-700" numberOfLines={1}>
              {i.item_type === 'production' ? '🏭' : '🚚'} {fmtQty(i.quantity)}
              {i.item_type === 'production' ? ` × ${i.product_name}` : ` → ${i.customer_name}`}
              <Text className="text-xs text-slate-400"> ({i.sale_order_ref})</Text>
            </Text>
          ))}
        </View>
      ))}

      {activateError ? (
        <Text className="mt-2 text-sm text-red-500">{activateError}</Text>
      ) : null}

      <View className="mt-3 flex-row gap-2">
        <Pressable
          onPress={onDiscard}
          className="flex-1 items-center rounded-xl border border-slate-200 py-3 active:opacity-70"
        >
          <Text className="font-semibold text-slate-600">Discard</Text>
        </Pressable>
        <Pressable
          onPress={onActivate}
          disabled={activating}
          className={`flex-1 items-center rounded-xl py-3 ${activating ? 'bg-slate-200' : 'bg-green-500 active:opacity-80'}`}
        >
          {activating ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text className="font-semibold text-white">✅ Activate plan</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function PlanSegment() {
  const inputs = usePlanningInputs();
  const refresh = useRefreshInputs();
  const generate = useGeneratePlan();
  const activate = useActivatePlan();
  const promise = usePromiseDate();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [horizon, setHorizon] = useState(14);
  const [constraints, setConstraints] = useState('');
  const [draft, setDraft] = useState<DraftPlan | null>(null);
  const [promiseFg, setPromiseFg] = useState<string | null>(null);
  const [promiseQty, setPromiseQty] = useState('');

  const data = inputs.data?.data;
  const orders = data?.open_orders ?? [];
  const productsMissingParams = (data?.products ?? []).filter((p) => !p.has_params);

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onGenerate = () => {
    setDraft(null);
    generate.mutate(
      {
        horizon_days: horizon,
        constraint_text: constraints.trim() || null,
        selected_order_ids: [...selected],
      },
      { onSuccess: (res) => setDraft(res.data) },
    );
  };

  const onActivate = () => {
    if (!draft) return;
    activate.mutate(draft, {
      onSuccess: () => {
        setDraft(null);
        setSelected(new Set());
      },
    });
  };

  if (inputs.isLoading) {
    return (
      <View className="flex-1 items-center justify-center py-20">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerClassName="p-4 pb-10"
      refreshControl={
        <RefreshControl refreshing={inputs.isRefetching} onRefresh={() => inputs.refetch()} />
      }
      keyboardShouldPersistTaps="handled"
    >
      {/* sync strip */}
      <View className="mb-3 flex-row items-center justify-between rounded-xl bg-white p-3 border border-slate-200">
        <View className="flex-1">
          <Text className="text-xs text-slate-400">
            Orders synced: {data?.orders_synced_at ? new Date(data.orders_synced_at).toLocaleString('en-IN') : 'never'}
          </Text>
          {data?.active_plan ? (
            <Text className="mt-0.5 text-xs font-medium text-green-600">
              ✅ Active: {data.active_plan.name}
            </Text>
          ) : (
            <Text className="mt-0.5 text-xs text-slate-400">No active plan yet</Text>
          )}
        </View>
        <Pressable
          onPress={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="rounded-lg bg-ink px-3 py-2 active:opacity-80"
        >
          {refresh.isPending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-xs font-semibold text-white">🔄 Sync Odoo</Text>
          )}
        </Pressable>
      </View>

      {inputs.isError ? (
        <Text className="mb-3 text-sm text-red-500">
          {inputs.error instanceof Error ? inputs.error.message : 'Failed to load'}
        </Text>
      ) : null}

      {productsMissingParams.length > 0 ? (
        <View className="mb-3 rounded-xl bg-amber-50 p-3">
          <Text className="text-xs text-amber-700">
            ⚙️ No capacity set for: {productsMissingParams.map((p) => p.product_name).join(', ')}.
            These can't be planned — set daily capacity in Settings → Planning.
          </Text>
        </View>
      ) : null}

      {/* promise checker */}
      <Section title="🔮 Promise checker">
        <View className="rounded-xl border border-slate-200 bg-white p-3">
          <View className="flex-row flex-wrap">
            {(data?.products ?? [])
              .filter((p) => p.has_params)
              .map((p) => (
                <Pressable
                  key={p.finished_good_id}
                  onPress={() => setPromiseFg(p.finished_good_id)}
                  className={`mb-1.5 mr-1.5 rounded-lg border px-2.5 py-1.5 ${
                    promiseFg === p.finished_good_id
                      ? 'border-ink bg-ink'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <Text
                    className={`text-xs ${promiseFg === p.finished_good_id ? 'text-white' : 'text-slate-600'}`}
                  >
                    {p.product_name}
                  </Text>
                </Pressable>
              ))}
          </View>
          <View className="mt-2 flex-row gap-2">
            <TextInput
              value={promiseQty}
              onChangeText={setPromiseQty}
              keyboardType="numeric"
              placeholder="Quantity"
              placeholderTextColor="#94a3b8"
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-ink"
            />
            <Pressable
              onPress={() =>
                promiseFg &&
                Number(promiseQty) > 0 &&
                promise.mutate({ finished_good_id: promiseFg, quantity: Number(promiseQty) })
              }
              disabled={promise.isPending || !promiseFg || !Number(promiseQty)}
              className={`items-center justify-center rounded-lg px-4 ${
                promise.isPending || !promiseFg || !Number(promiseQty)
                  ? 'bg-slate-200'
                  : 'bg-brand active:opacity-80'
              }`}
            >
              {promise.isPending ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : (
                <Text className="text-sm font-semibold text-ink">Check</Text>
              )}
            </Pressable>
          </View>
          {promise.data ? (
            <Text className="mt-2 text-sm font-semibold text-green-700">
              {promise.data.data.promised_delivery_date
                ? `📦 Earliest delivery: ${fmtDate(promise.data.data.promised_delivery_date)}`
                : '⚠️ Cannot be fulfilled within 60 days'}
              {promise.data.data.unfulfilled_units > 0
                ? ` (${fmtQty(promise.data.data.unfulfilled_units)} units short)`
                : ''}
            </Text>
          ) : null}
        </View>
      </Section>

      {/* open orders */}
      <Section
        title={`📦 Open sales orders (${orders.length})`}
      >
        {orders.length === 0 ? (
          <View className="rounded-xl border border-slate-200 bg-white p-4">
            <Text className="text-sm text-slate-400">
              No open orders — tap 🔄 Sync Odoo to pull the latest confirmed orders.
            </Text>
          </View>
        ) : (
          <>
            <Pressable
              onPress={() =>
                setSelected(
                  selected.size === orders.length
                    ? new Set()
                    : new Set(orders.map((o) => o.odoo_order_id)),
                )
              }
              className="mb-2 self-start rounded-lg bg-slate-100 px-3 py-1.5 active:opacity-70"
            >
              <Text className="text-xs font-semibold text-slate-600">
                {selected.size === orders.length ? 'Clear selection' : 'Select all'}
              </Text>
            </Pressable>
            {orders.map((o) => (
              <OrderCard
                key={o.odoo_order_id}
                order={o}
                selected={selected.has(o.odoo_order_id)}
                onToggle={() => toggle(o.odoo_order_id)}
              />
            ))}
          </>
        )}
      </Section>

      {/* constraints + generate */}
      <Section title="⚙️ Constraints & horizon">
        <View className="mb-2 flex-row gap-2">
          {[7, 14, 30].map((d) => (
            <Pressable
              key={d}
              onPress={() => setHorizon(d)}
              className={`rounded-full px-4 py-1.5 ${
                horizon === d ? 'bg-ink' : 'border border-slate-200 bg-white'
              }`}
            >
              <Text className={`text-xs font-medium ${horizon === d ? 'text-white' : 'text-slate-600'}`}>
                {d} days
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={constraints}
          onChangeText={setConstraints}
          placeholder="e.g. No production Thursday — machine service. Kumar's order first. Max 2 deliveries/day this week."
          placeholderTextColor="#94a3b8"
          multiline
          className="min-h-[70px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink"
        />
      </Section>

      <Pressable
        onPress={onGenerate}
        disabled={generate.isPending || (orders.length > 0 && selected.size === 0)}
        className={`mb-4 items-center rounded-2xl py-4 ${
          generate.isPending || (orders.length > 0 && selected.size === 0)
            ? 'bg-slate-200'
            : 'bg-brand active:opacity-80'
        }`}
      >
        {generate.isPending ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator color="#0f172a" />
            <Text className="text-base font-bold text-ink">Planning with AI…</Text>
          </View>
        ) : (
          <Text className="text-base font-bold text-ink">
            ⚡ Generate plan{selected.size ? ` (${selected.size} order${selected.size > 1 ? 's' : ''})` : ''}
          </Text>
        )}
      </Pressable>
      {orders.length > 0 && selected.size === 0 ? (
        <Text className="-mt-2 mb-4 text-center text-xs text-slate-400">
          Select at least one sales order above
        </Text>
      ) : null}
      {generate.isError ? (
        <Text className="-mt-2 mb-4 text-center text-sm text-red-500">
          {generate.error instanceof Error ? generate.error.message : 'Generation failed'}
        </Text>
      ) : null}

      {draft ? (
        <DraftPreview
          draft={draft}
          onActivate={onActivate}
          onDiscard={() => setDraft(null)}
          activating={activate.isPending}
          activateError={
            activate.isError
              ? activate.error instanceof Error
                ? activate.error.message
                : 'Activation failed'
              : null
          }
        />
      ) : null}
    </ScrollView>
  );
}

// ---------------- Calendar segment ----------------

function CalendarSegment() {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  const monthStart = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const from = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const to = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;

  const { data, isLoading } = useActivePlan(from, to);
  const update = useUpdatePlanItem();
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [reportItem, setReportItem] = useState<PlanItem | null>(null);
  const [reportQty, setReportQty] = useState('');

  const itemsByDate = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const item of data?.data.items ?? []) {
      const arr = map.get(item.item_date) ?? [];
      arr.push(item);
      map.set(item.item_date, arr);
    }
    return map;
  }, [data]);

  // Build the day grid (weeks start Monday).
  const cells: (string | null)[] = [];
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0 = Monday
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    cells.push(
      `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    );
  }

  const monthLabel = monthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const dayItems = dayOpen ? (itemsByDate.get(dayOpen) ?? []) : [];

  return (
    <ScrollView contentContainerClassName="p-4 pb-10">
      <View className="mb-3 flex-row items-center justify-between">
        <Pressable onPress={() => setMonthOffset((m) => m - 1)} className="rounded-lg bg-slate-100 px-3 py-1.5">
          <Text className="font-bold text-slate-600">←</Text>
        </Pressable>
        <Text className="text-base font-bold text-ink">{monthLabel}</Text>
        <Pressable onPress={() => setMonthOffset((m) => m + 1)} className="rounded-lg bg-slate-100 px-3 py-1.5">
          <Text className="font-bold text-slate-600">→</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#f97316" className="mt-10" />
      ) : !data?.data.plan ? (
        <View className="mt-6 items-center rounded-xl border border-slate-200 bg-white p-6">
          <Text className="text-sm text-slate-400">No active plan — generate one in the Plan tab.</Text>
        </View>
      ) : (
        <>
          <View className="flex-row">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <Text key={i} className="flex-1 text-center text-xs font-bold text-slate-400">
                {d}
              </Text>
            ))}
          </View>
          <View className="mt-1 flex-row flex-wrap">
            {cells.map((date, i) => {
              const items = date ? (itemsByDate.get(date) ?? []) : [];
              const prod = items.filter((x) => x.item_type === 'production');
              const del = items.filter((x) => x.item_type === 'delivery');
              const sunday = date ? isSunday(date) : false;
              return (
                <Pressable
                  key={i}
                  disabled={!date || items.length === 0}
                  onPress={() => date && setDayOpen(date)}
                  style={{ width: `${100 / 7}%` }}
                  className="p-0.5"
                >
                  <View
                    className={`min-h-[52px] rounded-lg border p-1 ${
                      sunday
                        ? 'border-slate-100 bg-slate-100'
                        : items.length
                          ? 'border-brand bg-orange-50'
                          : 'border-slate-100 bg-white'
                    }`}
                  >
                    <Text className={`text-xs ${sunday ? 'text-slate-300' : 'text-slate-500'}`}>
                      {date ? Number(date.slice(8)) : ''}
                    </Text>
                    {prod.length > 0 ? (
                      <Text className="text-[10px] text-ink" numberOfLines={1}>
                        🏭{fmtQty(prod.reduce((s, x) => s + Number(x.quantity), 0))}
                      </Text>
                    ) : null}
                    {del.length > 0 ? (
                      <Text className="text-[10px] text-ink" numberOfLines={1}>
                        🚚{del.length}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Day detail sheet */}
      <Modal visible={!!dayOpen} transparent animationType="slide" onRequestClose={() => setDayOpen(null)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="max-h-[70%] rounded-t-3xl bg-white p-5">
            <Text className="mb-3 text-lg font-bold text-ink">
              {dayOpen
                ? new Date(`${dayOpen}T00:00:00`).toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })
                : ''}
            </Text>
            <ScrollView>
              {dayItems.map((item) => (
                <View key={item.id} className="mb-2 rounded-xl border border-slate-200 p-3">
                  <Text className="font-semibold text-ink">
                    {item.item_type === 'production' ? '🏭' : '🚚'} {fmtQty(item.quantity)}
                    {item.item_type === 'production' ? ` × ${item.product_name}` : ` → ${item.customer_name}`}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-400">
                    {item.sale_order_ref} · {item.status}
                    {item.actual_quantity != null ? ` · actual ${fmtQty(item.actual_quantity)}` : ''}
                  </Text>
                  {item.status === 'planned' ? (
                    <View className="mt-2 flex-row gap-2">
                      <Pressable
                        onPress={() => {
                          setReportItem(item);
                          setReportQty(String(item.quantity));
                        }}
                        className="rounded-lg bg-green-500 px-3 py-1.5 active:opacity-80"
                      >
                        <Text className="text-xs font-semibold text-white">✅ Report done</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          const next = new Date(`${item.item_date}T00:00:00Z`);
                          next.setUTCDate(next.getUTCDate() + (next.getUTCDay() === 6 ? 2 : 1));
                          update.mutate({
                            id: item.id,
                            body: { item_date: next.toISOString().slice(0, 10) },
                          });
                          setDayOpen(null);
                        }}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 active:opacity-70"
                      >
                        <Text className="text-xs font-semibold text-slate-600">→ Push a day</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setDayOpen(null)}
              className="mt-2 items-center rounded-xl bg-ink py-3 active:opacity-80"
            >
              <Text className="font-semibold text-white">Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Report-actual sheet */}
      <Modal
        visible={!!reportItem}
        transparent
        animationType="fade"
        onRequestClose={() => setReportItem(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-8">
          <View className="w-full rounded-2xl bg-white p-5">
            <Text className="text-base font-bold text-ink">Report actual</Text>
            <Text className="mt-1 text-sm text-slate-500" numberOfLines={2}>
              {reportItem?.product_name} · planned {fmtQty(reportItem?.quantity ?? 0)}
            </Text>
            <TextInput
              value={reportQty}
              onChangeText={setReportQty}
              keyboardType="numeric"
              className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-ink"
            />
            <View className="mt-3 flex-row gap-2">
              <Pressable
                onPress={() => setReportItem(null)}
                className="flex-1 items-center rounded-xl border border-slate-200 py-2.5"
              >
                <Text className="font-semibold text-slate-600">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!reportItem) return;
                  const qty = Number(reportQty);
                  if (Number.isNaN(qty) || qty < 0) return;
                  update.mutate(
                    {
                      id: reportItem.id,
                      body: {
                        actual_quantity: qty,
                        status: qty >= Number(reportItem.quantity) ? 'done' : 'partial',
                      },
                    },
                    { onSuccess: () => setReportItem(null) },
                  );
                }}
                disabled={update.isPending}
                className="flex-1 items-center rounded-xl bg-green-500 py-2.5 active:opacity-80"
              >
                {update.isPending ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="font-semibold text-white">Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ---------------- Variance segment ----------------

function VarianceSegment() {
  const { data, isLoading } = useVariance(14);
  const v = data?.data;

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center py-20">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  const pct = v?.production.fulfillment_pct;

  return (
    <ScrollView contentContainerClassName="p-4 pb-10">
      <View className="rounded-2xl bg-ink p-4">
        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Last 14 days · plan vs actual
        </Text>
        <View className="mt-2 flex-row items-end">
          <Text
            className={`text-4xl font-bold ${
              pct == null ? 'text-slate-400' : pct >= 90 ? 'text-green-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'
            }`}
          >
            {pct == null ? '—' : `${pct}%`}
          </Text>
          <Text className="mb-1.5 ml-2 text-sm text-slate-400">production fulfillment</Text>
        </View>
        <Text className="mt-1 text-sm text-slate-300">
          🏭 {fmtQty(v?.production.actual_units ?? 0)} made of {fmtQty(v?.production.planned_units ?? 0)} planned ·
          🚚 {v?.deliveries.completed ?? 0}/{v?.deliveries.planned ?? 0} deliveries
        </Text>
      </View>

      <Text className="mb-2 mt-4 text-base font-bold text-ink">Recent items</Text>
      {(v?.items ?? []).length === 0 ? (
        <Text className="text-sm text-slate-400">No plan items in this window yet.</Text>
      ) : (
        (v?.items ?? []).map((item) => {
          const variance =
            item.item_type === 'production' && item.actual_quantity != null
              ? Number(item.actual_quantity) - Number(item.quantity)
              : null;
          return (
            <View key={item.id} className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 text-sm font-semibold text-ink" numberOfLines={1}>
                  {item.item_type === 'production' ? '🏭' : '🚚'} {item.product_name}
                </Text>
                <Text className="text-xs text-slate-400">{fmtDate(item.item_date)}</Text>
              </View>
              <Text className="mt-0.5 text-xs text-slate-500">
                Planned {fmtQty(item.quantity)}
                {item.actual_quantity != null ? ` · Actual ${fmtQty(item.actual_quantity)}` : ' · not reported'}
                {variance != null ? (
                  <Text className={variance >= 0 ? 'text-green-600' : 'text-red-500'}>
                    {'  '}({variance >= 0 ? '+' : ''}{fmtQty(variance)})
                  </Text>
                ) : null}
              </Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

// ---------------- screen ----------------

type Segment = 'plan' | 'calendar' | 'variance';

export default function PlanScreen() {
  const [segment, setSegment] = useState<Segment>('plan');
  const SEGMENTS: { key: Segment; label: string }[] = [
    { key: 'plan', label: '📋 Plan' },
    { key: 'calendar', label: '🗓️ Calendar' },
    { key: 'variance', label: '📊 Variance' },
  ];

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <View className="flex-row gap-2 px-4 pb-1 pt-3">
        {SEGMENTS.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setSegment(s.key)}
            className={`flex-1 items-center rounded-xl py-2 ${
              segment === s.key ? 'bg-ink' : 'border border-slate-200 bg-white'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${segment === s.key ? 'text-white' : 'text-slate-600'}`}
            >
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {segment === 'plan' ? <PlanSegment /> : segment === 'calendar' ? <CalendarSegment /> : <VarianceSegment />}
    </SafeAreaView>
  );
}
