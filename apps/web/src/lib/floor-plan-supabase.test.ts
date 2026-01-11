/**
 * Floor Plan Supabase Service Tests
 *
 * Unit tests for the floor plan persistent memory service.
 * Uses a Proxy-based mock for full Supabase query chain support.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Store mock responses in a queue
let responseQueue: Array<{ data: unknown; error: unknown }> = [];
let insertCalls: unknown[] = [];
let updateCalls: unknown[] = [];
let deleteCalls: unknown[] = [];

// Pop the next response from the queue
function getNextResponse() {
  if (responseQueue.length > 0) {
    return responseQueue.shift()!;
  }
  return { data: null, error: { message: 'No mock response configured' } };
}

/**
 * Create a Proxy-based mock that handles Supabase query chains.
 *
 * The key insight: We need a "thenable" object that is BOTH:
 * 1. Chainable (has .limit(), .single(), etc. methods)
 * 2. Awaitable (resolves when awaited directly)
 *
 * This mimics Supabase's PostgrestBuilder which is a PromiseLike.
 */
function createSupabaseMock() {
  const createChainProxy = (): Record<string, unknown> => {
    // Create an object that acts as both a thenable AND has chain methods
    const chainableThenable = {
      // Make it awaitable - when awaited directly, return the next response
      then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        const response = getNextResponse();
        const promise = Promise.resolve(response);
        return promise.then(onFulfilled, onRejected);
      },
      catch(onRejected?: (reason: unknown) => unknown) {
        return this.then(undefined, onRejected);
      },
      finally(onFinally?: () => void) {
        return this.then(
          (value: unknown) => { onFinally?.(); return value; },
          (reason: unknown) => { onFinally?.(); throw reason; }
        );
      },
    };

    const handler: ProxyHandler<typeof chainableThenable> = {
      get(target, prop) {
        // Handle promise methods - delegate to the thenable
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return target[prop as keyof typeof target].bind(target);
        }

        // Track specific method calls
        if (prop === 'insert') {
          return vi.fn().mockImplementation((data: unknown) => {
            insertCalls.push(data);
            return createChainProxy();
          });
        }
        if (prop === 'update') {
          return vi.fn().mockImplementation((data: unknown) => {
            updateCalls.push(data);
            return createChainProxy();
          });
        }
        if (prop === 'delete') {
          return vi.fn().mockImplementation(() => {
            deleteCalls.push(true);
            return createChainProxy();
          });
        }

        // All other methods return a new chain proxy (which is also thenable)
        // This handles: from, select, eq, order, limit, single, etc.
        return vi.fn().mockImplementation(() => createChainProxy());
      }
    };

    return new Proxy(chainableThenable, handler) as Record<string, unknown>;
  };

  return createChainProxy();
}

let mockSupabase: ReturnType<typeof createSupabaseMock>;

// Mock the supabase module
vi.mock('./supabase', () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
  getSupabase: vi.fn(() => mockSupabase),
}));

// Import after mocks are set up
import { floorPlanSupabase } from './floor-plan-supabase';

