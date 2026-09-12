import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLead, useUpdateLead } from "@/hooks/use-leads";
import { useAddNote, useLeadNotes } from "@/hooks/use-notes";
import { usePromiseDate, useProductParams } from "@/hooks/use-ops-planning";
import {
  useLeadCallRecordings,
  useLeadOdooSyncLogs,
} from "@/hooks/use-lead-activity";
import { QuotePricingEditor } from "@/components/QuotePricingEditor";
import {
  getQuoteReadiness,
  quotePdfUrl,
  quoteUrl,
  useGenerateSmartQuote,
  useSmartQuote,
} from "@/hooks/use-smart-quote";
import { QuickActionsModal } from "@/components/LeadQuickActions";
import { LeadProcessStrip } from "@/components/process/LeadProcessStrip";
import { toast } from "@/lib/toast";

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <View className="border-b border-slate-100 py-3">
      <Text className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </Text>
      <Text className="mt-1 text-base text-ink">{String(value)}</Text>
    </View>
  );
}

const STAGE_LABEL: Record<string, string> = {
  new_inquiry: "New inquiry",
  qualified_lead: "Qualified",
  quote_shared: "Quote shared",
  factory_visit_proof: "Proof / visit",
  decision_pending: "Decision pending",
  finalisation: "Finalisation",
  order_won: "Order won",
  closed_lost: "Closed lost",
};

const TEMP_STYLE: Record<
  string,
  { label: string; chip: string; rail: string; emoji: string }
> = {
  hot: {
    label: "Hot",
    chip: "bg-red-50 text-red-700",
    rail: "bg-red-500",
    emoji: "🔥",
  },
  warm: {
    label: "Warm",
    chip: "bg-amber-50 text-amber-700",
    rail: "bg-amber-500",
    emoji: "🌤️",
  },
  cold: {
    label: "Cold",
    chip: "bg-sky-50 text-sky-700",
    rail: "bg-sky-500",
    emoji: "❄️",
  },
};

