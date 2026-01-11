import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';
import { planningService } from '@/lib/planning-service';

/**
 * Request schema for submitting an answer
 */
const SubmitAnswerRequestSchema = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string(),
  answer: z.union([z.string(), z.array(z.string()), z.record(z.unknown())]),
});

/**
 * Question configuration
 */
interface QuestionConfig {
  id: string;
  question: string;
  helpText?: string;
  type: 'single-select' | 'multi-select' | 'form' | 'upload';
  options?: {
    label: string;
    value: string;
    icon?: string;
    recommended?: boolean;
    description?: string;
  }[];
  fields?: string[];
  condition?: (inputs: Record<string, unknown>) => boolean;
}

/**
 * Complete question flow for residential projects
 */
const RESIDENTIAL_QUESTIONS: QuestionConfig[] = [
  {
    id: 'clientName',
    question: "What's the client or project name for this floor plan?",
    type: 'form',
    fields: ['clientName'],
  },
  {
    id: 'plotInput',
    question:
      "Let's start with your plot. Do you have a land survey document?",
    type: 'single-select',
    options: [
      {
        label: 'Upload Survey',
        value: 'upload',
        icon: '📄',
        recommended: true,
        description: 'Auto-extract dimensions',
      },
      {
        label: 'Enter Manually',
        value: 'manual',
        icon: '✏️',
        description: 'Type dimensions',
      },
    ],
  },
  {
    id: 'plotDimensions',
    question: 'Please enter your plot dimensions (in feet):',
    type: 'form',
    fields: ['north', 'south', 'east', 'west'],
    condition: (inputs) => inputs.plotInput === 'manual',
  },
  {
    id: 'surveyUpload',
    question: 'Upload your land survey document:',
    type: 'upload',
    condition: (inputs) => inputs.plotInput === 'upload',
  },
  {
    id: 'roadSide',
    question: 'Which side of your plot faces the road?',
    type: 'single-select',
    options: [
      { label: 'North', value: 'north', icon: '⬆️' },
      { label: 'South', value: 'south', icon: '⬇️' },
      { label: 'East', value: 'east', icon: '➡️', recommended: true },
      { label: 'West', value: 'west', icon: '⬅️' },
    ],
  },
  {
    id: 'setbacks',
    question: 'What are the required setback distances from plot boundaries (in feet)?',
    type: 'form',
    fields: ['north', 'south', 'east', 'west'],
    helpText: 'Setbacks are the minimum distances that must be maintained from plot boundaries. Common values: 3-10 feet depending on local regulations.',
  },
  {
    id: 'bedrooms',
    question: 'How many bedrooms do you need?',
    type: 'single-select',
    options: [
      { label: '1 Bedroom', value: '1', icon: '🛏️' },
      { label: '2 Bedrooms', value: '2', icon: '🛏️', recommended: true },
      { label: '3 Bedrooms', value: '3', icon: '🛏️' },
      { label: '4+ Bedrooms', value: '4+', icon: '🛏️' },
    ],
  },
  {
    id: 'bathrooms',
    question: 'How many bathrooms?',
    type: 'single-select',
    options: [
      { label: '1 Bathroom', value: '1', icon: '🚿' },
      { label: '2 Bathrooms', value: '2', icon: '🚿', recommended: true },
      { label: '3+ Bathrooms', value: '3+', icon: '🚿' },
    ],
  },
  {
    id: 'floors',
    question: 'How many floors?',
    type: 'single-select',
    options: [
      { label: 'Ground Only', value: 'ground', icon: '🏠' },
      {
        label: 'Ground + 1',
        value: 'g+1',
        icon: '🏘️',
        recommended: true,
        description: 'Most common for families',
      },
      { label: 'Ground + 2', value: 'g+2', icon: '🏢' },
    ],
  },
  {
    id: 'hasMutram',
    question:
      'Would you like a traditional open-to-sky courtyard (mutram)?',
    type: 'single-select',
    options: [
      {
        label: 'Yes',
        value: 'yes',
        icon: '🌿',
        recommended: true,
        description: 'Natural ventilation & light, Vastu compliant',
      },
      {
        label: 'No',
        value: 'no',
        icon: '🏠',
        description: 'More indoor space',
      },
    ],
  },
  {
    id: 'hasVerandah',
    question: 'Include a front verandah (thinnai)?',
    type: 'single-select',
    options: [
      {
        label: 'Yes',
        value: 'yes',
        icon: '🪑',
        recommended: true,
        description: 'Traditional covered porch for guests',
      },
      { label: 'No', value: 'no', icon: '🚪' },
    ],
  },
  {
    id: 'hasPooja',
    question: 'Dedicated pooja room?',
    type: 'single-select',
    options: [
      {
        label: 'Yes - Separate Room',
        value: 'separate',
        icon: '🙏',
        recommended: true,
        description: 'Dedicated prayer room',
      },
      {
        label: 'Yes - Corner Space',
        value: 'corner',
        icon: '🕯️',
        description: 'Prayer corner in another room',
      },
      { label: 'No', value: 'no', icon: '❌' },
    ],
  },
  {
    id: 'parking',
    question: 'Car parking requirement?',
    type: 'single-select',
    options: [
      { label: 'No Parking', value: 'none', icon: '🚫' },
      {
        label: 'Covered - 1 Car',
        value: 'covered-1',
        icon: '🚗',
        recommended: true,
      },
      { label: 'Covered - 2 Cars', value: 'covered-2', icon: '🚙🚙' },
      { label: 'Open Parking', value: 'open', icon: '🅿️' },
    ],
  },
  {
    id: 'wallMaterial',
    question: 'What wall construction do you prefer?',
    type: 'single-select',
    options: [
      {
        label: 'Mud Interlock Bricks',
        value: 'mud-interlock',
        icon: '🧱',
        recommended: true,
        description: 'Eco-friendly, excellent thermal comfort',
      },
      {
        label: 'Conventional Bricks',
        value: 'conventional',
        icon: '🏗️',
        description: 'Traditional, widely available',
      },
      {
        label: 'Concrete Blocks',
        value: 'concrete',
        icon: '⬜',
        description: 'Fast construction',
      },
    ],
  },
  {
    id: 'flooringType',
    question: 'Flooring preference?',
    type: 'single-select',
    options: [
      {
        label: 'Oxide Flooring',
        value: 'oxide',
        icon: '🔴',
        recommended: true,
        description: 'Cool, low maintenance, eco-friendly',
      },
      {
        label: 'Aathangudi Tiles',
        value: 'aathangudi',
        icon: '🟤',
        description: 'Traditional handcrafted beauty',
      },
      {
        label: 'Vitrified Tiles',
        value: 'vitrified',
        icon: '⬜',
        description: 'Modern, easy cleaning',
      },
      {
        label: 'Granite',
        value: 'granite',
        icon: '⚫',
        description: 'Premium, durable',
      },
    ],
  },
  {
    id: 'roofType',
    question: 'Roof style preference?',
    type: 'single-select',
    options: [
      {
        label: 'Mangalore Tiles',
        value: 'mangalore',
        icon: '🏠',
        recommended: true,
        description: 'Traditional, excellent insulation',
      },
      {
        label: 'RCC Slab',
        value: 'rcc',
        icon: '⬜',
        description: 'Modern, allows future expansion',
      },
      {
        label: 'Metal Sheet',
        value: 'metal',
        icon: '📄',
        description: 'Economical, quick installation',
      },
    ],
  },
  {
    id: 'ecoFeatures',
    question: 'Which eco-friendly features would you like?',
    type: 'multi-select',
    options: [
      {
        label: 'Rainwater Harvesting',
        value: 'rainwater',
        icon: '💧',
        recommended: true,
      },
      {
        label: 'Solar Provision',
        value: 'solar',
        icon: '☀️',
        recommended: true,
      },
      {
        label: 'Cross Ventilation',
        value: 'ventilation',
        icon: '🌬️',
        recommended: true,
      },
      { label: 'Grey Water Recycling', value: 'greywater', icon: '♻️' },
    ],
  },
  {
    id: 'budgetRange',
    question: 'Approximate budget range?',
    type: 'single-select',
    options: [
      { label: 'Under 20 Lakhs', value: 'under-20l', icon: '💰' },
      {
        label: '20-30 Lakhs',
        value: '20-30l',
        icon: '💰💰',
        recommended: true,
      },
      { label: '30-50 Lakhs', value: '30-50l', icon: '💰💰💰' },
      { label: 'Above 50 Lakhs', value: 'above-50l', icon: '💎' },
    ],
  },
];

