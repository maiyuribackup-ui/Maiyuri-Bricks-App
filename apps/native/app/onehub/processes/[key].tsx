import type { ProcessStageView } from "@maiyuri/shared";
import { PROCESS_CATEGORY_LABELS, PROCESS_ROLE_LABELS } from "@maiyuri/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StageTypeBadge } from "@/components/process/ProcessStagePanel";
import { useProcessDefinition } from "@/hooks/use-process";
import { Card, Icon, SkeletonList, Touchable } from "@/ui";

/**
 * Process Map (PRD §7.2 / §24) — a vertical, numbered list of stages. Tap a
 * stage to see its checklist, gates and SLA. No horizontal diagram on phone.
 */

function slaLabel(minutes: number | null): string | null {
  if (!minutes) return null;
  if (minutes % 1440 === 0)
    return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

function humanKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function StageCard({
  stage,
  index,
  isLast,
  stageNameById,
}: {
  stage: ProcessStageView;
  index: number;
  isLast: boolean;
  stageNameById: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const sla = slaLabel(stage.sla_minutes);
  const normal = stage.transitions.filter((t) => !t.is_exception);
  const exceptions = stage.transitions.filter((t) => t.is_exception);

  return (
    <View className="flex-row">
      <View className="w-10 items-center">
        <View className="h-8 w-8 items-center justify-center rounded-full bg-ink">
          <Text className="text-sm font-bold text-white">{index}</Text>
        </View>
        {!isLast ? <View className="w-0.5 flex-1 bg-slate-300" /> : null}
      </View>
      <View className={`flex-1 pl-2 ${isLast ? "" : "pb-3"}`}>
        <Card padded={false}>
          <Touchable onPress={() => setOpen((v) => !v)} className="p-4">
            <View className="flex-row items-start justify-between">
              <Text className="flex-1 pr-2 text-base font-bold text-ink">
                {stage.name}
              </Text>
              <StageTypeBadge type={stage.stage_type} />
            </View>
            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              <View className="flex-row items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1">
                <Icon name="person-outline" size={13} color="#c2410c" />
                <Text className="text-xs font-semibold text-orange-700">
                  {PROCESS_ROLE_LABELS[stage.owner_role] ?? stage.owner_role}
                </Text>
              </View>
              {sla ? (
                <View className="flex-row items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                  <Icon name="time-outline" size={13} color="#475569" />
                  <Text className="text-xs font-semibold text-slate-600">
                    SLA {sla}
                  </Text>
                </View>
              ) : null}
              {stage.checklist.length ? (
                <Text className="text-xs text-muted">
                  {stage.checklist.length} tasks
                </Text>
              ) : null}
              {stage.gates.length ? (
                <Text className="text-xs text-muted">
                  {stage.gates.length} gates
                </Text>
              ) : null}
            </View>
            {!open && stage.description ? (
              <Text className="mt-2 text-sm text-muted" numberOfLines={2}>
                {stage.description}
              </Text>
            ) : null}
          </Touchable>

          {open ? (
            <View className="border-t border-line px-4 pb-4">
              {stage.description ? (
                <Text className="mt-3 text-sm leading-5 text-slate-600">
                  {stage.description}
                </Text>
              ) : null}

              {stage.checklist.length ? (
                <View className="mt-3">
                  <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                    Checklist
                  </Text>
                  {stage.checklist.map((c) => (
                    <View key={c.id} className="mb-1.5 flex-row items-start">
                      <Icon name="ellipse-outline" size={16} color="#94a3b8" />
                      <Text className="ml-2 flex-1 text-sm text-ink">
                        {c.title}
                        {c.required ? (
                          <Text className="text-red-400"> *</Text>
                        ) : null}
                        {c.evidence_required ? (
                          <Text className="text-xs text-amber-700">
                            {" "}
                            · evidence
                          </Text>
                        ) : null}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {stage.gates.length ? (
                <View className="mt-3">
                  <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                    Gates
                  </Text>
                  {stage.gates.map((g) => (
                    <View key={g.id} className="mb-1.5 flex-row items-start">
                      <Icon
                        name="shield-checkmark-outline"
                        size={16}
                        color="#475569"
                      />
                      <View className="ml-2 flex-1">
                        <Text className="text-sm text-ink">
                          {humanKey(g.gate_key)}
                        </Text>
                        {g.failure_message ? (
                          <Text className="text-xs text-muted">
                            {g.failure_message}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {stage.configuration?.outcomes?.length ? (
                <View className="mt-3">
                  <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                    Outcomes
                  </Text>
                  <Text className="text-sm text-ink">
                    {stage.configuration.outcomes.map(humanKey).join(" · ")}
                  </Text>
                </View>
              ) : null}

              {normal.length || exceptions.length ? (
                <View className="mt-3">
                  <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                    Next
                  </Text>
                  {normal.map((t) => (
                    <Text key={t.id} className="text-sm text-ink">
                      → {stageNameById.get(t.to_stage_id) ?? "?"}
                      {t.condition?.outcome
                        ? ` (${humanKey(t.condition.outcome)})`
                        : ""}
                    </Text>
                  ))}
                  {exceptions.map((t) => (
                    <Text key={t.id} className="text-sm text-muted">
                      ↩ {t.label ?? humanKey(t.transition_key)} →{" "}
                      {stageNameById.get(t.to_stage_id) ?? "?"}
                    </Text>
                  ))}
                </View>
              ) : null}

              {stage.configuration?.sop_slug ? (
                <Text className="mt-3 text-xs text-muted">
                  SOP: {stage.configuration.sop_slug}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Card>
      </View>
    </View>
  );
}

export default function ProcessMap() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { data, isLoading, isError, error } = useProcessDefinition(key);
  const def = data?.data;

  if (isLoading) return <SkeletonList count={5} />;
  if (isError || !def) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text className="text-sm text-muted">
          {error instanceof Error ? error.message : "Process not found"}
        </Text>
      </View>
    );
  }

  const stages = [...def.stages].sort((a, b) => a.sequence - b.sequence);
  const stageNameById = new Map(stages.map((s) => [s.id, s.name]));

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="p-4 pb-12"
    >
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
        {PROCESS_CATEGORY_LABELS[def.category] ?? def.category} · v
        {def.version?.version ?? "—"}
      </Text>
      <Text className="mt-1 text-2xl font-bold text-ink">{def.name}</Text>
      {def.description ? (
        <Text className="mt-1 text-sm leading-5 text-muted">
          {def.description}
        </Text>
      ) : null}
      <Text className="mb-4 mt-2 text-xs text-subtle">
        {stages.length} stages · tap a stage for its checklist and gates
      </Text>

      {stages.map((s, i) => (
        <StageCard
          key={s.id}
          stage={s}
          index={i + 1}
          isLast={i === stages.length - 1}
          stageNameById={stageNameById}
        />
      ))}
    </ScrollView>
  );
}
