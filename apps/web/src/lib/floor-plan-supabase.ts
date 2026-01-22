/**
 * Floor Plan Supabase Service
 *
 * Provides persistent storage for floor plan chatbot sessions,
 * messages, progress tracking, and generated images.
 */

import { getSupabaseAdmin } from "./supabase-admin";
import { getSupabase } from "./supabase-browser";
import type {
  ChatMessage,
  FloorPlanInputs,
  GeneratedImages,
  ProgressData,
  SessionStatus,
  QuestionConfig,
  DesignContextSummary,
  BlueprintDesignSummary,
} from "@/components/FloorPlanChatbot/types";

// Re-export ChatMessage for use in other files
export type { ChatMessage } from "@/components/FloorPlanChatbot/types";

// ============================================
// Database Types
// ============================================

export interface DbFloorPlanSession {
  id: string;
  user_id: string | null;
  status: SessionStatus;
  project_type: "residential" | "compound" | "commercial" | null;
  client_name: string | null;
  client_contact: string | null;
  client_location: string | null;
  collected_inputs: Partial<FloorPlanInputs>;
  generated_images: GeneratedImages;
  blueprint_image: { base64Data: string; mimeType: string } | null;
  design_context: DesignContextSummary | null;
  current_question_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface DbFloorPlanMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  message_type: "text" | "image" | "options" | "progress" | "error" | "form";
  metadata: Record<string, unknown>;
  sequence_number: number;
  created_at: string;
}

export interface DbFloorPlanProgress {
  id: string;
  session_id: string;
  phase: "blueprint" | "isometric";
  current_stage: string;
  percent: number;
  stages: ProgressData["stages"];
  created_at: string;
  updated_at: string;
}

export interface DbFloorPlanModification {
  id: string;
  session_id: string;
  modification_request: string;
  clarification: string | null;
  changes: string[];
  trade_offs: string[];
  status: "pending" | "confirmed" | "rejected";
  before_image: { base64Data: string; mimeType: string } | null;
  after_image: { base64Data: string; mimeType: string } | null;
  created_at: string;
  processed_at: string | null;
}

// ============================================
// Service Result Type
// ============================================

export interface FloorPlanResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// Floor Plan Supabase Service
// ============================================

