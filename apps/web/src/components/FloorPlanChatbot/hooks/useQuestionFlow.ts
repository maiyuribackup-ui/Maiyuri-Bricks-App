/**
 * useQuestionFlow Hook
 *
 * Manages the question flow logic for the floor plan chatbot.
 * Defines all questions, handles conditional logic, and provides smart defaults.
 */

import { useMemo, useCallback } from 'react';
import type {
  QuestionConfig,
  FloorPlanInputs,
  UseQuestionFlowReturn,
} from '../types';

/**
 * Complete question flow definition
 */
const QUESTION_FLOW: QuestionConfig[] = [
  // ============================================
  // Phase 0: Client Information
  // ============================================
  {
    id: 'clientName',
    question: "What's the client or project name for this floor plan?",
    description: "This helps us organize your files with a meaningful name (e.g., Kumar Residence, Villa Project Phase 2)",
    type: 'form',
    fields: ['clientName'],
    validation: (value) => {
      const name = typeof value === 'string' ? value : '';
      if (!name || name.trim().length < 2) {
        return 'Please enter a client or project name (at least 2 characters)';
      }
      if (name.length > 100) {
        return 'Name is too long (max 100 characters)';
      }
      return null;
    },
  },

  // ============================================
  // Phase 1: Project Type
  // ============================================
  {
    id: 'projectType',
    question: "What would you like to design today?",
    type: 'single-select',
    options: [
      { label: 'Residential House', value: 'residential', icon: '🏠', recommended: true, description: 'Home for your family' },
      { label: 'Compound Wall', value: 'compound', icon: '🧱', description: 'Boundary wall for your property' },
      { label: 'Commercial Building', value: 'commercial', icon: '🏢', description: 'Shop, office, or warehouse' },
    ],
  },

  // ============================================
  // Phase 2: Plot Input Method
  // ============================================
  {
    id: 'plotInput',
    question: "Let's start with your plot. Do you have a land survey document?",
    description: "I can automatically extract dimensions from your survey document.",
    type: 'single-select',
    options: [
      { label: 'Upload Survey', value: 'upload', icon: '📄', recommended: true, description: 'Auto-extract dimensions' },
      { label: 'Enter Manually', value: 'manual', icon: '✏️', description: 'Type in dimensions' },
    ],
  },

  // Manual dimensions form
  {
    id: 'plotDimensions',
    condition: (inputs) => inputs.plotInput === 'manual',
    question: "What are your plot dimensions? (in feet)",
    description: "Enter the length of each side of your plot.",
    type: 'form',
    fields: ['north', 'south', 'east', 'west'],
  },

  // Road side
  {
    id: 'roadSide',
    question: "Which side of your plot faces the road?",
    description: "This helps determine the entrance and setback requirements.",
    type: 'single-select',
    options: [
      { label: 'North', value: 'north', icon: '⬆️' },
      { label: 'South', value: 'south', icon: '⬇️' },
      { label: 'East', value: 'east', icon: '➡️' },
      { label: 'West', value: 'west', icon: '⬅️' },
    ],
  },

  // Road width
  {
    id: 'roadWidth',
    question: "What is the width of the road facing your plot?",
    description: "Road width affects setback requirements.",
    type: 'single-select',
    options: [
      { label: '12 feet', value: '12', description: 'Narrow lane' },
      { label: '20 feet', value: '20', recommended: true, description: 'Standard road' },
      { label: '30 feet', value: '30', description: 'Main road' },
      { label: '40+ feet', value: '40+', description: 'Highway/wide road' },
    ],
  },

  // ============================================
  // Phase 3: Residential Requirements
  // ============================================
  {
    id: 'bedrooms',
    condition: (inputs) => inputs.projectType === 'residential',
    question: "How many bedrooms do you need?",
    type: 'single-select',
    options: [
      { label: '1 Bedroom', value: '1', description: 'Compact home' },
      { label: '2 Bedrooms', value: '2', recommended: true, description: 'Small family' },
      { label: '3 Bedrooms', value: '3', description: 'Growing family' },
      { label: '4+ Bedrooms', value: '4', description: 'Large family' },
    ],
    smartDefault: (inputs) => {
      const area = inputs.plotArea || 0;
      if (area > 2000) return '4';
      if (area > 1500) return '3';
      if (area > 800) return '2';
      return '1';
    },
  },

  {
    id: 'bathrooms',
    condition: (inputs) => inputs.projectType === 'residential',
    question: "How many bathrooms do you need?",
    type: 'single-select',
    options: [
      { label: '1 Bathroom', value: '1', description: 'Shared bathroom' },
      { label: '2 Bathrooms', value: '2', recommended: true, description: 'Common + attached' },
      { label: '3 Bathrooms', value: '3', description: 'Multiple attached' },
      { label: '4+ Bathrooms', value: '4+', description: 'All rooms attached' },
    ],
    smartDefault: (inputs) => {
      const bedrooms = parseInt(inputs.bedrooms || '2');
      return bedrooms >= 3 ? '3' : '2';
    },
  },

  {
    id: 'kitchenType',
    condition: (inputs) => inputs.projectType === 'residential',
    question: "What kitchen style do you prefer?",
    type: 'single-select',
    options: [
      { label: 'Closed Kitchen', value: 'closed', recommended: true, icon: '🚪', description: 'Traditional, separate cooking area' },
      { label: 'Open Kitchen', value: 'open', icon: '🍳', description: 'Modern, connected to living area' },
    ],
  },

  {
    id: 'floors',
    condition: (inputs) => inputs.projectType === 'residential',
    question: "How many floors do you want?",
    type: 'single-select',
    options: [
      { label: 'Ground Floor Only', value: 'ground', description: 'Single level, easy access' },
      { label: 'Ground + 1 (G+1)', value: 'g+1', recommended: true, description: 'Two floors' },
      { label: 'Ground + 2 (G+2)', value: 'g+2', description: 'Three floors' },
    ],
    smartDefault: (inputs) => {
      const area = inputs.plotArea || 0;
      const bedrooms = parseInt(inputs.bedrooms || '2');
      // If plot is small but need many bedrooms, recommend G+1
      if (area < 1200 && bedrooms >= 3) return 'g+1';
      if (area > 1500) return 'ground';
      return 'g+1';
    },
  },

  // ============================================
  // Phase 4: Preferences (Residential)
  // ============================================
  {
    id: 'hasMutram',
    condition: (inputs) => inputs.projectType === 'residential' && (inputs.plotArea || 0) >= 600,
    question: "Would you like a traditional open-to-sky courtyard (mutram)?",
    description: "Mutram provides natural ventilation and light. A signature element of Tamil Nadu architecture.",
    type: 'single-select',
    options: [
      { label: 'Yes', value: 'yes', icon: '✅', recommended: true, description: 'Natural cooling & ventilation' },
      { label: 'No', value: 'no', icon: '❌', description: 'More indoor space' },
    ],
    smartDefault: (inputs) => (inputs.plotArea || 0) >= 800 ? 'yes' : 'no',
  },

  {
    id: 'hasVerandah',
    condition: (inputs) => inputs.projectType === 'residential',
    question: "Would you like a front verandah (thinnai)?",
    description: "Traditional shaded sitting area at the entrance.",
    type: 'single-select',
    options: [
      { label: 'Yes', value: 'yes', icon: '✅', recommended: true, description: 'Shaded entrance area' },
      { label: 'No', value: 'no', icon: '❌', description: 'Direct entrance' },
    ],
  },

  {
    id: 'hasPooja',
    condition: (inputs) => inputs.projectType === 'residential',
    question: "Do you need a dedicated pooja room?",
    type: 'single-select',
    options: [
      { label: 'Yes, Separate Room', value: 'yes', icon: '🛕', recommended: true, description: 'Dedicated space for worship' },
      { label: 'Pooja Corner', value: 'corner', icon: '🪔', description: 'Corner in living room' },
      { label: 'No', value: 'no', icon: '❌', description: 'Not required' },
    ],
  },

  {
    id: 'parking',
    condition: (inputs) => inputs.projectType === 'residential',
    question: "What type of car parking do you need?",
    type: 'single-select',
    options: [
      { label: 'Covered Parking', value: 'covered', icon: '🏠', recommended: true, description: 'Protected from weather' },
      { label: 'Open Parking', value: 'open', icon: '🚗', description: 'Simple parking space' },
      { label: 'No Parking', value: 'none', icon: '🚫', description: 'Two-wheeler only' },
    ],
  },

  {
    id: 'staircaseLocation',
    condition: (inputs) => inputs.projectType === 'residential' && inputs.floors !== 'ground',
    question: "Where would you like the staircase?",
    type: 'single-select',
    options: [
      { label: 'Inside the House', value: 'inside', icon: '🏠', recommended: true, description: 'Internal staircase' },
      { label: 'Outside/External', value: 'outside', icon: '🚪', description: 'Separate entrance for upper floor' },
    ],
  },

  // ============================================
  // Phase 5: Materials
  // ============================================
  {
    id: 'wallMaterial',
    condition: (inputs) => inputs.projectType !== 'compound',
    question: "What wall construction do you prefer?",
    description: "Maiyuri specializes in eco-friendly mud interlock bricks.",
    type: 'single-select',
    options: [
      { label: 'Mud Interlock Bricks', value: 'mud-interlock', icon: '🧱', recommended: true, description: 'Eco-friendly, thermal comfort, our specialty!' },
      { label: 'Conventional Bricks', value: 'conventional', icon: '🏗️', description: 'Traditional, widely available' },
      { label: 'Concrete Blocks', value: 'concrete', icon: '⬜', description: 'Fast construction' },
    ],
  },

  {
    id: 'flooringType',
    condition: (inputs) => inputs.projectType === 'residential',
    question: "What flooring do you prefer?",
    type: 'single-select',
    options: [
      { label: 'Oxide Flooring', value: 'oxide', icon: '🔴', recommended: true, description: 'Cool, low maintenance, traditional' },
      { label: 'Aathangudi Tiles', value: 'aathangudi', icon: '🟤', description: 'Traditional, handcrafted beauty' },
      { label: 'Vitrified Tiles', value: 'vitrified', icon: '⬜', description: 'Modern, easy cleaning' },
      { label: 'Granite', value: 'granite', icon: '⚫', description: 'Premium, durable' },
    ],
  },

  {
    id: 'roofType',
    condition: (inputs) => inputs.projectType === 'residential',
    question: "What roof style do you prefer?",
    type: 'single-select',
    options: [
      { label: 'Mangalore Tiles', value: 'mangalore', icon: '🏠', recommended: true, description: 'Traditional sloped roof, thermal comfort' },
      { label: 'RCC Slab', value: 'rcc', icon: '🏢', description: 'Flat roof, future expansion' },
      { label: 'Metal Sheet', value: 'metal', icon: '🔩', description: 'Economical, industrial' },
    ],
  },

  // ============================================
  // Phase 6: Budget & Eco
  // ============================================
  {
    id: 'budgetRange',
    condition: (inputs) => inputs.projectType === 'residential',
    question: "What is your approximate construction budget?",
    description: "This helps us recommend appropriate finishes and materials.",
    type: 'single-select',
    options: [
      { label: 'Under ₹20 Lakhs', value: 'under-20', description: 'Economy build' },
      { label: '₹20-30 Lakhs', value: '20-30', description: 'Standard build' },
      { label: '₹30-50 Lakhs', value: '30-50', recommended: true, description: 'Quality build' },
      { label: '₹50-80 Lakhs', value: '50-80', description: 'Premium build' },
      { label: 'Above ₹80 Lakhs', value: 'above-80', description: 'Luxury build' },
    ],
  },

  {
    id: 'ecoFeatures',
    condition: (inputs) => inputs.projectType === 'residential',
    question: "Which eco-friendly features would you like?",
    description: "Select all that apply. These help reduce long-term costs and environmental impact.",
    type: 'multi-select',
    options: [
      { label: 'Rainwater Harvesting', value: 'rainwater', icon: '💧', recommended: true, description: 'Mandatory in Tamil Nadu' },
      { label: 'Solar Panel Provision', value: 'solar', icon: '☀️', description: 'Rooftop solar ready' },
      { label: 'Cross-Ventilation', value: 'ventilation', icon: '💨', recommended: true, description: 'Natural air flow design' },
      { label: 'Natural Lighting', value: 'lighting', icon: '🌞', recommended: true, description: 'Maximize daylight' },
    ],
  },

  // ============================================
  // Compound Wall Questions
  // ============================================
  {
    id: 'wallLength',
    condition: (inputs) => inputs.projectType === 'compound',
    question: "What is the total length of compound wall needed? (in feet)",
    type: 'form',
    fields: ['wallLength'],
  },

  {
    id: 'wallHeight',
    condition: (inputs) => inputs.projectType === 'compound',
    question: "What height do you want for the compound wall?",
    type: 'single-select',
    options: [
      { label: '4 feet', value: '4', description: 'Low boundary' },
      { label: '5 feet', value: '5', recommended: true, description: 'Standard height' },
      { label: '6 feet', value: '6', description: 'Privacy wall' },
      { label: '7 feet', value: '7', description: 'High security' },
    ],
  },

  {
    id: 'gates',
    condition: (inputs) => inputs.projectType === 'compound',
    question: "What gates do you need?",
    type: 'single-select',
    options: [
      { label: 'Main Gate Only', value: 'main', description: 'Single entrance' },
      { label: 'Side Gate Only', value: 'side', description: 'Pedestrian access' },
      { label: 'Both Main & Side', value: 'both', recommended: true, description: 'Car + pedestrian' },
    ],
  },

  {
    id: 'pillars',
    condition: (inputs) => inputs.projectType === 'compound',
    question: "What style of pillars do you prefer?",
    type: 'single-select',
    options: [
      { label: 'Plain Pillars', value: 'plain', description: 'Simple, economical' },
      { label: 'Decorative Pillars', value: 'decorative', recommended: true, description: 'Traditional design elements' },
    ],
  },

  // ============================================
  // Commercial Questions
  // ============================================
  {
    id: 'buildingType',
    condition: (inputs) => inputs.projectType === 'commercial',
    question: "What type of commercial building?",
    type: 'single-select',
    options: [
      { label: 'Retail Shop', value: 'shop', icon: '🏪', description: 'Street-facing retail' },
      { label: 'Office Space', value: 'office', icon: '🏢', description: 'Professional workspace' },
      { label: 'Warehouse', value: 'warehouse', icon: '🏭', description: 'Storage facility' },
      { label: 'Mixed Use', value: 'mixed', icon: '🏬', description: 'Shop + residence' },
    ],
  },

  {
    id: 'units',
    condition: (inputs) => inputs.projectType === 'commercial',
    question: "How many units/shops do you need?",
    type: 'single-select',
    options: [
      { label: '1 Unit', value: '1', description: 'Single occupancy' },
      { label: '2-3 Units', value: '2-3', description: 'Small complex' },
      { label: '4-6 Units', value: '4-6', description: 'Medium complex' },
      { label: '7+ Units', value: '7+', description: 'Large complex' },
    ],
  },

  {
    id: 'loadingArea',
    condition: (inputs) => inputs.projectType === 'commercial' && inputs.buildingType === 'warehouse',
    question: "Do you need a loading/unloading area?",
    type: 'single-select',
    options: [
      { label: 'Yes', value: 'yes', icon: '✅', recommended: true, description: 'Truck access area' },
      { label: 'No', value: 'no', icon: '❌', description: 'Not needed' },
    ],
  },
];

