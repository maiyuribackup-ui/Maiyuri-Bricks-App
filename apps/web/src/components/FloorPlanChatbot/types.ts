/**
 * FloorPlanChatbot TypeScript Interfaces
 *
 * Defines all types for the conversational floor plan generation system.
 */

// ============================================
// Core Message Types
// ============================================

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageType = 'text' | 'image' | 'options' | 'progress' | 'error' | 'form';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  type: MessageType;
  options?: QuickOption[];
  imageUrl?: string;
  imageBase64?: string;
  progress?: ProgressData;
  formFields?: FormField[];
  timestamp: Date;
}

export interface QuickOption {
  label: string;
  value: string;
  icon?: string;
  recommended?: boolean;
  description?: string;
  disabled?: boolean;
}

export interface ProgressData {
  stage: string;
  percent: number;
  stages: ProgressStage[];
}

export interface ProgressStage {
  id: string;
  label: string;
  icon: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'awaiting_confirmation';
}

export type GenerationPhase = 'blueprint' | 'isometric';

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

// ============================================
// Question Flow Types
// ============================================

export type QuestionType = 'single-select' | 'multi-select' | 'form' | 'upload';
export type ProjectType = 'residential' | 'compound' | 'commercial';

export interface QuestionConfig {
  id: string;
  question: string;
  description?: string;
  type: QuestionType;
  options?: QuickOption[];
  fields?: string[];
  condition?: (inputs: Partial<FloorPlanInputs>) => boolean;
  smartDefault?: (inputs: Partial<FloorPlanInputs>) => string;
  validation?: (value: string | string[]) => string | null;
}

// ============================================
// Floor Plan Input Types
// ============================================

export interface PlotDimensions {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface Setbacks {
  north: number;
  south: number;
  east: number;
  west: number;
}

export type RoadSide = 'north' | 'south' | 'east' | 'west';
export type RoadWidth = '12' | '20' | '30' | '40+';
export type Bedrooms = '1' | '2' | '3' | '4' | '5+';
export type Bathrooms = '1' | '2' | '3' | '4+';
export type KitchenType = 'open' | 'closed';
export type Floors = 'ground' | 'g+1' | 'g+2';
export type ParkingType = 'none' | 'covered' | 'open';
export type StaircaseLocation = 'inside' | 'outside';
export type WallMaterial = 'mud-interlock' | 'conventional' | 'concrete';
export type FlooringType = 'oxide' | 'aathangudi' | 'vitrified' | 'granite';
export type RoofType = 'rcc' | 'mangalore' | 'metal';
export type BudgetRange = 'under-20' | '20-30' | '30-50' | '50-80' | 'above-80';

export interface FloorPlanInputs {
  // Phase 0: Client Information
  clientName?: string;
  clientContact?: string;
  clientLocation?: string;

  // Phase 1: Project Setup
  projectType: ProjectType;
  plotInput: 'upload' | 'manual';
  surveyImage?: string; // base64

  // Phase 2: Plot Details
  plotDimensions: PlotDimensions;
  roadSide: RoadSide;
  roadWidth: RoadWidth;
  setbacks?: Setbacks;
  plotArea?: number; // Calculated

  // Phase 3: Residential Requirements
  bedrooms: Bedrooms;
  bathrooms: Bathrooms;
  kitchenType: KitchenType;
  floors: Floors;

  // Phase 4: Preferences
  hasMutram: boolean;
  hasVerandah: boolean;
  hasPooja: boolean | 'corner';
  parking: ParkingType;
  staircaseLocation?: StaircaseLocation;

  // Phase 5: Materials
  wallMaterial: WallMaterial;
  flooringType: FlooringType;
  roofType: RoofType;

  // Phase 6: Budget & Eco
  budgetRange: BudgetRange;
  ecoFeatures: string[];

  // Compound Wall specific
  wallLength?: number;
  wallHeight?: '4' | '5' | '6' | '7';
  gates?: 'main' | 'side' | 'both';
  pillars?: 'plain' | 'decorative';

