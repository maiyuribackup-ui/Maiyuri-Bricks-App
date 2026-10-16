import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useMyRole } from "@/hooks/use-approvals";
import { useProcessForLead, useStartProcess } from "@/hooks/use-process";
import { Button, Card, Icon, Skeleton, Touchable } from "@/ui";
import { ProcessJourney } from "./ProcessJourney";

const START_ROLES = ["sales", "engineer", "founder", "owner"];

/**
 * Compact journey strip for the lead screen (PRD §7.4): previous ✓ /
 * current ● / next ○. Tap → the full case. When no case exists yet, sales
 * can start Lead-to-Delivery from here.
 */
export function LeadProcessStrip({
  leadId,
  customerName,
}: {
  leadId: string;
  customerName: string;
}) {
  const router = useRouter();
  const role = useMyRole();
  const forLead = useProcessForLead(leadId);
  const start = useStartProcess();
  const view = forLead.data?.data ?? null;

  if (forLead.isLoading) {
    return (
      <Card className="mx-5 mt-4">
        <Skeleton width={140} height={14} />
        <Skeleton className="mt-3" width={220} height={12} />
      </Card>
    );
  }

  // Silently hide on API failure — the lead screen must never be blocked by
  // the process layer being unavailable.
  if (forLead.isError) return null;

  if (!view) {
    if (!START_ROLES.includes(role)) return null;
    return (
      <Card className="mx-5 mt-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base font-bold text-ink">
              Lead-to-Delivery
            </Text>
            <Text className="mt-0.5 text-xs text-muted">
              Track this lead through qualification, quote, advance and factory
              handover.
            </Text>
          </View>
          <Button
            size="sm"
            variant="dark"
            icon="play-outline"
            label="Start"
            loading={start.isPending}
            onPress={() =>
              start.mutate({
                process_key: "LEAD_TO_DELIVERY",
                entity_type: "lead",
                entity_id: leadId,
                context: { customer_name: customerName },
              })
            }
          />
        </View>
      </Card>
    );
  }

  const blocked = view.instance.status === "blocked";
  return (
    <Card padded={false} className="mx-5 mt-4">
      <Touchable
        onPress={() =>
          router.push(`/onehub/processes/case/${view.instance.id}` as never)
        }
        className="p-4"
      >
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-base font-bold text-ink">
            {view.definition.name}
          </Text>
          <View className="flex-row items-center gap-1">
            {blocked ? (
              <View className="rounded-full bg-red-50 px-2 py-0.5">
                <Text className="text-xs font-semibold text-red-600">
                  Blocked
                </Text>
              </View>
            ) : null}
            <Text className="text-xs font-semibold text-brand">Open case</Text>
            <Icon name="chevron-forward" size={16} color="#f97316" />
          </View>
        </View>
        <ProcessJourney journey={view.journey} compact />
      </Touchable>
    </Card>
  );
}
