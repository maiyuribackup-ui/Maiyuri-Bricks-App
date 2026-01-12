// Agent Orchestrator - Main entry point for AI agents

// Re-export types
export * from './types';

// Re-export utilities
export { successResult, errorResult, parseJsonResponse } from './utils';

// Summarization Agent
export { summarize, summarizeNote } from './summarization';

// Scoring Agent
export { score } from './scoring';

// Suggestion Agent
export { suggest } from './suggestion';

// Lead Manager (Orchestrator)
export { analyzeLead, analyzeLeadById } from './lead-manager';

// Report Agent
export { generateReport, generateQuickReport } from './reporting';
export type { ReportInput, ReportOutput, ReportSection, ReportMetrics } from './reporting';

// Notification Agent
export {
  createNotification,
  checkDueNotifications,
  generateDailyDigest,
  generateWeeklySummary,
} from './notifications';
export type {
  NotificationInput,
  NotificationOutput,
  NotificationBatch,
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from './notifications';

// Database Tools
export * from './tools/supabase-tools';

// Default export with all agents
import { summarize, summarizeNote } from './summarization';
import { score } from './scoring';
import { suggest } from './suggestion';
import { analyzeLead, analyzeLeadById } from './lead-manager';
import { generateReport, generateQuickReport } from './reporting';
import {
  createNotification,
  checkDueNotifications,
  generateDailyDigest,
  generateWeeklySummary,
} from './notifications';

export default {
  // Individual agents
  summarize,
  summarizeNote,
  score,
  suggest,

  // Report Agent
  generateReport,
  generateQuickReport,

  // Notification Agent
  createNotification,
  checkDueNotifications,
  generateDailyDigest,
  generateWeeklySummary,

  // Orchestrator
  analyzeLead,
  analyzeLeadById,
};
