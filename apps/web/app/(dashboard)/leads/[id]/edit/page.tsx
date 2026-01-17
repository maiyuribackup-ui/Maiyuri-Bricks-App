"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Spinner } from "@maiyuri/ui";
import {
  updateLeadSchema,
  type UpdateLeadInput,
  type Lead,
  type LeadStatus,
  type User,
} from "@maiyuri/shared";
import Link from "next/link";

// Source options (Issue #6)
const sourceOptions = [
  "Facebook",
  "Google",
  "Customer Reference",
  "Instagram",
  "Company Website",
  "Just Dial",
  "IndiaMart",
  "Walk-in",
  "Phone",
  "Other",
];

const leadTypeOptions = [
  "Commercial",
  "Residential",
  "Industrial",
  "Government",
  "Other",
];

// Classification options (Issue #3)
const classificationOptions = [
  { value: "direct_customer", label: "Direct Customer" },
  { value: "vendor", label: "Vendor" },
  { value: "builder", label: "Builder" },
  { value: "dealer", label: "Dealer" },
  { value: "architect", label: "Architect" },
];

// Requirement type options (Issue #4)
const requirementTypeOptions = [
  { value: "residential_house", label: "Residential House" },
  { value: "commercial_building", label: "Commercial Building" },
  { value: "eco_friendly_building", label: "Eco-Friendly Building" },
  { value: "compound_wall", label: "Compound Wall" },
];

const statusOptions: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "follow_up", label: "Follow Up" },
  { value: "hot", label: "Hot" },
  { value: "cold", label: "Cold" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

async function fetchLead(id: string) {
  const res = await fetch(`/api/leads/${id}`);
  if (!res.ok) throw new Error("Failed to fetch lead");
  return res.json();
}

async function fetchUsers() {
  const res = await fetch("/api/users");
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

async function updateLead(id: string, data: UpdateLeadInput) {
  const res = await fetch(`/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to update lead");
  }
  return res.json();
}

export default function EditLeadPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const leadId = params.id as string;

  const { data: leadData, isLoading: leadLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => fetchLead(leadId),
    enabled: !!leadId,
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const lead: Lead | null = leadData?.data;
  const users = usersData?.data || [];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateLeadInput>({
    resolver: zodResolver(updateLeadSchema),
  });

  // Reset form when lead data is loaded
  useEffect(() => {
    if (lead) {
      reset({
        name: lead.name,
        contact: lead.contact,
        source: lead.source,
        lead_type: lead.lead_type,
        status: lead.status,
        assigned_staff: lead.assigned_staff,
        classification: lead.classification,
        requirement_type: lead.requirement_type,
        site_region: lead.site_region,
        site_location: lead.site_location,
        next_action: lead.next_action,
        follow_up_date: lead.follow_up_date?.split("T")[0] || null,
      });
    }
  }, [lead, reset]);

  const mutation = useMutation({
    mutationFn: (data: UpdateLeadInput) => updateLead(leadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      router.push(`/leads/${leadId}`);
    },
  });

  const onSubmit = (data: UpdateLeadInput) => {
    mutation.mutate(data);
  };

  if (leadLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Lead not found</p>
        <Link href="/leads" className="mt-4 text-blue-600 hover:text-blue-500">
          Back to leads
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/leads/${leadId}`}
          className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeftIcon className="h-5 w-5 text-slate-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Edit Lead
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Update information for {lead.name}
          </p>
        </div>
      </div>

      {/* Form */}
      <Card className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {mutation.error && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {mutation.error.message}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Name
            </label>
            <input
              {...register("name")}
              type="text"
              placeholder="Enter lead name"
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Contact */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Contact Number
            </label>
            <input
              {...register("contact")}
              type="tel"
              placeholder="Enter contact number"
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.contact && (
              <p className="mt-1 text-sm text-red-500">
                {errors.contact.message}
              </p>
            )}
          </div>

          {/* Source and Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Source
              </label>
              <select
                {...register("source")}
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select source</option>
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
              {errors.source && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.source.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Lead Type
              </label>
              <select
                {...register("lead_type")}
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select type</option>
                {leadTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              {errors.lead_type && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.lead_type.message}
                </p>
              )}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Status
            </label>
            <select
              {...register("status")}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Classification and Requirement Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Classification
              </label>
              <select
                {...register("classification")}
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select classification</option>
                {classificationOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Requirement Type
              </label>
              <select
                {...register("requirement_type")}
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select requirement type</option>
                {requirementTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Site Region and Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Site Region
              </label>
              <input
                {...register("site_region")}
                type="text"
                placeholder="e.g., Chennai, Kanchipuram"
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Site Location
              </label>
              <input
                {...register("site_location")}
                type="text"
                placeholder="e.g., T Nagar, Anna Nagar"
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Assigned Staff */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Assign To
            </label>
            <select
              {...register("assigned_staff")}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Unassigned</option>
              {users.map((user: User) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
          </div>

          {/* Next Action */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Next Action
            </label>
            <input
              {...register("next_action")}
              type="text"
              placeholder="e.g., Call to discuss requirements"
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Follow-up Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Follow-up Date
            </label>
            <input
              {...register("follow_up_date")}
              type="date"
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
            <Link href={`/leads/${leadId}`}>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
      />
    </svg>
  );
}
