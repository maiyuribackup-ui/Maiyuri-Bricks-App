# Eco-Vastu Intelligent Floor Plan Generator
## Claude SDK Implementation Plan

**Generated**: 2026-01-10
**Architect**: Claude SDK Implementation Architect Agent
**Principles**: SOLID, Clean Code, TDD, DRY, SRP
**PRD Version**: v1.0

---

## 1. Executive Summary

### 1.1 Product Vision
Generate **accurate, buildable, eco-friendly, and Vastu-compliant residential floor plans** from rough site sketches using a multi-agent AI architecture.

### 1.2 Target Users
- Individual homeowners building independent houses
- Eco-conscious builders and contractors
- Small architecture firms
- (Future) Real estate developers

### 1.3 Core Design Principles
1. **Deterministic over creative** - No hallucination, no guessing
2. **Eco-design is non-negotiable** - Courtyard, ventilation, rainwater harvesting
3. **Vastu guides but does not override legality** - Compliance first
4. **Every output must be buildable** - Construction-ready
5. **Explainability is mandatory** - Clear rationale for all decisions

### 1.4 Pipeline Overview
This plan defines a **12-agent pipeline** for architectural house planning. Each agent is specialized, deterministic, and follows strict input/output contracts. The system enforces a **human-in-the-loop** pattern: if any agent returns `open_questions`, the pipeline halts until resolved.

---

## 2. Orchestration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRATION PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐                                                         │
│  │ 1. Diagram      │──────────────────────────────────────────────┐         │
│  │    Interpreter  │                                               │         │
│  └────────┬────────┘                                               │         │
│           │ plot, setbacks, road                                   │         │
│           ▼                                                        │         │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │
│  │ 2. Regulation   │     │ 4. Engineer     │     │ 6. Eco-Design   │        │
│  │    Compliance   │     │    Clarify      │     │    Enforce      │        │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘        │
│           │                       │                       │                  │
│           ▼                       │                       │                  │
│  ┌─────────────────┐              │                       │                  │
│  │ 3. Client       │              │                       │                  │
│  │    Elicitation  │◄─────────────┼───────────────────────┘                  │
│  └────────┬────────┘              │                                          │
│           │                       │                                          │
│           ▼                       │                                          │
│  ┌─────────────────┐              │                                          │
│  │ 5. Vastu        │              │                                          │
│  │    Compliance   │              │                                          │
│  └────────┬────────┘              │                                          │
│           │                       │                                          │
│           ▼                       │                                          │
│  ┌─────────────────┐              │                                          │
│  │ 7. Architectural│◄─────────────┘                                          │
│  │    Zoning       │                                                         │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐                                 │
│  │ 8. Dimensioning │────▶│ 9. Engineering  │                                 │
│  │    & Planning   │     │    Plan         │                                 │
│  └────────┬────────┘     └────────┬────────┘                                 │
│           │                       │                                          │
│           └───────────┬───────────┘                                          │
│                       ▼                                                      │
│              ┌─────────────────┐                                             │
│              │ 10. Design      │                                             │
│              │     Validation  │                                             │
│              └────────┬────────┘                                             │
│                       │                                                      │
│           ┌───────────┴───────────┐                                          │
│           ▼                       ▼                                          │
│  ┌─────────────────┐     ┌─────────────────┐                                 │
│  │ 11. Narrative   │     │ 12. Visualize   │                                 │
│  │     Explain     │     │     Prompts     │                                 │
│  └─────────────────┘     └─────────────────┘                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

                    ⚠️ HALT ON open_questions ⚠️
         Any agent returning open_questions stops the pipeline
              until human resolution is provided.