  // Commercial specific
  buildingType?: 'shop' | 'office' | 'warehouse' | 'mixed';
  units?: number;
  loadingArea?: boolean;
}

// ============================================
// Chat Session Types
// ============================================

export type SessionStatus = 'collecting' | 'generating' | 'awaiting_blueprint_confirmation' | 'generating_isometric' | 'presenting' | 'iterating' | 'complete' | 'halted' | 'failed';

export interface GeneratedImages {
  floorPlan?: string; // base64
  courtyard?: string;
  exterior?: string;
  interior?: string;
}

export interface ChatSession {
  sessionId: string;
  status: SessionStatus;
  messages: ChatMessage[];
  currentQuestion: QuestionConfig | null;
  collectedInputs: Partial<FloorPlanInputs>;
  generatedImages: GeneratedImages;
  designContext?: DesignContextSummary;
  createdAt: Date;
  updatedAt: Date;
}

export interface DesignContextSummary {
  totalArea: number;
  builtUpArea: number;
  rooms: RoomSummary[];
  vastuCompliance: boolean;
  ecoScore: number;
}

export interface RoomSummary {
  name: string;
  width: number;
  depth: number;
  area: number;
  zone: string;
}

// ============================================
// API Types
// ============================================

export interface StartSessionRequest {
  projectType: ProjectType;
}

export interface StartSessionResponse {
  sessionId: string;
  firstQuestion: QuestionConfig;
}

export interface AnswerRequest {
  sessionId: string;
  questionId: string;
  answer: string | string[];
}

export interface AnswerResponse {
  nextQuestion?: QuestionConfig;
  status: SessionStatus;
  progress?: ProgressData;
  generatedImages?: GeneratedImages;
  designSummary?: DesignContextSummary;
}

export interface ModifyRequest {
  sessionId: string;
  modification: string;
}

export interface ModifyResponse {
  clarification?: string;
  newImage?: string;
  changes: string[];
  tradeOffs?: string[];
  requiresConfirmation?: boolean;
}

export interface StatusResponse {
  status: 'pending' | 'in_progress' | 'complete' | 'failed' | 'awaiting_blueprint_confirmation' | 'generating_isometric';
  currentStage?: string;
  progress?: number;
  phase?: GenerationPhase;
  error?: string;
  blueprint?: {
    base64Data: string;
    mimeType: string;
  };
  designSummary?: BlueprintDesignSummary;
  confirmationOptions?: ConfirmationOption[];
  result?: {
    images: GeneratedImages;
    designContext: DesignContextSummary;
  };
}

export interface BlueprintDesignSummary {
  plotSize?: string;
  roomCount?: number;
  rooms?: {
    name: string;
    type: string;
    areaSqft: number;
  }[];
  hasCourtyard?: boolean;
  hasVerandah?: boolean;
  vastuCompliant?: boolean;
}

export interface ConfirmationOption {
  label: string;
  value: 'confirm' | 'reject';
  primary?: boolean;
}

export interface BlueprintConfirmationProps {
  blueprintImage: string;
  mimeType?: string;
  designSummary: BlueprintDesignSummary;
  onConfirm: () => void;
  onReject: (feedback?: string) => void;
  isLoading?: boolean;
}

// ============================================
// Component Props Types
// ============================================

export interface FloorPlanChatbotProps {
  className?: string;
  initialProjectType?: ProjectType;
  onDesignComplete?: (images: GeneratedImages, context: DesignContextSummary) => void;
}

export interface ChatMessageProps {
  message: ChatMessage;
  onOptionSelect?: (value: string) => void;
  onFormSubmit?: (values: Record<string, string>) => void;
}

export interface QuickOptionsProps {
  options: QuickOption[];
  onSelect: (value: string) => void;
  multiSelect?: boolean;
  selectedValues?: string[];
  disabled?: boolean;
}

export interface ImageUploaderProps {
  onUpload: (base64: string) => void;
  onCancel: () => void;
  accept?: string;
  maxSizeMB?: number;
}

export interface FloorPlanPreviewProps {
  imageBase64?: string;
  imageUrl?: string;
  title?: string;
  onViewCourtyard?: () => void;
  onViewExterior?: () => void;
  onDownloadDxf?: () => void;
  onDownloadPng?: () => void;
}

export interface ProgressIndicatorProps {
  progress: ProgressData;
}

// ============================================
// Hook Return Types
// ============================================

export interface UseChatSessionReturn {
  session: ChatSession;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setStatus: (status: SessionStatus) => void;
  setCurrentQuestion: (question: QuestionConfig | null) => void;
  updateInputs: (inputs: Partial<FloorPlanInputs>) => void;
  setGeneratedImages: (images: GeneratedImages) => void;
  clearSession: () => void;
  loadSession: (sessionId: string) => Promise<void>;
}

export interface UseQuestionFlowReturn {
  questions: QuestionConfig[];
  currentQuestionIndex: number;
  getNextQuestion: (inputs: Partial<FloorPlanInputs>) => QuestionConfig | null;
  isLastQuestion: (inputs: Partial<FloorPlanInputs>) => boolean;
  getSmartDefault: (questionId: string, inputs: Partial<FloorPlanInputs>) => string | undefined;
}

export interface UseFloorPlanGenerationReturn {
  startSession: (projectType: ProjectType) => Promise<StartSessionResponse>;
  submitAnswer: (questionId: string, answer: string | string[]) => Promise<AnswerResponse>;
  modifyDesign: (modification: string) => Promise<ModifyResponse>;
  confirmModification: () => Promise<ModifyResponse>;
  cancelModification: () => void;
  confirmBlueprint: (confirmed: boolean, feedback?: string) => Promise<BlueprintConfirmationResponse>;
  getStatus: () => Promise<StatusResponse>;
  isLoading: boolean;
  error: string | null;
}

export interface BlueprintConfirmationResponse {
  status: SessionStatus;
  message: string;
  progress?: {
    stage: string;
    percent: number;
    phase: GenerationPhase;
  };
  stages?: ProgressStage[];
  feedbackRecorded?: boolean;
}

// ============================================
// Constants
// ============================================

export const STORAGE_KEY = 'floor-plan-chatbot-session';

export const GENERATION_STAGES: ProgressStage[] = [
  { id: 'vastu', label: 'Applying Vastu principles', icon: '🏛️', status: 'pending' },
  { id: 'eco', label: 'Adding eco-friendly elements', icon: '🌿', status: 'pending' },
  { id: 'zoning', label: 'Organizing room zones', icon: '📍', status: 'pending' },
  { id: 'dimensioning', label: 'Calculating dimensions', icon: '📐', status: 'pending' },
  { id: 'engineering', label: 'Engineering specifications', icon: '🔧', status: 'pending' },
  { id: 'validation', label: 'Validating design', icon: '✅', status: 'pending' },
  { id: 'rendering', label: 'Rendering 3D view', icon: '🎨', status: 'pending' },
];

export const BUDGET_LABELS: Record<BudgetRange, string> = {
  'under-20': 'Under ₹20 Lakhs',
  '20-30': '₹20-30 Lakhs',
  '30-50': '₹30-50 Lakhs',
  '50-80': '₹50-80 Lakhs',
  'above-80': 'Above ₹80 Lakhs',
};

export const ECO_FEATURES = [
  { id: 'rainwater', label: 'Rainwater Harvesting', icon: '💧' },
  { id: 'solar', label: 'Solar Panel Provision', icon: '☀️' },
  { id: 'ventilation', label: 'Cross-Ventilation Design', icon: '💨' },
  { id: 'lighting', label: 'Natural Lighting Priority', icon: '🌞' },
  { id: 'insulation', label: 'Thermal Insulation', icon: '🧱' },
];