class FloorPlanSupabaseService {
  /**
   * Create a new floor plan session
   */
  async createSession(
    userId?: string,
    projectType?: "residential" | "compound" | "commercial",
    clientName?: string,
    clientContact?: string,
    clientLocation?: string,
  ): Promise<FloorPlanResult<DbFloorPlanSession>> {
    try {
      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from("floor_plan_sessions")
        .insert({
          user_id: userId || null,
          project_type: projectType || null,
          client_name: clientName || null,
          client_contact: clientContact || null,
          client_location: clientLocation || null,
          status: "collecting",
          collected_inputs: {},
          generated_images: {},
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating session:", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DbFloorPlanSession };
    } catch (err) {
      console.error("Error creating session:", err);
      return { success: false, error: "Failed to create session" };
    }
  }

  /**
   * Get a session by ID
   */
  async getSession(
    sessionId: string,
  ): Promise<FloorPlanResult<DbFloorPlanSession>> {
    try {
      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from("floor_plan_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (error) {
        console.error("Error fetching session:", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DbFloorPlanSession };
    } catch (err) {
      console.error("Error fetching session:", err);
      return { success: false, error: "Failed to fetch session" };
    }
  }

  /**
   * Get sessions for a user
   */
  async getUserSessions(
    userId: string,
    limit = 10,
  ): Promise<FloorPlanResult<DbFloorPlanSession[]>> {
    try {
      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from("floor_plan_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching user sessions:", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: (data || []) as DbFloorPlanSession[] };
    } catch (err) {
      console.error("Error fetching user sessions:", err);
      return { success: false, error: "Failed to fetch user sessions" };
    }
  }

  /**
   * Update session status
   */
  async updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
  ): Promise<FloorPlanResult<void>> {
    try {
      const supabase = getSupabaseAdmin();

      const updateData: Record<string, unknown> = { status };
      if (status === "complete") {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("floor_plan_sessions")
        .update(updateData)
        .eq("id", sessionId);

      if (error) {
        console.error("Error updating session status:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error("Error updating session status:", err);
      return { success: false, error: "Failed to update session status" };
    }
  }

  /**
   * Update collected inputs
   */
  async updateCollectedInputs(
    sessionId: string,
    inputs: Partial<FloorPlanInputs>,
  ): Promise<FloorPlanResult<void>> {
    try {
      const supabase = getSupabaseAdmin();

      // Get current inputs first
      const { data: session } = await supabase
        .from("floor_plan_sessions")
        .select("collected_inputs")
        .eq("id", sessionId)
        .single();

      const currentInputs =
        (session?.collected_inputs as Partial<FloorPlanInputs>) || {};
      const mergedInputs = { ...currentInputs, ...inputs };

      const { error } = await supabase
        .from("floor_plan_sessions")
        .update({ collected_inputs: mergedInputs })
        .eq("id", sessionId);

      if (error) {
        console.error("Error updating inputs:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error("Error updating inputs:", err);
      return { success: false, error: "Failed to update inputs" };
    }
  }

  /**
   * Update generated images
   */
  async updateGeneratedImages(
    sessionId: string,
    images: GeneratedImages,
  ): Promise<FloorPlanResult<void>> {
    try {
      const supabase = getSupabaseAdmin();

      const { error } = await supabase
        .from("floor_plan_sessions")
        .update({ generated_images: images })
        .eq("id", sessionId);

      if (error) {
        console.error("Error updating images:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error("Error updating images:", err);
      return { success: false, error: "Failed to update images" };
    }
  }

  /**
   * Update blueprint image awaiting confirmation
   */
  async updateBlueprintImage(
    sessionId: string,
    blueprintImage: { base64Data: string; mimeType: string } | null,
  ): Promise<FloorPlanResult<void>> {
    try {
      const supabase = getSupabaseAdmin();

      const { error } = await supabase
        .from("floor_plan_sessions")
        .update({ blueprint_image: blueprintImage })
        .eq("id", sessionId);

      if (error) {
        console.error("Error updating blueprint:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error("Error updating blueprint:", err);
      return { success: false, error: "Failed to update blueprint" };
    }
  }

  /**
   * Update design context
   */
  async updateDesignContext(
    sessionId: string,
    designContext: DesignContextSummary | null,
  ): Promise<FloorPlanResult<void>> {
    try {
      const supabase = getSupabaseAdmin();

      const { error } = await supabase
        .from("floor_plan_sessions")
        .update({ design_context: designContext })
        .eq("id", sessionId);

      if (error) {
        console.error("Error updating design context:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error("Error updating design context:", err);
      return { success: false, error: "Failed to update design context" };
    }
  }

  /**
   * Set current question
   */
  async setCurrentQuestion(
    sessionId: string,
    questionId: string | null,
  ): Promise<FloorPlanResult<void>> {
    try {
      const supabase = getSupabaseAdmin();

      const { error } = await supabase
        .from("floor_plan_sessions")
        .update({ current_question_id: questionId })
        .eq("id", sessionId);

      if (error) {
        console.error("Error setting current question:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error("Error setting current question:", err);
      return { success: false, error: "Failed to set current question" };
    }
  }

  /**
   * Update client information
   */
  async updateClientInfo(
    sessionId: string,
    clientInfo: {
      clientName?: string;
      clientContact?: string;
      clientLocation?: string;
    },
  ): Promise<FloorPlanResult<void>> {
    try {
      const supabase = getSupabaseAdmin();

      const updateData: Record<string, unknown> = {};
      if (clientInfo.clientName !== undefined)
        updateData.client_name = clientInfo.clientName;
      if (clientInfo.clientContact !== undefined)
        updateData.client_contact = clientInfo.clientContact;
      if (clientInfo.clientLocation !== undefined)
        updateData.client_location = clientInfo.clientLocation;

      const { error } = await supabase
        .from("floor_plan_sessions")
        .update(updateData)
        .eq("id", sessionId);

      if (error) {
        console.error("Error updating client info:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error("Error updating client info:", err);
      return { success: false, error: "Failed to update client info" };
    }
  }

  // ============================================
  // Message Operations
  // ============================================

  /**
   * Add a message to a session
   */
  async addMessage(
    sessionId: string,
    message: Omit<ChatMessage, "id" | "timestamp">,
  ): Promise<FloorPlanResult<DbFloorPlanMessage>> {
    try {
      const supabase = getSupabaseAdmin();

      // Get the next sequence number
      const { data: lastMessage } = await supabase
        .from("floor_plan_messages")
        .select("sequence_number")
        .eq("session_id", sessionId)
        .order("sequence_number", { ascending: false })
        .limit(1)
        .single();

      const sequenceNumber = (lastMessage?.sequence_number || 0) + 1;

      // Prepare metadata
      const metadata: Record<string, unknown> = {};
      if (message.options) metadata.options = message.options;
      if (message.imageUrl) metadata.imageUrl = message.imageUrl;
      if (message.imageBase64) metadata.imageBase64 = message.imageBase64;
      if (message.progress) metadata.progress = message.progress;
      if (message.formFields) metadata.formFields = message.formFields;

      const { data, error } = await supabase
        .from("floor_plan_messages")
        .insert({
          session_id: sessionId,
          role: message.role,
          content: message.content,
          message_type: message.type,
          metadata,
          sequence_number: sequenceNumber,
        })
        .select()
        .single();

      if (error) {
        console.error("Error adding message:", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DbFloorPlanMessage };
    } catch (err) {
      console.error("Error adding message:", err);
      return { success: false, error: "Failed to add message" };
    }
  }

  /**
   * Get all messages for a session
   */
  async getMessages(
    sessionId: string,
  ): Promise<FloorPlanResult<ChatMessage[]>> {
    try {
      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from("floor_plan_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("sequence_number", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        return { success: false, error: error.message };
      }

      // Transform to ChatMessage format
      const messages: ChatMessage[] = (data || []).map(
        (msg: DbFloorPlanMessage) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          type: msg.message_type,
          options: msg.metadata?.options as ChatMessage["options"],
          imageUrl: msg.metadata?.imageUrl as string | undefined,
          imageBase64: msg.metadata?.imageBase64 as string | undefined,
          progress: msg.metadata?.progress as ChatMessage["progress"],
          formFields: msg.metadata?.formFields as ChatMessage["formFields"],
          timestamp: new Date(msg.created_at),
        }),
      );

      return { success: true, data: messages };
    } catch (err) {
      console.error("Error fetching messages:", err);
      return { success: false, error: "Failed to fetch messages" };
    }
  }

  // ============================================
  // Progress Operations
  // ============================================

  /**
   * Update or create generation progress
   */
  async updateProgress(
    sessionId: string,
    progress: Omit<
      DbFloorPlanProgress,
      "id" | "session_id" | "created_at" | "updated_at"
    >,
  ): Promise<FloorPlanResult<void>> {
    try {
      const supabase = getSupabaseAdmin();

      // Check if progress record exists
      const { data: existing } = await supabase
        .from("floor_plan_progress")
        .select("id")
        .eq("session_id", sessionId)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("floor_plan_progress")
          .update({
            phase: progress.phase,
            current_stage: progress.current_stage,
            percent: progress.percent,
            stages: progress.stages,
          })
          .eq("session_id", sessionId);

        if (error) {
          console.error("Error updating progress:", error);
          return { success: false, error: error.message };
        }
      } else {
        // Insert new
        const { error } = await supabase.from("floor_plan_progress").insert({
          session_id: sessionId,
          phase: progress.phase,
          current_stage: progress.current_stage,
          percent: progress.percent,
          stages: progress.stages,
        });

        if (error) {
          console.error("Error creating progress:", error);
          return { success: false, error: error.message };
        }
      }

      return { success: true };
    } catch (err) {
      console.error("Error updating progress:", err);
      return { success: false, error: "Failed to update progress" };
    }
  }

  /**
   * Get progress for a session
   */
  async getProgress(
    sessionId: string,
  ): Promise<FloorPlanResult<DbFloorPlanProgress | null>> {
    try {
      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from("floor_plan_progress")
        .select("*")
        .eq("session_id", sessionId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found
        console.error("Error fetching progress:", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: (data as DbFloorPlanProgress) || null };
    } catch (err) {
      console.error("Error fetching progress:", err);
      return { success: false, error: "Failed to fetch progress" };
    }
  }

  /**
   * Delete progress for a session
   */
  async deleteProgress(sessionId: string): Promise<FloorPlanResult<void>> {
    try {
      const supabase = getSupabaseAdmin();

      const { error } = await supabase
        .from("floor_plan_progress")
        .delete()
        .eq("session_id", sessionId);

      if (error) {
        console.error("Error deleting progress:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error("Error deleting progress:", err);
      return { success: false, error: "Failed to delete progress" };
    }
  }

  // ============================================
  // Modification Operations
  // ============================================

  /**
   * Create a modification request
   */
  async createModification(
    sessionId: string,
    request: string,
    beforeImage?: { base64Data: string; mimeType: string },
  ): Promise<FloorPlanResult<DbFloorPlanModification>> {
    try {
      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from("floor_plan_modifications")
        .insert({
          session_id: sessionId,
          modification_request: request,
          before_image: beforeImage || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating modification:", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DbFloorPlanModification };
    } catch (err) {
      console.error("Error creating modification:", err);
      return { success: false, error: "Failed to create modification" };
    }
  }

  /**
   * Update a modification with results
   */
  async updateModification(
    modificationId: string,
    updates: {
      clarification?: string;
      changes?: string[];
      trade_offs?: string[];
      status?: "pending" | "confirmed" | "rejected";
      after_image?: { base64Data: string; mimeType: string };
    },
  ): Promise<FloorPlanResult<void>> {
    try {
      const supabase = getSupabaseAdmin();

      const updateData: Record<string, unknown> = {};
      if (updates.clarification !== undefined)
        updateData.clarification = updates.clarification;
      if (updates.changes !== undefined) updateData.changes = updates.changes;
      if (updates.trade_offs !== undefined)
        updateData.trade_offs = updates.trade_offs;
      if (updates.status !== undefined) {
        updateData.status = updates.status;
        if (updates.status !== "pending") {
          updateData.processed_at = new Date().toISOString();
        }
      }
      if (updates.after_image !== undefined)
        updateData.after_image = updates.after_image;

      const { error } = await supabase
        .from("floor_plan_modifications")
        .update(updateData)
        .eq("id", modificationId);

      if (error) {
        console.error("Error updating modification:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error("Error updating modification:", err);
      return { success: false, error: "Failed to update modification" };
    }
  }

  /**
   * Get modifications for a session
   */
  async getModifications(
    sessionId: string,
  ): Promise<FloorPlanResult<DbFloorPlanModification[]>> {
    try {
      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from("floor_plan_modifications")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching modifications:", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: (data || []) as DbFloorPlanModification[] };
    } catch (err) {
      console.error("Error fetching modifications:", err);
      return { success: false, error: "Failed to fetch modifications" };
    }
  }

  // ============================================
  // Full Session Load/Save
  // ============================================

  /**
   * Load a complete session with all related data
   */
  async loadFullSession(sessionId: string): Promise<
    FloorPlanResult<{
      session: DbFloorPlanSession;
      messages: ChatMessage[];
      progress: DbFloorPlanProgress | null;
      modifications: DbFloorPlanModification[];
    }>
  > {
    try {
      const [
        sessionResult,
        messagesResult,
        progressResult,
        modificationsResult,
      ] = await Promise.all([
        this.getSession(sessionId),
        this.getMessages(sessionId),
        this.getProgress(sessionId),
        this.getModifications(sessionId),
      ]);

      if (!sessionResult.success || !sessionResult.data) {
        return {
          success: false,
          error: sessionResult.error || "Session not found",
        };
      }

      return {
        success: true,
        data: {
          session: sessionResult.data,
          messages: messagesResult.data || [],
          progress: progressResult.data || null,
          modifications: modificationsResult.data || [],
        },
      };
    } catch (err) {
      console.error("Error loading full session:", err);
      return { success: false, error: "Failed to load session" };
    }
  }

  /**
   * Delete a session and all related data
   */
  async deleteSession(sessionId: string): Promise<FloorPlanResult<void>> {
    try {
      const supabase = getSupabaseAdmin();

      // Due to CASCADE, deleting the session will delete all related data
      const { error } = await supabase
        .from("floor_plan_sessions")
        .delete()
        .eq("id", sessionId);

      if (error) {
        console.error("Error deleting session:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error("Error deleting session:", err);
      return { success: false, error: "Failed to delete session" };
    }
  }
}

// Export singleton instance
export const floorPlanSupabase = new FloorPlanSupabaseService();
