/**
 * Planning API Routes Tests
 *
 * Unit tests for the floor plan planning API routes.
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { NextRequest } from 'next/server';

// Create mock functions
const mockAddMessage = vi.fn();
const mockUpdateCollectedInputs = vi.fn();
const mockLoadFullSession = vi.fn();
const mockIsPersistenceEnabled = vi.fn(() => true);
const mockCreateSession = vi.fn();

// Mock the floor-plan-supabase module
vi.mock('@/lib/floor-plan-supabase', () => ({
  floorPlanSupabase: {
    addMessage: (...args: unknown[]) => mockAddMessage(...args),
    updateCollectedInputs: (...args: unknown[]) => mockUpdateCollectedInputs(...args),
    loadFullSession: (...args: unknown[]) => mockLoadFullSession(...args),
  },
}));

// Mock the planning-service module
vi.mock('@/lib/planning-service', () => ({
  planningService: {
    isPersistenceEnabled: () => mockIsPersistenceEnabled(),
    createSession: (...args: unknown[]) => mockCreateSession(...args),
  },
}));

// Import route handlers after mocks are set up
import { GET as getConfig } from './config/route';
import { POST as postMessage } from './message/route';
import { POST as postInputs } from './inputs/route';
import { POST as postStart } from './start/route';

// Helper to create mock NextRequest
function createMockRequest(
  method: string,
  body?: Record<string, unknown>,
  url: string = 'http://localhost:3000/api/planning'
): NextRequest {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  return new NextRequest(url, init);
}

// Helper to parse response
async function parseResponse(response: Response) {
  const data = await response.json();
  return {
    status: response.status,
    body: data,
  };
}

describe('Planning API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPersistenceEnabled.mockReturnValue(true);
  });

  // ============================================
  // GET /api/planning/config
  // ============================================
  describe('GET /api/planning/config', () => {
    it('should return persistence configuration', async () => {
      const request = createMockRequest('GET');
      const response = await getConfig(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body.data).toBeDefined();
      expect(body.data.persistenceEnabled).toBe(true);
      expect(mockIsPersistenceEnabled).toHaveBeenCalled();
    });

    it('should return persistenceEnabled: false when disabled', async () => {
      mockIsPersistenceEnabled.mockReturnValueOnce(false);

      const request = createMockRequest('GET');
      const response = await getConfig(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body.data.persistenceEnabled).toBe(false);
    });
  });

  // ============================================
  // POST /api/planning/start
  // ============================================
  describe('POST /api/planning/start', () => {
    it('should start a new session with valid project type', async () => {
      mockCreateSession.mockResolvedValueOnce({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        projectType: 'residential',
        status: 'collecting',
        messages: [],
        currentQuestion: null,
        collectedInputs: {},
        generatedImages: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = createMockRequest('POST', {
        projectType: 'residential',
      });
      const response = await postStart(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body.data).toBeDefined();
      expect(body.data.sessionId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(body.data.firstQuestion).toBeDefined();
      expect(body.data.firstQuestion.id).toBe('plotInput');
    });

    it('should start a session for commercial project type', async () => {
      mockCreateSession.mockResolvedValueOnce({
        sessionId: '223e4567-e89b-12d3-a456-426614174000',
        projectType: 'commercial',
        status: 'collecting',
        messages: [],
        currentQuestion: null,
        collectedInputs: {},
        generatedImages: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = createMockRequest('POST', {
        projectType: 'commercial',
      });
      const response = await postStart(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body.data.sessionId).toBe('223e4567-e89b-12d3-a456-426614174000');
    });

    it('should reject invalid project type', async () => {
      const request = createMockRequest('POST', {
        projectType: 'invalid',
      });
      const response = await postStart(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body.error).toBeDefined();
    });

    it('should reject missing project type', async () => {
      const request = createMockRequest('POST', {});
      const response = await postStart(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body.error).toBeDefined();
    });
  });

  // ============================================
  // POST /api/planning/message
  // ============================================
  describe('POST /api/planning/message', () => {
    it('should add a text message', async () => {
      mockAddMessage.mockResolvedValueOnce({
        success: true,
        data: {
          id: 'msg-123',
          session_id: '123e4567-e89b-12d3-a456-426614174000',
          role: 'user',
          content: 'Hello',
          message_type: 'text',
          sequence_number: 1,
        },
      });

      const request = createMockRequest('POST', {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        message: {
          role: 'user',
          content: 'Hello',
          type: 'text',
        },
      });
      const response = await postMessage(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body.data).toBeDefined();
      expect(body.data.messageId).toBe('msg-123');
    });

    it('should add an assistant message with options', async () => {
      mockAddMessage.mockResolvedValueOnce({
        success: true,
        data: {
          id: 'msg-456',
          session_id: '123e4567-e89b-12d3-a456-426614174000',
          role: 'assistant',
          content: 'Choose your preference:',
          message_type: 'options',
          sequence_number: 2,
        },
      });

      const request = createMockRequest('POST', {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        message: {
          role: 'assistant',
          content: 'Choose your preference:',
          type: 'options',
          options: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
          ],
        },
      });
      const response = await postMessage(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body.data.messageId).toBe('msg-456');
    });

    it('should reject invalid session ID format', async () => {
      const request = createMockRequest('POST', {
        sessionId: 'not-a-uuid',
        message: {
          role: 'user',
          content: 'Hello',
          type: 'text',
        },
      });
      const response = await postMessage(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body.error).toBeDefined();
    });

    it('should reject invalid role', async () => {
      const request = createMockRequest('POST', {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        message: {
          role: 'invalid',
          content: 'Hello',
          type: 'text',
        },
      });
      const response = await postMessage(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body.error).toBeDefined();
    });

    it('should reject invalid message type', async () => {
      const request = createMockRequest('POST', {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        message: {
          role: 'user',
          content: 'Hello',
          type: 'invalid',
        },
      });
      const response = await postMessage(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body.error).toBeDefined();
    });

    it('should handle Supabase errors gracefully', async () => {
      mockAddMessage.mockResolvedValueOnce({
        success: false,
        error: 'Database error',
      });

      const request = createMockRequest('POST', {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        message: {
          role: 'user',
          content: 'Hello',
          type: 'text',
        },
      });
      const response = await postMessage(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(500);
      expect(body.error).toBe('Database error');
    });
  });

  // ============================================
  // POST /api/planning/inputs
  // ============================================
  describe('POST /api/planning/inputs', () => {
    it('should update collected inputs', async () => {
      mockUpdateCollectedInputs.mockResolvedValueOnce({
        success: true,
      });

      const request = createMockRequest('POST', {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        inputs: {
          bedrooms: '3',
          bathrooms: '2',
          kitchenType: 'open',
        },
      });
      const response = await postInputs(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body.data).toBeDefined();
      expect(body.data.updated).toBe(true);
      expect(mockUpdateCollectedInputs).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        {
          bedrooms: '3',
          bathrooms: '2',
          kitchenType: 'open',
        }
      );
    });

    it('should reject invalid session ID format', async () => {
      const request = createMockRequest('POST', {
        sessionId: 'invalid-uuid',
        inputs: { bedrooms: '3' },
      });
      const response = await postInputs(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body.error).toBeDefined();
    });

    it('should handle empty inputs object', async () => {
      mockUpdateCollectedInputs.mockResolvedValueOnce({
        success: true,
      });

      const request = createMockRequest('POST', {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        inputs: {},
      });
      const response = await postInputs(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body.data.updated).toBe(true);
    });

    it('should handle Supabase errors gracefully', async () => {
      mockUpdateCollectedInputs.mockResolvedValueOnce({
        success: false,
        error: 'Failed to update',
      });

      const request = createMockRequest('POST', {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        inputs: { bedrooms: '3' },
      });
      const response = await postInputs(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(500);
      expect(body.error).toBe('Failed to update');
    });
  });
});

// ============================================
// GET /api/planning/[sessionId]/full - Separate describe
// ============================================
describe('GET /api/planning/[sessionId]/full', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load full session with all data', async () => {
    const { GET: getFullSession } = await import('./[sessionId]/full/route');

    mockLoadFullSession.mockResolvedValueOnce({
      success: true,
      data: {
        session: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          status: 'generating',
          project_type: 'residential',
        },
        messages: [
          { id: 'msg-1', content: 'Hello', role: 'assistant' },
        ],
        progress: {
          phase: 'blueprint',
          current_stage: 'Analyzing',
          percent: 50,
        },
        modifications: [],
      },
    });

    const request = createMockRequest(
      'GET',
      undefined,
      'http://localhost:3000/api/planning/123e4567-e89b-12d3-a456-426614174000/full'
    );

    const response = await getFullSession(request, {
      params: Promise.resolve({ sessionId: '123e4567-e89b-12d3-a456-426614174000' }),
    });
    const { status, body } = await parseResponse(response);

    expect(status).toBe(200);
    expect(body.data).toBeDefined();
    expect(body.data.session.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(body.data.messages).toHaveLength(1);
    expect(body.data.progress.phase).toBe('blueprint');
  });

  it('should reject invalid session ID format', async () => {
    const { GET: getFullSession } = await import('./[sessionId]/full/route');

    const request = createMockRequest(
      'GET',
      undefined,
      'http://localhost:3000/api/planning/invalid-id/full'
    );

    const response = await getFullSession(request, {
      params: Promise.resolve({ sessionId: 'invalid-id' }),
    });
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid sessionId format');
  });

  it('should return 404 for non-existent session', async () => {
    const { GET: getFullSession } = await import('./[sessionId]/full/route');

    mockLoadFullSession.mockResolvedValueOnce({
      success: false,
      error: 'Session not found',
    });

    const request = createMockRequest(
      'GET',
      undefined,
      'http://localhost:3000/api/planning/123e4567-e89b-12d3-a456-426614174000/full'
    );

    const response = await getFullSession(request, {
      params: Promise.resolve({ sessionId: '123e4567-e89b-12d3-a456-426614174000' }),
    });
    const { status, body } = await parseResponse(response);

    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});
