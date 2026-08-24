import Langfuse from "langfuse";

let client: Langfuse | null | undefined;

export function getLangfuse(): Langfuse | null {
  if (client !== undefined) return client;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl =
    process.env.LANGFUSE_HOST ||
    process.env.LANGFUSE_BASE_URL ||
    process.env.LANGFUSE_BASEURL;

  if (!publicKey || !secretKey) {
    client = null;
    return client;
  }

  client = new Langfuse({
    publicKey,
    secretKey,
    baseUrl,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
  });
  return client;
}

export function isLangfuseConfigured(): boolean {
  return Boolean(getLangfuse());
}

export type AiTraceMetadata = Record<string, unknown>;

export async function traceAiGeneration<T>(args: {
  name: string;
  model: string;
  input: unknown;
  metadata?: AiTraceMetadata;
  userId?: string;
  sessionId?: string;
  run: () => Promise<{ output: unknown; value: T; usage?: Record<string, unknown> }>;
}): Promise<T> {
  const langfuse = getLangfuse();
  if (!langfuse) return (await args.run()).value;

  const startTime = new Date();
  const trace = langfuse.trace({
    name: args.name,
    userId: args.userId,
    sessionId: args.sessionId,
    input: args.input,
    metadata: args.metadata,
  });

  try {
    const result = await args.run();
    trace.generation({
      name: args.name,
      model: args.model,
      input: args.input,
      output: result.output,
      metadata: args.metadata,
      usage: result.usage,
      startTime,
      endTime: new Date(),
    });
    await langfuse.flushAsync();
    return result.value;
  } catch (err) {
    trace.generation({
      name: args.name,
      model: args.model,
      input: args.input,
      output: err instanceof Error ? err.message : String(err),
      metadata: { ...(args.metadata ?? {}), error: true },
      startTime,
      endTime: new Date(),
      level: "ERROR",
      statusMessage: err instanceof Error ? err.message : String(err),
    });
    await langfuse.flushAsync().catch(() => undefined);
    throw err;
  }
}
