# Observability & Logging Standards

**Purpose:** Logging standards and observability practices for debugging production issues. Follow these to ensure proper visibility into system behavior.

**Related Documents:**

- [TESTING.md](./TESTING.md) - Debugging protocol
- [CODING_PRINCIPLES.md](./CODING_PRINCIPLES.md) - Error handling standards

---

## Table of Contents

1. [Logging Standards](#1-logging-standards)
2. [Log Levels](#2-log-levels)
3. [What to Log](#3-what-to-log)
4. [What NOT to Log](#4-what-not-to-log)
5. [Correlation IDs](#5-correlation-ids)
6. [Structured Logging](#6-structured-logging)
7. [Monitoring Patterns](#7-monitoring-patterns)

---

## 1. Logging Standards

### OBS-001: Log at System Boundaries

**Rule:** Log when data enters or leaves your system.

```typescript
// API endpoint entry
export async function POST(req: Request) {
  const correlationId = generateCorrelationId();
  console.log("API_REQUEST", {
    correlationId,
    method: "POST",
    path: "/api/leads",
    timestamp: new Date().toISOString(),
  });

  try {
    const body = await req.json();
    // ... process ...

    console.log("API_RESPONSE", {
      correlationId,
      status: 201,
      duration: Date.now() - startTime,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("API_ERROR", {
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
```

### OBS-002: Include Context in Logs

**Rule:** Every log should answer: What, Where, When, Why.

```typescript
// ❌ WRONG - No context
console.log("Error occurred");
console.log("Processing lead");

// ✅ CORRECT - Full context
console.error("LEAD_CREATE_FAILED", {
  leadId: "uuid-123",
  userId: "user-456",
  error: "Duplicate phone number",
  phone: "+91******7890", // Masked
  timestamp: new Date().toISOString(),
});

console.log("LEAD_PROCESSING", {
  leadId: "uuid-123",
  stage: "validation",
  timestamp: new Date().toISOString(),
});
```

### OBS-003: Use Consistent Log Format

**Rule:** Standardize log structure across the application.

```typescript
// lib/logger.ts
type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogContext {
  correlationId?: string;
  userId?: string;
  [key: string]: unknown;
}

export function log(level: LogLevel, event: string, context: LogContext = {}) {
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...context,
  };

  switch (level) {
    case "DEBUG":
      console.debug(JSON.stringify(entry));
      break;
    case "INFO":
      console.info(JSON.stringify(entry));
      break;
    case "WARN":
      console.warn(JSON.stringify(entry));
      break;
    case "ERROR":
      console.error(JSON.stringify(entry));
      break;
  }
}

// Usage
log("INFO", "LEAD_CREATED", { leadId: lead.id, userId: user.id });
log("ERROR", "ODOO_SYNC_FAILED", { leadId, error: error.message });
```

---

## 2. Log Levels

### Level Guidelines

| Level   | When to Use                        | Example                                 |
| ------- | ---------------------------------- | --------------------------------------- |
| `DEBUG` | Development details, verbose info  | Variable values, loop iterations        |
| `INFO`  | Normal operations, business events | User login, lead created                |
| `WARN`  | Recoverable issues, deprecations   | Rate limit approaching, retry succeeded |
| `ERROR` | Failures requiring attention       | API error, database failure             |

### Level Selection Rules

```typescript
// DEBUG - Development/troubleshooting (disable in production)
log("DEBUG", "QUERY_PARAMS", { filters, sort, page });

// INFO - Business events (always on)
log("INFO", "LEAD_CONVERTED", { leadId, amount, userId });

// WARN - Something wrong but recovered
log("WARN", "ODOO_RETRY", { attempt: 2, maxAttempts: 3, error });

// ERROR - Something failed, needs attention
log("ERROR", "PAYMENT_FAILED", { orderId, error: error.message });
```

---

## 3. What to Log

### Always Log These Events

| Event Category            | Events                               | Level      |
| ------------------------- | ------------------------------------ | ---------- |
| **Application Lifecycle** | Startup, shutdown, config loaded     | INFO       |
| **Authentication**        | Login success, login failure, logout | INFO/WARN  |
| **Business Operations**   | Create, update, delete operations    | INFO       |
| **External API Calls**    | Request sent, response received      | DEBUG/INFO |
| **Errors & Exceptions**   | All caught exceptions                | ERROR      |
| **Security Events**       | Auth failures, permission denials    | WARN/ERROR |
| **Performance**           | Slow operations (>500ms)             | WARN       |

### Event Examples

```typescript
// Application startup
log("INFO", "APP_STARTED", {
  version: process.env.APP_VERSION,
  environment: process.env.NODE_ENV,
  port: 3000,
});

// Authentication
log("INFO", "USER_LOGIN", { userId: user.id, method: "email" });
log("WARN", "LOGIN_FAILED", {
  email: maskEmail(email),
  reason: "invalid_password",
});

// Business operations
log("INFO", "LEAD_CREATED", { leadId: lead.id, userId: user.id });
log("INFO", "QUOTE_GENERATED", { leadId, quoteId, amount });

// External API
log("DEBUG", "ODOO_REQUEST", { endpoint, method, correlationId });
log("INFO", "ODOO_RESPONSE", { status: 200, duration: 234, correlationId });

// Errors
log("ERROR", "DATABASE_ERROR", {
  operation: "insert",
  table: "leads",
  error: error.message,
  correlationId,
});

// Performance
log("WARN", "SLOW_QUERY", {
  query: "getLeadsWithNotes",
  duration: 2340,
  threshold: 500,
});
```

---

## 4. What NOT to Log

### NEVER Log These (Security/Privacy)

| Category           | Examples                    | Why                  |
| ------------------ | --------------------------- | -------------------- |
| **Credentials**    | Passwords, API keys, tokens | Security breach risk |
| **Full PII**       | Full phone numbers, Aadhaar | Privacy regulations  |
| **Payment Data**   | Card numbers, CVV           | PCI compliance       |
| **Session Tokens** | JWT, session IDs            | Session hijacking    |
| **Request Bodies** | Full POST payloads          | May contain secrets  |

### Safe Logging Patterns

```typescript
// ❌ NEVER - Full sensitive data
console.log("User:", { password: user.password });
console.log("Token:", authToken);
console.log("Card:", cardNumber);

// ✅ CORRECT - Masked/sanitized
console.log("User:", { email: maskEmail(user.email) });
console.log("Token:", "Bearer ***");
console.log("Card:", maskCard(cardNumber)); // ****-****-****-1234

// Masking helpers
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string): string {
  return phone.slice(0, 4) + "******" + phone.slice(-4);
}

function maskCard(card: string): string {
  return "****-****-****-" + card.slice(-4);
}

// Request body sanitization
function sanitizeBody(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;

  const sensitiveFields = ["password", "token", "secret", "key", "card"];
  const sanitized = { ...(body as Record<string, unknown>) };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = "***REDACTED***";
    }
  }

  return sanitized;
}
```

---

## 5. Correlation IDs

### OBS-004: Use Correlation IDs for Request Tracing

**Rule:** Every request should have a unique ID that flows through all operations.

```typescript
// lib/correlation.ts
import { randomUUID } from "crypto";

export function generateCorrelationId(): string {
  return randomUUID();
}

// middleware.ts (Next.js)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") ?? generateCorrelationId();

  const response = NextResponse.next();
  response.headers.set("x-correlation-id", correlationId);

  return response;
}

// In API routes
export async function POST(req: Request) {
  const correlationId =
    req.headers.get("x-correlation-id") ?? generateCorrelationId();

  // Pass to all downstream calls
  log("INFO", "LEAD_CREATE_START", { correlationId });

  try {
    const lead = await createLead(data);
    log("INFO", "LEAD_CREATE_SUCCESS", { correlationId, leadId: lead.id });

    // Pass to external services
    await syncToOdoo(lead, { correlationId });

    return Response.json(lead);
  } catch (error) {
    log("ERROR", "LEAD_CREATE_FAILED", { correlationId, error: error.message });
    throw error;
  }
}

// External service calls include correlation ID
async function syncToOdoo(lead: Lead, ctx: { correlationId: string }) {
  log("DEBUG", "ODOO_SYNC_START", {
    correlationId: ctx.correlationId,
    leadId: lead.id,
  });

  const response = await fetch(odooUrl, {
    headers: {
      "X-Correlation-ID": ctx.correlationId,
    },
  });

  log("INFO", "ODOO_SYNC_COMPLETE", {
    correlationId: ctx.correlationId,
    leadId: lead.id,
    status: response.status,
  });
}
```

---

## 6. Structured Logging

### OBS-005: Use Structured JSON Logs

**Rule:** Logs should be machine-parseable for aggregation tools.

```typescript
// ❌ WRONG - Unstructured string logs
console.log(`Lead ${leadId} created by user ${userId} at ${new Date()}`);

// ✅ CORRECT - Structured JSON
console.log(
  JSON.stringify({
    event: "LEAD_CREATED",
    level: "INFO",
    timestamp: new Date().toISOString(),
    data: {
      leadId,
      userId,
    },
  }),
);

// Production logger with structured output
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});

// Usage
logger.info({ leadId, userId }, "Lead created");
logger.error({ leadId, error: error.message }, "Lead creation failed");
```

### Log Format Standard

```json
{
  "level": "INFO",
  "event": "LEAD_CREATED",
  "timestamp": "2026-01-17T10:30:00.000Z",
  "correlationId": "abc-123-def",
  "data": {
    "leadId": "lead-456",
    "userId": "user-789"
  },
  "metadata": {
    "service": "maiyuri-web",
    "version": "1.0.0",
    "environment": "production"
  }
}
```

---

## 7. Monitoring Patterns

### Health Check Endpoint

```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkExternalServices(),
  ]);

  const health = {
    status: checks.every((c) => c.status === "fulfilled")
      ? "healthy"
      : "degraded",
    timestamp: new Date().toISOString(),
    checks: {
      database: checks[0].status === "fulfilled" ? "ok" : "error",
      external: checks[1].status === "fulfilled" ? "ok" : "error",
    },
  };

  log("DEBUG", "HEALTH_CHECK", health);

  return Response.json(health, {
    status: health.status === "healthy" ? 200 : 503,
  });
}

async function checkDatabase() {
  const start = Date.now();
  await supabase.from("leads").select("id").limit(1);
  const duration = Date.now() - start;

  if (duration > 1000) {
    log("WARN", "SLOW_DB_HEALTH_CHECK", { duration });
  }
}
```

### Performance Timing

```typescript
// lib/timing.ts
export function withTiming<T>(
  operation: string,
  fn: () => Promise<T>,
  threshold = 500,
): Promise<T> {
  const start = Date.now();

  return fn().finally(() => {
    const duration = Date.now() - start;

    if (duration > threshold) {
      log("WARN", "SLOW_OPERATION", { operation, duration, threshold });
    } else {
      log("DEBUG", "OPERATION_TIMING", { operation, duration });
    }
  });
}

// Usage
const leads = await withTiming("getLeadsWithNotes", () =>
  supabase.from("leads").select("*, notes(*)").limit(100),
);
```

### Error Rate Monitoring

```typescript
// lib/metrics.ts
const errorCounts = new Map<string, number>();

export function recordError(category: string) {
  const count = (errorCounts.get(category) ?? 0) + 1;
  errorCounts.set(category, count);

  // Alert if error rate spikes
  if (count > 10) {
    log("WARN", "HIGH_ERROR_RATE", {
      category,
      count,
      window: "5min",
    });
  }
}

// Reset counts periodically
setInterval(
  () => {
    errorCounts.clear();
  },
  5 * 60 * 1000,
); // 5 minutes
```

---

## Quick Reference

### Logging Checklist

- [ ] Log at system boundaries (entry/exit)
- [ ] Include correlation ID
- [ ] Use appropriate log level
- [ ] Include relevant context
- [ ] Sanitize sensitive data

### What to Log

- Application startup/shutdown
- Authentication events
- Business operations (CRUD)
- External API calls
- Errors with stack traces
- Performance warnings

### What NOT to Log

- Passwords/credentials
- Full personal data
- Payment information
- Session tokens
- API keys

### Log Levels

- `DEBUG`: Verbose development info
- `INFO`: Normal operations
- `WARN`: Recoverable issues
- `ERROR`: Failures needing attention

---

_Last Updated: January 17, 2026_
_Version: 1.0_
