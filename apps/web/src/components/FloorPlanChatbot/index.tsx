/**
 * FloorPlanChatbot Module
 *
 * Exports the chatbot-driven floor plan generation system.
 */

// Main component
export { FloorPlanChatbot } from './FloorPlanChatbot';

// Sub-components
export { ChatMessage } from './ChatMessage';
export { QuickOptions } from './QuickOptions';
export { ImageUploader } from './ImageUploader';
export { FloorPlanPreview } from './FloorPlanPreview';
export { ProgressIndicator } from './ProgressIndicator';

// Hooks
export { useChatSession } from './hooks/useChatSession';
export { useQuestionFlow } from './hooks/useQuestionFlow';
export { useFloorPlanGeneration } from './hooks/useFloorPlanGeneration';

// Types
export type {
  // Core types
  ChatSession,
  ChatMessage as ChatMessageType,
  QuickOption,
  QuestionConfig,
  ProgressData,
  ProgressStage,
  FloorPlanInputs,
  PlotDimensions,

  // Props types
  FloorPlanChatbotProps,
  ChatMessageProps,
  QuickOptionsProps,
  ImageUploaderProps,
  FloorPlanPreviewProps,
  ProgressIndicatorProps,

  // Enums/Literals
  MessageRole,
  MessageType,
  SessionStatus,
  ProjectType,
  Bedrooms,
  Bathrooms,
  KitchenType,
  Floors,
  WallMaterial,
  FlooringType,
  RoofType,
  BudgetRange,
  RoadSide,
  ParkingType,
} from './types';