/**
 * Question flow for compound wall projects
 */
const COMPOUND_QUESTIONS: QuestionConfig[] = [
  {
    id: 'clientName',
    question: "What's the client or project name for this floor plan?",
    type: 'form',
    fields: ['clientName'],
  },
  {
    id: 'plotInput',
    question: 'Do you have a survey document for your plot?',
    type: 'single-select',
    options: [
      { label: 'Upload Survey', value: 'upload', icon: '📄', recommended: true },
      { label: 'Enter Manually', value: 'manual', icon: '✏️' },
    ],
  },
  {
    id: 'plotDimensions',
    question: 'Enter your plot perimeter dimensions (in feet):',
    type: 'form',
    fields: ['north', 'south', 'east', 'west'],
    condition: (inputs) => inputs.plotInput === 'manual',
  },
  {
    id: 'surveyUpload',
    question: 'Upload your land survey document:',
    type: 'upload',
    condition: (inputs) => inputs.plotInput === 'upload',
  },
  {
    id: 'wallHeight',
    question: 'Desired wall height?',
    type: 'single-select',
    options: [
      { label: '4 Feet', value: '4', icon: '📏' },
      { label: '5 Feet', value: '5', icon: '📏', recommended: true },
      { label: '6 Feet', value: '6', icon: '📏' },
      { label: '7 Feet', value: '7', icon: '📏' },
    ],
  },
  {
    id: 'gates',
    question: 'What gates do you need?',
    type: 'single-select',
    options: [
      { label: 'Main Gate Only', value: 'main', icon: '🚪' },
      { label: 'Side Gate Only', value: 'side', icon: '🚪' },
      { label: 'Both Main & Side', value: 'both', icon: '🚪🚪', recommended: true },
    ],
  },
  {
    id: 'pillarStyle',
    question: 'Pillar style preference?',
    type: 'single-select',
    options: [
      { label: 'Plain Pillars', value: 'plain', icon: '⬜' },
      { label: 'Decorative Pillars', value: 'decorative', icon: '🏛️', recommended: true },
    ],
  },
  {
    id: 'wallMaterial',
    question: 'Wall construction material?',
    type: 'single-select',
    options: [
      {
        label: 'Mud Interlock Bricks',
        value: 'mud-interlock',
        icon: '🧱',
        recommended: true,
        description: 'Eco-friendly, durable',
      },
      {
        label: 'Conventional Bricks',
        value: 'conventional',
        icon: '🏗️',
      },
      {
        label: 'Concrete Blocks',
        value: 'concrete',
        icon: '⬜',
      },
    ],
  },
];