```

---

## 3. Module Breakdown

### 3.1 Directory Structure (SOLID Compliant)

```
apps/api/src/
├── agents/
│   ├── planning/
│   │   ├── index.ts                    # Public exports
│   │   ├── orchestrator.ts             # Pipeline controller (SRP)
│   │   ├── types/
│   │   │   ├── index.ts                # All type exports
│   │   │   ├── design-context.ts       # DesignContext schema
│   │   │   ├── agent-result.ts         # Common result types
│   │   │   └── contracts.ts            # Input/Output contracts
│   │   ├── agents/
│   │   │   ├── base-agent.ts           # Abstract base (DRY)
│   │   │   ├── diagram-interpreter.ts  # Agent 1
│   │   │   ├── regulation-compliance.ts # Agent 2
│   │   │   ├── client-elicitation.ts   # Agent 3
│   │   │   ├── engineer-clarification.ts # Agent 4
│   │   │   ├── vastu-compliance.ts     # Agent 5
│   │   │   ├── eco-design.ts           # Agent 6
│   │   │   ├── architectural-zoning.ts # Agent 7
│   │   │   ├── dimensioning.ts         # Agent 8
│   │   │   ├── engineering-plan.ts     # Agent 9
│   │   │   ├── design-validation.ts    # Agent 10
│   │   │   ├── narrative.ts            # Agent 11
│   │   │   └── visualization.ts        # Agent 12
│   │   ├── prompts/
│   │   │   ├── system-rules.ts         # Global prompt contract
│   │   │   └── agent-prompts.ts        # Per-agent prompts
│   │   ├── validators/
│   │   │   ├── schema-validator.ts     # JSON schema validation
│   │   │   └── constraint-checker.ts   # Business rule validation
│   │   ├── utils/
│   │   │   ├── retry.ts                # Retry logic with backoff
│   │   │   ├── logger.ts               # Structured logging
│   │   │   └── token-budget.ts         # Token management
│   │   └── __tests__/
│   │       ├── unit/
│   │       │   └── *.test.ts
│   │       ├── integration/
│   │       │   └── pipeline.test.ts
│   │       └── mocks/
│   │           └── claude-sdk.mock.ts
```

### 3.2 Module Responsibilities (SRP)

| Module | Single Responsibility |
|--------|----------------------|
| `orchestrator.ts` | Pipeline flow control, halt on open_questions |
| `base-agent.ts` | Common agent interface, Claude SDK wrapper |
| `schema-validator.ts` | Validate JSON output against schemas |
| `constraint-checker.ts` | Business rule validation |
| `retry.ts` | Exponential backoff retry logic |
| `token-budget.ts` | Track and limit token usage |
| `design-context.ts` | Central state accumulator |

---

## 4. Input/Output Contracts

### 4.1 DesignContext (Central State Object)

```typescript
// types/design-context.ts

interface DesignContext {
  // Session metadata
  sessionId: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'in_progress' | 'halted' | 'completed' | 'failed';
  currentAgent: AgentName | null;
  haltReason?: string;

  // Agent 1: Diagram Interpretation
  plot?: {
    width: number;
    depth: number;
    area: number;
    unit: 'feet' | 'meters';
  };
  setbacks?: {
    front: number;
    rear: number;
    left: number;
    right: number;
  };
  road?: {
    side: 'north' | 'south' | 'east' | 'west';
    width: number;
  };
  annotations?: string[];
  diagramConfidence?: number;

  // Agent 2: Regulation
  buildableEnvelope?: {
    width: number;
    depth: number;
    area: number;
    maxHeight?: number;
    maxFloors?: number;
  };
  constraints?: string[];
  violations?: string[];

  // Agent 3: Client Requirements
  clientAnswers?: Record<string, string>;
  pendingQuestions?: Question[];

  // Agent 4: Engineer Clarification
  structuralStrategy?: 'load-bearing' | 'rcc' | 'hybrid';
  engineeringRisks?: string[];

  // Agent 5: Vastu
  vastuZones?: Record<string, string[]>;
  vastuConflicts?: string[];
  vastuDeviations?: string[];

  // Agent 6: Eco-Design
  ecoMandatory?: string[];
  energyStrategy?: Record<string, unknown>;
  waterStrategy?: Record<string, unknown>;
  materialPreferences?: string[];

  // Agent 7: Zoning
  zones?: {
    public: string[];
    semiPrivate: string[];
    private: string[];
    service: string[];
  };
  adjacencyRules?: string[];
  circulationLogic?: string;

  // Agent 8: Dimensioning
  rooms?: Room[];
  courtyardSize?: string;
  totalBuiltUp?: string;

  // Agent 9: Engineering Plan
  wallSystem?: Record<string, unknown>;
  staircase?: Record<string, unknown>;
  plumbingStrategy?: Record<string, unknown>;
  ventilationShafts?: string[];

  // Agent 10: Validation
  validationStatus?: 'PASS' | 'FAIL';
  validationIssues?: Issue[];
  validationSeverity?: 'low' | 'medium' | 'high';

  // Agent 11: Narrative
  designRationale?: string;
  ecoSummary?: string;
  vastuSummary?: string;

  // Agent 12: Visualization
  renderPrompts?: {
    courtyard?: string;
    exterior?: string;
    interior?: string;
  };

  // Aggregated open questions (halt trigger)
  openQuestions: OpenQuestion[];
  assumptions: Assumption[];
}

interface OpenQuestion {
  agentSource: AgentName;
  questionId: string;
  question: string;
  type: 'mandatory' | 'optional';
  reason: string;
  answer?: string;
}

interface Assumption {
  agentSource: AgentName;
  assumption: string;
  risk: 'low' | 'medium' | 'high';
}
```

### 4.2 Agent Result Contract

```typescript
// types/agent-result.ts

