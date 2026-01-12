/**
 * Claude SDK Mock for Testing
 *
 * Provides mock implementations of the Anthropic SDK
 * for unit and integration testing.
 */

import { vi, type MockedObject } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Mock response structure
 */
export interface MockClaudeResponse {
  content: unknown;
  inputTokens?: number;
  outputTokens?: number;
  stopReason?: string;
}

/**
 * Store for mock responses
 */
let mockResponseQueue: MockClaudeResponse[] = [];
let mockCallHistory: Array<{
  model: string;
  system: string;
  messages: unknown[];
}> = [];

/**
 * Set up a mock response for the next Claude call
 */
export function mockClaudeResponse(response: unknown): void {
  mockResponseQueue.push({
    content: response,
    inputTokens: 100,
    outputTokens: 200,
    stopReason: 'end_turn',
  });
}

/**
 * Set up multiple mock responses
 */
export function mockClaudeResponses(responses: unknown[]): void {
  for (const response of responses) {
    mockClaudeResponse(response);
  }
}

/**
 * Clear all mock responses and call history
 */
export function clearMocks(): void {
  mockResponseQueue = [];
  mockCallHistory = [];
}

/**
 * Get the call history
 */
export function getCallHistory(): typeof mockCallHistory {
  return [...mockCallHistory];
}

/**
 * Get the last call made
 */
export function getLastCall(): (typeof mockCallHistory)[0] | undefined {
  return mockCallHistory[mockCallHistory.length - 1];
}

/**
 * Create a mock Anthropic client
 */
export function createMockAnthropicClient(): MockedObject<Anthropic> {
  const mockClient = {
    messages: {
      create: vi.fn().mockImplementation(async (params) => {
        // Record the call
        mockCallHistory.push({
          model: params.model,
          system: params.system,
          messages: params.messages,
        });

        // Get the next mock response
        const mockResponse = mockResponseQueue.shift();

        if (!mockResponse) {
          throw new Error('No mock response available');
        }

        // Format response as Anthropic.Message
        return {
          id: `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text:
                typeof mockResponse.content === 'string'
                  ? mockResponse.content
                  : JSON.stringify(mockResponse.content),
            },
          ],
          model: params.model,
          stop_reason: mockResponse.stopReason || 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: mockResponse.inputTokens || 100,
            output_tokens: mockResponse.outputTokens || 200,
          },
        } as Anthropic.Message;
      }),
    },
  } as unknown as MockedObject<Anthropic>;

  return mockClient;
}

/**
 * Mock error responses
 */
export function mockClaudeError(
  status: number,
  code: string,
  message: string
): void {
  mockResponseQueue.push({
    content: {
      __error: true,
      status,
      code,
      message,
    },
  });
}

/**
 * Create a mock rate limit error
 */
export function mockRateLimitError(): void {
  mockClaudeError(429, 'rate_limit_error', 'Rate limit exceeded');
}

/**
 * Create a mock overloaded error
 */
export function mockOverloadedError(): void {
  mockClaudeError(529, 'overloaded_error', 'API is overloaded');
}
