/**
 * Eco-Vastu Intelligent Floor Plan Generator
 *
 * Multi-agent pipeline for generating buildable, eco-friendly,
 * Vastu-compliant residential floor plans.
 *
 * @module planning
 */

// Types
export * from './types';

// Orchestrator
export { PlanningOrchestrator, type PipelineConfig, type PipelineInput } from './orchestrator';

// Agents
export {
  DiagramInterpreterAgent,
  createDiagramInterpreterAgent,
} from './agents/diagram-interpreter';

export {
  RegulationComplianceAgent,
  createRegulationComplianceAgent,
} from './agents/regulation-compliance';

export {
  ClientElicitationAgent,
  createClientElicitationAgent,
} from './agents/client-elicitation';

export {
  EngineerClarificationAgent,
  createEngineerClarificationAgent,
} from './agents/engineer-clarification';

export {
  VastuComplianceAgent,
  createVastuComplianceAgent,
} from './agents/vastu-compliance';

export {
  EcoDesignAgent,
  createEcoDesignAgent,
} from './agents/eco-design';

export {
  ArchitecturalZoningAgent,
  createArchitecturalZoningAgent,
} from './agents/architectural-zoning';

export {
  DimensioningAgent,
  createDimensioningAgent,
} from './agents/dimensioning';

export {
  EngineeringPlanAgent,
  createEngineeringPlanAgent,
} from './agents/engineering-plan';

export {
  DesignValidationAgent,
  createDesignValidationAgent,
} from './agents/design-validation';

// Base Agent
export { BaseAgent, type BaseAgentConfig, DEFAULT_AGENT_CONFIG } from './agents/base-agent';

// Errors
export {
  PipelineError,
  HaltError,
  ValidationError,
  AgentExecutionError,
  TokenBudgetError,
  InputValidationError,
  DesignValidationError,
} from './errors';

// Utilities
export { logger, PipelineLogger } from './utils/logger';
export {
  retryWithBackoff,
  isRetryableError,
  calculateDelay,
  type RetryConfig,
} from './utils/retry';
export {
  TokenBudget,
  tokenBudget,
  type TokenBudgetConfig,
} from './utils/token-budget';

// Validators
export {
  validateSchema,
  getSchema,
  type ValidationResult,
  type SchemaValidationError,
} from './validators/schema-validator';

// Prompts
export {
  SYSTEM_RULES,
  ECO_DESIGN_RULES,
  VASTU_GUIDELINES,
  REGULATION_GUIDELINES,
} from './prompts/system-rules';

import { PlanningOrchestrator as Orchestrator } from './orchestrator';
import { createDiagramInterpreterAgent as createDiagram } from './agents/diagram-interpreter';
import { createRegulationComplianceAgent as createRegulation } from './agents/regulation-compliance';
import { createClientElicitationAgent as createElicitation } from './agents/client-elicitation';
import { createEngineerClarificationAgent as createEngineer } from './agents/engineer-clarification';
import { createVastuComplianceAgent as createVastu } from './agents/vastu-compliance';
import { createEcoDesignAgent as createEco } from './agents/eco-design';
import { createArchitecturalZoningAgent as createZoning } from './agents/architectural-zoning';
import { createDimensioningAgent as createDimensioning } from './agents/dimensioning';
import { createEngineeringPlanAgent as createEngineering } from './agents/engineering-plan';
import { createDesignValidationAgent as createValidation } from './agents/design-validation';

/**
 * Create a new planning orchestrator with all agents registered
 *
 * @param config - Pipeline configuration overrides
 * @returns PlanningOrchestrator with all available agents registered
 */
export function createPlanningPipeline(
  config?: Partial<import('./orchestrator').PipelineConfig>
): Orchestrator {
  const orchestrator = new Orchestrator(config);

  // Register all available agents
  // Agent 1: Diagram Interpreter (Vision)
  orchestrator.registerAgent(createDiagram());

  // Agent 2: Regulation Compliance (Tamil Nadu building codes)
  orchestrator.registerAgent(createRegulation());

  // Agent 3: Client Elicitation (gather user requirements)
  orchestrator.registerAgent(createElicitation());

  // Agent 4: Engineer Clarification (structural strategy)
  orchestrator.registerAgent(createEngineer());

  // Agent 5: Vastu Compliance (room placement based on Vastu Shastra)
  orchestrator.registerAgent(createVastu());

  // Agent 6: Eco Design (non-negotiable sustainable elements)
  orchestrator.registerAgent(createEco());

  // Agent 7: Architectural Zoning (room zones and adjacency)
  orchestrator.registerAgent(createZoning());

  // Agent 8: Dimensioning (room sizes and space planning)
  orchestrator.registerAgent(createDimensioning());

  // Agent 9: Engineering Plan (wall system, staircase, plumbing, ventilation)
  orchestrator.registerAgent(createEngineering());

  // Agent 10: Design Validation (cross-validate against all constraints)
  orchestrator.registerAgent(createValidation());

  // Future agents will be registered here as they are implemented:
  // orchestrator.registerAgent(createNarrativeAgent());
  // orchestrator.registerAgent(createVisualizationAgent());

  return orchestrator;
}