/**
 * Question flow for commercial projects
 */
const COMMERCIAL_QUESTIONS: QuestionConfig[] = [
  {
    id: 'clientName',
    question: "What's the client or project name for this floor plan?",
    type: 'form',
    fields: ['clientName'],
  },
  {
    id: 'plotInput',
    question: 'Do you have a survey document?',
    type: 'single-select',
    options: [
      { label: 'Upload Survey', value: 'upload', icon: '📄', recommended: true },
      { label: 'Enter Manually', value: 'manual', icon: '✏️' },
    ],
  },
  {
    id: 'plotDimensions',
    question: 'Enter plot dimensions (in feet):',
    type: 'form',
    fields: ['north', 'south', 'east', 'west'],
    condition: (inputs) => inputs.plotInput === 'manual',
  },
  {
    id: 'surveyUpload',
    question: 'Upload your land survey document:',
    type: 'upload',
    condition: (inputs) => inputs.plotInput === 'upload',
  },
  {
    id: 'buildingType',
    question: 'What type of commercial building?',
    type: 'single-select',
    options: [
      { label: 'Shop / Retail', value: 'shop', icon: '🏪', recommended: true },
      { label: 'Office Space', value: 'office', icon: '🏢' },
      { label: 'Warehouse', value: 'warehouse', icon: '🏭' },
      { label: 'Mixed Use', value: 'mixed', icon: '🏬' },
    ],
  },
  {
    id: 'units',
    question: 'Number of units/shops?',
    type: 'single-select',
    options: [
      { label: '1 Unit', value: '1', icon: '1️⃣' },
      { label: '2-4 Units', value: '2-4', icon: '🔢', recommended: true },
      { label: '5-10 Units', value: '5-10', icon: '🔢' },
      { label: '10+ Units', value: '10+', icon: '🔢' },
    ],
  },
  {
    id: 'floors',
    question: 'Number of floors?',
    type: 'single-select',
    options: [
      { label: 'Ground Only', value: 'ground', icon: '🏠' },
      { label: 'Ground + 1', value: 'g+1', icon: '🏘️', recommended: true },
      { label: 'Ground + 2', value: 'g+2', icon: '🏢' },
      { label: 'Ground + 3', value: 'g+3', icon: '🏢' },
    ],
  },
  {
    id: 'parking',
    question: 'Parking requirement?',
    type: 'single-select',
    options: [
      { label: 'No Parking', value: 'none', icon: '🚫' },
      { label: 'Front Parking', value: 'front', icon: '🅿️', recommended: true },
      { label: 'Basement Parking', value: 'basement', icon: '🅿️' },
    ],
  },
  {
    id: 'loadingArea',
    question: 'Need a loading/unloading area?',
    type: 'single-select',
    options: [
      { label: 'Yes', value: 'yes', icon: '🚛' },
      { label: 'No', value: 'no', icon: '❌', recommended: true },
    ],
  },
];

