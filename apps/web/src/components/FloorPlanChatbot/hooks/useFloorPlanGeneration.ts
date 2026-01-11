/**
 * useFloorPlanGeneration Hook
 *
 * Handles API calls for floor plan generation, including starting sessions,
 * submitting answers, and requesting modifications.
 */

import { useState, useCallback, useRef } from 'react';
import type {
  ProjectType,
  StartSessionResponse,
  AnswerResponse,
  ModifyResponse,
  StatusResponse,
  BlueprintConfirmationResponse,
  UseFloorPlanGenerationReturn,
} from '../types';

/**
 * useFloorPlanGeneration Hook
 */
export function useFloorPlanGeneration(): UseFloorPlanGenerationReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingModificationRef = useRef<string | null>(null);

  /**
   * Start a new design session
   */
  const startSession = useCallback(
    async (projectType: ProjectType): Promise<StartSessionResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/planning/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectType }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to start session');
        }

        const data: StartSessionResponse = await response.json();
        sessionIdRef.current = data.sessionId;
        return data;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to start session';
        setError(message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Submit an answer to the current question
   */
  const submitAnswer = useCallback(
    async (questionId: string, answer: string | string[]): Promise<AnswerResponse> => {
      if (!sessionIdRef.current) {
        throw new Error('No active session');
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/planning/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            questionId,
            answer,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to submit answer');
        }

        return await response.json();
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to submit answer';
        setError(message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Request a modification to the generated design
   */
  const modifyDesign = useCallback(
    async (modification: string): Promise<ModifyResponse> => {
      if (!sessionIdRef.current) {
        throw new Error('No active session');
      }

      setIsLoading(true);
      setError(null);
      pendingModificationRef.current = modification;

      try {
        const response = await fetch('/api/planning/modify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            modification,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to modify design');
        }

        return await response.json();
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to modify design';
        setError(message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Confirm a pending modification
   */
  const confirmModification = useCallback(async (): Promise<ModifyResponse> => {
    if (!sessionIdRef.current || !pendingModificationRef.current) {
      throw new Error('No pending modification');
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/planning/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          modification: pendingModificationRef.current,
          confirmed: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to confirm modification');
      }

      pendingModificationRef.current = null;
      return await response.json();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to confirm modification';
      setError(message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Cancel a pending modification
   */
  const cancelModification = useCallback(() => {
    pendingModificationRef.current = null;
  }, []);

  /**
   * Confirm or reject the generated blueprint
   */
  const confirmBlueprint = useCallback(
    async (confirmed: boolean, feedback?: string): Promise<BlueprintConfirmationResponse> => {
      if (!sessionIdRef.current) {
        throw new Error('No active session');
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/planning/confirm-blueprint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            confirmed,
            feedback,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to process blueprint confirmation');
        }

        const data = await response.json();
        return data.data || data;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to process blueprint confirmation';
        setError(message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Get the current generation status
   */
  const getStatus = useCallback(async (): Promise<StatusResponse> => {
    if (!sessionIdRef.current) {
      throw new Error('No active session');
    }

    try {
      const response = await fetch(`/api/planning/${sessionIdRef.current}/status`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get status');
      }

      return await response.json();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to get status';
      setError(message);
      throw e;
    }
  }, []);

  /**
   * Set session ID (for resuming sessions)
   */
  const setSessionId = useCallback((id: string) => {
    sessionIdRef.current = id;
  }, []);

  return {
    startSession,
    submitAnswer,
    modifyDesign,
    confirmModification,
    cancelModification,
    confirmBlueprint,
    getStatus,
    isLoading,
    error,
  };
}
