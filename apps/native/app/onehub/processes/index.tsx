import type {
  ProcessCategory,
  ProcessDefinitionView,
  ProcessWorkStageItem,
} from "@maiyuri/shared";
import { PROCESS_CATEGORY_LABELS, PROCESS_ROLE_LABELS } from "@maiyuri/shared";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useProcessDefinitions, useProcessWork } from "@/hooks/use-process";
import { Card, Icon, SkeletonList, Touchable } from "@/ui";

/**
 * Process Library (PRD §7.1): what processes exist, grouped by category,
 * plus a "My process work" summary so staff can jump straight to the stage
 * they own.
 */

const CATEGORY_ORDER: ProcessCategory[] = [
  "SALES",
  "FACTORY",
  "DELIVERY",
  "FINANCE",
  "PROJECTS",
  "SAFETY",
];

/** Where a work row goes: the mirrored My Work item when it exists, else the case. */
function workItemHref(item: ProcessWorkStageItem): string {
  return item.stage_instance.work_item_id
    ? `/onehub/my-work/${item.stage_instance.work_item_id}`
    : `/onehub/processes/case/${item.instance.id}`;
}

function SummaryPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: string;
}) {
  return (
    <View className="flex-1 items-center rounded-xl bg-white/10 py-2.5">
      <Text
        className={`text-xl font-bold ${count > 0 ? tone : "text-slate-400"}`}
      >
        {count}
      </Text>
      <Text className="text-xs text-slate-300">{label}</Text>
    </View>
  );
}

function WorkRow({
  item,
  kind,
}: {
  item: ProcessWorkStageItem;
  kind: "stage" | "handover";
}) {
  const router = useRouter();
  const customer =
    String(item.instance.context?.customer_name ?? "") || item.definition.name;
  return (
    <Touchable
      onPress={() => router.push(workItemHref(item) as never)}
      className="flex-row items-center px-4 py-3.5"
      containerClassName="border-t border-line"
    >
      <Icon
        name={
          kind === "handover"
            ? "swap-horizontal-outline"
            : item.is_overdue
              ? "alert-circle"
              : "ellipse"
        }
        size={20}
        color={
          item.is_overdue
            ? "#dc2626"
            : kind === "handover"
              ? "#0284c7"
              : "#f97316"
        }
      />
      <View className="ml-3 flex-1">
        <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
          {item.stage.name} · {customer}
        </Text>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
          {kind === "handover"
            ? `Handover from ${PROCESS_ROLE_LABELS[item.handover?.from_role ?? "SALES_ENGINEER"] ?? ""}`
            : `${item.required_open_task_count} required task${item.required_open_task_count === 1 ? "" : "s"} open`}
          {item.is_overdue ? " · overdue" : ""}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color="#94a3b8" />
    </Touchable>
  );
}

function MyProcessWork() {
  const work = useProcessWork();
  const q = work.data?.data;
  const rows: { item: ProcessWorkStageItem; kind: "stage" | "handover" }[] = [
    ...(q?.handovers ?? []).map((item) => ({
      item,
      kind: "handover" as const,
    })),
    ...(q?.mine ?? []).map((item) => ({ item, kind: "stage" as const })),
  ];
  // A pending handover is also "mine"; show it once.
  const seen = new Set<string>();
  const unique = rows.filter(({ item }) => {
    if (seen.has(item.stage_instance.id)) return false;
    seen.add(item.stage_instance.id);
    return true;
  });

  return (
    <Card padded={false} className="mb-5 overflow-hidden">
      <View className="bg-ink px-4 pb-4 pt-4">
        <Text className="text-base font-bold text-white">My process work</Text>
        <View className="mt-3 flex-row gap-2">
          <SummaryPill
            label="Mine"
            count={q?.summary.mine ?? 0}
            tone="text-brand"
          />
          <SummaryPill
            label="Handovers"
            count={q?.summary.handovers ?? 0}
            tone="text-sky-300"
          />
          <SummaryPill
            label="Overdue"
            count={q?.summary.overdue ?? 0}
            tone="text-red-300"
          />
          <SummaryPill
            label="My role"
            count={q?.summary.role ?? 0}
            tone="text-slate-100"
          />
        </View>
      </View>
      {work.isLoading ? (
        <View className="px-4 py-3">
          <Text className="text-sm text-muted">Loading your stages…</Text>
        </View>
      ) : work.isError ? (
        <View className="px-4 py-3">
          <Text className="text-sm text-red-500">
            {work.error instanceof Error
              ? work.error.message
              : "Could not load process work"}
          </Text>
        </View>
      ) : unique.length === 0 ? (
        <View className="flex-row items-center gap-2 px-4 py-3.5">
          <Icon name="checkmark-circle" size={18} color="#16a34a" />
          <Text className="text-sm text-muted">
            Nothing waiting on you right now
          </Text>
        </View>
      ) : (
        unique
          .slice(0, 8)
          .map(({ item, kind }) => (
            <WorkRow key={item.stage_instance.id} item={item} kind={kind} />
          ))
      )}
    </Card>
  );
}