/**
 * Get question flow based on project type
 */
function getQuestionFlow(projectType: string): QuestionConfig[] {
  switch (projectType) {
    case 'compound':
      return COMPOUND_QUESTIONS;
    case 'commercial':
      return COMMERCIAL_QUESTIONS;
    default:
      return RESIDENTIAL_QUESTIONS;
  }
}

/**
 * Get next applicable question
 */
function getNextQuestion(
  questions: QuestionConfig[],
  currentIndex: number,
  inputs: Record<string, unknown>
): { question: QuestionConfig | null; newIndex: number } {
  for (let i = currentIndex; i < questions.length; i++) {
    const q = questions[i];
    // Check condition if exists
    if (q.condition && !q.condition(inputs)) {
      continue; // Skip this question
    }
    return { question: q, newIndex: i + 1 };
  }
  return { question: null, newIndex: questions.length };
}

/**
 * POST /api/planning/answer
 *
 * Submit an answer and get the next question or trigger generation
 *
 * @example
 * POST /api/planning/answer
 * {
 *   "sessionId": "uuid",
 *   "questionId": "bedrooms",
 *   "answer": "3"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const parsed = SubmitAnswerRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const { sessionId, questionId, answer } = parsed.data;

    // Get session from planning service (load from DB if not in memory)
    let session = await planningService.getSessionAsync(sessionId);
    if (!session) {
      return error('Session not found. Please start a new session.', 404);
    }

    // Handle survey upload - process with DiagramInterpreter agent
    if (questionId === 'surveyUpload' && typeof answer === 'string') {
      const surveyResult = await planningService.processSurveyImage(sessionId, answer);

      if (surveyResult.success && surveyResult.dimensions) {
        // Update session with extracted dimensions
        const updatedSession = planningService.getSession(sessionId);
        if (updatedSession) {
          // Store the answer and extracted data
          planningService.updateInputs(sessionId, {
            [questionId]: 'processed',
            plotDimensions: surveyResult.dimensions,
            roadSide: surveyResult.orientation || 'east',
          });
        }

        // Get question flow
        const questions = getQuestionFlow(session.projectType);

        // Find next question after surveyUpload
        const surveyIndex = questions.findIndex(q => q.id === 'surveyUpload');
        const { question: nextQuestion, newIndex } = getNextQuestion(
          questions,
          surveyIndex + 1,
          { ...session.inputs, plotDimensions: surveyResult.dimensions }
        );
        planningService.setQuestionIndex(sessionId, newIndex);

        return success({
          status: 'collecting',
          message: `I've analyzed your survey document and extracted the plot dimensions: ${surveyResult.dimensions.north}'×${surveyResult.dimensions.east}' feet. ${surveyResult.orientation ? `The road appears to be on the ${surveyResult.orientation} side.` : ''}`,
          extractedData: {
            dimensions: surveyResult.dimensions,
            orientation: surveyResult.orientation,
          },
          nextQuestion: nextQuestion ? {
            id: nextQuestion.id,
            question: nextQuestion.question,
            type: nextQuestion.type,
            options: nextQuestion.options,
            fields: nextQuestion.fields,
          } : null,
        });
      } else {
        // Survey processing failed - ask for manual input
        return success({
          status: 'collecting',
          message: "I couldn't extract the dimensions automatically. Let me ask for them manually.",
          nextQuestion: {
            id: 'plotDimensions',
            question: 'Please enter your plot dimensions (in feet):',
            type: 'form',
            fields: ['north', 'south', 'east', 'west'],
          },
        });
      }
    }

    // Store the answer - handle form questions specially
    let inputsToUpdate: Record<string, unknown> = {};

    // Special handling for client name form question
    if (questionId === 'clientName' && typeof answer === 'object' && !Array.isArray(answer) && answer !== null) {
      // Unwrap single-field form
      const formData = answer as Record<string, unknown>;
      if ('clientName' in formData) {
        inputsToUpdate = {
          clientName: formData.clientName,
          clientContact: formData.clientContact,
          clientLocation: formData.clientLocation,
        };
      }
    } else if (typeof answer === 'object' && !Array.isArray(answer) && answer !== null) {
      // For multi-field forms (like plotDimensions), keep as nested object
      inputsToUpdate = { [questionId]: answer };
    } else {
      // For simple answers (string, array)
      inputsToUpdate = { [questionId]: answer };
    }

    await planningService.updateInputs(sessionId, inputsToUpdate);

    // Get updated session
    const updatedSession = planningService.getSession(sessionId)!;

    // Get question flow for this project type
    const questions = getQuestionFlow(updatedSession.projectType);

    // Get next question
    const { question: nextQuestion, newIndex } = getNextQuestion(
      questions,
      updatedSession.currentQuestionIndex,
      updatedSession.inputs
    );

    // Update session index
    planningService.setQuestionIndex(sessionId, newIndex);

    // If no more questions, start generation
    if (!nextQuestion) {
      // Start async generation
      planningService.startGeneration(sessionId).catch(err => {
        console.error('Generation error:', err);
      });

      return success({
        status: 'generating',
        message:
          "I have all the information I need. Let me design your floor plan now...",
        inputs: updatedSession.inputs,
        progress: {
          stage: 'Starting design process...',
          percent: 0,
          stages: planningService.getStages(sessionId),
        },
      });
    }

    // Generate appropriate message based on answer
    let message = '';
    const prevQuestion = questions.find((q) => q.id === questionId);
    if (prevQuestion?.options) {
      const selectedOption = prevQuestion.options.find(
        (o) => o.value === answer || (Array.isArray(answer) && answer.includes(o.value))
      );
      if (selectedOption?.recommended) {
        message = 'Excellent choice! ';
      }
    }

    // Add contextual message for specific answers
    if (questionId === 'hasMutram' && answer === 'yes') {
      message +=
        'A mutram is perfect for Tamil Nadu climate - it provides natural cooling and brings positive energy according to Vastu.';
    } else if (questionId === 'wallMaterial' && answer === 'mud-interlock') {
      message +=
        "Mud interlock bricks from Maiyuri Bricks will give your home excellent thermal comfort and reduce your carbon footprint.";
    } else if (questionId === 'flooringType' && answer === 'aathangudi') {
      message +=
        'Aathangudi tiles are handcrafted in Tamil Nadu and each tile is a unique work of art!';
    }

    return success({
      status: 'collecting',
      message: message || undefined,
      nextQuestion: {
        id: nextQuestion.id,
        question: nextQuestion.question,
        type: nextQuestion.type,
        options: nextQuestion.options,
        fields: nextQuestion.fields,
      },
      progress: {
        current: newIndex,
        total: questions.filter((q) => !q.condition || q.condition(updatedSession.inputs)).length,
      },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Submit answer error:', err);
    return error('Failed to process answer', 500);
  }
}
