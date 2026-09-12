import type { ProcessEventType } from "@maiyuri/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { ProcessJourney } from "@/components/process/ProcessJourney";
import { ProcessStagePanel } from "@/components/process/ProcessStagePanel";
import {
  useProcessHistory,
  useProcessInstance,
  type ProcessHistoryEvent,
} from "@/hooks/use-process";
import { Card, Icon, SkeletonList, Touchable, type IconName } from "@/ui";

/**
 * Case screen (PRD §7.4): who/what the case is about, the vertical journey,
 * the current stage's execution panel, and the audit timeline.
 */

const EVENT_STYLE: Partial<
  Record<ProcessEventType, { icon: IconName; color: string; label: string }>
> = {
  "process.started": {
    icon: "play-circle-outline",
    color: "#0f172a",
    label: "Started",
  },
  "process.stage_started": {
    icon: "ellipse",
    color: "#f97316",
    label: "Stage started",
  },
  "process.task_completed": {
    icon: "checkmark-circle-outline",
    color: "#16a34a",
    label: "Task done",
  },
  "process.evidence_added": {
    icon: "document-attach-outline",
    color: "#475569",
    label: "Evidence added",
  },
  "process.gate_failed": {
    icon: "close-circle-outline",
    color: "#dc2626",
    label: "Gate failed",
  },
  "process.gate_overridden": {
    icon: "shield-checkmark-outline",
    color: "#d97706",
    label: "Gate overridden",
  },
  "process.stage_completed": {
    icon: "checkmark-done-outline",
    color: "#16a34a",
    label: "Stage completed",
  },
  "process.blocked": {
    icon: "alert-circle",
    color: "#dc2626",
    label: "Exception raised",
  },
  "process.unblocked": {
    icon: "lock-open-outline",
    color: "#16a34a",
    label: "Exception cleared",
  },
  "process.handover_requested": {
    icon: "send-outline",
    color: "#0284c7",
    label: "Handover sent",
  },
  "process.handover_accepted": {
    icon: "checkmark-circle",
    color: "#16a34a",
    label: "Handover accepted",
  },
  "process.handover_rejected": {
    icon: "arrow-undo-outline",
    color: "#dc2626",
    label: "Handover returned",
  },
  "process.sla_warning": {
    icon: "time-outline",
    color: "#d97706",
    label: "SLA warning",
  },
  "process.sla_breached": {
    icon: "time-outline",
    color: "#dc2626",
    label: "SLA breached",
  },
  "process.completed": {
    icon: "trophy-outline",
    color: "#16a34a",
    label: "Process completed",
  },
  "process.cancelled": {
    icon: "close-circle",
    color: "#64748b",
    label: "Cancelled",
  },
};

function eventDetail(e: ProcessHistoryEvent): string | null {
  if (e.reason) return e.reason;
  const p = e.payload ?? {};
  const candidates = [
    p.stage_name,
    p.task_title,
    p.title,
    p.message,
    p.comment,
    p.outcome,
  ];
  const hit = candidates.find(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
  return typeof hit === "string" ? hit : null;
}

function HistoryRow({
  event,
  isLast,
}: {
  event: ProcessHistoryEvent;
  isLast: boolean;
}) {
  const s = EVENT_STYLE[event.event_type] ?? {
    icon: "ellipse-outline" as IconName,
    color: "#94a3b8",
    label: event.event_type.replace("process.", "").replace(/_/g, " "),
  };
  const detail = eventDetail(event);
  const when = new Date(event.created_at).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <View className="flex-row">
      <View className="w-8 items-center">
        <Icon name={s.icon} size={18} color={s.color} />
        {!isLast ? <View className="w-0.5 flex-1 bg-line" /> : null}
      </View>
      <View className={`flex-1 pl-2 ${isLast ? "" : "pb-3"}`}>
        <Text className="text-sm font-semibold text-ink">{s.label}</Text>
        {detail ? (
          <Text className="text-sm text-slate-600">{detail}</Text>
        ) : null}
        <Text className="mt-0.5 text-xs text-muted">
          {when}
          {event.actor_name
            ? ` · ${event.actor_name}`
            : event.actor_type === "system"
              ? " · system"
              : ""}
        </Text>
      </View>
    </View>
  );
}

const STATUS_LABEL: Record<
  string,
  { label: string; chip: string; text: string }
> = {
  active: { label: "Active", chip: "bg-green-50", text: "text-green-700" },
  blocked: { label: "Blocked", chip: "bg-red-50", text: "text-red-700" },
  completed: {
    label: "Completed",
    chip: "bg-slate-100",
    text: "text-slate-600",
  },
  cancelled: {
    label: "Cancelled",
    chip: "bg-slate-100",
    text: "text-slate-600",
  },
};

export default function ProcessCase() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const instance = useProcessInstance(id);
  const history = useProcessHistory(id);
  const view = instance.data?.data;

  if (instance.isLoading) return <SkeletonList count={4} />;
  if (instance.isError || !view) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text className="text-sm text-muted">
          {instance.error instanceof Error
            ? instance.error.message
            : "Case not found"}
        </Text>
      </View>
    );
  }

  const ctx = view.instance.context ?? {};
  const title =
    String(ctx.customer_name ?? "") || `${view.definition.name} case`;
  const subtitleBits = [
    ctx.product_name,
    ctx.quantity ? `${Number(ctx.quantity).toLocaleString("en-IN")} nos` : null,
    ctx.odoo_order_name,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
  const st = STATUS_LABEL[view.instance.status] ?? STATUS_LABEL.active;
  const events = [...(history.data?.data ?? [])].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="p-4 pb-16"
      refreshControl={
        <RefreshControl
          refreshing={instance.isRefetching || history.isRefetching}
          onRefresh={() => {
            void instance.refetch();
            void history.refetch();
          }}
        />
      }
    >
      {/* header */}
      <View className="mb-4 flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
            {view.definition.name} · v{view.version.version}
          </Text>
          <Text className="mt-1 text-2xl font-bold text-ink">{title}</Text>
          {subtitleBits.length ? (
            <Text className="mt-0.5 text-sm text-muted">
              {subtitleBits.join(" · ")}
            </Text>
          ) : null}
        </View>
        <View className={`rounded-full px-2.5 py-1 ${st.chip}`}>
          <Text className={`text-xs font-semibold ${st.text}`}>{st.label}</Text>
        </View>
      </View>

      {view.instance.entity_type === "lead" ? (
        <Touchable
          onPress={() =>
            router.push(`/leads/${view.instance.entity_id}` as never)
          }
          className="mb-4 flex-row items-center gap-1.5 self-start rounded-lg px-1 py-1"
        >
          <Icon name="people-outline" size={16} color="#f97316" />
          <Text className="text-sm font-semibold text-brand">Open lead</Text>
        </Touchable>
      ) : null}

      {/* journey */}
      <Card className="mb-4">
        <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          Journey
        </Text>
        <ProcessJourney journey={view.journey} />
      </Card>

      {/* current stage panel */}
      <View className="mb-4">
        <ProcessStagePanel view={view} />
      </View>

      {/* history */}
      <Card>
        <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          History
        </Text>
        {history.isLoading ? (
          <Text className="text-sm text-muted">Loading…</Text>
        ) : events.length === 0 ? (
          <Text className="text-sm text-muted">No events yet.</Text>
        ) : (
          events.map((e, i) => (
            <HistoryRow key={e.id} event={e} isLast={i === events.length - 1} />
          ))
        )}
      </Card>
    </ScrollView>
  );
}
