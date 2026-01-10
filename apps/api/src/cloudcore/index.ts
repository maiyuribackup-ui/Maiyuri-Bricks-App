/**
 * CloudCore - AI Backend Infrastructure
 *
 * This is the main entry point for the CloudCore backend.
 * All intelligence lives here - the frontend is a stateless consumer.
 *
 * Architecture:
 * - Kernels: Agent modules (Lead Analyst, Knowledge Curator, Coach)
 * - Services: Core services (AI providers, embeddings, memory, transcription)
 * - Contracts: API contracts (Zod schemas for request/response validation)
 * - Routes: HTTP route handlers
 */

// Kernels - namespaced to avoid collisions
import * as leadAnalyst from './kernels/lead-analyst';
import * as knowledgeCurator from './kernels/knowledge-curator';
import * as conversionPredictor from './kernels/conversion-predictor';
import * as coach from './kernels/coach';
import * as kpiScorer from './kernels/kpi-scorer';
import * as salesCoach from './kernels/sales-coach';
import * as archiveCurator from './kernels/archive-curator';
import * as discountAdvisor from './kernels/discount-advisor';

export const kernels = {
  leadAnalyst,
  knowledgeCurator,
  conversionPredictor,
  coach,
  kpiScorer,
  salesCoach,
  archiveCurator,
  discountAdvisor,
};

// Services - namespaced to avoid collisions
import * as claude from './services/ai/claude';
import * as gemini from './services/ai/gemini';
import * as aiProvider from './services/ai/provider';
import * as embeddings from './services/embeddings';
import * as memory from './services/memory';
import * as transcription from './services/transcription';
import * as supabase from './services/supabase';

export const services = {
  ai: {
    claude,
    gemini,
    provider: aiProvider,
  },
  embeddings,
  memory,
  transcription,
  supabase,
};

// Routes - namespaced
import * as leadsRoutes from './routes/leads';
import * as notesRoutes from './routes/notes';
import * as analysisRoutes from './routes/analysis';
import * as knowledgeRoutes from './routes/knowledge';
import * as coachingRoutes from './routes/coaching';
import * as transcriptionRoutes from './routes/transcription';
import * as healthRoutes from './routes/health';
import * as kpiRoutes from './routes/kpi';

export const routes = {
  leads: leadsRoutes,
  notes: notesRoutes,
  analysis: analysisRoutes,
  knowledge: knowledgeRoutes,
  coaching: coachingRoutes,
  transcription: transcriptionRoutes,
  health: healthRoutes,
  kpi: kpiRoutes,
};

// Contracts - export as namespace to avoid collisions with types
import * as contractSchemas from './contracts';
export { contractSchemas as contracts };

// Types - export as namespace to avoid collisions with contracts
import * as coreTypes from './types';
export { coreTypes as types };
