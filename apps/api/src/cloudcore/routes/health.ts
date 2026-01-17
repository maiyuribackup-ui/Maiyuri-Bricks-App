/**
 * Health Check Route Handlers
 */

import * as aiProvider from "../services/ai/provider";
import { supabase } from "../services/supabase";
import type { CloudCoreResult } from "../types";

export interface SchemaHealth {
  status: "valid" | "invalid" | "unknown";
  missingColumns?: string[];
  error?: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  services: {
    database: ServiceHealth;
    schema: SchemaHealth;
    claude: ServiceHealth;
    gemini: ServiceHealth;
  };
  uptime: number;
}

export interface ServiceHealth {
  status: "up" | "down" | "unknown";
  latency?: number;
  error?: string;
}

const startTime = Date.now();

/**
 * Get comprehensive health status
 */
export async function getHealth(): Promise<CloudCoreResult<HealthStatus>> {
  const timestamp = new Date().toISOString();

  // Check database
  const dbHealth = await checkDatabase();

  // Check schema (required columns exist)
  const schemaHealth = await checkSchema();

  // Check AI providers
  const aiHealth = await aiProvider.checkHealth();

  // Determine overall status
  let status: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (dbHealth.status === "down") {
    status = "unhealthy";
  } else if (schemaHealth.status === "invalid") {
    // Missing schema = unhealthy (will cause runtime errors)
    status = "unhealthy";
  } else if (!aiHealth.claude || !aiHealth.gemini) {
    status = "degraded";
  }

  return {
    success: true,
    data: {
      status,
      timestamp,
      version: "1.0.0",
      services: {
        database: dbHealth,
        schema: schemaHealth,
        claude: {
          status: aiHealth.claude ? "up" : "down",
        },
        gemini: {
          status: aiHealth.gemini ? "up" : "down",
        },
      },
      uptime: Math.floor((Date.now() - startTime) / 1000),
    },
  };
}

/**
 * Simple ping check
 */
export async function ping(): Promise<
  CloudCoreResult<{ pong: boolean; timestamp: string }>
> {
  return {
    success: true,
    data: {
      pong: true,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<ServiceHealth> {
  const startTime = Date.now();

  try {
    const { error } = await supabase.from("leads").select("id").limit(1);

    if (error) {
      return {
        status: "down",
        error: error.message,
      };
    }

    return {
      status: "up",
      latency: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: "down",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Required columns in the leads table
 * Update this list when adding new migrations
 */
const REQUIRED_LEAD_COLUMNS = [
  "id",
  "name",
  "contact",
  "source",
  "lead_type",
  "status",
  "assigned_staff",
  // Issue #3, #4, #5 - Classification and location fields
  "classification",
  "requirement_type",
  "site_region",
  "site_location",
  // Archive fields
  "is_archived",
  "archived_at",
  "archived_by",
  "archive_reason",
  // AI fields
  "ai_score",
  "ai_summary",
];

/**
 * Check database schema has required columns
 * This catches deployment issues where migrations weren't applied
 */
async function checkSchema(): Promise<SchemaHealth> {
  try {
    // Query a single lead with all expected columns
    const { data, error } = await supabase
      .from("leads")
      .select(REQUIRED_LEAD_COLUMNS.join(","))
      .limit(1);

    if (error) {
      // Check if error is about missing column
      const missingMatch = error.message.match(
        /column "(\w+)" does not exist/i,
      );
      if (missingMatch) {
        return {
          status: "invalid",
          missingColumns: [missingMatch[1]],
          error: `Missing column: ${missingMatch[1]} - run pending migrations`,
        };
      }

      // Check for multiple missing columns pattern
      if (error.message.includes("does not exist")) {
        return {
          status: "invalid",
          error: error.message,
        };
      }

      return {
        status: "unknown",
        error: error.message,
      };
    }

    return {
      status: "valid",
    };
  } catch (error) {
    return {
      status: "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get kernel configurations
 */
export async function getKernelInfo(): Promise<
  CloudCoreResult<{
    kernels: Array<{
      name: string;
      description: string;
      version: string;
    }>;
  }>
> {
  return {
    success: true,
    data: {
      kernels: [
        {
          name: "LeadAnalyst",
          description: "Analyzes leads and provides actionable insights",
          version: "1.0.0",
        },
        {
          name: "KnowledgeCurator",
          description: "Manages knowledge base and semantic search",
          version: "1.0.0",
        },
        {
          name: "ConversionPredictor",
          description: "Predicts lead conversion probability",
          version: "1.0.0",
        },
        {
          name: "Coach",
          description: "Provides staff performance coaching and insights",
          version: "1.0.0",
        },
      ],
    },
  };
}

export default {
  getHealth,
  ping,
  getKernelInfo,
};