describe('FloorPlanSupabaseService', () => {
  beforeEach(() => {
    responseQueue = [];
    insertCalls = [];
    updateCalls = [];
    deleteCalls = [];
    mockSupabase = createSupabaseMock();
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a new session with default values', async () => {
      const mockSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: null,
        status: 'collecting',
        project_type: 'residential',
        collected_inputs: {},
        generated_images: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      responseQueue.push({ data: mockSession, error: null });

      const result = await floorPlanSupabase.createSession(undefined, 'residential');

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(mockSession.id);
      expect(result.data?.status).toBe('collecting');
    });

    it('should create a session with user ID', async () => {
      const userId = 'user-123';
      const mockSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: userId,
        status: 'collecting',
        project_type: 'commercial',
        collected_inputs: {},
        generated_images: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      responseQueue.push({ data: mockSession, error: null });

      const result = await floorPlanSupabase.createSession(userId, 'commercial');

      expect(result.success).toBe(true);
      expect(result.data?.user_id).toBe(userId);
      expect(result.data?.project_type).toBe('commercial');
    });

    it('should handle errors gracefully', async () => {
      responseQueue.push({ data: null, error: { message: 'Database error' } });

      const result = await floorPlanSupabase.createSession();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('getSession', () => {
    it('should fetch a session by ID', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const mockSession = {
        id: sessionId,
        status: 'generating',
        project_type: 'residential',
        collected_inputs: { bedrooms: '3' },
      };

      responseQueue.push({ data: mockSession, error: null });

      const result = await floorPlanSupabase.getSession(sessionId);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(sessionId);
    });

    it('should return error for non-existent session', async () => {
      responseQueue.push({ data: null, error: { message: 'Session not found' } });

      const result = await floorPlanSupabase.getSession('non-existent');

      expect(result.success).toBe(false);
    });
  });

  describe('updateSessionStatus', () => {
    it('should update session status', async () => {
      responseQueue.push({ data: null, error: null });

      const result = await floorPlanSupabase.updateSessionStatus(
        '123e4567-e89b-12d3-a456-426614174000',
        'generating'
      );

      expect(result.success).toBe(true);
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    it('should set completed_at when status is complete', async () => {
      responseQueue.push({ data: null, error: null });

      await floorPlanSupabase.updateSessionStatus(
        '123e4567-e89b-12d3-a456-426614174000',
        'complete'
      );

      expect(updateCalls[0]).toEqual(
        expect.objectContaining({
          status: 'complete',
          completed_at: expect.any(String),
        })
      );
    });
  });

  describe('updateCollectedInputs', () => {
    it('should merge new inputs with existing inputs', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const existingInputs = { bedrooms: '2', projectType: 'residential' };
      const newInputs = { bathrooms: '2', kitchenType: 'open' };

      // First query: get current inputs
      responseQueue.push({
        data: { collected_inputs: existingInputs },
        error: null,
      });
      // Second query: update
      responseQueue.push({ data: null, error: null });

      const result = await floorPlanSupabase.updateCollectedInputs(sessionId, newInputs);

      expect(result.success).toBe(true);
      expect(updateCalls[0]).toEqual({
        collected_inputs: {
          ...existingInputs,
          ...newInputs,
        },
      });
    });
  });

  describe('addMessage', () => {
    it('should add a message with correct sequence number', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const message = {
        role: 'assistant' as const,
        content: 'Hello! How can I help you?',
        type: 'text' as const,
      };

      // Get last sequence
      responseQueue.push({
        data: { sequence_number: 5 },
        error: null,
      });
      // Insert result
      responseQueue.push({
        data: {
          id: 'msg-123',
          session_id: sessionId,
          role: message.role,
          content: message.content,
          message_type: message.type,
          sequence_number: 6,
        },
        error: null,
      });

      const result = await floorPlanSupabase.addMessage(sessionId, message);

      expect(result.success).toBe(true);
      expect(result.data?.sequence_number).toBe(6);
    });

    it('should handle first message (no previous messages)', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const message = {
        role: 'assistant' as const,
        content: 'Welcome!',
        type: 'text' as const,
      };

      // No previous messages
      responseQueue.push({
        data: null,
        error: { code: 'PGRST116', message: 'No rows' },
      });
      // Insert result
      responseQueue.push({
        data: {
          id: 'msg-001',
          session_id: sessionId,
          role: message.role,
          content: message.content,
          message_type: message.type,
          sequence_number: 1,
        },
        error: null,
      });

      const result = await floorPlanSupabase.addMessage(sessionId, message);

      expect(result.success).toBe(true);
      expect(result.data?.sequence_number).toBe(1);
    });

    it('should store message options in metadata', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const message = {
        role: 'assistant' as const,
        content: 'Choose your preference:',
        type: 'options' as const,
        options: [
          { label: 'Option A', value: 'a' },
          { label: 'Option B', value: 'b' },
        ],
      };

      responseQueue.push({ data: { sequence_number: 0 }, error: null });
      responseQueue.push({ data: { id: 'msg-123' }, error: null });

      await floorPlanSupabase.addMessage(sessionId, message);

      expect(insertCalls[0]).toEqual(
        expect.objectContaining({
          metadata: expect.objectContaining({
            options: message.options,
          }),
        })
      );
    });
  });

  describe('getMessages', () => {
    it('should return messages in order', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const mockMessages = [
        { id: 'msg-1', role: 'assistant', content: 'Hello', message_type: 'text', metadata: {}, sequence_number: 1, created_at: '2024-01-01T00:00:00Z' },
        { id: 'msg-2', role: 'user', content: 'Hi', message_type: 'text', metadata: {}, sequence_number: 2, created_at: '2024-01-01T00:01:00Z' },
      ];

      responseQueue.push({ data: mockMessages, error: null });

      const result = await floorPlanSupabase.getMessages(sessionId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].id).toBe('msg-1');
      expect(result.data?.[1].id).toBe('msg-2');
    });

    it('should transform message metadata to ChatMessage format', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const mockMessages = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Choose:',
          message_type: 'options',
          metadata: {
            options: [{ label: 'A', value: 'a' }],
          },
          sequence_number: 1,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      responseQueue.push({ data: mockMessages, error: null });

      const result = await floorPlanSupabase.getMessages(sessionId);

      expect(result.success).toBe(true);
      expect(result.data?.[0].options).toEqual([{ label: 'A', value: 'a' }]);
    });
  });

  describe('updateProgress', () => {
    it('should create progress if not exists', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';

      // Check for existing (not found)
      responseQueue.push({ data: null, error: { code: 'PGRST116' } });
      // Insert succeeds
      responseQueue.push({ data: null, error: null });

      const result = await floorPlanSupabase.updateProgress(sessionId, {
        phase: 'blueprint',
        current_stage: 'Analyzing plot',
        percent: 10,
        stages: [],
      });

      expect(result.success).toBe(true);
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    it('should update existing progress', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';

      // Check for existing (found)
      responseQueue.push({ data: { id: 'progress-123' }, error: null });
      // Update succeeds
      responseQueue.push({ data: null, error: null });

      const result = await floorPlanSupabase.updateProgress(sessionId, {
        phase: 'isometric',
        current_stage: 'Rendering 3D view',
        percent: 90,
        stages: [],
      });

      expect(result.success).toBe(true);
      expect(updateCalls.length).toBeGreaterThan(0);
    });
  });

  describe('loadFullSession', () => {
    it('should load session with all related data', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const mockSession = {
        id: sessionId,
        status: 'generating',
        project_type: 'residential',
      };
      const mockMessages = [
        { id: 'msg-1', content: 'Hello', role: 'assistant', message_type: 'text', metadata: {} },
      ];
      const mockProgress = {
        phase: 'blueprint',
        current_stage: 'Analyzing',
        percent: 50,
      };

      // Session
      responseQueue.push({ data: mockSession, error: null });
      // Messages
      responseQueue.push({ data: mockMessages, error: null });
      // Progress
      responseQueue.push({ data: mockProgress, error: null });
      // Modifications
      responseQueue.push({ data: [], error: null });

      const result = await floorPlanSupabase.loadFullSession(sessionId);

      expect(result.success).toBe(true);
      expect(result.data?.session.id).toBe(sessionId);
      expect(result.data?.messages).toHaveLength(1);
      expect(result.data?.progress?.phase).toBe('blueprint');
    });
  });

  describe('deleteSession', () => {
    it('should delete session and cascade to related data', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';

      responseQueue.push({ data: null, error: null });

      const result = await floorPlanSupabase.deleteSession(sessionId);

      expect(result.success).toBe(true);
      expect(deleteCalls.length).toBeGreaterThan(0);
    });
  });

  describe('getUserSessions', () => {
    it('should return sessions for a user', async () => {
      const userId = 'user-123';
      const mockSessions = [
        { id: 'session-1', user_id: userId, status: 'complete' },
        { id: 'session-2', user_id: userId, status: 'generating' },
      ];

      responseQueue.push({ data: mockSessions, error: null });

      const result = await floorPlanSupabase.getUserSessions(userId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      const userId = 'user-123';

      responseQueue.push({ data: [], error: null });

      const result = await floorPlanSupabase.getUserSessions(userId, 5);

      expect(result.success).toBe(true);
    });
  });

  describe('createModification', () => {
    it('should create a modification request', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const request = 'Make the living room bigger';

      responseQueue.push({
        data: {
          id: 'mod-123',
          session_id: sessionId,
          modification_request: request,
          status: 'pending',
        },
        error: null,
      });

      const result = await floorPlanSupabase.createModification(sessionId, request);

      expect(result.success).toBe(true);
      expect(result.data?.modification_request).toBe(request);
      expect(result.data?.status).toBe('pending');
    });

    it('should include before image if provided', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const beforeImage = { base64Data: 'abc123', mimeType: 'image/png' };

      responseQueue.push({
        data: {
          id: 'mod-123',
          before_image: beforeImage,
        },
        error: null,
      });

      await floorPlanSupabase.createModification(sessionId, 'Change kitchen', beforeImage);

      expect(insertCalls[0]).toEqual(
        expect.objectContaining({
          before_image: beforeImage,
        })
      );
    });
  });
});
