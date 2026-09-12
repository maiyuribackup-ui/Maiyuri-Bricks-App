import * as crypto from "node:crypto";

let ingestionAvailable: boolean | undefined;

const PHONE_RE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;
const SECRET_KEY_RE = /(api[_-]?key|secret|token|password|authorization|client_secret)/i;
const MAX_FIELD_CHARS = 1200;
const MAX_CONTAINER_ITEMS = 25;

type Primitive = string | number | boolean | null | undefined;
type LangfuseJson = Primitive | LangfuseJson[] | { [key: string]: LangfuseJson };

type AiTraceMetadata = Record<string, unknown>;

function maskText(value: string): string {
  const masked = value.replace(PHONE_RE, "[masked-phone]");
  return masked.length > MAX_FIELD_CHARS
    ? `${masked.slice(0, MAX_FIELD_CHARS)}…[truncated]`
    : masked;
}

export function sanitizeForLangfuse(value: unknown, key = ""): LangfuseJson {
  if (SECRET_KEY_RE.test(key)) return "[redacted]";
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value === "string") return maskText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_CONTAINER_ITEMS)
      .map((item) => sanitizeForLangfuse(item, key));
    if (value.length > MAX_CONTAINER_ITEMS) {
      items.push(`…${value.length - MAX_CONTAINER_ITEMS} more items`);
    }
    return items;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const out: Record<string, LangfuseJson> = {};
    for (let idx = 0; idx < entries.length; idx += 1) {
      if (idx >= MAX_CONTAINER_ITEMS) {
        out._truncated = `${entries.length - MAX_CONTAINER_ITEMS} more keys`;
        break;
      }
      const [entryKey, entryValue] = entries[idx];
      out[entryKey] = sanitizeForLangfuse(entryValue, entryKey);
    }
    return out;
  }
  return maskText(String(value));
}

function isLangfuseEnabled(): boolean {
  if (process.env.LANGFUSE_ENABLED === "false") return false;
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY &&
      process.env.LANGFUSE_SECRET_KEY &&
      (process.env.LANGFUSE_HOST || process.env.NEXT_PUBLIC_LANGFUSE_HOST),
  );
}

function langfuseHost(): string {
  return (
    process.env.LANGFUSE_HOST ||
    process.env.NEXT_PUBLIC_LANGFUSE_HOST ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

async function postIngestion(batch: Array<Record<string, unknown>>): Promise<void> {
  if (!isLangfuseEnabled()) return;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return;

  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  try {
    ingestionAvailable = true;
    const response = await Promise.race([
      fetch(`${langfuseHost()}/api/public/ingestion`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ batch }),
      }),
      new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error("Langfuse ingestion timeout")), 3000);
      }),
    ]);
    if (!response.ok) {
      console.warn("[Langfuse] ingestion rejected", response.status);
    }
  } catch (error) {
    ingestionAvailable = false;
    console.warn("[Langfuse] ingestion failed", error);
  }
}

// Backward-compatible probe used by existing route handlers/tests.
export function getLangfuse(): { enabled: true } | null {
  if (ingestionAvailable === false) return null;
  return isLangfuseEnabled() ? { enabled: true } : null;
}

export async function traceAiGeneration<T>(args: {
  name: string;
  model: string;
  input: unknown;
  metadata?: AiTraceMetadata;
  userId?: string;
  sessionId?: string;
  run: () => Promise<{
    output: unknown;
    usage?: { input?: number; output?: number; total?: number };
    value: T;
  }>;
}): Promise<T> {
  if (!isLangfuseEnabled()) {
    const result = await args.run();
    return result.value;
  }

  const startTime = new Date();
  const traceId = crypto.randomUUID();
  const generationId = crypto.randomUUID();
  const safeInput = sanitizeForLangfuse(args.input);
  const safeMetadata = sanitizeForLangfuse(args.metadata ?? {}) as Record<
    string,
    LangfuseJson
  >;

  try {
    const result = await args.run();
    const endTime = new Date();
    const safeOutput = sanitizeForLangfuse(result.output);

    await postIngestion([
      {
        id: crypto.randomUUID(),
        type: "trace-create",
        timestamp: startTime.toISOString(),
        body: {
          id: traceId,
          timestamp: startTime.toISOString(),
          name: args.name,
          userId: args.userId,
          sessionId: args.sessionId,
          input: safeInput,
          output: safeOutput,
          metadata: safeMetadata,
          tags: ["maiyuri-web", "ai-flow"],
        },
      },
      {
        id: crypto.randomUUID(),
        type: "generation-create",
        timestamp: startTime.toISOString(),
        body: {
          id: generationId,
          traceId,
          name: args.name,
          model: args.model,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          input: safeInput,
          output: safeOutput,
          metadata: safeMetadata,
          usage: result.usage,
          level: "DEFAULT",
        },
      },
    ]);

    return result.value;
  } catch (err) {
    const endTime = new Date();
    const safeError = sanitizeForLangfuse(
      err instanceof Error ? err.message : String(err),
    );

    await postIngestion([
      {
        id: crypto.randomUUID(),
        type: "trace-create",
        timestamp: startTime.toISOString(),
        body: {
          id: traceId,
          timestamp: startTime.toISOString(),
          name: args.name,
          userId: args.userId,
          sessionId: args.sessionId,
          input: safeInput,
          output: safeError,
          metadata: { ...safeMetadata, error: true },
          tags: ["maiyuri-web", "ai-flow"],
        },
      },
      {
        id: crypto.randomUUID(),
        type: "generation-create",
        timestamp: startTime.toISOString(),
        body: {
          id: generationId,
          traceId,
          name: args.name,
          model: args.model,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          input: safeInput,
          output: safeError,
          metadata: { ...safeMetadata, error: true },
          level: "ERROR",
          statusMessage: err instanceof Error ? err.message : String(err),
        },
      },
    ]);

    throw err;
  }
}