interface AgentResult<T> {
  success: boolean;
  agentName: AgentName;
  executionTimeMs: number;
  tokensUsed: {
    input: number;
    output: number;
  };
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  openQuestions: OpenQuestion[];
  assumptions: Assumption[];
}

type AgentName =
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
```

---

## 5. Base Agent Implementation (DRY)

```typescript
// agents/base-agent.ts

import Anthropic from '@anthropic-ai/sdk';
import { AgentResult, AgentName, DesignContext } from '../types';
import { validateSchema } from '../validators/schema-validator';
import { retryWithBackoff } from '../utils/retry';
import { logger } from '../utils/logger';
import { SYSTEM_RULES } from '../prompts/system-rules';

export abstract class BaseAgent<TInput, TOutput> {
  protected anthropic: Anthropic;
  protected abstract agentName: AgentName;
  protected abstract outputSchema: object;
  protected abstract systemPrompt: string;

  constructor() {
    this.anthropic = new Anthropic();
  }

  // Template method pattern (Open/Closed Principle)
  async execute(
    input: TInput,
    context: DesignContext
  ): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();

    try {
      logger.info(`[${this.agentName}] Starting execution`, { sessionId: context.sessionId });

      // 1. Validate input
      this.validateInput(input);

      // 2. Build prompt
      const prompt = this.buildPrompt(input, context);

      // 3. Call Claude with retry
      const response = await retryWithBackoff(
        () => this.callClaude(prompt),
        { maxRetries: 3, baseDelayMs: 1000 }
      );

      // 4. Parse and validate output
      const parsed = this.parseResponse(response);
      const validated = validateSchema(parsed, this.outputSchema);

      // 5. Extract open questions
      const openQuestions = this.extractOpenQuestions(validated);
      const assumptions = this.extractAssumptions(validated);

      logger.info(`[${this.agentName}] Completed`, {
        openQuestions: openQuestions.length,
        executionTimeMs: Date.now() - startTime
      });

      return {
        success: true,
        agentName: this.agentName,
        executionTimeMs: Date.now() - startTime,
        tokensUsed: {
          input: response.usage?.input_tokens || 0,
          output: response.usage?.output_tokens || 0
        },
        data: validated,
        openQuestions,
        assumptions
      };

    } catch (error) {
      logger.error(`[${this.agentName}] Failed`, { error });

      return {
        success: false,
        agentName: this.agentName,
        executionTimeMs: Date.now() - startTime,
        tokensUsed: { input: 0, output: 0 },
        error: {
          code: error.code || 'AGENT_ERROR',
          message: error.message,
          retryable: this.isRetryable(error)
        },
        openQuestions: [],
        assumptions: []
      };
    }
  }

  protected async callClaude(prompt: string): Promise<Anthropic.Message> {
    return this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `${SYSTEM_RULES}\n\n${this.systemPrompt}`,
      messages: [{ role: 'user', content: prompt }]
    });
  }

  // Abstract methods for subclasses (Liskov Substitution)
  protected abstract validateInput(input: TInput): void;
  protected abstract buildPrompt(input: TInput, context: DesignContext): string;
  protected abstract parseResponse(response: Anthropic.Message): TOutput;

  protected extractOpenQuestions(data: TOutput): OpenQuestion[] {
    const questions = (data as any).open_questions || [];
    return questions.map((q: any) => ({
      agentSource: this.agentName,
      questionId: q.id || `${this.agentName}-${Date.now()}`,
      question: q.question || q,
      type: q.type || 'mandatory',
      reason: q.reason || 'Clarification needed'
    }));
  }

  protected extractAssumptions(data: TOutput): Assumption[] {
    const assumptions = (data as any).assumptions || [];
    return assumptions.map((a: any) => ({
      agentSource: this.agentName,
      assumption: typeof a === 'string' ? a : a.assumption,
      risk: a.risk || 'medium'
    }));
  }

  protected isRetryable(error: any): boolean {
    const retryableCodes = ['rate_limit', 'overloaded', 'timeout'];
    return retryableCodes.includes(error.code);
  }
}
```

---

## 6. Orchestrator Implementation

```typescript
// orchestrator.ts

import { DesignContext, AgentResult, AgentName } from './types';
import { DiagramInterpreterAgent } from './agents/diagram-interpreter';
import { RegulationComplianceAgent } from './agents/regulation-compliance';
// ... import all agents
import { logger } from './utils/logger';
import { PipelineError, HaltError } from './errors';

interface PipelineConfig {
  maxTokenBudget: number;
  timeoutMs: number;
  enableParallelStages: boolean;
}

