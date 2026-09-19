import type {
  HandoverRejectionCode,
  ProcessQcResult,
  RecordQcReleaseInput,
} from "@maiyuri/shared";
import { HANDOVER_REJECTION_LABELS } from "@maiyuri/shared";
import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button, Icon, Touchable } from "@/ui";

/**
 * Bottom-anchored form sheets used by the process stage panel. Built on the
 * RN Modal (the stage panel is mounted inside ScrollViews on several screens,
 * so a plain modal is more predictable there than a nested BottomSheetModal).
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function SheetModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
      >
        <Pressable className="flex-1 bg-ink/50" onPress={onClose} />
        <View className="max-h-[85%] rounded-t-3xl bg-white">
          <View className="items-center pt-3">
            <View className="h-1.5 w-11 rounded-full bg-slate-300" />
          </View>
          <View className="flex-row items-center justify-between border-b border-line px-5 pb-3 pt-3">
            <Text
              className="flex-1 text-xl font-bold text-ink"
              numberOfLines={1}
            >
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Icon name="close-circle" size={26} color="#94a3b8" />
            </Pressable>
          </View>
          <ScrollView
            className="px-5"
            contentContainerClassName="pb-10 pt-4"
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function FieldLabel({
  children,
  required,
}: {
  children: string;
  required?: boolean;
}) {
  return (
    <Text className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-muted">
      {children}
      {required ? <Text className="text-red-400"> *</Text> : null}
    </Text>
  );
}

export function SheetInput({
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      multiline={multiline}
      keyboardType={keyboardType}
      className={`rounded-xl border border-line bg-canvas px-3 py-3 text-base text-ink ${
        multiline ? "min-h-[80px]" : ""
      }`}
    />
  );
}

// ---------- Raise exception (block) ----------

export type ExceptionForm = {
  code: string;
  message: string;
  proposed_date?: string;
};

const EXCEPTION_CODES: { code: string; label: string }[] = [
  { code: "CUSTOMER_UNREACHABLE", label: "Customer unreachable" },
  { code: "WAITING_ON_CUSTOMER", label: "Waiting on customer" },
  { code: "PAYMENT_PENDING", label: "Payment pending" },
  { code: "STOCK", label: "Stock / capacity" },
  { code: "DATE_INFEASIBLE", label: "Date not feasible" },
  { code: "OTHER", label: "Other" },
];

export function ExceptionSheet({
  visible,
  onClose,
  onSubmit,
  busy,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (form: ExceptionForm) => void;
  busy: boolean;
}) {
  const [code, setCode] = useState("OTHER");
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  const dateOk = date === "" || DATE_RE.test(date);
  const valid = message.trim().length >= 2 && dateOk;

  return (
    <SheetModal visible={visible} title="Raise exception" onClose={onClose}>
      <FieldLabel required>Reason</FieldLabel>
      <ChipRow
        options={EXCEPTION_CODES.map((c) => ({ key: c.code, label: c.label }))}
        value={code}
        onChange={setCode}
      />
      <FieldLabel required>What is blocking this stage?</FieldLabel>
      <SheetInput
        value={message}
        onChangeText={setMessage}
        placeholder="Describe the exception"
        multiline
      />
      <FieldLabel>Proposed date (YYYY-MM-DD)</FieldLabel>
      <SheetInput
        value={date}
        onChangeText={setDate}
        placeholder="2026-09-30"
      />
      {!dateOk ? (
        <Text className="mt-1 text-xs text-red-500">Use YYYY-MM-DD</Text>
      ) : null}
      <Button
        className="mt-5"
        size="lg"
        variant="danger"
        icon="alert-circle-outline"
        label="Raise exception"
        loading={busy}
        disabled={!valid}
        onPress={() =>
          onSubmit({
            code,
            message: message.trim(),
            proposed_date: date.trim() || undefined,
          })
        }
      />
    </SheetModal>
  );
}

// ---------- Return handover with exception (reject) ----------

export type RejectForm = {
  reason_code: HandoverRejectionCode;
  comment: string;
  proposed_date?: string;
};

export function RejectHandoverSheet({
  visible,
  onClose,
  onSubmit,
  busy,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (form: RejectForm) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState<HandoverRejectionCode>("OTHER");
  const [comment, setComment] = useState("");
  const [date, setDate] = useState("");
  const dateOk = date === "" || DATE_RE.test(date);
  const valid = comment.trim().length >= 3 && dateOk;
  const options = (
    Object.keys(HANDOVER_REJECTION_LABELS) as HandoverRejectionCode[]
  ).map((k) => ({ key: k, label: HANDOVER_REJECTION_LABELS[k] }));

  return (
    <SheetModal
      visible={visible}
      title="Return with exception"
      onClose={onClose}
    >
      <FieldLabel required>Reason</FieldLabel>
      <ChipRow
        options={options}
        value={reason}
        onChange={(k) => setReason(k as HandoverRejectionCode)}
      />
      <FieldLabel required>Comment for sales</FieldLabel>
      <SheetInput
        value={comment}
        onChangeText={setComment}
        placeholder="What must change before the factory can accept?"
        multiline
      />
      <FieldLabel>Achievable date (YYYY-MM-DD)</FieldLabel>
      <SheetInput
        value={date}
        onChangeText={setDate}
        placeholder="2026-09-30"
      />
      {!dateOk ? (
        <Text className="mt-1 text-xs text-red-500">Use YYYY-MM-DD</Text>
      ) : null}
      <Button
        className="mt-5"
        size="lg"
        variant="danger"
        icon="arrow-undo-outline"
        label="Return to sales"
        loading={busy}
        disabled={!valid}
        onPress={() =>
          onSubmit({
            reason_code: reason,
            comment: comment.trim(),
            proposed_date: date.trim() || undefined,
          })
        }
      />
    </SheetModal>
  );
}

// ---------- Handover package form ----------

const PAYLOAD_LABELS: Record<string, string> = {
  customer_name: "Customer",
  order_ref: "Order reference",
  product_name: "Product",
  finished_good_id: "Finished good",
  quantity: "Quantity",
  payment_status: "Payment status",
  requested_delivery_date: "Requested delivery date (YYYY-MM-DD)",
  site_location: "Site location",
  contact_person: "Contact person",
  contact_phone: "Contact phone",
  architect_or_builder: "Architect / builder",
  special_requirements: "Special requirements",
  commitments: "Commitments already made",
  notes: "Notes",
};

export function payloadLabel(key: string): string {
  return (
    PAYLOAD_LABELS[key] ??
    key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

const MULTILINE_FIELDS = new Set([
  "special_requirements",
  "commitments",
  "notes",
]);
const NUMERIC_FIELDS = new Set(["quantity"]);

export function HandoverFormSheet({
  visible,
  onClose,
  fields,
  initial,
  onSubmit,
  busy,
}: {
  visible: boolean;
  onClose: () => void;
  fields: string[];
  initial: Record<string, unknown>;
  onSubmit: (payload: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState(false);
  if (visible && !seeded) {
    setSeeded(true);
    const seed: Record<string, string> = {};
    for (const f of fields) {
      const v = initial[f];
      seed[f] = v === null || v === undefined ? "" : String(v);
    }
    setValues(seed);
  }
  if (!visible && seeded) setSeeded(false);

  const build = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = (values[f] ?? "").trim();
      if (raw === "") continue;
      out[f] =
        NUMERIC_FIELDS.has(f) && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
    }
    return out;
  };

  return (
    <SheetModal visible={visible} title="Handover package" onClose={onClose}>
      <Text className="text-sm text-muted">
        The factory judges this package. Fill in everything the customer has
        been promised.
      </Text>
      {fields.map((f) => (
        <View key={f}>
          <FieldLabel>{payloadLabel(f)}</FieldLabel>
          <SheetInput
            value={values[f] ?? ""}
            onChangeText={(t) => setValues((p) => ({ ...p, [f]: t }))}
            placeholder={payloadLabel(f)}
            multiline={MULTILINE_FIELDS.has(f)}
            keyboardType={NUMERIC_FIELDS.has(f) ? "numeric" : "default"}
          />
        </View>
      ))}
      <Button
        className="mt-5"
        size="lg"
        variant="success"
        icon="send-outline"
        label="Send handover"
        loading={busy}
        onPress={() => onSubmit(build())}
      />
    </SheetModal>
  );
}

// ---------- Evidence note ----------

export function NoteSheet({
  visible,
  title,
  onClose,
  onSubmit,
  busy,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (text: string) => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <SheetModal visible={visible} title={title} onClose={onClose}>
      <FieldLabel required>Evidence note</FieldLabel>
      <SheetInput
        value={text}
        onChangeText={setText}
        placeholder="Reference number, what was confirmed, by whom…"
        multiline
      />
      <Button
        className="mt-5"
        size="lg"
        icon="document-text-outline"
        label="Save note"
        loading={busy}
        disabled={text.trim().length < 2}
        onPress={() => {
          onSubmit(text.trim());
          setText("");
        }}
      />
    </SheetModal>
  );
}

// ---------- QC release ----------

export type QcReleaseForm = Omit<
  RecordQcReleaseInput,
  "stage_instance_id" | "task_id"
>;

/**
 * The factory's QC record (PRD §9 Quality Release): product, quantity,
 * batch and verdict. A HOLD keeps the gate closed and needs a reason.
 */