function titleCase(value?: string | null): string {
  return (value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortDate(value?: string | null): string {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isOverdueDate(value?: string | null): boolean {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(value) < today;
}

function ageText(value?: string | null): string {
  if (!value) return "No update";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated 1 day ago";
  return `Updated ${days} days ago`;
}

function primaryInsight(
  lead: NonNullable<ReturnType<typeof useLead>["data"]>["data"],
): { title: string; body: string; tone: string } {
  if (isOverdueDate(lead.follow_up_date)) {
    return {
      title: "Overdue follow-up",
      body: "Call now, record outcome, and reset the next commitment date.",
      tone: "bg-red-50 border-red-100 text-red-700",
    };
  }
  if (lead.pipeline_stage === "qualified_lead") {
    return {
      title: "Move to quote",
      body: "Customer is qualified. Send quote/sketch and ask for site visit or decision date.",
      tone: "bg-orange-50 border-orange-100 text-orange-700",
    };
  }
  if (lead.pipeline_stage === "quote_shared") {
    return {
      title: "Quote follow-up",
      body: "Confirm price objection, quantity, and delivery expectation before the lead cools.",
      tone: "bg-amber-50 border-amber-100 text-amber-700",
    };
  }
  if (lead.pipeline_stage === "factory_visit_proof") {
    return {
      title: "Trust-building stage",
      body: "Push proof: factory visit, site photo, sample, or customer example.",
      tone: "bg-blue-50 border-blue-100 text-blue-700",
    };
  }
  if (lead.pipeline_stage === "decision_pending") {
    return {
      title: "Decision chase",
      body: "Ask what is blocking the decision: price, engineer, family, or delivery date.",
      tone: "bg-violet-50 border-violet-100 text-violet-700",
    };
  }
  if (!lead.follow_up_date) {
    return {
      title: "No follow-up date",
      body: "Set a date so this lead does not disappear from the sales rhythm.",
      tone: "bg-slate-50 border-slate-200 text-slate-700",
    };
  }
  return {
    title: "Next action ready",
    body:
      lead.next_action ||
      "Open quick status after the call and record the next step.",
    tone: "bg-green-50 border-green-100 text-green-700",
  };
}

function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  const [bg, text] = className.split(" ");
  return (
    <View className={`rounded-full px-2.5 py-1 ${bg}`}>
      <Text className={`text-xs font-bold ${text}`}>{children}</Text>
    </View>
  );
}

function DetailTile({
  label,
  value,
  tone = "bg-white",
}: {
  label: string;
  value?: string | number | null;
  tone?: string;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <View
      className={`mb-2 w-[48.5%] rounded-2xl border border-slate-200 p-3 ${tone}`}
    >
      <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </Text>
      <Text className="mt-1 text-sm font-bold text-ink" numberOfLines={2}>
        {String(value)}
      </Text>
    </View>
  );
}

function SalesHero({
  lead,
  onBack,
  onEdit,
  onStatus,
}: {
  lead: NonNullable<ReturnType<typeof useLead>["data"]>["data"];
  onBack: () => void;
  onEdit: () => void;
  onStatus: () => void;
}) {
  const temp = TEMP_STYLE[lead.lead_temperature] ?? TEMP_STYLE.cold;
  const insight = primaryInsight(lead);
  return (
    <View className="bg-ink px-5 pb-5 pt-3">
      <View className="mb-4 flex-row items-center justify-between">
        <Pressable
          onPress={onBack}
          className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
        >
          <Text className="text-xl text-white">‹</Text>
        </Pressable>
        <Text className="text-xs font-bold uppercase tracking-[2px] text-brand">
          Lead Workspace
        </Text>
        <Pressable
          onPress={onStatus}
          className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
        >
          <Text className="text-base text-white">⚡</Text>
        </Pressable>
      </View>
      <View className={`mb-3 h-1.5 rounded-full ${temp.rail}`} />
      <Text className="text-3xl font-extrabold text-white" numberOfLines={2}>
        {lead.name}
      </Text>
      <Text className="mt-1 text-base text-slate-300">{lead.contact}</Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        <Pill className={temp.chip}>
          {temp.emoji} {temp.label}
        </Pill>
        <Pill className="bg-brand text-ink">
          {STAGE_LABEL[lead.pipeline_stage] ?? titleCase(lead.pipeline_stage)}
        </Pill>
        {lead.ai_score != null ? (
          <Pill className="bg-violet-100 text-violet-700">
            AI {lead.ai_score}
          </Pill>
        ) : null}
      </View>
      <View
        className={`mt-4 rounded-2xl border p-3 ${insight.tone.split(" ").slice(0, 2).join(" ")}`}
      >
        <Text
          className={`text-sm font-extrabold ${insight.tone.split(" ")[2]}`}
        >
          {insight.title}
        </Text>
        <Text className="mt-1 text-xs leading-5 text-slate-700">
          {insight.body}
        </Text>
      </View>
      <View className="mt-4 flex-row gap-2">
        <Pressable
          onPress={() => Linking.openURL(`tel:${lead.contact}`)}
          className="flex-1 items-center rounded-xl bg-brand py-3 active:opacity-80"
        >
          <Text className="font-extrabold text-ink">Call</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            Linking.openURL(
              `https://wa.me/${lead.contact.replace(/[^0-9]/g, "")}`,
            )
          }
          className="flex-1 items-center rounded-xl bg-green-500 py-3 active:opacity-80"
        >
          <Text className="font-extrabold text-white">WhatsApp</Text>
        </Pressable>
        <Pressable
          onPress={onEdit}
          className="items-center rounded-xl bg-white/15 px-4 py-3 active:opacity-80"
        >
          <Text className="font-extrabold text-white">✎</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CompactDetails({
  lead,
}: {
  lead: NonNullable<ReturnType<typeof useLead>["data"]>["data"];
}) {
  return (
    <View className="mx-5 mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-base font-extrabold text-ink">Sales details</Text>
        <Text className="text-xs font-semibold text-slate-400">
          {ageText(lead.updated_at)}
        </Text>
      </View>
      <View className="flex-row flex-wrap justify-between">
        <DetailTile label="Status" value={titleCase(lead.lead_status)} />
        <DetailTile
          label="Stage"
          value={
            STAGE_LABEL[lead.pipeline_stage] ?? titleCase(lead.pipeline_stage)
          }
        />
        <DetailTile label="Customer" value={titleCase(lead.classification)} />
        <DetailTile label="Source" value={lead.source} />
        <DetailTile
          label="Location"
          value={lead.site_location || lead.site_region}
        />
        <DetailTile
          label="Value"
          value={
            lead.estimated_value
              ? `₹${Number(lead.estimated_value).toLocaleString("en-IN")}`
              : null
          }
        />
      </View>
      {lead.next_action ? (
        <View className="mt-1 rounded-2xl border border-purple-100 bg-purple-50 p-3">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-purple-400">
            Next action
          </Text>
          <Text className="mt-1 text-sm font-semibold leading-5 text-purple-900">
            {lead.next_action}
          </Text>
        </View>
      ) : null}
      {lead.ai_summary ? (
        <View className="mt-2 rounded-2xl border border-violet-100 bg-violet-50 p-3">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-violet-400">
            AI summary
          </Text>
          <Text
            className="mt-1 text-sm leading-5 text-violet-900"
            numberOfLines={4}
          >
            {lead.ai_summary}
          </Text>
        </View>
      ) : null}
      {lead.staff_notes ? (
        <View className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Staff notes
          </Text>
          <Text className="mt-1 text-sm leading-5 text-slate-700">
            {lead.staff_notes}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * AI Smart Quote — one tap on the phone gives sales a personalised,
 * bilingual quote page they can WhatsApp to the customer on the spot.
 */
function SmartQuoteSection({
  leadId,
  contact,
}: {
  leadId: string;
  contact: string;
}) {
  const generate = useGenerateSmartQuote();
  const existing = useSmartQuote(leadId);
  const [pricingOpen, setPricingOpen] = useState(false);

  // The query cache is the ONLY source of truth for the quote.
  //
  // This used to read `generate.data?.data ?? existing.data`. A mutation's
  // `.data` is its last result and it survives for the life of the component,
  // so once you generated a quote, that pre-price snapshot outranked the
  // query for the rest of the visit. Saving a rate updates the query cache —
  // and the screen went on rendering the stale object: the readiness gate
  // stayed shut, WhatsApp and PDF stayed greyed out, and the editor reopened
  // empty and asked for a price that was already in the database.
  //
  // useGenerateSmartQuote writes its result into this same cache on success,
  // so nothing is lost by reading only from here.
  const quote = existing.data ?? null;
  const slug = quote?.link_slug;
  const url = slug ? quoteUrl(slug) : null;
  const phone = contact.replace(/[^0-9]/g, "");

  // Same gate as the web staff UI: nothing reaches the customer until an
  // engineer has set the rate. Preview stays open — staff may look, the
  // customer may not.
  const readiness = getQuoteReadiness(quote?.pricing_config);

  return (
    <View className="mx-5 mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <Text className="text-base font-bold text-ink">🧾 Smart Quote</Text>
      <Text className="mt-0.5 text-xs text-slate-400">
        AI builds a personalised quote page for this customer — share the link
        or the PDF on WhatsApp.
      </Text>

      {existing.isLoading && !url ? (
        <View className="mt-3 flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#94a3b8" />
          <Text className="text-xs text-slate-400">
            Checking for an existing quote…
          </Text>
        </View>
      ) : null}

      {url ? (
        <>
          <Text className="mt-2 text-xs text-sky-600" numberOfLines={1}>
            {url}
          </Text>
          {!readiness.ready ? (
            <View className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <Text className="text-xs font-semibold text-amber-700">
                Not ready to send
              </Text>
              <Text className="mt-0.5 text-xs text-amber-700">
                {readiness.reason}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => setPricingOpen((v) => !v)}
            className="mt-2 items-center rounded-lg border border-brand py-2 active:opacity-70"
          >
            <Text className="text-sm font-bold text-ink">
              {pricingOpen
                ? "Close pricing"
                : readiness.ready
                  ? "₹ Edit pricing"
                  : "₹ Set the price"}
            </Text>
          </Pressable>

          {pricingOpen && quote ? (
            <QuotePricingEditor
              quote={quote}
              leadId={leadId}
              onSaved={() => setPricingOpen(false)}
            />
          ) : null}
          <View className="mt-2 flex-row gap-2">
            <Pressable
              disabled={!readiness.ready}
              onPress={() =>
                Linking.openURL(
                  `https://wa.me/${phone}?text=${encodeURIComponent(
                    `Vanakkam! 🧱 Your Maiyuri Bricks quote is ready:\n${url}`,
                  )}`,
                )
              }
              className={`flex-1 items-center rounded-lg py-2.5 ${
                readiness.ready
                  ? "bg-green-500 active:opacity-80"
                  : "bg-slate-200"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  readiness.ready ? "text-white" : "text-slate-400"
                }`}
              >
                📲 WhatsApp
              </Text>
            </Pressable>
            <Pressable
              disabled={!readiness.ready}
              onPress={() => slug && Linking.openURL(quotePdfUrl(slug))}
              className={`flex-1 items-center rounded-lg py-2.5 ${
                readiness.ready
                  ? "border border-brand bg-white active:opacity-70"
                  : "bg-slate-200"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  readiness.ready ? "text-ink" : "text-slate-400"
                }`}
              >
                📄 PDF
              </Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL(url)}
              className="items-center rounded-lg border border-slate-200 px-4 py-2.5 active:opacity-70"
            >
              <Text className="text-sm font-semibold text-slate-600">Open</Text>
            </Pressable>
          </View>
          <Pressable
            disabled={generate.isPending}
            onPress={() =>
              generate.mutate(
                { lead_id: leadId, regenerate: true },
                {
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : "Failed"),
                },
              )
            }
            className="mt-2 items-center py-1 active:opacity-70"
          >
            <Text className="text-xs font-medium text-slate-400">
              {generate.isPending ? "Regenerating…" : "↻ Regenerate quote"}
            </Text>
          </Pressable>
        </>
      ) : existing.isLoading ? null : (
        <Pressable
          disabled={generate.isPending}
          onPress={() =>
            generate.mutate(
              { lead_id: leadId },
              {
                onError: (e) =>
                  toast.error(e instanceof Error ? e.message : "Failed"),
              },
            )
          }
          className={`mt-3 items-center rounded-lg py-2.5 ${
            generate.isPending ? "bg-slate-200" : "bg-brand active:opacity-80"
          }`}
        >
          {generate.isPending ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#0f172a" />
              <Text className="text-sm font-semibold text-slate-500">
                AI is writing the quote… (~30s)
              </Text>
            </View>
          ) : (
            <Text className="text-sm font-bold text-ink">
              ✨ Generate Smart Quote
            </Text>
          )}
        </Pressable>
      )}
      {generate.isError ? (
        <Text className="mt-2 text-xs text-red-500">
          {generate.error instanceof Error
            ? generate.error.message
            : "Failed to generate"}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * "Can we deliver?" — the promise checker, in the salesperson's hand.
 * Same engine the Plan tab uses; here so a real delivery date can be quoted
 * DURING the customer conversation instead of over-promising.
 */
function PromiseSection() {
  const { data: params } = useProductParams();
  const promise = usePromiseDate();
  const [fg, setFg] = useState<string | null>(null);
  const [qty, setQty] = useState("");

  const products = (params?.data ?? []).filter(
    (p) => p.daily_capacity_units != null,
  );
  if (!products.length) return null;

  const result = promise.data?.data;

  return (
    <View className="mx-5 mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <Text className="text-base font-bold text-ink">📦 Can we deliver?</Text>
      <Text className="mt-0.5 text-xs text-slate-400">
        Check the earliest realistic delivery date before promising the
        customer.
      </Text>
      <View className="mt-2 flex-row flex-wrap">
        {products.map((p) => (
          <Pressable
            key={p.finished_good_id}
            onPress={() => setFg(p.finished_good_id)}
            className={`mb-2 mr-2 rounded-full px-3 py-1.5 ${
              fg === p.finished_good_id
                ? "bg-ink"
                : "border border-slate-200 bg-white"
            }`}
          >
            <Text
              className={`text-xs font-medium ${fg === p.finished_good_id ? "text-white" : "text-slate-600"}`}
            >
              {p.product_name}
            </Text>
          </Pressable>
        ))}
      </View>
      <View className="mt-1 flex-row gap-2">
        <TextInput
          value={qty}
          onChangeText={setQty}
          keyboardType="numeric"
          placeholder="Quantity"
          placeholderTextColor="#94a3b8"
          className="flex-1 rounded-lg border border-slate-200 bg-canvas px-3 py-2 text-ink"
        />
        <Pressable
          onPress={() =>
            fg &&
            Number(qty) > 0 &&
            promise.mutate({ finished_good_id: fg, quantity: Number(qty) })
          }
          disabled={promise.isPending || !fg || !Number(qty)}
          className={`items-center justify-center rounded-lg px-4 ${
            promise.isPending || !fg || !Number(qty)
              ? "bg-slate-200"
              : "bg-brand active:opacity-80"
          }`}
        >
          {promise.isPending ? (
            <ActivityIndicator size="small" color="#0f172a" />
          ) : (
            <Text className="text-sm font-semibold text-ink">Check</Text>
          )}
        </Pressable>
      </View>
      {result ? (
        <Text
          className={`mt-2 text-sm font-semibold ${
            result.promised_delivery_date ? "text-green-700" : "text-red-600"
          }`}
        >
          {result.promised_delivery_date
            ? `✅ Earliest delivery: ${new Date(result.promised_delivery_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
            : "⚠️ Cannot be fulfilled within 60 days"}
          {result.unfulfilled_units > 0
            ? ` (${result.unfulfilled_units.toLocaleString("en-IN")} short)`
            : ""}
        </Text>
      ) : null}
      {promise.isError ? (
        <Text className="mt-2 text-xs text-red-500">
          {promise.error instanceof Error
            ? promise.error.message
            : "Check failed"}
        </Text>
      ) : null}
    </View>
  );
}

type ActivityFilter = "all" | "notes" | "calls" | "syncs";

type NoteItem = NonNullable<
  ReturnType<typeof useLeadNotes>["data"]
>["data"][number];
type CallRecordingItem = NonNullable<
  ReturnType<typeof useLeadCallRecordings>["data"]
>["data"][number];
type SyncLogItem = NonNullable<
  ReturnType<typeof useLeadOdooSyncLogs>["data"]
>[number];
type TimelineActivity =
  | { type: "note"; id: string; timestamp: Date; data: NoteItem }
  | { type: "call"; id: string; timestamp: Date; data: CallRecordingItem }
  | { type: "sync"; id: string; timestamp: Date; data: SyncLogItem };

function formatTime(value: Date) {
  return value.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateGroup(value: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(value, today)) return "Today";
  if (sameDay(value, yesterday)) return "Yesterday";
  return value.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function languageLabel(lang: string | null | undefined) {
  if (!lang) return null;
  const key = lang.toLowerCase();
  if (key === "ta-en" || key === "en-ta") return "Tamil-English";
  if (key === "ta") return "Tamil";
  if (key === "en") return "English";
  if (key === "hi") return "Hindi";
  return lang;
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`mr-2 rounded-full px-3 py-1.5 ${active ? "bg-ink" : "border border-slate-200 bg-white"}`}
    >
      <Text
        className={`text-xs font-semibold ${active ? "text-white" : "text-slate-600"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CallRecordingTimelineCard({
  recording,
}: {
  recording: CallRecordingItem;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const insights = recording.ai_insights ?? {};
  const insightItems = [
    ...(insights.positive_signals ?? []).map((text) => `✅ ${text}`),
    ...(insights.complaints ?? []).map((text) => `⚠️ ${text}`),
    ...(insights.negative_feedback ?? []).map((text) => `😕 ${text}`),
    ...(insights.negotiation_signals ?? []).map((text) => `💰 ${text}`),
    ...(insights.price_expectations ?? []).map((text) => `💵 ${text}`),
    ...(insights.recommended_actions ?? []).map((text) => `🎯 ${text}`),
  ];

  return (
    <View className="rounded-xl border border-slate-200 bg-white">
      <View className="border-b border-slate-100 p-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-base font-bold text-ink">
            📞 {recording.phone_number}
          </Text>
          <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            ⏱ {formatDuration(recording.duration_seconds)}
          </Text>
          {languageLabel(recording.transcription_language) ? (
            <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              🌐 {languageLabel(recording.transcription_language)}
            </Text>
          ) : null}
          {recording.ai_insights?.sentiment ? (
            <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              🙂 {recording.ai_insights.sentiment}
            </Text>
          ) : null}
        </View>
      </View>

      {recording.mp3_gdrive_url ? (
        <Pressable
          onPress={() => Linking.openURL(recording.mp3_gdrive_url!)}
          className="border-b border-slate-100 bg-slate-50 p-3 active:opacity-70"
        >
          <Text className="text-sm font-semibold text-blue-600">
            🔊 Listen on Google Drive ↗
          </Text>
        </Pressable>
      ) : null}

      {recording.ai_summary ? (
        <View className="border-b border-slate-100 bg-purple-50 p-3">
          <Text className="text-xs font-semibold text-purple-700">
            ✨ AI Summary
          </Text>
          <Text className="mt-1 text-sm leading-5 text-purple-900">
            {recording.ai_summary}
          </Text>
        </View>
      ) : null}

      {recording.transcription_text ? (
        <View className="border-b border-slate-100">
          <Pressable
            onPress={() => setShowTranscript((v) => !v)}
            className="flex-row items-center justify-between p-3"
          >
            <Text className="text-sm font-semibold text-slate-700">
              📄 Show Transcription
            </Text>
            <Text className="text-slate-400">{showTranscript ? "⌃" : "⌄"}</Text>
          </Pressable>
          {showTranscript ? (
            <View className="mx-3 mb-3 rounded-lg bg-blue-50 p-3">
              {recording.transcription_confidence ? (
                <Text className="mb-1 text-xs font-semibold text-blue-700">
                  {Math.round(recording.transcription_confidence * 100)}%
                  confidence
                </Text>
              ) : null}
              <Text className="text-sm leading-5 text-blue-900">
                {recording.transcription_text}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {insightItems.length ? (
        <View>
          <Pressable
            onPress={() => setShowInsights((v) => !v)}
            className="flex-row items-center justify-between p-3"
          >
            <Text className="text-sm font-semibold text-slate-700">
              💡 Show AI Insights
            </Text>
            <Text className="text-slate-400">{showInsights ? "⌃" : "⌄"}</Text>
          </Pressable>
          {showInsights ? (
            <View className="mx-3 mb-3 rounded-lg bg-amber-50 p-3">
              {insightItems.map((item, idx) => (
                <Text
                  key={`${recording.id}-insight-${idx}`}
                  className="mb-1 text-sm leading-5 text-amber-900"
                >
                  • {item}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LeadActivitySection({ leadId }: { leadId: string }) {
  const { data: notesData, isLoading: notesLoading } = useLeadNotes(leadId);
  const { data: recordingsData, isLoading: recordingsLoading } =
    useLeadCallRecordings(leadId);
  const { data: syncLogs = [] } = useLeadOdooSyncLogs(leadId);
  const addNote = useAddNote(leadId);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const notes = notesData?.data ?? [];
  const recordings = recordingsData?.data ?? [];

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || addNote.isPending) return;
    addNote.mutate(trimmed, {
      onSuccess: () => {
        setText("");
        toast.success("Note added");
      },
    });
  };

  const activities: TimelineActivity[] = [
    ...(filter === "all" || filter === "notes"
      ? notes.map((note) => ({
          type: "note" as const,
          id: note.id,
          timestamp: new Date(note.date ?? note.created_at),
          data: note,
        }))
      : []),
    ...(filter === "all" || filter === "calls"
      ? recordings.map((recording) => ({
          type: "call" as const,
          id: recording.id,
          timestamp: new Date(recording.created_at),
          data: recording,
        }))
      : []),
    ...(filter === "all" || filter === "syncs"
      ? syncLogs
          .filter(
            (log) => log.sync_type === "quote_pull" && log.status === "success",
          )
          .map((log) => ({
            type: "sync" as const,
            id: log.id,
            timestamp: new Date(log.created_at),
            data: log,
          }))
      : []),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return (
    <View className="mt-4 px-5">
      <View className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
        <View className="mb-3 flex-row flex-wrap items-center justify-between gap-2">
          <Text className="text-base font-bold text-ink">Lead Activity</Text>
          <Text className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            {notes.length + recordings.length + syncLogs.length} items
          </Text>
        </View>
        <View className="mb-3 flex-row flex-wrap">
          <FilterPill
            label="All Activity"
            active={filter === "all"}
            onPress={() => setFilter("all")}
          />
          <FilterPill
            label="Notes"
            active={filter === "notes"}
            onPress={() => setFilter("notes")}
          />
          <FilterPill
            label="Calls"
            active={filter === "calls"}
            onPress={() => setFilter("calls")}
          />
          <FilterPill
            label="Odoo"
            active={filter === "syncs"}
            onPress={() => setFilter("syncs")}
          />
        </View>
        <View className="rounded-xl border border-slate-200 bg-canvas p-2">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a note about this lead…"
            placeholderTextColor="#94a3b8"
            multiline
            className="min-h-[40px] px-2 py-1 text-sm text-ink"
          />
          <View className="flex-row items-center justify-between px-1">
            {addNote.isError ? (
              <Text className="flex-1 text-xs text-red-500" numberOfLines={1}>
                {addNote.error instanceof Error
                  ? addNote.error.message
                  : "Failed to save"}
              </Text>
            ) : (
              <View className="flex-1" />
            )}
            <Pressable
              onPress={submit}
              disabled={!text.trim() || addNote.isPending}
              className={`rounded-lg px-4 py-1.5 ${!text.trim() || addNote.isPending ? "bg-slate-200" : "bg-brand active:opacity-80"}`}
            >
              {addNote.isPending ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : (
                <Text className="text-sm font-semibold text-ink">Add Note</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {notesLoading || recordingsLoading ? (
        <ActivityIndicator color="#f97316" />
      ) : activities.length === 0 ? (
        <Text className="mb-4 text-sm text-slate-400">
          No activity yet — add a note or wait for call recordings to sync.
        </Text>
      ) : (
        activities.map((activity, index) => {
          const previous = activities[index - 1];
          const showDate =
            !previous ||
            formatDateGroup(previous.timestamp) !==
              formatDateGroup(activity.timestamp);
          return (
            <View key={`${activity.type}-${activity.id}`} className="mb-4">
              {showDate ? (
                <View className="mb-3 flex-row items-center gap-3">
                  <View className="h-px flex-1 bg-slate-200" />
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {formatDateGroup(activity.timestamp)}
                  </Text>
                  <View className="h-px flex-1 bg-slate-200" />
                </View>
              ) : null}
              <View className="flex-row gap-3">
                <View className="items-center">
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-full ${activity.type === "call" ? "bg-emerald-500" : activity.type === "sync" ? "bg-orange-500" : "bg-blue-500"}`}
                  >
                    <Text className="text-[10px] text-white">
                      {activity.type === "call"
                        ? "☎"
                        : activity.type === "sync"
                          ? "↻"
                          : "N"}
                    </Text>
                  </View>
                  <View className="w-0.5 flex-1 bg-slate-200" />
                </View>
                <View className="min-w-0 flex-1">
                  <View className="mb-2 flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-ink">
                      {formatTime(activity.timestamp)}
                    </Text>
                    <Text className="text-xs text-slate-400">
                      {activity.type === "call"
                        ? "Call Recording"
                        : activity.type === "sync"
                          ? "Odoo Sync"
                          : "Note"}
                    </Text>
                  </View>
                  {activity.type === "call" ? (
                    <CallRecordingTimelineCard recording={activity.data} />
                  ) : activity.type === "sync" ? (
                    <View className="rounded-xl border border-orange-100 bg-orange-50 p-3">
                      <Text className="text-sm font-semibold text-orange-900">
                        Quote sync from Odoo
                      </Text>
                      <Text className="mt-1 text-xs text-orange-700">
                        Latest quote/order information pulled successfully.
                      </Text>
                    </View>
                  ) : (
                    <View className="rounded-xl border border-slate-100 bg-white p-3">
                      <Text className="text-sm leading-5 text-slate-700">
                        {activity.data.text}
                      </Text>
                      {activity.data.transcription_text ? (
                        <Text
                          className="mt-1 text-xs italic text-slate-400"
                          numberOfLines={3}
                        >
                          🎙️ {activity.data.transcription_text}
                        </Text>
                      ) : null}
                      {activity.data.ai_summary ? (
                        <Text
                          className="mt-1 text-xs text-violet-500"
                          numberOfLines={3}
                        >
                          ✨ {activity.data.ai_summary}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function FollowUpDateEditor({
  lead,
}: {
  lead: NonNullable<ReturnType<typeof useLead>["data"]>["data"];
}) {
  const updateLead = useUpdateLead();
  const [date, setDate] = useState(
    lead.follow_up_date ? lead.follow_up_date.slice(0, 10) : "",
  );
  const save = () => {
    updateLead.mutate(
      { id: lead.id, body: { follow_up_date: date || null } },
      {
        onSuccess: () =>
          toast.success(
            date ? "Follow-up date updated" : "Follow-up date cleared",
          ),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Failed to update date"),
      },
    );
  };
  return (
    <View className="mx-5 mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <Text className="text-base font-bold text-ink">
        📅 Follow-up / due date
      </Text>
      <Text className="mt-0.5 text-xs text-slate-400">
        Edit the lead follow-up date without leaving this screen.
      </Text>
      <View className="mt-3 flex-row gap-2">
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#94a3b8"
          className="flex-1 rounded-lg border border-slate-200 bg-canvas px-3 py-2 text-ink"
        />
        <Pressable
          onPress={save}
          disabled={updateLead.isPending}
          className={`rounded-lg px-4 py-2.5 ${updateLead.isPending ? "bg-slate-200" : "bg-brand active:opacity-80"}`}
        >
          {updateLead.isPending ? (
            <ActivityIndicator size="small" color="#0f172a" />
          ) : (
            <Text className="font-semibold text-ink">Save</Text>
          )}
        </Pressable>
      </View>
      {lead.follow_up_date ? (
        <Text className="mt-2 text-xs text-slate-400">
          Current: {new Date(lead.follow_up_date).toLocaleDateString("en-IN")}
        </Text>
      ) : null}
    </View>
  );
}

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError, error } = useLead(id);
  const lead = data?.data;
  const [qaOpen, setQaOpen] = useState(false);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  if (isError || !lead) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-500">
          {error instanceof Error ? error.message : "Lead not found"}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <ScrollView
        className="flex-1 bg-canvas"
        keyboardShouldPersistTaps="handled"
      >
        <SalesHero
          lead={lead}
          onBack={() => router.back()}
          onEdit={() => router.push(`/leads/edit/${lead.id}`)}
          onStatus={() => setQaOpen(true)}
        />

        <FollowUpDateEditor lead={lead} />
        <LeadActivitySection leadId={lead.id} />
        <CompactDetails lead={lead} />
        <LeadProcessStrip leadId={lead.id} customerName={lead.name} />
        <SmartQuoteSection leadId={lead.id} contact={lead.contact} />
        <PromiseSection />

        <View className="h-10" />
      </ScrollView>
      {/* Same Quick Actions sheet as the list — no more backing out to edit */}
      <QuickActionsModal
        lead={qaOpen ? lead : null}
        onClose={() => setQaOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}
