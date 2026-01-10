/**
 * Agent Result Types
 *
 * Standard result contract for all planning agents.
 * Ensures consistent output structure across the pipeline.
 */

/**
 * All agent names in the pipeline
 */
export type AgentName =
  | 'diagram-interpreter'
  | 'regulation-compliance'
  | 'client-elicitation'
  | 'engineer-clarification'
  | 'vastu-compliance'
  | 'eco-design'
  | 'architectural-zoning'
  | 'dimensioning'
  | 'engineering-plan'
  | 'design-validation'
  | 'narrative'
  | 'visualization';

/**
 * Agent platform assignment per PRD
 */
export const AGENT_PLATFORMS: Record<AgentName, 'vercel' | 'railway'> = {
  'diagram-interpreter': 'railway',      // Image processing, long-running
  'regulation-compliance': 'railway',    // Rule engine, stateful
  'client-elicitation': 'vercel',        // User-facing, lightweight
  'engineer-clarification': 'railway',   // Technical reasoning
  'vastu-compliance': 'railway',         // Complex zoning logic
  'eco-design': 'railway',               // Constraint enforcement
  'architectural-zoning': 'railway',     // Spatial logic
  'dimensioning': 'railway',             // Mathematical calculations
  'engineering-plan': 'railway',         // Structural logic
  'design-validation': 'railway',        // Cross-checking all data
  'narrative': 'vercel',                 // Text generation, lightweight
  'visualization': 'vercel',             // Prompt generation
};

/**
 * Open question requiring human input
 */
export interface OpenQuestion {
  agentSource: AgentName;
  questionId: string;
  question: string;
  type: 'mandatory' | 'optional';
  reason: string;
  category?: string;
  defaultValue?: string;
  options?: string[];
  answer?: string;
}

/**
 * Assumption made by an agent (must be tracked)
 */
export interface Assumption {
  agentSource: AgentName;
  assumptionId: string;
  assumption: string;
  risk: 'low' | 'medium' | 'high';
  basis?: string;
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

/**
 * Agent error details
 */
export interface AgentError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

/**
 * Generic result type for all agents
 *
 * @template T - The specific output type for the agent
 */
export interface AgentResult<T> {
  /** Whether the agent executed successfully */
  success: boolean;

  /** Which agent produced this result */
  agentName: AgentName;

  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Tokens consumed by this agent */
  tokensUsed: TokenUsage;

  /** The agent's output data (only present if success is true) */
  data?: T;

  /** Error details (only present if success is false) */
  error?: AgentError;

  /** Open questions requiring human input */
  openQuestions: OpenQuestion[];

  /** Assumptions made by the agent */
  assumptions: Assumption[];

  /** Optional metadata */
  meta?: {
    model?: string;
    cached?: boolean;
    retryCount?: number;
    [key: string]: unknown;
  };
}

/**
 * Create a successful agent result
 */
export function createSuccessResult<T>(
  agentName: AgentName,
  data: T,
  executionTimeMs: number,
  tokensUsed: TokenUsage,
  openQuestions: OpenQuestion[] = [],
  assumptions: Assumption[] = []
): AgentResult<T> {
  return {
    success: true,
    agentName,
    executionTimeMs,
    tokensUsed,
    data,
    openQuestions,
    assumptions,
  };
}

/**
 * Create a failed agent result
 */
export function createErrorResult<T>(
  agentName: AgentName,
  error: AgentError,
  executionTimeMs: number
): AgentResult<T> {
  return {
    success: false,
    agentName,
    executionTimeMs,
    tokensUsed: { input: 0, output: 0, total: 0 },
    error,
    openQuestions: [],
    assumptions: [],
  };
}

/**
 * Check if result has unresolved open questions
 */
export function hasOpenQuestions(result: AgentResult<unknown>): boolean {
  return result.openQuestions.some(q => !q.answer);
}

/**
 * Check if result has high-risk assumptions
 */
export function hasHighRiskAssumptions(result: AgentResult<unknown>): boolean {
  return result.assumptions.some(a => a.risk === 'high');
}

/**
 * Agent interface that all agents must implement
 *
 * This allows different agent implementations (BaseAgent and specialized agents)
 * to be registered with the orchestrator.
 */
export interface IAgent<TInput = unknown, TOutput = unknown> {
  /** Unique name identifying the agent */
  readonly agentName: AgentName;

  /**
   * Execute the agent with the given input and context
   */
  execute(
    input: TInput,
    context: import('./design-context').DesignContext
  ): Promise<AgentResult<TOutput>>;
}
