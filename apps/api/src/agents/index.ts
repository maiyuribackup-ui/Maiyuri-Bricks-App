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

// Database Tools
export * from './tools/supabase-tools';

// Default export with all agents
import { summarize, summarizeNote } from './summarization';
import { score } from './scoring';
import { suggest } from './suggestion';
import { analyzeLead, analyzeLeadById } from './lead-manager';

export default {
  // Individual agents
  summarize,
  summarizeNote,
  score,
  suggest,

  // Orchestrator
  analyzeLead,
  analyzeLeadById,
};
