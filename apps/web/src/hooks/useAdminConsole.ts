/**
 * Hooks for the OneHub Manage console (/onehub/admin): recurring work
 * templates, planning settings, OneHub links + SOPs, staff list.
 * All endpoints already existed — this is the missing client half
 * (completeness audit U1–U10).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface ApiResponse<T> {
  data: T;
  error?: string;
}

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || fallback);
  return body as T;
}

// ---------- staff ----------

export interface StaffUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  is_active?: boolean;
}

export function useStaff() {
  return useQuery({
    queryKey: ["admin-staff"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      return jsonOrThrow<ApiResponse<StaffUser[]>>(res, "Failed to load staff");
    },
  });
}

// ---------- recurring work templates ----------

export interface WorkTemplate {
  id: string;
  name: string;
  title: string;
  activity_type: string;
  default_assigned_user_id: string | null;
  default_role: string | null;
  checklist_template_id: string | null;
  recurrence_rule: string | null;
  due_time: string | null;
  priority: string;
  requires_photo: boolean;
  requires_note: boolean;
  requires_approval: boolean;
  active: boolean;
  checklist_template?: { id: string; name: string } | null;
  default_assignee?: { id: string; name: string } | null;
}

export function useWorkTemplates() {
  return useQuery({
    queryKey: ["work-templates"],
    queryFn: async () => {
      const res = await fetch("/api/my-work/templates");
      return jsonOrThrow<ApiResponse<WorkTemplate[]>>(res, "Failed to load templates");
    },
  });
}

export function useSaveWorkTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const res = await fetch("/api/my-work/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return jsonOrThrow<ApiResponse<WorkTemplate>>(res, "Failed to save template");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["work-templates"] }),
  });
}

// ---------- planning settings ----------

export interface PlanningSettings {
  work_days: number[];
  max_deliveries_per_day: number;
  default_constraints_note: string | null;
}

export function usePlanningSettings() {
  return useQuery({
    queryKey: ["planning-settings"],
    queryFn: async () => {
      const res = await fetch("/api/ops-planning/settings");
      return jsonOrThrow<ApiResponse<PlanningSettings>>(res, "Failed to load settings");
    },
  });
}

export function useSavePlanningSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PlanningSettings) => {
      const res = await fetch("/api/ops-planning/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return jsonOrThrow<ApiResponse<PlanningSettings>>(res, "Failed to save settings");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["planning-settings"] }),
  });
}

// ---------- OneHub links ----------

export interface OneHubLink {
  id: string;
  category: string;
  name: string;
  purpose: string | null;
  url: string;
  sort_order: number;
}

export function useAdminLinks() {
  return useQuery({
    queryKey: ["onehub", "links"],
    queryFn: async () => {
      const res = await fetch("/api/onehub/links");
      return jsonOrThrow<ApiResponse<OneHubLink[]>>(res, "Failed to load links");
    },
  });
}

export function useSaveLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<OneHubLink>) => {
      const res = await fetch("/api/onehub/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return jsonOrThrow<ApiResponse<OneHubLink>>(res, "Failed to save link");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["onehub", "links"] }),
  });
}

// ---------- OneHub SOPs ----------

export interface SopStep {
  en: string;
  ta?: string;
  icon?: string;
}

export interface AdminSop {
  id: string;
  department: string;
  slug: string;
  title_en: string;
  title_ta: string | null;
  purpose_en: string | null;
  purpose_ta: string | null;
  steps: SopStep[];
  warning_en: string | null;
  warning_ta: string | null;
  video_url: string | null;
  status: "draft" | "published";
  version: number;
}

export function useAdminSops() {
  return useQuery({
    queryKey: ["onehub", "sops", "admin"],
    queryFn: async () => {
      const res = await fetch("/api/onehub/sops");
      return jsonOrThrow<ApiResponse<AdminSop[]>>(res, "Failed to load SOPs");
    },
  });
}

export function useSaveSop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AdminSop>) => {
      const res = await fetch("/api/onehub/sops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return jsonOrThrow<ApiResponse<AdminSop>>(res, "Failed to save SOP");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["onehub", "sops"] }),
  });
}
