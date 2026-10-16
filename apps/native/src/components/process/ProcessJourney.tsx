import type {
  ProcessJourneyStep,
  ProcessStageInstanceStatus,
} from "@maiyuri/shared";
import { PROCESS_ROLE_LABELS } from "@maiyuri/shared";
import { Text, View } from "react-native";
import { Icon, type IconName } from "@/ui";

/**
 * Vertical journey (PRD §7.4 / §24 / §25): ✓ completed · ● current ·
 * ! blocked · ○ upcoming. `compact` shows only previous / current / next for
 * the lead-screen strip; the full list is for the case screen.
 */

type StepStyle = {
  icon: IconName;
  color: string;
  ring: string;
  label: string;
};

const STEP_STYLE: Record<ProcessStageInstanceStatus, StepStyle> = {
  completed: {
    icon: "checkmark-circle",
    color: "#16a34a",
    ring: "bg-green-50",
    label: "Done",
  },
  current: {
    icon: "ellipse",
    color: "#f97316",
    ring: "bg-orange-50",
    label: "Now",
  },
  blocked: {
    icon: "alert-circle",
    color: "#dc2626",
    ring: "bg-red-50",
    label: "Blocked",
  },
  failed: {
    icon: "alert-circle",
    color: "#dc2626",
    ring: "bg-red-50",
    label: "Failed",
  },
  upcoming: {
    icon: "ellipse-outline",
    color: "#94a3b8",
    ring: "bg-slate-50",
    label: "Next",
  },
  skipped: {
    icon: "remove-circle-outline",
    color: "#94a3b8",
    ring: "bg-slate-50",
    label: "Skipped",
  },
  cancelled: {
    icon: "close-circle-outline",
    color: "#94a3b8",
    ring: "bg-slate-50",
    label: "Cancelled",
  },
};

const ACTIVE: ProcessStageInstanceStatus[] = ["current", "blocked", "failed"];

/** Previous ✓ / current ● / next ○ around the active stage. */
export function compactJourney(
  journey: ProcessJourneyStep[],
): ProcessJourneyStep[] {
  const sorted = [...journey].sort((a, b) => a.sequence - b.sequence);
  const idx = sorted.findIndex((s) => ACTIVE.includes(s.status));
  if (idx === -1) {
    // No active stage (completed / cancelled case): show the tail.
    return sorted.slice(-3);
  }
  return sorted.slice(Math.max(0, idx - 1), idx + 2);
}

function StepRow({
  step,
  isLast,
  emphasis,
}: {
  step: ProcessJourneyStep;
  isLast: boolean;
  emphasis: "previous" | "current" | "next" | "other";
}) {
  const s = STEP_STYLE[step.status] ?? STEP_STYLE.upcoming;
  const isCurrent = emphasis === "current";
  return (
    <View className="flex-row">
      <View className="w-9 items-center">
        <View
          className={`h-8 w-8 items-center justify-center rounded-full ${s.ring}`}
        >
          <Icon name={s.icon} size={isCurrent ? 22 : 18} color={s.color} />
        </View>
        {!isLast ? <View className="w-0.5 flex-1 bg-line" /> : null}
      </View>
      <View className={`flex-1 pl-3 ${isLast ? "pb-0" : "pb-4"}`}>
        <View className="flex-row items-center">
          <Text className="mr-2 text-xs font-semibold text-subtle">
            {step.sequence}
          </Text>
          <Text
            className={`flex-1 ${
              isCurrent
                ? "text-base font-bold text-ink"
                : emphasis === "other"
                  ? "text-sm text-muted"
                  : "text-sm font-semibold text-ink"
            }`}
            numberOfLines={2}
          >
            {step.name}
          </Text>
        </View>
        {isCurrent || emphasis !== "other" ? (
          <Text className="mt-0.5 text-xs text-muted">
            {s.label} ·{" "}
            {PROCESS_ROLE_LABELS[step.owner_role] ?? step.owner_role}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function ProcessJourney({
  journey,
  compact = false,
}: {
  journey: ProcessJourneyStep[];
  compact?: boolean;
}) {
  const steps = compact
    ? compactJourney(journey)
    : [...journey].sort((a, b) => a.sequence - b.sequence);
  const currentIdx = steps.findIndex((s) => ACTIVE.includes(s.status));

  if (steps.length === 0) {
    return <Text className="text-sm text-muted">No stages yet.</Text>;
  }

  return (
    <View>
      {steps.map((step, i) => {
        const emphasis =
          i === currentIdx
            ? "current"
            : i === currentIdx - 1
              ? "previous"
              : i === currentIdx + 1
                ? "next"
                : "other";
        return (
          <StepRow
            key={step.stage_id}
            step={step}
            isLast={i === steps.length - 1}
            emphasis={emphasis}
          />
        );
      })}
    </View>
  );
}