/**
 * useQuestionFlow Hook
 */
export function useQuestionFlow(): UseQuestionFlowReturn {
  const questions = useMemo(() => QUESTION_FLOW, []);

  /**
   * Get the next applicable question based on collected inputs
   */
  const getNextQuestion = useCallback(
    (inputs: Partial<FloorPlanInputs>): QuestionConfig | null => {
      // Find answered question IDs
      const answeredIds = new Set<string>();

      if (inputs.clientName) answeredIds.add('clientName');
      if (inputs.projectType) answeredIds.add('projectType');
      if (inputs.plotInput) answeredIds.add('plotInput');
      if (inputs.plotDimensions) answeredIds.add('plotDimensions');
      if (inputs.roadSide) answeredIds.add('roadSide');
      if (inputs.roadWidth) answeredIds.add('roadWidth');
      if (inputs.bedrooms) answeredIds.add('bedrooms');
      if (inputs.bathrooms) answeredIds.add('bathrooms');
      if (inputs.kitchenType) answeredIds.add('kitchenType');
      if (inputs.floors) answeredIds.add('floors');
      if (inputs.hasMutram !== undefined) answeredIds.add('hasMutram');
      if (inputs.hasVerandah !== undefined) answeredIds.add('hasVerandah');
      if (inputs.hasPooja !== undefined) answeredIds.add('hasPooja');
      if (inputs.parking) answeredIds.add('parking');
      if (inputs.staircaseLocation) answeredIds.add('staircaseLocation');
      if (inputs.wallMaterial) answeredIds.add('wallMaterial');
      if (inputs.flooringType) answeredIds.add('flooringType');
      if (inputs.roofType) answeredIds.add('roofType');
      if (inputs.budgetRange) answeredIds.add('budgetRange');
      if (inputs.ecoFeatures && inputs.ecoFeatures.length > 0) answeredIds.add('ecoFeatures');
      // Compound wall
      if (inputs.wallLength) answeredIds.add('wallLength');
      if (inputs.wallHeight) answeredIds.add('wallHeight');
      if (inputs.gates) answeredIds.add('gates');
      if (inputs.pillars) answeredIds.add('pillars');
      // Commercial
      if (inputs.buildingType) answeredIds.add('buildingType');
      if (inputs.units) answeredIds.add('units');
      if (inputs.loadingArea !== undefined) answeredIds.add('loadingArea');

      // Find next unanswered question that passes condition
      for (const question of questions) {
        if (answeredIds.has(question.id)) continue;

        // Check condition
        if (question.condition && !question.condition(inputs)) continue;

        return question;
      }

      return null; // All questions answered
    },
    [questions]
  );

  /**
   * Check if we're at the last question
   */
  const isLastQuestion = useCallback(
    (inputs: Partial<FloorPlanInputs>): boolean => {
      return getNextQuestion(inputs) === null;
    },
    [getNextQuestion]
  );

  /**
   * Get smart default for a question based on inputs
   */
  const getSmartDefault = useCallback(
    (questionId: string, inputs: Partial<FloorPlanInputs>): string | undefined => {
      const question = questions.find((q) => q.id === questionId);
      if (!question?.smartDefault) return undefined;
      return question.smartDefault(inputs);
    },
    [questions]
  );

  /**
   * Get current question index (for progress display)
   */
  const currentQuestionIndex = useMemo(() => {
    // This would need inputs to calculate, returning 0 as base
    return 0;
  }, []);

  return {
    questions,
    currentQuestionIndex,
    getNextQuestion,
    isLastQuestion,
    getSmartDefault,
  };
}

export { QUESTION_FLOW };
