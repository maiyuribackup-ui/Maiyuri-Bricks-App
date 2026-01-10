/**
 * Mock DesignContext Factory for Testing
 *
 * Creates test fixtures for different pipeline scenarios.
 */

import type { DesignContext, Room } from '../../types/design-context';
import { createDesignContext } from '../../types/design-context';

/**
 * Create a minimal valid context for testing
 */
export function createMockContext(
  overrides: Partial<DesignContext> = {}
): DesignContext {
  return {
    ...createDesignContext(`test-${Date.now()}`),
    ...overrides,
  };
}

/**
 * Create a context after diagram interpretation (Agent 1)
 */
export function createPostDiagramContext(
  overrides: Partial<DesignContext> = {}
): DesignContext {
  return createMockContext({
    plot: {
      width: 30,
      depth: 40,
      area: 1200,
      unit: 'feet',
    },
    setbacks: {
      front: 5,
      rear: 5,
      left: 3,
      right: 3,
      unit: 'feet',
    },
    road: {
      side: 'north',
      width: 30,
    },
    orientation: 'north',
    diagramConfidence: 0.95,
    ...overrides,
  });
}

/**
 * Create a context after regulation compliance (Agent 2)
 */
export function createPostRegulationContext(
  overrides: Partial<DesignContext> = {}
): DesignContext {
  return createPostDiagramContext({
    buildableEnvelope: {
      width: 24,
      depth: 32,
      area: 768,
      maxHeight: 15,
      maxFloors: 2,
      fsi: 1.5,
    },
    regulationConstraints: [
      'Front setback: 5 feet minimum',
      'FSI limit: 1.5',
      'Maximum height: 15 meters',
    ],
    regulationViolations: [],
    ...overrides,
  });
}

/**
 * Create a context with client requirements filled
 */
export function createPostElicitationContext(
  overrides: Partial<DesignContext> = {}
): DesignContext {
  return createPostRegulationContext({
    requirements: {
      bedrooms: 3,
      bathrooms: 2,
      hasPooja: true,
      hasParking: true,
      hasStore: true,
      hasServantRoom: false,
      floors: 1,
      budgetRange: 'standard',
    },
    clientAnswers: {
      bedrooms: '3',
      bathrooms: '2',
      pooja: 'yes',
      parking: 'yes',
    },
    ...overrides,
  });
}

/**
 * Create a context with eco-design constraints
 */
export function createPostEcoContext(
  overrides: Partial<DesignContext> = {}
): DesignContext {
  return createPostElicitationContext({
    ecoMandatory: [
      'courtyard',
      'cross_ventilation',
      'veranda',
      'rainwater_harvesting',
    ],
    energyStrategy: {
      passiveCooling: true,
      crossVentilation: true,
      westWallMinimized: true,
      naturalLighting: true,
    },
    waterStrategy: {
      rainwaterHarvesting: true,
      greyWaterRecycling: false,
      borewell: false,
      sumpCapacity: 5000,
    },
    courtyardSpec: {
      required: true,
      minArea: 100,
      position: 'central',
    },
    verandaSpec: {
      required: true,
      width: 4,
      sides: ['south', 'east'],
    },
    ...overrides,
  });
}

/**
 * Create a context with rooms dimensioned
 */
export function createPostDimensioningContext(
  overrides: Partial<DesignContext> = {}
): DesignContext {
  const rooms: Room[] = [
    {
      id: 'living',
      name: 'Living Room',
      type: 'living',
      width: 15,
      depth: 12,
      areaSqft: 180,
      zone: 'public',
    },
    {
      id: 'dining',
      name: 'Dining Room',
      type: 'dining',
      width: 10,
      depth: 12,
      areaSqft: 120,
      zone: 'public',
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      type: 'kitchen',
      width: 10,
      depth: 10,
      areaSqft: 100,
      zone: 'semi_private',
    },
    {
      id: 'master',
      name: 'Master Bedroom',
      type: 'bedroom',
      width: 14,
      depth: 12,
      areaSqft: 168,
      zone: 'private',
    },
    {
      id: 'bed2',
      name: 'Bedroom 2',
      type: 'bedroom',
      width: 12,
      depth: 10,
      areaSqft: 120,
      zone: 'private',
    },
    {
      id: 'bed3',
      name: 'Bedroom 3',
      type: 'bedroom',
      width: 10,
      depth: 10,
      areaSqft: 100,
      zone: 'private',
    },
    {
      id: 'courtyard',
      name: 'Courtyard',
      type: 'courtyard',
      width: 10,
      depth: 10,
      areaSqft: 100,
      zone: 'public',
    },
  ];

  return createPostEcoContext({
    rooms,
    courtyardSize: {
      width: 10,
      depth: 10,
      areaSqft: 100,
    },
    totalBuiltUp: 888,
    carpetArea: 788,
    efficiency: 88.7,
    ...overrides,
  });
}

/**
 * Create a fully completed context
 */
export function createCompletedContext(
  overrides: Partial<DesignContext> = {}
): DesignContext {
  return createPostDimensioningContext({
    status: 'completed',
    validationStatus: 'PASS',
    validationIssues: [],
    designRationale: 'This design prioritizes natural ventilation and eco-friendly principles...',
    ecoSummary: 'The design includes a central courtyard for natural light and ventilation...',
    vastuSummary: 'The main entrance faces north, with kitchen in southeast...',
    renderPrompts: {
      courtyard: 'A central courtyard in a Tamil Nadu style home...',
      exterior: 'A single-story brick home with veranda...',
      interior: 'Bright, airy interior with cross-ventilation...',
    },
    ...overrides,
  });
}

/**
 * Create a context that will trigger halt (with open questions)
 */
export function createHaltContext(
  overrides: Partial<DesignContext> = {}
): DesignContext {
  return createMockContext({
    status: 'halted',
    haltReason: 'Awaiting human resolution of open questions',
    openQuestions: [
      {
        agentSource: 'diagram-interpreter',
        questionId: 'Q1',
        question: 'What is the exact width of the plot?',
        type: 'mandatory',
        reason: 'Dimension is unclear in the sketch',
      },
      {
        agentSource: 'client-elicitation',
        questionId: 'Q2',
        question: 'How many bedrooms do you need?',
        type: 'mandatory',
        reason: 'Required for space planning',
      },
    ],
    ...overrides,
  });
}

/**
 * Create a context with validation failures
 */
export function createFailedValidationContext(
  overrides: Partial<DesignContext> = {}
): DesignContext {
  return createPostDimensioningContext({
    status: 'failed',
    validationStatus: 'FAIL',
    validationIssues: [
      {
        id: 'V1',
        type: 'error',
        category: 'regulation',
        message: 'Setback violation on south side',
        affectedElement: 'Master Bedroom',
        suggestedFix: 'Move room 2 feet inward',
      },
      {
        id: 'V2',
        type: 'error',
        category: 'eco',
        message: 'Missing courtyard in design',
        suggestedFix: 'Add central courtyard',
      },
    ],
    validationSeverity: 'high',
    ...overrides,
  });
}