export class PlanningOrchestrator {
  private agents: Map<AgentName, BaseAgent<any, any>>;
  private config: PipelineConfig;

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = {
      maxTokenBudget: 100000,
      timeoutMs: 300000, // 5 minutes
      enableParallelStages: true,
      ...config
    };

    this.agents = new Map([
      ['diagram-interpreter', new DiagramInterpreterAgent()],
      ['regulation-compliance', new RegulationComplianceAgent()],
      // ... all agents
    ]);
  }

  async runPipeline(
    input: { imageUrl?: string; imageBase64?: string },
    existingContext?: Partial<DesignContext>
  ): Promise<DesignContext> {

    const context: DesignContext = {
      sessionId: existingContext?.sessionId || crypto.randomUUID(),
      createdAt: existingContext?.createdAt || new Date(),
      updatedAt: new Date(),
      status: 'in_progress',
      currentAgent: null,
      openQuestions: existingContext?.openQuestions || [],
      assumptions: existingContext?.assumptions || [],
      ...existingContext
    };

    try {
      // Stage 1: Diagram Interpretation (entry point)
      await this.executeStage(context, 'diagram-interpreter', input);
      if (this.shouldHalt(context)) return this.halt(context);

      // Stage 2: Parallel - Regulation, Engineer, Eco
      if (this.config.enableParallelStages) {
        await Promise.all([
          this.executeStage(context, 'regulation-compliance', context),
          this.executeStage(context, 'engineer-clarification', context),
          this.executeStage(context, 'eco-design', context)
        ]);
      } else {
        await this.executeStage(context, 'regulation-compliance', context);
        await this.executeStage(context, 'engineer-clarification', context);
        await this.executeStage(context, 'eco-design', context);
      }
      if (this.shouldHalt(context)) return this.halt(context);

      // Stage 3: Client Elicitation
      await this.executeStage(context, 'client-elicitation', context);
      if (this.shouldHalt(context)) return this.halt(context);

      // Stage 4: Vastu Compliance
      await this.executeStage(context, 'vastu-compliance', context);
      if (this.shouldHalt(context)) return this.halt(context);

      // Stage 5: Architectural Zoning
      await this.executeStage(context, 'architectural-zoning', context);
      if (this.shouldHalt(context)) return this.halt(context);

      // Stage 6: Dimensioning
      await this.executeStage(context, 'dimensioning', context);
      if (this.shouldHalt(context)) return this.halt(context);

      // Stage 7: Engineering Plan
      await this.executeStage(context, 'engineering-plan', context);
      if (this.shouldHalt(context)) return this.halt(context);

      // Stage 8: Validation (critical gate)
      await this.executeStage(context, 'design-validation', context);
      if (context.validationStatus === 'FAIL') {
        context.status = 'failed';
        context.haltReason = 'Design validation failed';
        return context;
      }

      // Stage 9: Parallel - Narrative & Visualization
      await Promise.all([
        this.executeStage(context, 'narrative', context),
        this.executeStage(context, 'visualization', context)
      ]);

      context.status = 'completed';
      return context;

    } catch (error) {
      context.status = 'failed';
      context.haltReason = error.message;
      logger.error('Pipeline failed', { error, sessionId: context.sessionId });
      throw new PipelineError(error.message, context);
    }
  }

  private async executeStage<T>(
    context: DesignContext,
    agentName: AgentName,
    input: T
  ): Promise<void> {
    context.currentAgent = agentName;
    context.updatedAt = new Date();

    const agent = this.agents.get(agentName);
    if (!agent) throw new Error(`Agent not found: ${agentName}`);

    const result = await agent.execute(input, context);

    if (!result.success) {
      throw new PipelineError(`Agent ${agentName} failed: ${result.error?.message}`, context);
    }

    // Merge result into context
    this.mergeResult(context, agentName, result);

    // Accumulate open questions
    context.openQuestions.push(...result.openQuestions);
    context.assumptions.push(...result.assumptions);
  }

  private shouldHalt(context: DesignContext): boolean {
    // CRITICAL: Halt if ANY open questions exist
    return context.openQuestions.some(q => !q.answer);
  }

  private halt(context: DesignContext): DesignContext {
    context.status = 'halted';
    context.haltReason = 'Awaiting human resolution of open questions';
    logger.info('Pipeline halted', {
      sessionId: context.sessionId,
      openQuestions: context.openQuestions.filter(q => !q.answer)
    });
    return context;
  }

  // Resume pipeline after human answers
  async resumePipeline(
    context: DesignContext,
    answers: Record<string, string>
  ): Promise<DesignContext> {
    // Apply answers to open questions
    for (const q of context.openQuestions) {
      if (answers[q.questionId]) {
        q.answer = answers[q.questionId];
      }
    }

    // Check if all mandatory questions answered
    const unanswered = context.openQuestions.filter(
      q => q.type === 'mandatory' && !q.answer
    );

    if (unanswered.length > 0) {
      context.haltReason = `${unanswered.length} mandatory questions still unanswered`;
      return context;
    }

    // Resume from last agent
    context.status = 'in_progress';
    return this.runPipeline({}, context);
  }

  private mergeResult(
    context: DesignContext,
    agentName: AgentName,
    result: AgentResult<any>
  ): void {
    // Agent-specific merging logic
    switch (agentName) {
      case 'diagram-interpreter':
        context.plot = result.data.plot;
        context.setbacks = result.data.setbacks;
        context.road = result.data.road;
        context.annotations = result.data.annotations;
        context.diagramConfidence = result.data.confidence;
        break;
      case 'regulation-compliance':
        context.buildableEnvelope = result.data.buildable_envelope;
        context.constraints = result.data.constraints;
        context.violations = result.data.violations;
        break;
      // ... handle all agents
    }
  }
}
```

---

## 7. Error Handling & Retry Logic

```typescript
// utils/retry.ts

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  exponentialBase?: number;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  const {
    maxRetries,
    baseDelayMs,
    maxDelayMs = 30000,
    exponentialBase = 2
  } = config;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(exponentialBase, attempt),
        maxDelayMs
      );

      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries}`, {
        delay,
        error: error.message
      });

      await sleep(delay);
    }
  }

  throw lastError!;
}

function isRetryableError(error: any): boolean {
  // Anthropic API retryable errors
  if (error.status === 429) return true; // Rate limit
  if (error.status === 529) return true; // Overloaded
  if (error.status >= 500) return true;  // Server errors
  if (error.code === 'ECONNRESET') return true;
  if (error.code === 'ETIMEDOUT') return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

```typescript
// errors.ts

