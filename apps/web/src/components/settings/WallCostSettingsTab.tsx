"use client";

/**
 * Settings panel for the founder-owned global wall-cost template.
 * Self-contained: fetches GET /api/settings/wall-costs, renders the editor,
 * saves via PUT. Mirrors the other settings tabs.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Spinner } from "@maiyuri/ui";
import { toast } from "sonner";
import type { WallCostConfig } from "@maiyuri/shared";
import { WallCostSettings } from "@/components/wall-cost/WallCostSettings";
import { WallCostComparison } from "@/components/wall-cost/WallCostComparison";
import { computeWallComparison } from "@/lib/pricing/wall-cost";

async function fetchWallCosts(): Promise<{ data: WallCostConfig }> {
  const res = await fetch("/api/settings/wall-costs");
  if (!res.ok) throw new Error("Failed to fetch wall costs");
  return res.json();
}

async function saveWallCosts(config: WallCostConfig): Promise<{ data: WallCostConfig }> {
  const res = await fetch("/api/settings/wall-costs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to save wall costs");
  return res.json();
}

export function WallCostSettingsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["wall-costs"],
    queryFn: fetchWallCosts,
  });

  const save = useMutation({
    mutationFn: saveWallCosts,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wall-costs"] });
      toast.success("Wall costs saved");
    },
    onError: () => toast.error("Failed to save wall costs"),
  });

  const config = data?.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Wall System Costs
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Powers the “Total cost to build” comparison on customer quotes. New
          quotes inherit these as defaults; reps can personalize per customer.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <Card className="p-5">
            <WallCostSettings
              initial={config}
              saving={save.isPending}
              onSave={(cfg) => save.mutate(cfg)}
            />
          </Card>

          {config && (
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
                Live preview (1,000 sq.ft wall)
              </p>
              <WallCostComparison
                comparison={computeWallComparison(config, 1000)}
                language="en"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