function DefinitionCard({ def }: { def: ProcessDefinitionView }) {
  const router = useRouter();
  const owners = Array.from(new Set(def.owner_roles ?? []));
  return (
    <Card padded={false} className="mb-3">
      <Touchable
        onPress={() =>
          router.push(`/onehub/processes/${def.process_key}` as never)
        }
        className="p-4"
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base font-bold text-ink">{def.name}</Text>
            {def.description ? (
              <Text className="mt-0.5 text-sm text-muted" numberOfLines={2}>
                {def.description}
              </Text>
            ) : null}
          </View>
          <Icon name="chevron-forward" size={20} color="#94a3b8" />
        </View>
        <View className="mt-3 flex-row flex-wrap items-center gap-2">
          <View className="rounded-full bg-slate-100 px-2.5 py-1">
            <Text className="text-xs font-semibold text-slate-700">
              v{def.version?.version ?? "—"}
            </Text>
          </View>
          <View className="rounded-full bg-slate-100 px-2.5 py-1">
            <Text className="text-xs font-semibold text-slate-700">
              {def.stage_count} stage{def.stage_count === 1 ? "" : "s"}
            </Text>
          </View>
          <View
            className={`rounded-full px-2.5 py-1 ${def.status === "active" ? "bg-green-50" : "bg-slate-100"}`}
          >
            <Text
              className={`text-xs font-semibold ${def.status === "active" ? "text-green-700" : "text-slate-500"}`}
            >
              {def.status === "active" ? "Active" : "Archived"}
            </Text>
          </View>
        </View>
        {owners.length ? (
          <Text className="mt-2 text-xs text-muted" numberOfLines={2}>
            Owners: {owners.map((r) => PROCESS_ROLE_LABELS[r] ?? r).join(" · ")}
          </Text>
        ) : null}
      </Touchable>
    </Card>
  );
}

export default function ProcessLibrary() {
  const defs = useProcessDefinitions();
  const work = useProcessWork();
  const list = defs.data?.data ?? [];
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: list.filter((d) => d.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={defs.isRefetching || work.isRefetching}
          onRefresh={() => {
            void defs.refetch();
            void work.refetch();
          }}
        />
      }
    >
      <MyProcessWork />

      {defs.isLoading ? (
        <SkeletonList count={3} />
      ) : defs.isError ? (
        <Text className="text-sm text-red-500">
          {defs.error instanceof Error
            ? defs.error.message
            : "Could not load processes"}
        </Text>
      ) : grouped.length === 0 ? (
        <Card>
          <Text className="text-sm text-muted">
            No processes published yet.
          </Text>
        </Card>
      ) : (
        grouped.map((g) => (
          <View key={g.cat} className="mb-4">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              {PROCESS_CATEGORY_LABELS[g.cat] ?? g.cat}
            </Text>
            {g.items.map((d) => (
              <DefinitionCard key={d.id} def={d} />
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}
