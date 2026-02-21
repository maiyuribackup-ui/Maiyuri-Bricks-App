/**
 * Call Recording Processing Types
 *
 * Shared interfaces for the call recording processing pipeline.
 */

export interface CallRecording {
  id: string;
  lead_id: string | null;
  phone_number: string;
  telegram_file_id: string;
  telegram_chat_id: number;
  original_filename: string;
  processing_status: string;
  retry_count: number;
  file_size_bytes: number | null;
}

export type ProcessingStatus =
  | "pending"
  | "downloading"
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed";

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
}

export interface CallInsights {
  complaints?: string[];
  negative_feedback?: string[];
  negotiation_signals?: string[];
  price_expectations?: string[];
  positive_signals?: string[];
  recommended_actions?: string[];
  sentiment?: "positive" | "negative" | "neutral" | "mixed";
}

export interface AnalysisResult {
  summary: string;
  insights: CallInsights;
  scoreImpact: number;
}

export type ProductInterest =
  | "8_inch_mud_interlock"
  | "6_inch_mud_interlock"
  | "8_inch_cement_interlock"
  | "6_inch_cement_interlock"
  | "compound_wall_project"
  | "residential_project"
  | "laying_services";

export interface ExtractedLeadDetails {
  lead_type: "Residential" | "Commercial" | "Industrial" | "Government" | "Other";
  classification:
    | "builder"
    | "dealer"
    | "architect"
    | "direct_customer"
    | "contractor"
    | "engineer";
  requirement_type:
    | "residential_house"
    | "commercial_building"
    | "compound_wall"
    | "industrial_shed"
    | "government_project"
    | "other"
    | null;
  product_interests: ProductInterest[];
  site_region: string | null;
  site_location: string | null;
  next_action: string | null;
  estimated_quantity: number | null;
  notes: string | null;
}

export interface UploadResult {
  fileId: string;
  webViewLink: string;
  webContentLink?: string;
}

export interface NotificationData {
  leadName?: string;
  leadId?: string;
  phoneNumber: string;
  duration: number;
  summary: string;
  insights: CallInsights;
  scoreImpact: number;
  driveUrl: string;
  extractedDetails?: ExtractedLeadDetails;
  isNewlyAutoPopulated?: boolean;
}
