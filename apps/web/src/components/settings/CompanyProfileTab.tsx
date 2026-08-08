"use client";

/**
 * Company identity and standing terms — the facts printed on every PDF
 * quotation.
 *
 * These are deliberately empty until the business types them in. A GST number,
 * a registered address or a payment term invented by software is a liability,
 * so the document omits any block left blank rather than guessing. That is why
 * this screen exists at all.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Spinner } from "@maiyuri/ui";
import { toast } from "sonner";
import type { FactorySettings } from "@maiyuri/shared";

interface CompanyProfileForm {
  legal_name: string;
  gstin: string;
  registered_address: string;
  contact_phone: string;
  contact_email: string;
  website: string;
  payment_terms: string;
  delivery_terms: string;
  quote_footer_note: string;
  quote_validity_days: string;
}

const EMPTY: CompanyProfileForm = {
  legal_name: "",
  gstin: "",
  registered_address: "",
  contact_phone: "",
  contact_email: "",
  website: "",
  payment_terms: "",
  delivery_terms: "",
  quote_footer_note: "",
  quote_validity_days: "15",
};

async function fetchFactory(): Promise<{ data: FactorySettings | null }> {
  const res = await fetch("/api/settings/factory");
  if (!res.ok) throw new Error("Failed to load company details");
  return res.json();
}

/** Blank input means "we have not entered this" — send null, not "". */
const orNull = (v: string) => {
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
};

async function saveFactory(form: CompanyProfileForm) {
  const days = Number.parseInt(form.quote_validity_days, 10);
  const res = await fetch("/api/settings/factory", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      legal_name: orNull(form.legal_name),
      gstin: orNull(form.gstin),
      registered_address: orNull(form.registered_address),
      contact_phone: orNull(form.contact_phone),
      contact_email: orNull(form.contact_email),
      website: orNull(form.website),
      payment_terms: orNull(form.payment_terms),
      delivery_terms: orNull(form.delivery_terms),
      quote_footer_note: orNull(form.quote_footer_note),
      quote_validity_days: Number.isFinite(days) && days > 0 ? days : null,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Failed to save company details");
  }
  return res.json();
}

export function CompanyProfileTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<CompanyProfileForm>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["factory-settings"],
    queryFn: fetchFactory,
  });

  // Load saved values into the form once they arrive.
  useEffect(() => {
    const s = data?.data;
    if (!s) return;
    setForm({
      legal_name: s.legal_name ?? "",
      gstin: s.gstin ?? "",
      registered_address: s.registered_address ?? "",
      contact_phone: s.contact_phone ?? "",
      contact_email: s.contact_email ?? "",
      website: s.website ?? "",
      payment_terms: s.payment_terms ?? "",
      delivery_terms: s.delivery_terms ?? "",
      quote_footer_note: s.quote_footer_note ?? "",
      quote_validity_days: String(s.quote_validity_days ?? 15),
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveFactory(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factory-settings"] });
      toast.success("Company details saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (key: keyof CompanyProfileForm) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Company &amp; Quotation Terms
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Printed on every PDF quotation. Anything left blank is left off the
          document — nothing here is ever filled in for you.
        </p>
      </div>

      <Card className="space-y-5 p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Letterhead
        </h3>
        <Field
          label="Registered / legal name"
          hint="As it appears on your GST registration, e.g. Maiyuri Bricks Pvt Ltd"
          value={form.legal_name}
          onChange={set("legal_name")}
        />
        <Field
          label="GSTIN"
          hint="Leave blank if you are not GST registered — the line is then omitted."
          value={form.gstin}
          onChange={set("gstin")}
        />
        <Field
          label="Registered address"
          multiline
          value={form.registered_address}
          onChange={set("registered_address")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Phone on quotations"
            value={form.contact_phone}
            onChange={set("contact_phone")}
          />
          <Field
            label="Email on quotations"
            type="email"
            value={form.contact_email}
            onChange={set("contact_email")}
          />
        </div>
        <Field
          label="Website"
          value={form.website}
          onChange={set("website")}
        />
      </Card>

      <Card className="space-y-5 p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Standing terms
        </h3>
        <Field
          label="Payment terms"
          hint='In your own words, e.g. "50% advance, balance before dispatch"'
          multiline
          value={form.payment_terms}
          onChange={set("payment_terms")}
        />
        <Field
          label="Delivery terms"
          hint='e.g. "Delivered to site within 7 days of confirmation"'
          multiline
          value={form.delivery_terms}
          onChange={set("delivery_terms")}
        />
        <Field
          label="Quotation validity (days)"
          hint="New quotations expire after this many days and can no longer be downloaded."
          type="number"
          value={form.quote_validity_days}
          onChange={set("quote_validity_days")}
        />
        <Field
          label="Footer note"
          hint="One line at the foot of every page."
          value={form.quote_footer_note}
          onChange={set("quote_footer_note")}
        />
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Saving…
            </>
          ) : (
            "Save company details"
          )}
        </Button>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  multiline?: boolean;
  type?: string;
}

function Field({
  label,
  value,
  onChange,
  hint,
  multiline,
  type = "text",
}: FieldProps) {
  const shared =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white";
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={shared}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={shared}
        />
      )}
      {hint && (
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      )}
    </label>
  );
}
