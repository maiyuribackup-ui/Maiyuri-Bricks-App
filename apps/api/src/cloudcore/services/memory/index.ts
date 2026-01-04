/**
 * Memory Service
 * State and context persistence for agents
 */

import { supabase } from '../supabase';
import type {
  CloudCoreResult,
  MemoryEntry,
  ConversationState,
  ConversationMessage,
} from '../../types';

// In-memory cache for session data (faster than DB for hot paths)
const sessionCache = new Map<string, { data: unknown; expiresAt: number }>();

/**
 * Store a value in memory
 */
export async function set(
  key: string,
  value: unknown,
  options: {
    type?: 'session' | 'conversation' | 'persistent';
    expiresIn?: number; // seconds
    userId?: string;
  } = {}
): Promise<CloudCoreResult<void>> {
  const startTime = Date.now();
  const type = options.type || 'session';
  const expiresAt = options.expiresIn
    ? new Date(Date.now() + options.expiresIn * 1000).toISOString()
    : null;

  try {
    // For session data, use in-memory cache
    if (type === 'session') {
      const cacheExpiry = options.expiresIn
        ? Date.now() + options.expiresIn * 1000
        : Date.now() + 3600000; // 1 hour default

      sessionCache.set(key, {
        data: value,
        expiresAt: cacheExpiry,
      });
    }

    // For persistent and conversation data, store in database
    if (type !== 'session') {
      const { error } = await supabase.from('memory').upsert(
        {
          key,
          value,
          type,
          expires_at: expiresAt,
          user_id: options.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

      if (error) {
        throw error;
      }
    }

    return {
      success: true,
      data: null,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Memory set error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'MEMORY_SET_ERROR',
        message: error instanceof Error ? error.message : 'Failed to set memory',
      },
    };
  }
}

/**
 * Get a value from memory
 */
export async function get<T>(key: string): Promise<CloudCoreResult<T | null>> {
  const startTime = Date.now();

  try {
    // Check session cache first
    const cached = sessionCache.get(key);
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        return {
          success: true,
          data: cached.data as T,
          meta: { processingTime: Date.now() - startTime, cached: true },
        };
      } else {
        // Expired, remove from cache
        sessionCache.delete(key);
      }
    }

    // Check database
    const { data, error } = await supabase
      .from('memory')
      .select('value, expires_at')
      .eq('key', key)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return {
          success: true,
          data: null,
          meta: { processingTime: Date.now() - startTime },
        };
      }
      throw error;
    }

    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      // Expired, delete and return null
      await supabase.from('memory').delete().eq('key', key);
      return {
        success: true,
        data: null,
        meta: { processingTime: Date.now() - startTime },
      };
    }

    return {
      success: true,
      data: data.value as T,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Memory get error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'MEMORY_GET_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get memory',
      },
    };
  }
}

/**
 * Delete a value from memory
 */
export async function del(key: string): Promise<CloudCoreResult<void>> {
  const startTime = Date.now();

  try {
    // Remove from cache
    sessionCache.delete(key);

    // Remove from database
    const { error } = await supabase.from('memory').delete().eq('key', key);

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: null,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Memory delete error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'MEMORY_DELETE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to delete memory',
      },
    };
  }
}

/**
 * Get or create a conversation state
 */
export async function getConversation(
  conversationId: string
): Promise<CloudCoreResult<ConversationState | null>> {
  const key = `conversation:${conversationId}`;
  return get<ConversationState>(key);
}

/**
 * Save conversation state
 */
export async function saveConversation(
  state: ConversationState
): Promise<CloudCoreResult<void>> {
  const key = `conversation:${state.id}`;
  return set(key, state, {
    type: 'conversation',
    expiresIn: 86400 * 7, // 7 days
  });
}

/**
 * Add a message to a conversation
 */
export async function addMessage(
  conversationId: string,
  message: ConversationMessage
): Promise<CloudCoreResult<ConversationState>> {
  const startTime = Date.now();

  try {
    // Get existing conversation
    const result = await getConversation(conversationId);
    let state: ConversationState;

    if (result.success && result.data) {
      state = result.data;
    } else {
      // Create new conversation
      state = {
        id: conversationId,
        messages: [],
        context: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // Add message
    state.messages.push(message);
    state.updatedAt = new Date().toISOString();

    // Keep only last 50 messages to prevent bloat
    if (state.messages.length > 50) {
      state.messages = state.messages.slice(-50);
    }

    // Save
    await saveConversation(state);

    return {
      success: true,
      data: state,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Add message error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'ADD_MESSAGE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to add message',
      },
    };
  }
}

/**
 * Set conversation context
 */
export async function setContext(
  conversationId: string,
  context: Record<string, unknown>
): Promise<CloudCoreResult<void>> {
  const startTime = Date.now();

  try {
    const result = await getConversation(conversationId);

    if (!result.success || !result.data) {
      return {
        success: false,
        data: null,
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
        },
      };
    }

    const state = result.data;
    state.context = { ...state.context, ...context };
    state.updatedAt = new Date().toISOString();

    await saveConversation(state);

    return {
      success: true,
      data: null,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Set context error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'SET_CONTEXT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to set context',
      },
    };
  }
}

/**
 * Clean up expired session cache entries
 */
export function cleanupSessionCache(): void {
  const now = Date.now();
  for (const [key, value] of sessionCache.entries()) {
    if (value.expiresAt <= now) {
      sessionCache.delete(key);
    }
  }
}

/**
 * Clean up expired database entries
 */
export async function cleanupExpiredEntries(): Promise<CloudCoreResult<{ deleted: number }>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('memory')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: { deleted: data?.length || 0 },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Cleanup error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'CLEANUP_ERROR',
        message: error instanceof Error ? error.message : 'Cleanup failed',
      },
    };
  }
}

// Cleanup session cache every 5 minutes
setInterval(cleanupSessionCache, 5 * 60 * 1000);

export default {
  set,
  get,
  del,
  getConversation,
  saveConversation,
  addMessage,
  setContext,
  cleanupSessionCache,
  cleanupExpiredEntries,
};