export function QcReleaseSheet({
  visible,
  initialProduct,
  initialQuantity,
  onClose,
  onSubmit,
  busy,
}: {
  visible: boolean;
  initialProduct?: string;
  initialQuantity?: number | null;
  onClose: () => void;
  onSubmit: (form: QcReleaseForm) => void;
  busy: boolean;
}) {
  const [product, setProduct] = useState(initialProduct ?? "");
  const [quantity, setQuantity] = useState(
    initialQuantity && initialQuantity > 0 ? String(initialQuantity) : "",
  );
  const [batch, setBatch] = useState("");
  const [result, setResult] = useState<ProcessQcResult>("released");
  const [notes, setNotes] = useState("");
  const qty = Number(quantity);
  const valid =
    product.trim().length > 0 &&
    Number.isFinite(qty) &&
    qty > 0 &&
    (result === "released" || notes.trim().length > 0);
  const hold = result === "hold";
  return (
    <SheetModal visible={visible} title="Record QC release" onClose={onClose}>
      <FieldLabel required>Result</FieldLabel>
      <ChipRow
        options={[
          { key: "released", label: "Released" },
          { key: "hold", label: "Hold" },
        ]}
        value={result}
        onChange={(k) => setResult(k as ProcessQcResult)}
      />
      <FieldLabel required>Product</FieldLabel>
      <SheetInput
        value={product}
        onChangeText={setProduct}
        placeholder="e.g. Solid block 8 inch"
      />
      <FieldLabel required>Quantity checked</FieldLabel>
      <SheetInput
        value={quantity}
        onChangeText={setQuantity}
        placeholder="0"
        keyboardType="numeric"
      />
      <FieldLabel>Batch (optional)</FieldLabel>
      <SheetInput value={batch} onChangeText={setBatch} placeholder="B-17" />
      <FieldLabel required={hold}>
        {hold ? "Why is it on hold?" : "Notes (optional)"}
      </FieldLabel>
      <SheetInput
        value={notes}
        onChangeText={setNotes}
        placeholder={hold ? "What failed the check?" : "Anything worth noting"}
        multiline
      />
      <Button
        className="mt-5"
        size="lg"
        variant={hold ? "danger" : "primary"}
        icon={hold ? "alert-circle-outline" : "checkmark-circle-outline"}
        label={hold ? "Record hold" : "Record release"}
        loading={busy}
        disabled={!valid}
        onPress={() =>
          onSubmit({
            product_name: product.trim(),
            quantity: qty,
            result,
            batch_ref: batch.trim() || undefined,
            notes: notes.trim() || undefined,
          })
        }
      />
    </SheetModal>
  );
}

// ---------- shared chip row ----------

export function ChipRow({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { key: string; label: string }[];
  value: string | null;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Touchable
            key={o.key}
            disabled={disabled}
            onPress={() => onChange(o.key)}
            className={`rounded-xl px-3.5 py-2.5 ${active ? "bg-ink" : "bg-slate-100"}`}
            rippleColor={active ? "rgba(255,255,255,0.2)" : undefined}
          >
            <Text
              className={`text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}
            >
              {o.label}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}
