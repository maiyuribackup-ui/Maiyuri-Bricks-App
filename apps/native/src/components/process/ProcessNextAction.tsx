import {
  PROCESS_ROLE_LABELS,
  deriveNextAction,
  describeDue,
  journeyProgress,
  processLaneFor,
  type NextActionKind,
  type ProcessInstanceView,
} from "@maiyuri/shared";
import { Text, View } from "react-native";
import { Button, Icon, type IconName } from "@/ui";

/**
 * Journey-first hero for the native case screen: coloured progress track,
 * then the single next action with owner, due and a big button that scrolls
 * to the checklist. Same lane colours as the web map.
 */

const KIND_ICON: Record<NextActionKind, IconName> = {
  blocked: "alert-circle",
  handover: "swap-horizontal-outline",
  task: "list-outline",
  gate: "shield-outline",
  decision: "git-branch-outline",
  ready: "checkmark-circle-outline",
  waiting: "hourglass-outline",
  done: "flag-outline",
  cancelled: "flag-outline",
};

const KIND_LABEL: Record<NextActionKind, string> = {
  blocked: "Blocked",
  handover: "Handover",
  task: "Next checklist item",
  gate: "Gate not met",
  decision: "Decision needed",
  ready: "Ready to complete",
  waiting: "Waiting on customer",
  done: "Complete",
  cancelled: "Cancelled",
};

const LIVE = new Set(["current", "blocked", "failed"]);

export function ProcessProgressTrack({ view }: { view: ProcessInstanceView }) {
  const steps = [...view.journey]
    .filter(
      (s) =>
        s.stage_type !== "END" ||
        LIVE.has(s.status) ||
        s.status === "completed",
    )
    .sort((a, b) => a.sequence - b.sequence);
  const currentIndex = steps.findIndex((s) => LIVE.has(s.status));
  const progress = journeyProgress(view);
  return (
    <View>
      <View className="mb-2 flex-row items-baseline justify-between">
        <Text className="text-xs font-semibold text-ink">
          {progress.done} of {progress.total} stages done
        </Text>
        <Text className="text-xs text-muted">{progress.percent}%</Text>
      </View>
      <View className="flex-row items-end gap-1">
        {steps.map((s, i) => {
          const lane = processLaneFor(s.owner_role);
          const live = LIVE.has(s.status);
          const blocked = s.status === "blocked" || s.status === "failed";
          const past =
            s.status === "completed" ||
            (currentIndex !== -1 && i < currentIndex);
          const fill = blocked
            ? "#e11d48"
            : past || live
              ? lane.hue
              : "#e2e8f0";
          return (
            <View
              key={s.stage_id}
              accessibilityLabel={`${s.status}: ${s.name}`}
              style={{
                flex: 1,
                height: live ? 12 : 8,
                borderRadius: 999,
                backgroundColor: fill,
                opacity: s.status === "skipped" ? 0.35 : 1,
                borderWidth: live ? 3 : 0,
                borderColor: blocked ? "#ffe4e6" : lane.wash,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

export function ProcessNextAction({
  view,
  assigneeName,
  onGo,
}: {
  view: ProcessInstanceView;
  assigneeName?: string | null;
  onGo?: () => void;
}) {
  const action = deriveNextAction(view);
  const stage = view.current_stage;
  const si = view.current_stage_instance;
  const lane = processLaneFor(stage?.owner_role ?? "SALES_ENGINEER");
  const rose = action.kind === "blocked" || action.kind === "gate";
  const hue = rose ? "#e11d48" : lane.hue;
  const wash = rose ? "#fff1f2" : lane.wash;
  const deep = rose ? "#9f1239" : lane.deep;
  const due = describeDue(si?.due_at);
  const progress = journeyProgress(view);
  const owner =
    assigneeName ??
    (stage
      ? (PROCESS_ROLE_LABELS[stage.owner_role] ?? stage.owner_role)
      : null);
  const terminal = action.kind === "done" || action.kind === "cancelled";

  return (
    <View
      accessibilityLabel="Next action"
      className="overflow-hidden rounded-3xl border bg-white"
      style={{ borderColor: `${hue}44` }}
    >
      <View style={{ height: 6, backgroundColor: hue }} />
      <View className="p-4">
        <View className="flex-row flex-wrap items-center gap-2">
          <View
            className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
            style={{ backgroundColor: wash }}
          >
            <Icon name={KIND_ICON[action.kind]} size={14} color={deep} />
            <Text className="text-[11px] font-semibold" style={{ color: deep }}>
              {KIND_LABEL[action.kind]}
            </Text>
          </View>
          {stage ? (
            <Text className="text-[11px] font-semibold text-muted">
              Stage {progress.done + 1} of {progress.total}: {stage.name}
            </Text>
          ) : null}
        </View>
        <Text className="mt-2.5 text-xl font-bold leading-snug text-ink">
          {action.title}
        </Text>
        {action.detail ? (
          <Text className="mt-1 text-sm leading-relaxed text-slate-600">
            {action.detail}
          </Text>
        ) : null}
        {!terminal ? (
          <View className="mt-3 flex-row flex-wrap items-center gap-x-4 gap-y-2">
            {owner ? (
              <View className="flex-row items-center gap-2">
                <View
                  className="h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: lane.wash }}
                >
                  <Text
                    className="text-[11px] font-bold"
                    style={{ color: lane.deep }}
                  >
                    {initials(owner)}
                  </Text>
                </View>
                <Text className="text-sm font-medium text-ink">{owner}</Text>
                <Text className="text-sm text-muted">· {lane.label}</Text>
              </View>
            ) : null}
            {due ? (
              <View className="flex-row items-center gap-1">
                <Icon
                  name="time-outline"
                  size={15}
                  color={due.overdue ? "#e11d48" : "#475569"}
                />
                <Text
                  className={`text-sm font-semibold ${due.overdue ? "text-red-600" : "text-slate-700"}`}
                >
                  {due.label}
                </Text>
              </View>
            ) : null}
            {action.openRequired > 0 ? (
              <Text className="text-sm text-slate-600">
                {action.openRequired} required item
                {action.openRequired === 1 ? "" : "s"} left
              </Text>
            ) : null}
          </View>
        ) : null}
        {onGo && !terminal ? (
          <Button
            className="mt-4"
            size="lg"
            icon="arrow-down-outline"
            label={
              action.kind === "ready"
                ? "Complete stage"
                : action.kind === "handover"
                  ? "Open handover"
                  : "Do it now"
            }
            onPress={onGo}
          />
        ) : null}
      </View>
    </View>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
