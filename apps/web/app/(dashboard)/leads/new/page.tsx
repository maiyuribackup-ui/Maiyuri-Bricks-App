"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Spinner } from "@maiyuri/ui";
import {
  createLeadSchema,
  type CreateLeadInput,
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

async function fetchUsers() {
  const res = await fetch("/api/users");
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

async function createLead(data: CreateLeadInput) {
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to create lead");
  }
  return res.json();
}

export default function NewLeadPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const users = usersData?.data || [];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateLeadInput>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: {
      status: "new",
    },
  });

  const mutation = useMutation({
    mutationFn: createLead,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      router.push(`/leads/${data.data.id}`);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const onSubmit = (data: CreateLeadInput) => {
    setError(null);
    mutation.mutate(data);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/leads"
          className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeftIcon className="h-5 w-5 text-slate-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            New Lead
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Add a new lead to track
          </p>
        </div>
      </div>

      {/* Form */}
      <Card className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Name <span className="text-red-500">*</span>
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
              Contact Number <span className="text-red-500">*</span>
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
                Source <span className="text-red-500">*</span>
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
                Lead Type <span className="text-red-500">*</span>
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                "Create Lead"
              )}
            </Button>
            <Link href="/leads">
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