export class PipelineError extends Error {
  constructor(
    message: string,
    public context: DesignContext
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

export class HaltError extends Error {
  constructor(
    public openQuestions: OpenQuestion[],
    public context: DesignContext
  ) {
    super('Pipeline halted for human input');
    this.name = 'HaltError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public schemaErrors: object[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AgentError extends Error {
  constructor(
    message: string,
    public agentName: AgentName,
    public retryable: boolean
  ) {
    super(message);
    this.name = 'AgentError';
  }
}
```

---

## 8. Deployment Strategy

### 8.1 Platform Assignment (From PRD)

| # | Agent | Platform | Reason |
|---|-------|----------|--------|
| 1 | Diagram Interpretation | **Railway** | Image processing, long-running |
| 2 | Regulation & Compliance | **Railway** | Rule engine, stateful |
| 3 | Client Requirement Elicitation | **Vercel** | User-facing, lightweight |
| 4 | Engineer Clarification | **Railway** | Technical reasoning |
| 5 | Vastu Compliance | **Railway** | Complex zoning logic |
| 6 | Eco-Design | **Railway** | Constraint enforcement |
| 7 | Architectural Zoning | **Railway** | Spatial logic |
| 8 | Dimensioning | **Railway** | Mathematical calculations |
| 9 | Engineering Plan | **Railway** | Structural logic |
| 10 | Design Validation | **Railway** | Cross-checking all data |
| 11 | Narrative | **Vercel** | Text generation, lightweight |
| 12 | Visualization Prompt | **Vercel** | Prompt generation |

### 8.2 Platform Comparison

| Factor | Vercel | Railway | Assignment |
|--------|--------|---------|------------|
| Long-running tasks | ❌ 60s limit | ✅ No limit | Heavy agents → Railway |
| User interaction | ✅ Optimized | ⚠️ Separate | UI → Vercel |
| State management | ⚠️ Stateless | ✅ Stateful | Orchestrator → Railway |
| Cold starts | ⚠️ Slow | ✅ Always warm | Critical path → Railway |
| Cost | 💰 Higher | 💰 Lower | Balance workload |

### 8.3 Hybrid Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         VERCEL                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Next.js Frontend                       │  │
│  │  - UI for sketch upload                                   │  │
│  │  - Question/Answer interface                              │  │
│  │  - Design visualization                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              │ API Calls                        │
│                              ▼                                  │
└────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTPS / WebSocket
                               ▼
┌────────────────────────────────────────────────────────────────┐
│                        RAILWAY                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Agent Pipeline Service                       │  │
│  │  - PlanningOrchestrator                                   │  │
│  │  - All 12 agents                                          │  │
│  │  - Long-running execution                                 │  │
│  │  - WebSocket progress updates                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    PostgreSQL                             │  │
│  │  - DesignContext persistence                              │  │
│  │  - Session state                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                               │
                               │ Supabase
                               ▼
┌────────────────────────────────────────────────────────────────┐
│                       SUPABASE                                  │
│  - User authentication                                          │
│  - Real-time subscriptions                                      │
│  - File storage (sketches)                                      │
└────────────────────────────────────────────────────────────────┘
```

### 8.3 Railway Deployment Config

```yaml
# railway.toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "bun run start"
healthcheckPath = "/health"
healthcheckTimeout = 30

[service]
name = "planning-agents"
replicas = 2

[[services]]
name = "web"
internalPort = 3001
```

---

## 9. Testing Plan

### 9.1 Unit Tests (per agent)

```typescript
// __tests__/unit/diagram-interpreter.test.ts

import { DiagramInterpreterAgent } from '../../agents/diagram-interpreter';
import { mockClaudeResponse } from '../mocks/claude-sdk.mock';

describe('DiagramInterpreterAgent', () => {
  let agent: DiagramInterpreterAgent;

  beforeEach(() => {
    agent = new DiagramInterpreterAgent();
  });

  describe('execute', () => {
    it('should extract plot dimensions from valid image', async () => {
      mockClaudeResponse({
        plot: { width: 30, depth: 40, area: 1200, unit: 'feet' },
        setbacks: { front: 5, rear: 5, left: 3, right: 3 },
        road: { side: 'north', width: 30 },
        confidence: 0.95,
        open_questions: []
      });

      const result = await agent.execute(
        { imageBase64: 'base64...' },
        createMockContext()
      );

      expect(result.success).toBe(true);
      expect(result.data.plot.width).toBe(30);
      expect(result.openQuestions).toHaveLength(0);
    });

    it('should return open_questions for unclear dimensions', async () => {
      mockClaudeResponse({
        plot: { width: null, depth: 40 },
        confidence: 0.5,
        open_questions: [
          { id: 'Q1', question: 'Plot width is unclear', type: 'mandatory' }
        ]
      });

      const result = await agent.execute(
        { imageBase64: 'blurry...' },
        createMockContext()
      );

      expect(result.success).toBe(true);
      expect(result.openQuestions).toHaveLength(1);
      expect(result.openQuestions[0].type).toBe('mandatory');
    });

    it('should fail gracefully on invalid response', async () => {
      mockClaudeResponse('invalid json');

      const result = await agent.execute(
        { imageBase64: 'base64...' },
        createMockContext()
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PARSE_ERROR');
    });
  });
});
```

### 9.2 Integration Tests

```typescript
// __tests__/integration/pipeline.test.ts

describe('PlanningOrchestrator', () => {
  let orchestrator: PlanningOrchestrator;

  beforeEach(() => {
    orchestrator = new PlanningOrchestrator({
      enableParallelStages: false // Deterministic for testing
    });
  });

  describe('runPipeline', () => {
    it('should complete full pipeline with valid input', async () => {
      const context = await orchestrator.runPipeline({
        imageBase64: validSketchBase64
      });

      expect(context.status).toBe('completed');
      expect(context.plot).toBeDefined();
      expect(context.buildableEnvelope).toBeDefined();
      expect(context.rooms).toBeDefined();
      expect(context.validationStatus).toBe('PASS');
    });

    it('should halt on open_questions and resume correctly', async () => {
      // First run - should halt
      let context = await orchestrator.runPipeline({
        imageBase64: ambiguousSketchBase64
      });

      expect(context.status).toBe('halted');
      expect(context.openQuestions.length).toBeGreaterThan(0);

      // Resume with answers
      context = await orchestrator.resumePipeline(context, {
        'Q1': '30 feet',
        'Q2': 'North facing'
      });

      expect(context.status).toBe('completed');
    });

    it('should fail gracefully when validation fails', async () => {
      // Mock validation to fail
      mockValidationFail();

      const context = await orchestrator.runPipeline({
        imageBase64: invalidSketchBase64
      });

      expect(context.status).toBe('failed');
      expect(context.validationStatus).toBe('FAIL');
    });
  });
});
```

### 9.3 Edge Case Tests

```typescript
// __tests__/integration/edge-cases.test.ts

describe('Edge Cases', () => {
  it('should handle missing dimensions gracefully', async () => {
    // Sketch with no visible measurements
  });

  it('should detect conflicting eco/vastu constraints', async () => {
    // East-facing courtyard violates eco preference for central courtyard
  });

  it('should handle incomplete user answers', async () => {
    // User provides partial answers
  });

  it('should retry on rate limits', async () => {
    // Mock 429 response
  });

  it('should not exceed token budget', async () => {
    // Large context accumulation
  });

  it('should handle image processing failures', async () => {
    // Corrupted image
  });

  it('should maintain consistency across pipeline', async () => {
    // Verify Agent 10 catches inconsistencies
  });
});
```

---

## 10. Risk Mitigation

### 10.1 Hallucination Prevention

| Risk | Mitigation |
|------|------------|
| Agent invents data | System prompt explicitly forbids; Schema validation rejects unknown fields |
| Missing info ignored | `open_questions` extraction + pipeline halt |
| Assumptions unmarked | Dedicated `assumptions` array; logged for audit |
| Wrong confidence | Validation agent cross-checks all data |

### 10.2 Pipeline Failure Recovery

```typescript
// Recovery strategies

interface RecoveryConfig {
  checkpointInterval: number; // Save state every N agents
  maxRollbacks: number;       // Max rollback attempts
  deadLetterQueue: boolean;   // Store failed contexts for manual review
}

class PipelineRecovery {
  // Checkpoint: Save context to database after each agent
  async checkpoint(context: DesignContext): Promise<void> {
    await db.designContexts.upsert(context.sessionId, context);
  }

  // Rollback: Restore from last successful checkpoint
  async rollback(sessionId: string, toAgent: AgentName): Promise<DesignContext> {
    const context = await db.designContexts.findOne(sessionId);
    // Clear data from failed agents
    return this.clearDownstream(context, toAgent);
  }

  // Dead letter: Store for manual intervention
  async deadLetter(context: DesignContext, error: Error): Promise<void> {
    await db.failedPipelines.insert({
      context,
      error: error.message,
      stack: error.stack,
      timestamp: new Date()
    });
  }
}
```

### 10.3 Token Budget Management

```typescript
// utils/token-budget.ts

class TokenBudget {
  private used: number = 0;
  private limit: number;

  constructor(limit: number = 100000) {
    this.limit = limit;
  }

  track(input: number, output: number): void {
    this.used += input + output;
  }

  canProceed(estimated: number): boolean {
    return (this.used + estimated) <= this.limit;
  }

  remaining(): number {
    return this.limit - this.used;
  }

  shouldSummarize(): boolean {
    return this.used > this.limit * 0.7; // 70% threshold
  }
}
```

---

## 11. Mandatory Design Constraints (From PRD)

These constraints are **non-negotiable** and must be enforced by the Eco-Design Agent:

### 11.1 Eco-Design Requirements
| Constraint | Description | Agent Enforcing |
|------------|-------------|-----------------|
| Central Courtyard (Mutram) | Open-to-sky courtyard mandatory | Eco-Design, Validation |
| Veranda | Transition space between inside/outside | Eco-Design, Zoning |
| Cross Ventilation | Natural airflow through all rooms | Eco-Design, Engineering |
| West Heat Minimization | Minimize windows/openings on west wall | Eco-Design, Zoning |
| Rainwater Harvesting | Provision for water collection | Engineering Plan |
| Expansion-Ready | Structure allows future additions | Engineering Plan |

### 11.2 Compliance Requirements
| Constraint | Description | Agent Enforcing |
|------------|-------------|-----------------|
| Setback Adherence | Must respect legal setbacks | Regulation |
| Staircase Placement | Per local building codes | Engineering Plan |
| Toilet Zoning | Away from kitchen, proper drainage | Architectural Zoning |
| Structural Feasibility | Load-bearing or RCC viable | Engineer Clarification |

### 11.3 Acceptance Criteria (Definition of Done)
```typescript
const ACCEPTANCE_CRITERIA = {
  // From PRD Section 11
  missingDimensionsTriggerClarification: true,
  noSetbackViolations: true,
  courtyardAlwaysPresent: true,
  ecoPrinciplesNeverOverridden: true,
  vastuConflictsExplained: true,
  engineeringFeasibilityValidated: true,
  outputsIncludeReasoning: true
};
```

---

## 12. Open Questions (Updated)

```json
{
  "resolved_from_prd": [
    {
      "id": "OQ-1",
      "question": "PRD file is empty",
      "status": "RESOLVED",
      "answer": "Full PRD now available with 14 sections"
    },
    {
      "id": "OQ-4",
      "question": "Should Vastu be optional?",
      "status": "RESOLVED",
      "answer": "PRD states: Vastu guides but does not override legality. Conflicts must be explained."
    },
    {
      "id": "OQ-8",
      "question": "Authentication system?",
      "status": "RESOLVED",
      "answer": "PRD specifies: Auth via Clerk / Auth.js"
    }
  ],
  "remaining_open_questions": [
    {
      "id": "OQ-2",
      "question": "What image processing for sketch interpretation? (Claude Vision recommended)",
      "priority": "high",
      "recommendation": "Use Claude Vision API for diagram interpretation - native to SDK"
    },
    {
      "id": "OQ-3",
      "question": "Expected throughput? (requests/day, concurrent users)",
      "priority": "medium",
      "recommendation": "Start with 100 requests/day, scale based on usage"
    },
    {
      "id": "OQ-5",
      "question": "Local building regulations database source?",
      "priority": "high",
      "recommendation": "Start with Tamil Nadu/Karnataka rules, expand per user demand"
    },
    {
      "id": "OQ-6",
      "question": "Integration with Maiyuri Bricks CRM?",
      "priority": "medium",
      "recommendation": "Link via lead_id - each design session tied to a lead"
    },
    {
      "id": "OQ-7",
      "question": "Visualization format?",
      "priority": "low",
      "recommendation": "PRD says JSON + text floor plan + render prompts. v1 = prompts only, v2 = generated images"
    }
  ],
  "out_of_scope_v1": [
    "AutoCAD / DXF generation",
    "Structural load calculations",
    "BOQ or cost estimation",
    "Contractor marketplace"
  ]
}
```

---

## 13. Security Requirements (From PRD)

### 13.1 Authentication
```typescript
// Using Clerk or Auth.js as specified in PRD
import { ClerkProvider, SignIn, useAuth } from '@clerk/nextjs';

// Protect planning routes
export const middleware = authMiddleware({
  publicRoutes: ['/'],
  protectedRoutes: ['/planning', '/api/planning/*']
});
```

### 13.2 API Security
```typescript
// Signed API calls between Vercel & Railway
interface SecureApiCall {
  timestamp: number;
  signature: string; // HMAC-SHA256(payload + secret)
  payload: unknown;
}

// No direct client access to Railway agents
// All Railway calls go through Vercel API routes
```

### 13.3 Data Protection
- User sketches stored in Supabase Storage with user-scoped access
- DesignContext encrypted at rest
- No PII in agent logs

---

## 14. Non-Functional Requirements (From PRD)

### 14.1 Performance
| Metric | Target |
|--------|--------|
| UI Response | < 1 second |
| Agent Execution | Async with progress updates |
| Full Pipeline | < 5 minutes total |

### 14.2 Reliability
- Partial state persistence after each agent
- Resume from last completed agent on failure
- Retry logic with exponential backoff

### 14.3 Scalability
- Stateless frontend (Vercel)
- Horizontally scalable agent services (Railway)
- Database: Supabase (existing Maiyuri Bricks infra)

---

## 15. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Railway project
- [ ] Implement types and contracts
- [ ] Create BaseAgent class
- [ ] Implement Orchestrator skeleton
- [ ] Set up testing infrastructure

### Phase 2: Core Agents (Week 3-4)
- [ ] Agent 1: Diagram Interpreter (with Claude Vision)
- [ ] Agent 2: Regulation Compliance
- [ ] Agent 10: Design Validation
- [ ] Integration tests for minimal pipeline

### Phase 3: Full Pipeline (Week 5-6)
- [ ] Agents 3-9: All remaining agents
- [ ] Agent 11-12: Narrative & Visualization
- [ ] Full pipeline integration tests

### Phase 4: Production Readiness (Week 7-8)
- [ ] Error recovery implementation
- [ ] Monitoring and logging
- [ ] Performance optimization
- [ ] Security audit
- [ ] Documentation

---

## 13. JSON Export

```json
{
  "orchestration_plan": {
    "stages": [
      { "id": 1, "agent": "diagram-interpreter", "parallel": false },
      { "id": 2, "agents": ["regulation-compliance", "engineer-clarification", "eco-design"], "parallel": true },
      { "id": 3, "agent": "client-elicitation", "parallel": false },
      { "id": 4, "agent": "vastu-compliance", "parallel": false },
      { "id": 5, "agent": "architectural-zoning", "parallel": false },
      { "id": 6, "agent": "dimensioning", "parallel": false },
      { "id": 7, "agent": "engineering-plan", "parallel": false },
      { "id": 8, "agent": "design-validation", "parallel": false, "gate": true },
      { "id": 9, "agents": ["narrative", "visualization"], "parallel": true }
    ],
    "halt_condition": "any agent returns open_questions without answers",
    "resume_method": "resumePipeline(context, answers)"
  },
  "deployment_recommendation": {
    "frontend": "vercel",
    "agents": "railway",
    "database": "supabase",
    "reasoning": "Railway supports long-running tasks required for multi-agent pipeline"
  },
  "estimated_tokens_per_run": {
    "minimum": 15000,
    "average": 35000,
    "maximum": 80000
  },
  "risk_level": "medium",
  "confidence": 0.85
}
```

---

**End of Implementation Plan**

*Generated following Uncle Bob's SOLID, Clean Code, TDD, DRY, and SRP principles.*
