/**
 * Design Validation Agent (Agent 10)
 *
 * Cross-validates the complete design against all constraints from
 * previous agents: regulations, Vastu, eco-design, structural, and dimensional.
 *
 * Responsibilities:
 * - Validate Tamil Nadu building regulation compliance
 * - Check Vastu Shastra room placement rules
 * - Verify eco-design elements (courtyard, ventilation)
 * - Confirm structural integrity requirements
 * - Validate dimensional constraints and efficiency
 *
 * Guardrails:
 * - MUST flag any regulation violations as errors
 * - MUST identify Vastu deviations as warnings
 * - NEVER approve designs with critical structural issues
 * - Report all issues with suggested fixes
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DesignContext } from '../types/design-context';
import type {
  AgentResult,
  OpenQuestion,
  Assumption,
  TokenUsage,
  AgentError,
} from '../types/agent-result';
import type {
  DesignValidationInput,
  DesignValidationOutput,
} from '../types/contracts';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import { SYSTEM_RULES } from '../prompts/system-rules';

/**
 * Agent configuration
 */
interface DesignValidationConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

const DEFAULT_CONFIG: DesignValidationConfig = {
  model: 'gemini-2.5-flash',
  maxTokens: 4096,
  temperature: 0.1, // Very low for consistent validation
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * Validation rule categories
 */
type ValidationCategory = 'regulation' | 'vastu' | 'eco' | 'structural' | 'dimensional';

/**
 * Issue severity levels
 */
type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * Validation issue
 */
interface ValidationIssue {
  id: string;
  type: IssueSeverity;
  category: ValidationCategory;
  message: string;
  affected_element?: string;
  suggested_fix?: string;
}

/**
 * Compliance checklist item
 */
interface ComplianceItem {
  item: string;
  passed: boolean;
  notes?: string;
}

/**
 * Tamil Nadu Building Regulation Rules
 */
const REGULATION_RULES = {
  minSetbacks: {
    front: 1.5,  // meters
    rear: 1.5,
    side: 1.0,
  },
  maxFAR: 1.5,        // Floor Area Ratio
  maxCoverage: 0.6,   // Ground coverage 60%
  minPlotArea: 40,    // sqm for residential
  minRoomHeight: 2.75, // meters (9 feet)
  minKitchenArea: 5,   // sqm
  minBathroomArea: 2.8, // sqm
  minBedroomArea: 9.5,  // sqm
  minLivingArea: 12,    // sqm
};

/**
 * Vastu Shastra Rules
 */
const VASTU_RULES = {
  // Preferred directions for rooms
  preferredPlacements: {
    'pooja': ['northeast'],
    'kitchen': ['southeast'],
    'master-bedroom': ['southwest'],
    'living': ['northeast', 'north', 'east'],
    'dining': ['west', 'east'],
    'bathroom': ['west', 'northwest'],
    'store': ['south', 'southwest'],
  },
  // Rooms that should NOT be in certain directions
  avoidPlacements: {
    'kitchen': ['northeast'],
    'bathroom': ['northeast', 'east'],
    'bedroom': ['southeast'],
  },
  // Main entrance preferences
  preferredEntrance: ['east', 'north', 'northeast'],
};

/**
 * Eco-Design Rules
 */
const ECO_RULES = {
  minCourtyardPercent: 8,     // 8% of plot area
  crossVentilationRequired: true,
  rainwaterHarvestingRequired: true,
  minNaturalLightRooms: ['living', 'bedroom', 'master-bedroom', 'dining'],
};

/**
 * Structural Rules
 */
const STRUCTURAL_RULES = {
  loadBearing: {
    maxSpan: 4.5,           // meters without support
    minWallThickness: 230,  // mm (9 inches)
  },
  rcc: {
    minColumnSize: 230,     // mm
    minBeamDepth: 300,      // mm
  },
};

/**
 * Pre-validate regulation compliance
 */
function validateRegulations(
  context: DesignContext
): { issues: ValidationIssue[]; checks: ComplianceItem[] } {
  const issues: ValidationIssue[] = [];
  const checks: ComplianceItem[] = [];

  // Check plot area
  const plotArea = context.plot?.area || 0;
  const plotAreaSqm = plotArea * 0.0929; // Convert sqft to sqm

  checks.push({
    item: 'Minimum plot area (40 sqm)',
    passed: plotAreaSqm >= REGULATION_RULES.minPlotArea,
    notes: plotAreaSqm >= REGULATION_RULES.minPlotArea
      ? `Plot area: ${plotAreaSqm.toFixed(1)} sqm`
      : `Plot area ${plotAreaSqm.toFixed(1)} sqm is below minimum 40 sqm`,
  });

  if (plotAreaSqm < REGULATION_RULES.minPlotArea) {
    issues.push({
      id: 'reg-001',
      type: 'error',
      category: 'regulation',
      message: `Plot area (${plotAreaSqm.toFixed(1)} sqm) is below minimum required (40 sqm)`,
      affected_element: 'plot',
      suggested_fix: 'Consult local authority for special provisions for small plots',
    });
  }

  // Check setbacks if available
  if (context.buildableEnvelope) {
    const plotWidth = context.plot?.width || 0;
    const plotDepth = context.plot?.depth || 0;
    const envelopeWidth = context.buildableEnvelope.width || 0;
    const envelopeDepth = context.buildableEnvelope.depth || 0;

    // Estimate setbacks (in feet, convert to meters)
    const sideSetback = ((plotWidth - envelopeWidth) / 2) * 0.3048;
    const frontRearSetback = ((plotDepth - envelopeDepth) / 2) * 0.3048;

    checks.push({
      item: 'Side setback (min 1.0m)',
      passed: sideSetback >= REGULATION_RULES.minSetbacks.side,
      notes: `Side setback: ${sideSetback.toFixed(2)}m`,
    });

    if (sideSetback < REGULATION_RULES.minSetbacks.side) {
      issues.push({
        id: 'reg-002',
        type: 'error',
        category: 'regulation',
        message: `Side setback (${sideSetback.toFixed(2)}m) is below minimum (1.0m)`,
        affected_element: 'setback',
        suggested_fix: 'Reduce building width to increase side setback',
      });
    }

    checks.push({
      item: 'Front/Rear setback (min 1.5m)',
      passed: frontRearSetback >= REGULATION_RULES.minSetbacks.front,
      notes: `Front/Rear setback: ${frontRearSetback.toFixed(2)}m`,
    });
  }

  // Check ground coverage
  if (context.buildableEnvelope && context.plot) {
    const builtUpArea = (context.buildableEnvelope.width || 0) * (context.buildableEnvelope.depth || 0);
    const coverage = builtUpArea / plotArea;

    checks.push({
      item: 'Ground coverage (max 60%)',
      passed: coverage <= REGULATION_RULES.maxCoverage,
      notes: `Coverage: ${(coverage * 100).toFixed(1)}%`,
    });

    if (coverage > REGULATION_RULES.maxCoverage) {
      issues.push({
        id: 'reg-003',
        type: 'error',
        category: 'regulation',
        message: `Ground coverage (${(coverage * 100).toFixed(1)}%) exceeds maximum (60%)`,
        affected_element: 'coverage',
        suggested_fix: 'Reduce building footprint or consider additional floors',
      });
    }
  }

  return { issues, checks };
}

/**
 * Pre-validate Vastu compliance
 */
function validateVastu(
  context: DesignContext
): { issues: ValidationIssue[]; checks: ComplianceItem[] } {
  const issues: ValidationIssue[] = [];
  const checks: ComplianceItem[] = [];

  // Check main entrance direction (from road.side)
  const entranceDir = context.road?.side;
  if (entranceDir) {
    const isPreferred = VASTU_RULES.preferredEntrance.includes(entranceDir);
    checks.push({
      item: 'Main entrance direction (prefer E/N/NE)',
      passed: isPreferred,
      notes: `Entrance facing: ${entranceDir}`,
    });

    if (!isPreferred) {
      issues.push({
        id: 'vastu-001',
        type: 'warning',
        category: 'vastu',
        message: `Main entrance facing ${entranceDir} is not ideal per Vastu (prefer east, north, or northeast)`,
        affected_element: 'entrance',
        suggested_fix: 'Consider repositioning main door or adding a secondary entrance',
      });
    }
  }

  // Check Vastu zones if available
  if (context.vastuZones) {
    // Check pooja room in northeast
    const poojaInNE = context.vastuZones.northeast?.includes('pooja');
    if (context.requirements?.hasPooja) {
      checks.push({
        item: 'Pooja room in northeast',
        passed: poojaInNE === true,
        notes: poojaInNE ? 'Correctly placed' : 'Not in northeast',
      });

      if (!poojaInNE) {
        issues.push({
          id: 'vastu-002',
          type: 'warning',
          category: 'vastu',
          message: 'Pooja room should ideally be in the northeast (Ishanya) corner',
          affected_element: 'pooja',
          suggested_fix: 'Relocate pooja room to northeast if possible',
        });
      }
    }

    // Check kitchen in southeast
    const kitchenInSE = context.vastuZones.southeast?.includes('kitchen');
    checks.push({
      item: 'Kitchen in southeast',
      passed: kitchenInSE === true,
      notes: kitchenInSE ? 'Correctly placed' : 'Not in southeast',
    });

    if (!kitchenInSE) {
      issues.push({
        id: 'vastu-003',
        type: 'warning',
        category: 'vastu',
        message: 'Kitchen should ideally be in the southeast (Agni) corner',
        affected_element: 'kitchen',
        suggested_fix: 'Relocate kitchen to southeast or ensure cooking platform faces east',
      });
    }

    // Check master bedroom in southwest
    const masterInSW = context.vastuZones.southwest?.includes('master-bedroom');
    checks.push({
      item: 'Master bedroom in southwest',
      passed: masterInSW === true,
      notes: masterInSW ? 'Correctly placed' : 'Not in southwest',
    });
  }

  return { issues, checks };
}

/**
 * Pre-validate eco-design compliance
 */
function validateEcoDesign(
  context: DesignContext
): { issues: ValidationIssue[]; checks: ComplianceItem[] } {
  const issues: ValidationIssue[] = [];
  const checks: ComplianceItem[] = [];

  // Check courtyard (from courtyardSpec)
  const hasCourtyardReq = context.courtyardSpec?.required;
  checks.push({
    item: 'Courtyard provision',
    passed: hasCourtyardReq === true,
    notes: hasCourtyardReq ? 'Required and planned' : 'Not specified',
  });

  // Check cross-ventilation (from energyStrategy)
  const hasCrossVent = context.energyStrategy?.crossVentilation;
  checks.push({
    item: 'Cross-ventilation design',
    passed: hasCrossVent === true,
    notes: hasCrossVent ? 'Required and planned' : 'Not specified',
  });

  if (!hasCrossVent) {
    issues.push({
      id: 'eco-001',
      type: 'warning',
      category: 'eco',
      message: 'Cross-ventilation is recommended for natural cooling',
      affected_element: 'ventilation',
      suggested_fix: 'Ensure windows on opposite walls in main rooms',
    });
  }

  // Check rainwater harvesting (from waterStrategy)
  const hasRWH = context.waterStrategy?.rainwaterHarvesting;
  checks.push({
    item: 'Rainwater harvesting',
    passed: hasRWH === true,
    notes: hasRWH ? 'Planned' : 'Not specified',
  });

  if (!hasRWH) {
    issues.push({
      id: 'eco-002',
      type: 'info',
      category: 'eco',
      message: 'Rainwater harvesting is mandatory in Tamil Nadu for plots > 200 sqm',
      affected_element: 'rainwater',
      suggested_fix: 'Plan for rainwater collection and recharge pit',
    });
  }

  return { issues, checks };
}

/**
 * Pre-validate structural requirements
 */
function validateStructural(
  context: DesignContext
): { issues: ValidationIssue[]; checks: ComplianceItem[] } {
  const issues: ValidationIssue[] = [];
  const checks: ComplianceItem[] = [];

  const strategy = context.structuralStrategy;

  checks.push({
    item: 'Structural strategy defined',
    passed: !!strategy,
    notes: strategy ? `Strategy: ${strategy}` : 'Not defined',
  });

  if (!strategy) {
    issues.push({
      id: 'struct-001',
      type: 'error',
      category: 'structural',
      message: 'Structural strategy must be defined (load-bearing, RCC, or hybrid)',
      affected_element: 'structure',
      suggested_fix: 'Run engineer clarification agent to determine structural strategy',
    });
  }

  // Check for multi-floor with load-bearing
  const floors = context.requirements?.floors || 1;
  if (strategy === 'load-bearing' && floors > 2) {
    issues.push({
      id: 'struct-002',
      type: 'error',
      category: 'structural',
      message: 'Load-bearing construction is not recommended for more than 2 floors',
      affected_element: 'structure',
      suggested_fix: 'Consider RCC frame construction for 3+ floors',
    });
  }

  checks.push({
    item: 'Structure suitable for floor count',
    passed: !(strategy === 'load-bearing' && floors > 2),
    notes: `${floors} floor(s) with ${strategy || 'undefined'} structure`,
  });

  return { issues, checks };
}

/**
 * Pre-validate dimensional requirements
 */
function validateDimensional(
  context: DesignContext
): { issues: ValidationIssue[]; checks: ComplianceItem[] } {
  const issues: ValidationIssue[] = [];
  const checks: ComplianceItem[] = [];

  // Check if rooms are defined
  if (context.rooms && context.rooms.length > 0) {
    // Check minimum room sizes
    for (const room of context.rooms) {
      const areaSqm = (room.areaSqft || 0) * 0.0929;

      let minArea = 0;
      let roomType = room.type;

      switch (room.type) {
        case 'bedroom':
          minArea = REGULATION_RULES.minBedroomArea;
          break;
        case 'living':
          minArea = REGULATION_RULES.minLivingArea;
          break;
        case 'kitchen':
          minArea = REGULATION_RULES.minKitchenArea;
          break;
        case 'bathroom':
        case 'toilet':
          minArea = REGULATION_RULES.minBathroomArea;
          roomType = 'bathroom';
          break;
      }

      if (minArea > 0) {
        const passed = areaSqm >= minArea;
        checks.push({
          item: `${room.name} minimum area (${minArea} sqm)`,
          passed,
          notes: `Actual: ${areaSqm.toFixed(1)} sqm`,
        });

        if (!passed) {
          issues.push({
            id: `dim-${room.id}`,
            type: 'error',
            category: 'dimensional',
            message: `${room.name} area (${areaSqm.toFixed(1)} sqm) is below minimum (${minArea} sqm)`,
            affected_element: room.id,
            suggested_fix: `Increase ${roomType} dimensions to meet minimum area requirement`,
          });
        }
      }
    }

    // Check efficiency
    const totalArea = context.rooms.reduce((sum, r) => sum + (r.areaSqft || 0), 0);
    const envelopeArea = (context.buildableEnvelope?.width || 0) * (context.buildableEnvelope?.depth || 0);

    if (envelopeArea > 0) {
      const efficiency = (totalArea / envelopeArea) * 100;

      checks.push({
        item: 'Space efficiency (target > 80%)',
        passed: efficiency >= 80,
        notes: `Efficiency: ${efficiency.toFixed(1)}%`,
      });

      if (efficiency < 70) {
        issues.push({
          id: 'dim-efficiency',
          type: 'warning',
          category: 'dimensional',
          message: `Space efficiency (${efficiency.toFixed(1)}%) is below optimal (80%)`,
          affected_element: 'layout',
          suggested_fix: 'Review room sizes and circulation space to improve efficiency',
        });
      }
    }
  } else {
    checks.push({
      item: 'Room dimensions defined',
      passed: false,
      notes: 'No rooms found in context',
    });

    issues.push({
      id: 'dim-no-rooms',
      type: 'error',
      category: 'dimensional',
      message: 'No room dimensions found in design context',
      affected_element: 'rooms',
      suggested_fix: 'Run dimensioning agent to calculate room sizes',
    });
  }

  return { issues, checks };
}

/**
 * Design Validation Agent
 *
 * Cross-validates the complete design against all constraints.
 */
export class DesignValidationAgent {
  readonly agentName = 'design-validation' as const;
  private config: DesignValidationConfig;
  private genAI: GoogleGenerativeAI;

  constructor(config: Partial<DesignValidationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      logger.warn('Google AI API key not found');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Execute the design validation agent
   */
  async execute(
    input: DesignValidationInput,
    context: DesignContext
  ): Promise<AgentResult<DesignValidationOutput>> {
    const startTime = Date.now();

    logger.info('Starting agent execution', { agent: this.agentName });

    try {
      // Step 1: Validate input
      const validationError = this.validateInput(input);
      if (validationError) {
        throw new Error(validationError);
      }

      // Step 2: Run all pre-validation checks
      const preValidation = this.runPreValidation(context);

      // Step 3: Build prompt for LLM validation
      const prompt = this.buildPrompt(input, context, preValidation);

      // Step 4: Call Gemini for additional validation insights
      const response = await this.callGemini(prompt);

      // Step 5: Parse and merge validation results
      const output = this.parseResponse(response, preValidation);

      // Step 6: Extract assumptions and open questions
      const { assumptions, openQuestions } = this.extractQuestionsAndAssumptions(
        output,
        context
      );

      const executionTimeMs = Date.now() - startTime;

      logger.info('Agent execution complete', {
        agent: this.agentName,
        executionTimeMs,
        status: output.status,
        issueCount: output.issues.length,
      });

      return {
        success: true,
        agentName: this.agentName,
        data: output,
        assumptions,
        openQuestions,
        tokensUsed: this.estimateTokens(prompt, response),
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const agentError = this.createError(error);

      logger.error('Agent execution failed', {
        agent: this.agentName,
        errorMessage: agentError.message,
        errorDetails: agentError.details,
      });

      return {
        success: false,
        agentName: this.agentName,
        error: agentError,
        assumptions: [],
        openQuestions: [],
        tokensUsed: { input: 0, output: 0, total: 0 },
        executionTimeMs,
      };
    }
  }

  /**
   * Validate input
   */
  private validateInput(input: DesignValidationInput): string | null {
    if (!input.fullContext) {
      return 'Full context is required for design validation';
    }

    if (typeof input.fullContext !== 'object') {
      return 'Full context must be an object';
    }

    return null;
  }

  /**
   * Run all pre-validation checks
   */
  private runPreValidation(context: DesignContext): {
    issues: ValidationIssue[];
    checks: ComplianceItem[];
  } {
    const allIssues: ValidationIssue[] = [];
    const allChecks: ComplianceItem[] = [];

    // Run each validation category
    const regulationResult = validateRegulations(context);
    allIssues.push(...regulationResult.issues);
    allChecks.push(...regulationResult.checks);

    const vastuResult = validateVastu(context);
    allIssues.push(...vastuResult.issues);
    allChecks.push(...vastuResult.checks);

    const ecoResult = validateEcoDesign(context);
    allIssues.push(...ecoResult.issues);
    allChecks.push(...ecoResult.checks);

    const structuralResult = validateStructural(context);
    allIssues.push(...structuralResult.issues);
    allChecks.push(...structuralResult.checks);

    const dimensionalResult = validateDimensional(context);
    allIssues.push(...dimensionalResult.issues);
    allChecks.push(...dimensionalResult.checks);

    return { issues: allIssues, checks: allChecks };
  }

  /**
   * Build the prompt for Gemini
   */
  private buildPrompt(
    input: DesignValidationInput,
    context: DesignContext,
    preValidation: { issues: ValidationIssue[]; checks: ComplianceItem[] }
  ): string {
    const issuesSummary = preValidation.issues.length > 0
      ? preValidation.issues.map(i => `- [${i.type.toUpperCase()}] ${i.category}: ${i.message}`).join('\n')
      : 'No issues found in pre-validation';

    const checksSummary = preValidation.checks
      .map(c => `- [${c.passed ? 'PASS' : 'FAIL'}] ${c.item}${c.notes ? `: ${c.notes}` : ''}`)
      .join('\n');

    return `${SYSTEM_RULES}

## Design Validation Agent

You are validating a residential floor plan design for Tamil Nadu, India.

### Design Context Summary

**Plot:**
- Width: ${context.plot?.width || 'unknown'} feet
- Depth: ${context.plot?.depth || 'unknown'} feet
- Area: ${context.plot?.area || 'unknown'} sqft
- Road Facing: ${context.road?.side || 'unknown'}

**Requirements:**
- Bedrooms: ${context.requirements?.bedrooms || 'unknown'}
- Bathrooms: ${context.requirements?.bathrooms || 'unknown'}
- Pooja Room: ${context.requirements?.hasPooja ? 'Yes' : 'No'}
- Parking: ${context.requirements?.hasParking ? 'Yes' : 'No'}
- Floors: ${context.requirements?.floors || 1}

**Structural Strategy:** ${context.structuralStrategy || 'Not defined'}

### Pre-Validation Results

**Compliance Checks:**
${checksSummary}

**Issues Found:**
${issuesSummary}

### Additional Context
${JSON.stringify(input.fullContext, null, 2).slice(0, 2000)}...

## Task

Review the pre-validation results and provide:

1. **Additional Issues**: Any design issues not caught by pre-validation
2. **Severity Assessment**: Overall severity of the design issues
3. **Additional Compliance Items**: Any additional checks that should be performed
4. **Recommendations**: Prioritized list of fixes

Consider:
- Circulation space between rooms
- Privacy requirements (bedroom-bathroom proximity)
- Kitchen-dining connectivity
- Natural light access for living spaces
- Ventilation paths

## Output Format

Respond with ONLY valid JSON:

{
  "additional_issues": [
    {
      "id": "llm-xxx",
      "type": "error|warning|info",
      "category": "regulation|vastu|eco|structural|dimensional",
      "message": "description",
      "affected_element": "element_id",
      "suggested_fix": "fix description"
    }
  ],
  "additional_checks": [
    {
      "item": "check description",
      "passed": true|false,
      "notes": "optional notes"
    }
  ],
  "severity_assessment": "low|medium|high",
  "recommendations": [
    "Prioritized recommendation 1",
    "Prioritized recommendation 2"
  ]
}`;
  }

  /**
   * Call Gemini API with retry
   */
  private async callGemini(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.config.model,
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      },
    });

    const result = await retryWithBackoff(
      async () => {
        const response = await model.generateContent(prompt);
        const text = response.response.text();
        if (!text) {
          throw new Error('Empty response from Gemini');
        }
        return text;
      },
      this.config.retryConfig
    );

    return result;
  }

  /**
   * Parse and validate the response
   */
  private parseResponse(
    response: string,
    preValidation: { issues: ValidationIssue[]; checks: ComplianceItem[] }
  ): DesignValidationOutput {
    // Extract JSON from response
    let jsonStr = response;

    // Try to extract JSON from markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let llmOutput: {
      additional_issues?: ValidationIssue[];
      additional_checks?: ComplianceItem[];
      severity_assessment?: 'low' | 'medium' | 'high';
      recommendations?: string[];
    } = {};

    try {
      llmOutput = JSON.parse(jsonStr);
    } catch {
      // Use pre-validation results only if LLM parsing fails
      logger.warn('Failed to parse LLM validation response, using pre-validation only');
    }

    // Merge issues
    const allIssues = [
      ...preValidation.issues,
      ...(llmOutput.additional_issues || []),
    ];

    // Merge checks
    const allChecks = [
      ...preValidation.checks,
      ...(llmOutput.additional_checks || []),
    ];

    // Determine status
    const hasErrors = allIssues.some(i => i.type === 'error');
    const hasWarnings = allIssues.some(i => i.type === 'warning');

    let status: 'PASS' | 'FAIL' | 'PASS_WITH_WARNINGS';
    if (hasErrors) {
      status = 'FAIL';
    } else if (hasWarnings) {
      status = 'PASS_WITH_WARNINGS';
    } else {
      status = 'PASS';
    }

    // Determine severity
    let severity: 'low' | 'medium' | 'high';
    if (llmOutput.severity_assessment) {
      severity = llmOutput.severity_assessment;
    } else {
      const errorCount = allIssues.filter(i => i.type === 'error').length;
      if (errorCount >= 3) {
        severity = 'high';
      } else if (errorCount >= 1 || hasWarnings) {
        severity = 'medium';
      } else {
        severity = 'low';
      }
    }

    return {
      status,
      issues: allIssues,
      severity,
      compliance_checklist: allChecks,
    };
  }

  /**
   * Extract assumptions and open questions
   */
  private extractQuestionsAndAssumptions(
    output: DesignValidationOutput,
    context: DesignContext
  ): { assumptions: Assumption[]; openQuestions: OpenQuestion[] } {
    const assumptions: Assumption[] = [];
    const openQuestions: OpenQuestion[] = [];

    // Assumption: Using Tamil Nadu building regulations
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'tn_regulations',
      assumption: 'Validation based on Tamil Nadu Combined Development Regulations 2019',
      risk: 'low',
      basis: 'Standard building codes for Tamil Nadu residential construction',
    });

    // Assumption: Standard Vastu principles
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'vastu_standard',
      assumption: 'Using standard Vastu Shastra principles for residential design',
      risk: 'low',
      basis: 'Traditional Indian architectural guidelines',
    });

    // Open questions based on issues
    if (output.status === 'FAIL') {
      openQuestions.push({
        agentSource: this.agentName,
        questionId: 'critical_issues',
        question: 'Critical issues found. Address errors before proceeding?',
        type: 'mandatory',
        reason: `${output.issues.filter(i => i.type === 'error').length} error(s) require resolution`,
      });
    }

    // If Vastu warnings exist
    const vastuWarnings = output.issues.filter(i => i.category === 'vastu' && i.type === 'warning');
    if (vastuWarnings.length > 0) {
      openQuestions.push({
        agentSource: this.agentName,
        questionId: 'vastu_deviations',
        question: 'Some Vastu recommendations are not met. Accept deviations?',
        type: 'optional',
        reason: `${vastuWarnings.length} Vastu guideline(s) deviated from optimal`,
      });
    }

    // If eco warnings exist
    const ecoWarnings = output.issues.filter(i => i.category === 'eco');
    if (ecoWarnings.length > 0) {
      openQuestions.push({
        agentSource: this.agentName,
        questionId: 'eco_enhancements',
        question: 'Some eco-design features are missing. Add them to the design?',
        type: 'optional',
        reason: 'Eco features improve sustainability and may reduce operating costs',
      });
    }

    return { assumptions, openQuestions };
  }

  /**
   * Estimate token usage
   */
  private estimateTokens(prompt: string, response: string): TokenUsage {
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(response.length / 4);

    return {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    };
  }

  /**
   * Create error object
   */
  private createError(error: unknown): AgentError {
    if (error instanceof Error) {
      return {
        code: 'DESIGN_VALIDATION_ERROR',
        message: error.message,
        retryable: true,
        details: { stack: error.stack },
      };
    }

    return {
      code: 'DESIGN_VALIDATION_ERROR',
      message: String(error),
      retryable: true,
    };
  }
}

/**
 * Factory function to create DesignValidationAgent
 */
export function createDesignValidationAgent(
  config?: Partial<DesignValidationConfig>
): DesignValidationAgent {
  return new DesignValidationAgent(config);
}
