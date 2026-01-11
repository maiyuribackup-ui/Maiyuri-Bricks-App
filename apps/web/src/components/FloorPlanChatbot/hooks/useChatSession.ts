/**
 * useChatSession Hook
 *
 * Manages the chat session state including messages, inputs, and generated images.
 * Supports both localStorage and Supabase persistence.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  ChatSession,
  ChatMessage,
  SessionStatus,
  QuestionConfig,
  FloorPlanInputs,
  GeneratedImages,
  DesignContextSummary,
  UseChatSessionReturn,
} from '../types';

const CHAT_STORAGE_KEY = 'floor-plan-chatbot-session';
const SUPABASE_SESSION_KEY = 'floor-plan-supabase-session-id';

/**
 * Generate unique ID for messages
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create initial empty session
 */
function createEmptySession(): ChatSession {
  return {
    sessionId: generateId(),
    status: 'collecting',
    messages: [],
    currentQuestion: null,
    collectedInputs: {},
    generatedImages: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Check if Supabase persistence is enabled
 */
async function checkSupabaseEnabled(): Promise<boolean> {
  try {
    const response = await fetch('/api/planning/config');
    if (response.ok) {
      const data = await response.json();
      return data.persistenceEnabled === true;
    }
  } catch (e) {
    // Fall back to localStorage
  }
  return false;
}

/**
 * useChatSession Hook
 */
export function useChatSession(): UseChatSessionReturn & {
  persistToSupabase: (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => Promise<void>;
  loadFromSupabase: (sessionId: string) => Promise<void>;
  supabaseEnabled: boolean;
} {
  const [session, setSession] = useState<ChatSession>(createEmptySession);
  const [supabaseEnabled, setSupabaseEnabled] = useState(false);
  const supabaseSessionIdRef = useRef<string | null>(null);

  /**
   * Check Supabase config on mount
   */
  useEffect(() => {
    checkSupabaseEnabled().then(setSupabaseEnabled);
  }, []);

  /**
   * Load session from localStorage on mount
   */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Convert date strings back to Date objects
        setSession({
          ...parsed,
          createdAt: new Date(parsed.createdAt),
          updatedAt: new Date(parsed.updatedAt),
          messages: parsed.messages.map((m: ChatMessage) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })),
        });
      }

      // Also check for Supabase session ID
      const supabaseSessionId = localStorage.getItem(SUPABASE_SESSION_KEY);
      if (supabaseSessionId) {
        supabaseSessionIdRef.current = supabaseSessionId;
      }
    } catch (e) {
      console.error('Failed to load chat session:', e);
    }
  }, []);

  /**
   * Save session to localStorage when it changes
   */
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.error('Failed to save chat session:', e);
    }
  }, [session]);

  /**
   * Persist a message to Supabase
   */
  const persistToSupabase = useCallback(
    async (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
      if (!supabaseEnabled) return;

      try {
        await fetch('/api/planning/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message: {
              role: message.role,
              content: message.content,
              type: message.type,
              options: message.options,
              imageUrl: message.imageUrl,
              imageBase64: message.imageBase64,
              progress: message.progress,
              formFields: message.formFields,
            },
          }),
        });
      } catch (e) {
        console.error('Failed to persist message to Supabase:', e);
      }
    },
    [supabaseEnabled]
  );

  /**
   * Load session from Supabase
   */
  const loadFromSupabase = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/planning/${sessionId}/full`);
      if (!response.ok) {
        throw new Error('Failed to load session from Supabase');
      }

      const data = await response.json();
      if (data.success && data.data) {
        const { session: dbSession, messages } = data.data;

        setSession({
          sessionId: dbSession.id,
          status: dbSession.status,
          messages: messages.map((m: ChatMessage) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })),
          currentQuestion: null,
          collectedInputs: dbSession.collected_inputs || {},
          generatedImages: dbSession.generated_images || {},
          designContext: dbSession.design_context,
          createdAt: new Date(dbSession.created_at),
          updatedAt: new Date(dbSession.updated_at),
        });

        supabaseSessionIdRef.current = sessionId;
        localStorage.setItem(SUPABASE_SESSION_KEY, sessionId);
      }
    } catch (e) {
      console.error('Failed to load session from Supabase:', e);
      throw e;
    }
  }, []);

  /**
   * Add a new message to the chat
   */
  const addMessage = useCallback(
    (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
      const newMessage: ChatMessage = {
        ...message,
        id: generateId(),
        timestamp: new Date(),
      };

      setSession((prev) => {
        // Persist to Supabase in background
        if (supabaseEnabled && supabaseSessionIdRef.current) {
          persistToSupabase(supabaseSessionIdRef.current, message);
        }

        return {
          ...prev,
          messages: [...prev.messages, newMessage],
          updatedAt: new Date(),
        };
      });
    },
    [supabaseEnabled, persistToSupabase]
  );

  /**
   * Update an existing message
   */
  const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
    setSession((prev) => ({
      ...prev,
      messages: prev.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
      updatedAt: new Date(),
    }));
  }, []);

  /**
   * Set session status
   */
  const setStatus = useCallback((status: SessionStatus) => {
    setSession((prev) => ({
      ...prev,
      status,
      updatedAt: new Date(),
    }));
  }, []);

  /**
   * Set current question
   */
  const setCurrentQuestion = useCallback((question: QuestionConfig | null) => {
    setSession((prev) => ({
      ...prev,
      currentQuestion: question,
      updatedAt: new Date(),
    }));
  }, []);

  /**
   * Update collected inputs
   */
  const updateInputs = useCallback(
    (inputs: Partial<FloorPlanInputs>) => {
      setSession((prev) => {
        // Persist to Supabase in background
        if (supabaseEnabled && supabaseSessionIdRef.current) {
          fetch('/api/planning/inputs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: supabaseSessionIdRef.current,
              inputs,
            }),
          }).catch((e) => console.error('Failed to persist inputs:', e));
        }

        return {
          ...prev,
          collectedInputs: { ...prev.collectedInputs, ...inputs },
          updatedAt: new Date(),
        };
      });
    },
    [supabaseEnabled]
  );

  /**
   * Set generated images
   */
  const setGeneratedImages = useCallback((images: GeneratedImages) => {
    setSession((prev) => ({
      ...prev,
      generatedImages: { ...prev.generatedImages, ...images },
      updatedAt: new Date(),
    }));
  }, []);

  /**
   * Set design context summary
   */
  const setDesignContext = useCallback((context: DesignContextSummary) => {
    setSession((prev) => ({
      ...prev,
      designContext: context,
      updatedAt: new Date(),
    }));
  }, []);

  /**
   * Clear session and start fresh
   */
  const clearSession = useCallback(() => {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem(SUPABASE_SESSION_KEY);
    supabaseSessionIdRef.current = null;
    setSession(createEmptySession());
  }, []);

  /**
   * Load session by ID from server (for resuming)
   */
  const loadSession = useCallback(
    async (sessionId: string) => {
      try {
        // Try loading from Supabase first if enabled
        if (supabaseEnabled) {
          await loadFromSupabase(sessionId);
          return;
        }

        // Fall back to status endpoint
        const response = await fetch(`/api/planning/${sessionId}/status`);
        if (!response.ok) {
          throw new Error('Session not found');
        }
        const data = await response.json();
        // Merge server data with local state
        setSession((prev) => ({
          ...prev,
          sessionId,
          ...data,
          updatedAt: new Date(),
        }));
      } catch (e) {
        console.error('Failed to load session:', e);
        throw e;
      }
    },
    [supabaseEnabled, loadFromSupabase]
  );

  /**
   * Set the Supabase session ID (called after createSession API)
   */
  const setSupabaseSessionId = useCallback((sessionId: string) => {
    supabaseSessionIdRef.current = sessionId;
    localStorage.setItem(SUPABASE_SESSION_KEY, sessionId);
    setSession((prev) => ({
      ...prev,
      sessionId,
      updatedAt: new Date(),
    }));
  }, []);

  return {
    session,
    addMessage,
    updateMessage,
    setStatus,
    setCurrentQuestion,
    updateInputs,
    setGeneratedImages,
    clearSession,
    loadSession,
    // Supabase-specific
    persistToSupabase,
    loadFromSupabase,
    supabaseEnabled,
  };
}
