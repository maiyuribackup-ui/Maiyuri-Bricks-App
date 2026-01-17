'use client';

/**
 * FloorPlanChatbot Component
 *
 * Main conversational interface for floor plan generation.
 * Guides users through questions, generates floor plans, and allows modifications.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatSession } from './hooks/useChatSession';
import { useQuestionFlow } from './hooks/useQuestionFlow';
import { useFloorPlanGeneration } from './hooks/useFloorPlanGeneration';
import { ChatMessage } from './ChatMessage';
import { QuickOptions } from './QuickOptions';
import { ImageUploader } from './ImageUploader';
import { ProgressIndicator } from './ProgressIndicator';
import type {
  FloorPlanChatbotProps,
  ProjectType,
  FloorPlanInputs,
  ProgressData,
} from './types';

// Welcome message
const WELCOME_MESSAGE = `Hello! I'm your AI Architect from Maiyuri Bricks. I'll help you design your dream home with eco-friendly mud interlock bricks.

Let's get started! What would you like to design today?`;

// Initial generation stages - Blueprint Phase
const BLUEPRINT_STAGES: ProgressData['stages'] = [
  { id: 'vastu', label: 'Applying Vastu principles', icon: '🏛️', status: 'pending' },
  { id: 'eco', label: 'Adding eco-friendly elements', icon: '🌿', status: 'pending' },
  { id: 'zoning', label: 'Organizing room zones', icon: '📍', status: 'pending' },
  { id: 'dimensioning', label: 'Calculating dimensions', icon: '📐', status: 'pending' },
  { id: 'engineering', label: 'Engineering specifications', icon: '🔧', status: 'pending' },
  { id: 'validation', label: 'Validating design', icon: '✅', status: 'pending' },
  { id: 'blueprint', label: 'Generating blueprint', icon: '📋', status: 'pending' },
];

// Isometric stages - shown after blueprint generation
const ISOMETRIC_STAGES: ProgressData['stages'] = [
  { id: 'visualization', label: 'Preparing 3D visualization', icon: '🎨', status: 'pending' },
  { id: 'isometric', label: 'Rendering isometric view', icon: '🏠', status: 'pending' },
];

// All stages combined
const ALL_STAGES: ProgressData['stages'] = [
  ...BLUEPRINT_STAGES,
  ...ISOMETRIC_STAGES,
];

export function FloorPlanChatbot({
  className = '',
  initialProjectType,
  onDesignComplete,
}: FloorPlanChatbotProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [showUploader, setShowUploader] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<ProgressData | null>(null);

  // Backend session tracking
  const backendSessionIdRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoConfirmRef = useRef(false);

  // Open questions state for halted generation
  const [pendingQuestions, setPendingQuestions] = useState<string[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});

  // Hooks
  const {
    session,
    addMessage,
    updateInputs,
    setGeneratedImages,
    clearSession,
    setStatus,
  } = useChatSession();
  const hasDownloads = Boolean(
    session.generatedImages?.floorPlan ||
    session.generatedImages?.courtyard ||
    session.generatedImages?.exterior ||
    session.generatedImages?.interior
  );

  const downloadPng = useCallback((imageData: unknown, filenamePrefix: string) => {
    const raw = typeof imageData === 'object' && imageData && 'base64Data' in imageData
      ? String((imageData as { base64Data: unknown }).base64Data ?? '')
      : (typeof imageData === 'string' ? imageData : '');

    const base64 = raw.includes(',') ? raw.split(',').pop()!.trim() : raw.trim();
    if (!base64) {
      console.error(`No ${filenamePrefix} image data available for download`);
      return;
    }

    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filenamePrefix}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const { getNextQuestion, isLastQuestion, getSmartDefault } = useQuestionFlow();

  const {
    startSession: startBackendSession,
    submitAnswer,
    modifyDesign,
    confirmBlueprint: confirmBlueprintAPI,
    getStatus,
    isLoading,
    error,
  } = useFloorPlanGeneration();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, generationProgress]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Poll for generation status when generating
  useEffect(() => {
    if (!isGenerating || !backendSessionIdRef.current) {
      return;
    }

    const pollStatus = async () => {
      try {
        const statusData = await getStatus();

        if (statusData.status === 'pending' || statusData.status === 'in_progress') {
          // Update progress - StatusResponse.progress is a number, not an object
          setGenerationProgress({
            stage: statusData.currentStage || 'Generating...',
            percent: statusData.progress || 0,
            stages: statusData.stages || BLUEPRINT_STAGES,
          });
        } else if (statusData.status === 'awaiting_blueprint_confirmation') {
          // Auto-confirm legacy sessions to keep the flow single-step
          if (!autoConfirmRef.current) {
            autoConfirmRef.current = true;
            try {
              await confirmBlueprintAPI(true);
            } catch (err) {
              autoConfirmRef.current = false;
              console.error('Auto-confirm blueprint failed:', err);
              addMessage({
                role: 'assistant',
                content: 'I hit an issue finalizing your blueprint. Please try again.',
                type: 'error',
              });
            }
          }
        } else if (statusData.status === 'halted') {
          // Pipeline halted - needs human input
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          setIsGenerating(false);
          setGenerationProgress(null);
          setStatus('halted');

          // Display open questions from agents
          const openQuestions = statusData.openQuestions || [];
          if (openQuestions.length > 0) {
            // Store questions for the UI form
            setPendingQuestions(openQuestions);
            setQuestionAnswers({});

            addMessage({
              role: 'assistant',
              content: `I need some clarification to proceed with your floor plan design. Please answer the ${openQuestions.length} question${openQuestions.length > 1 ? 's' : ''} below:`,
              type: 'text',
            });
          } else {
            addMessage({
              role: 'assistant',
              content: statusData.message || 'The design process has been paused. I need some additional information to continue.',
              type: 'text',
            });
          }
        } else if (statusData.status === 'failed') {
          // Generation failed - stop polling
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          setIsGenerating(false);
          setGenerationProgress(null);
          setStatus('failed');

          addMessage({
            role: 'assistant',
            content: `I encountered an issue while generating your floor plan: ${statusData.error || 'Unknown error'}. Would you like to try again?`,
            type: 'error',
          });
        } else if (statusData.status === 'complete') {
          // Generation complete with all images - stop polling
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          setIsGenerating(false);
          setGenerationProgress(null);
          setStatus('complete');

          // Store the generated images
          if (statusData.result?.images) {
            setGeneratedImages(statusData.result.images);
          }

          // Add completion message with download links
          addMessage({
            role: 'assistant',
            content: statusData.message || `Your floor plan design is complete!

Here are your generated images:
• Floor Plan (2D Blueprint)
• 3D Isometric/Exterior View

Click the download buttons below to save your images as PNG files.`,
            type: 'text',
          });

          // Notify parent component if callback provided
          if (onDesignComplete && statusData.result?.images && statusData.result?.designContext) {
            onDesignComplete(statusData.result.images, statusData.result.designContext);
          }
        }
      } catch (err) {
        console.error('Error polling status:', err);
      }
    };

    // Start polling every 3 seconds
    pollStatus(); // Initial call
    pollingIntervalRef.current = setInterval(pollStatus, 3000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [isGenerating, getStatus, addMessage, setStatus, setGeneratedImages, confirmBlueprintAPI, onDesignComplete]);

  // Initialize chat with welcome message
  useEffect(() => {
    if (session.messages.length === 0) {
      addMessage({
        role: 'assistant',
        content: WELCOME_MESSAGE,
        type: 'text',
      });

      // Get first question
      const firstQuestion = getNextQuestion({});
      if (firstQuestion) {
        setTimeout(() => {
          // Handle form questions differently
          if (firstQuestion.type === 'form') {
            // Determine field configuration based on question ID
            const isPlotDimensions = firstQuestion.id === 'plotDimensions';
            const isSetbacks = firstQuestion.id === 'setbacks';
            const isNumericForm = isPlotDimensions || isSetbacks;
            const isClientName = firstQuestion.id === 'clientName';

            addMessage({
              role: 'assistant',
              content: firstQuestion.question,
              type: 'form',
              formFields: firstQuestion.fields?.map((f) => {
                if (isClientName) {
                  return {
                    name: f,
                    label: 'Client/Project Name',
                    type: 'text' as const,
                    placeholder: 'e.g., Kumar Residence, Villa Phase 2',
                    required: true,
                  };
                }

                if (isPlotDimensions) {
                  return {
                    name: f,
                    label: f.charAt(0).toUpperCase() + f.slice(1) + ' (feet)',
                    type: 'number' as const,
                    placeholder: 'e.g., 30',
                    required: true,
                  };
                }

                // Default form field
                return {
                  name: f,
                  label: f.charAt(0).toUpperCase() + f.slice(1),
                  type: 'text' as const,
                  placeholder: '',
                  required: true,
                };
              }),
            });
          } else {
            addMessage({
              role: 'assistant',
              content: firstQuestion.question,
              type: 'options',
              options: firstQuestion.options,
            });
          }
        }, 500);
      }
    }
  }, [session.messages.length, addMessage, getNextQuestion]);

  /**
   * Handle option selection
   */
  const handleOptionSelect = useCallback(
    async (value: string) => {
      const currentQuestion = getNextQuestion(session.collectedInputs);
      if (!currentQuestion) return;

      // Add user's selection as message
      const selectedOption = currentQuestion.options?.find((o) => o.value === value);
      addMessage({
        role: 'user',
        content: selectedOption?.label || value,
        type: 'text',
      });

      // Update local inputs for UI state
      const newInputs: Partial<FloorPlanInputs> = {};

      switch (currentQuestion.id) {
        case 'projectType':
          newInputs.projectType = value as ProjectType;

          // Initialize backend session when project type is selected
          try {
            const response = await startBackendSession(value as ProjectType);
            backendSessionIdRef.current = response.sessionId;
            console.log('Backend session started:', response.sessionId);
          } catch (err) {
            console.error('Failed to start backend session:', err);
            addMessage({
              role: 'assistant',
              content: 'I encountered an issue starting your session. Please try refreshing the page.',
              type: 'error',
            });
            return;
          }
          break;
        case 'plotInput':
          newInputs.plotInput = value as 'upload' | 'manual';
          if (value === 'upload') {
            setShowUploader(true);
          }
          break;
        case 'roadSide':
          newInputs.roadSide = value as FloorPlanInputs['roadSide'];
          break;
        case 'roadWidth':
          newInputs.roadWidth = value as FloorPlanInputs['roadWidth'];
          break;
        case 'bedrooms':
          newInputs.bedrooms = value as FloorPlanInputs['bedrooms'];
          break;
        case 'bathrooms':
          newInputs.bathrooms = value as FloorPlanInputs['bathrooms'];
          break;
        case 'kitchenType':
          newInputs.kitchenType = value as FloorPlanInputs['kitchenType'];
          break;
        case 'floors':
          newInputs.floors = value as FloorPlanInputs['floors'];
          break;
        case 'hasMutram':
          newInputs.hasMutram = value === 'yes';
          break;
        case 'hasVerandah':
          newInputs.hasVerandah = value === 'yes';
          break;
        case 'hasPooja':
          newInputs.hasPooja = value === 'yes' ? true : value === 'corner' ? 'corner' : false;
          break;
        case 'parking':
          newInputs.parking = value as FloorPlanInputs['parking'];
          break;
        case 'staircaseLocation':
          newInputs.staircaseLocation = value as FloorPlanInputs['staircaseLocation'];
          break;
        case 'wallMaterial':
          newInputs.wallMaterial = value as FloorPlanInputs['wallMaterial'];
          break;
        case 'flooringType':
          newInputs.flooringType = value as FloorPlanInputs['flooringType'];
          break;
        case 'roofType':
          newInputs.roofType = value as FloorPlanInputs['roofType'];
          break;
        case 'budgetRange':
          newInputs.budgetRange = value as FloorPlanInputs['budgetRange'];
          break;
        case 'ecoFeatures':
          newInputs.ecoFeatures = value.split(',');
          break;
        // Compound wall
        case 'wallHeight':
          newInputs.wallHeight = value as FloorPlanInputs['wallHeight'];
          break;
        case 'gates':
          newInputs.gates = value as FloorPlanInputs['gates'];
          break;
        case 'pillars':
          newInputs.pillars = value as FloorPlanInputs['pillars'];
          break;
        // Commercial
        case 'buildingType':
          newInputs.buildingType = value as FloorPlanInputs['buildingType'];
          break;
        case 'units':
          newInputs.units = parseInt(value) || 1;
          break;
        case 'loadingArea':
          newInputs.loadingArea = value === 'yes';
          break;
      }

      const updatedInputs = { ...session.collectedInputs, ...newInputs };
      updateInputs(newInputs);

      // Submit answer to backend API (if session started)
      if (backendSessionIdRef.current) {
        try {
          const response = await submitAnswer(currentQuestion.id, value);

          // Check response status
          if (response.status === 'generating') {
            // Backend started generation automatically
            setIsGenerating(true);
            setStatus('generating');

            addMessage({
              role: 'assistant',
              content: response.message || "Perfect! I have all the information I need. Let me design your floor plan...",
              type: 'text',
            });

            // Initialize progress
            setGenerationProgress({
              stage: 'Starting design process...',
              percent: 0,
              stages: (response.progress && 'stages' in response.progress) ? response.progress.stages : BLUEPRINT_STAGES,
            });

            // Polling will handle the rest via useEffect
            return;
          }

          // Show next question from backend
          if (response.nextQuestion) {
            const nextQ = response.nextQuestion;

            setTimeout(() => {
              // Add any message from backend
              if (response.message) {
                addMessage({
                  role: 'assistant',
                  content: response.message,
                  type: 'text',
                });
              }

              setTimeout(() => {
                // Handle different question types
                if (nextQ.type === 'form') {
                  const isPlotDimensions = nextQ.id === 'plotDimensions';
                  const isClientName = nextQ.id === 'clientName';

                  addMessage({
                    role: 'assistant',
                    content: nextQ.question,
                    type: 'form',
                    formFields: nextQ.fields?.map((f) => {
                      if (isClientName) {
                        return {
                          name: f,
                          label: 'Client/Project Name',
                          type: 'text' as const,
                          placeholder: 'e.g., Kumar Residence, Villa Phase 2',
                          required: true,
                        };
                      }

                      if (isPlotDimensions) {
                        return {
                          name: f,
                          label: f.charAt(0).toUpperCase() + f.slice(1) + ' (feet)',
                          type: 'number' as const,
                          placeholder: 'e.g., 30',
                          required: true,
                        };
                      }

                      return {
                        name: f,
                        label: f.charAt(0).toUpperCase() + f.slice(1),
                        type: 'text' as const,
                        placeholder: '',
                        required: true,
                      };
                    }),
                  });
                } else if (nextQ.type === 'upload') {
                  // Handle upload question type
                  setShowUploader(true);
                  addMessage({
                    role: 'assistant',
                    content: nextQ.question,
                    type: 'text',
                  });
                } else {
                  // Handle single-select, multi-select
                  addMessage({
                    role: 'assistant',
                    content: nextQ.question,
                    type: 'options',
                    options: nextQ.options,
                  });
                }
              }, 400);
            }, 600);
          }
        } catch (err) {
          console.error('Error submitting answer:', err);
          addMessage({
            role: 'assistant',
            content: 'I encountered an issue processing your answer. Please try again.',
            type: 'error',
          });
        }
      } else {
        // Fallback to local flow if backend session not started
        if (isLastQuestion(updatedInputs)) {
          startGeneration(updatedInputs);
        } else {
          const nextQuestion = getNextQuestion(updatedInputs);
          if (nextQuestion) {
            setTimeout(() => {
              if (nextQuestion.description) {
                addMessage({
                  role: 'assistant',
                  content: nextQuestion.description,
                  type: 'text',
                });
              }

              setTimeout(() => {
                if (nextQuestion.type === 'form') {
                  const isPlotDimensions = nextQuestion.id === 'plotDimensions';
                  const isClientName = nextQuestion.id === 'clientName';

                  addMessage({
                    role: 'assistant',
                    content: nextQuestion.question,
                    type: 'form',
                    formFields: nextQuestion.fields?.map((f) => {
                      if (isClientName) {
                        return {
                          name: f,
                          label: 'Client/Project Name',
                          type: 'text' as const,
                          placeholder: 'e.g., Kumar Residence, Villa Phase 2',
                          required: true,
                        };
                      }

                      if (isPlotDimensions) {
                        return {
                          name: f,
                          label: f.charAt(0).toUpperCase() + f.slice(1) + ' (feet)',
                          type: 'number' as const,
                          placeholder: 'e.g., 30',
                          required: true,
                        };
                      }

                      return {
                        name: f,
                        label: f.charAt(0).toUpperCase() + f.slice(1),
                        type: 'text' as const,
                        placeholder: '',
                        required: true,
                      };
                    }),
                  });
                } else {
                  addMessage({
                    role: 'assistant',
                    content: nextQuestion.question,
                    type: 'options',
                    options: nextQuestion.options,
                  });
                }
              }, 400);
            }, 600);
          }
        }
      }
    },
    [session.collectedInputs, getNextQuestion, isLastQuestion, addMessage, updateInputs, submitAnswer, startBackendSession, setStatus]
  );

  const handleRefreshDownloads = useCallback(async () => {
    if (!backendSessionIdRef.current) {
      addMessage({
        role: 'assistant',
        content: 'Unable to refresh downloads without an active session. Please start a new design.',
        type: 'error',
      });
      return;
    }

    try {
      const statusData = await getStatus();
      if (statusData.result?.images) {
        setGeneratedImages(statusData.result.images);
      }
    } catch (err) {
      console.error('Failed to refresh downloads:', err);
      addMessage({
        role: 'assistant',
        content: 'Failed to refresh downloads. Please try again in a moment.',
        type: 'error',
      });
    }
  }, [addMessage, getStatus, setGeneratedImages]);

  /**
   * Handle form submission (for dimensions and client name)
   */
  const handleFormSubmit = useCallback(
    async (values: Record<string, string>) => {
      const currentQuestion = getNextQuestion(session.collectedInputs);
      if (!currentQuestion) return;

      // Handle client name submission
      if (currentQuestion.id === 'clientName') {
        const clientName = values.clientName?.trim();

        if (!clientName || clientName.length < 2) {
          addMessage({
            role: 'system',
            content: 'Please enter a valid client or project name (at least 2 characters).',
            type: 'error',
          });
          return;
        }

        addMessage({
          role: 'user',
          content: `Client Name: ${clientName}`,
          type: 'text',
        });

        updateInputs({ clientName });

        // Submit to backend API if session active
        if (backendSessionIdRef.current) {
          try {
            const response = await submitAnswer(currentQuestion.id, values as Record<string, unknown>);

            // Check response status
            if (response.status === 'generating') {
              setIsGenerating(true);
              setStatus('generating');

              addMessage({
                role: 'assistant',
                content: response.message || "Perfect! I have all the information I need. Let me design your floor plan...",
                type: 'text',
              });

              setGenerationProgress({
                stage: 'Starting design process...',
                percent: 0,
                stages: (response.progress && 'stages' in response.progress) ? response.progress.stages : BLUEPRINT_STAGES,
              });

              return;
            }

            // Show next question from backend
            if (response.nextQuestion) {
              const nextQ = response.nextQuestion;

              setTimeout(() => {
                if (response.message) {
                  addMessage({
                    role: 'assistant',
                    content: response.message,
                    type: 'text',
                  });
                } else {
                  addMessage({
                    role: 'assistant',
                    content: `Perfect! I'll create files for "${clientName}".`,
                    type: 'text',
                  });
                }

                setTimeout(() => {
                  if (nextQ.type === 'form') {
                    const isPlotDimensions = nextQ.id === 'plotDimensions';
                    const isSetbacks = nextQ.id === 'setbacks';
                    const isNumericForm = isPlotDimensions || isSetbacks;

                    addMessage({
                      role: 'assistant',
                      content: nextQ.question,
                      type: 'form',
                      formFields: nextQ.fields?.map((f) => ({
                        name: f,
                        label: isNumericForm
                          ? f.charAt(0).toUpperCase() + f.slice(1) + ' (feet)'
                          : f.charAt(0).toUpperCase() + f.slice(1),
                        type: isNumericForm ? ('number' as const) : ('text' as const),
                        placeholder: isNumericForm ? (isSetbacks ? 'e.g., 5' : 'e.g., 30') : '',
                        required: true,
                      })),
                    });
                  } else {
                    addMessage({
                      role: 'assistant',
                      content: nextQ.question,
                      type: 'options',
                      options: nextQ.options,
                    });
                  }
                }, 400);
              }, 600);
            }
          } catch (err) {
            console.error('Error submitting client name:', err);
            addMessage({
              role: 'assistant',
              content: 'I encountered an issue processing your input. Please try again.',
              type: 'error',
            });
          }
        } else {
          // Fallback to local flow
          const updatedInputs = { ...session.collectedInputs, clientName };
          const nextQuestion = getNextQuestion(updatedInputs);

          if (nextQuestion) {
            setTimeout(() => {
              addMessage({
                role: 'assistant',
                content: `Perfect! I'll create files for "${clientName}". ${nextQuestion.description || ''}`,
                type: 'text',
              });

              setTimeout(() => {
                if (nextQuestion.type === 'form') {
                  const isPlotDimensions = nextQuestion.id === 'plotDimensions';
                  const isSetbacks = nextQuestion.id === 'setbacks';
                  const isNumericForm = isPlotDimensions || isSetbacks;

                  addMessage({
                    role: 'assistant',
                    content: nextQuestion.question,
                    type: 'form',
                    formFields: nextQuestion.fields?.map((f) => ({
                      name: f,
                      label: isNumericForm
                        ? f.charAt(0).toUpperCase() + f.slice(1) + ' (feet)'
                        : f.charAt(0).toUpperCase() + f.slice(1),
                      type: isNumericForm ? ('number' as const) : ('text' as const),
                      placeholder: isNumericForm ? (isSetbacks ? 'e.g., 5' : 'e.g., 30') : '',
                      required: true,
                    })),
                  });
                } else {
                  addMessage({
                    role: 'assistant',
                    content: nextQuestion.question,
                    type: 'options',
                    options: nextQuestion.options,
                  });
                }
              }, 400);
            }, 600);
          }
        }
        return;
      }

      // Add user's input as message for plot dimensions
      if (currentQuestion.id === 'plotDimensions') {
        addMessage({
          role: 'user',
          content: `Plot dimensions: North ${values.north}', South ${values.south}', East ${values.east}', West ${values.west}'`,
          type: 'text',
        });

        const plotDimensions = {
          north: parseFloat(values.north),
          south: parseFloat(values.south),
          east: parseFloat(values.east),
          west: parseFloat(values.west),
        };

        // Calculate area (approximate for irregular plots)
        const avgWidth = (plotDimensions.north + plotDimensions.south) / 2;
        const avgDepth = (plotDimensions.east + plotDimensions.west) / 2;
        const plotArea = avgWidth * avgDepth;

        updateInputs({ plotDimensions, plotArea });

        // Submit to backend API if session active
        if (backendSessionIdRef.current) {
          try {
            const response = await submitAnswer(currentQuestion.id, values as Record<string, unknown>);

            // Check response status
            if (response.status === 'generating') {
              setIsGenerating(true);
              setStatus('generating');

              addMessage({
                role: 'assistant',
                content: response.message || "Perfect! I have all the information I need. Let me design your floor plan...",
                type: 'text',
              });

              setGenerationProgress({
                stage: 'Starting design process...',
                percent: 0,
                stages: (response.progress && 'stages' in response.progress) ? response.progress.stages : BLUEPRINT_STAGES,
              });

              return;
            }

            // Show next question from backend
            if (response.nextQuestion) {
              const nextQ = response.nextQuestion;

              setTimeout(() => {
                if (response.message) {
                  addMessage({
                    role: 'assistant',
                    content: response.message,
                    type: 'text',
                  });
                } else {
                  addMessage({
                    role: 'assistant',
                    content: `Great! Your plot area is approximately ${Math.round(plotArea)} sq.ft.`,
                    type: 'text',
                  });
                }

                setTimeout(() => {
                  addMessage({
                    role: 'assistant',
                    content: nextQ.question,
                    type: 'options',
                    options: nextQ.options,
                  });
                }, 400);
              }, 600);
            }
          } catch (err) {
            console.error('Error submitting plot dimensions:', err);
            addMessage({
              role: 'assistant',
              content: 'I encountered an issue processing your dimensions. Please try again.',
              type: 'error',
            });
          }
        } else {
          // Fallback to local flow
          const updatedInputs = { ...session.collectedInputs, plotDimensions, plotArea };
          const nextQuestion = getNextQuestion(updatedInputs);

          if (nextQuestion) {
            setTimeout(() => {
              addMessage({
                role: 'assistant',
                content: `Great! Your plot area is approximately ${Math.round(plotArea)} sq.ft. ${nextQuestion.description || ''}`,
                type: 'text',
              });

              setTimeout(() => {
                addMessage({
                  role: 'assistant',
                  content: nextQuestion.question,
                  type: 'options',
                  options: nextQuestion.options,
                });
              }, 400);
            }, 600);
          }
        }
      }

      // Handle setbacks submission
      if (currentQuestion.id === 'setbacks') {
        addMessage({
          role: 'user',
          content: `Setbacks: North ${values.north}', South ${values.south}', East ${values.east}', West ${values.west}'`,
          type: 'text',
        });

        const setbacks = {
          north: parseFloat(values.north),
          south: parseFloat(values.south),
          east: parseFloat(values.east),
          west: parseFloat(values.west),
        };

        updateInputs({ setbacks });

        // Submit to backend API if session active
        if (backendSessionIdRef.current) {
          try {
            const response = await submitAnswer(currentQuestion.id, values as Record<string, unknown>);

            // Check response status
            if (response.status === 'generating') {
              setIsGenerating(true);
              setStatus('generating');

              addMessage({
                role: 'assistant',
                content: response.message || "Perfect! I have all the information I need. Let me design your floor plan...",
                type: 'text',
              });

              setGenerationProgress({
                stage: 'Starting design process...',
                percent: 0,
                stages: (response.progress && 'stages' in response.progress) ? response.progress.stages : BLUEPRINT_STAGES,
              });

              return;
            }

            // Show next question from backend
            if (response.nextQuestion) {
              const nextQ = response.nextQuestion;

              setTimeout(() => {
                if (response.message) {
                  addMessage({
                    role: 'assistant',
                    content: response.message,
                    type: 'text',
                  });
                }

                setTimeout(() => {
                  if (nextQ.type === 'form') {
                    const isPlotDimensions = nextQ.id === 'plotDimensions';
                    const isSetbacks = nextQ.id === 'setbacks';
                    const isNumericForm = isPlotDimensions || isSetbacks;

                    addMessage({
                      role: 'assistant',
                      content: nextQ.question,
                      type: 'form',
                      formFields: nextQ.fields?.map((f) => ({
                        name: f,
                        label: isNumericForm
                          ? f.charAt(0).toUpperCase() + f.slice(1) + ' (feet)'
                          : f.charAt(0).toUpperCase() + f.slice(1),
                        type: isNumericForm ? ('number' as const) : ('text' as const),
                        placeholder: isNumericForm ? (isSetbacks ? 'e.g., 5' : 'e.g., 30') : '',
                        required: true,
                      })),
                    });
                  } else {
                    addMessage({
                      role: 'assistant',
                      content: nextQ.question,
                      type: 'options',
                      options: nextQ.options,
                    });
                  }
                }, 400);
              }, 600);
            }
          } catch (err) {
            console.error('Error submitting setbacks:', err);
            addMessage({
              role: 'assistant',
              content: 'I encountered an issue processing your setbacks. Please try again.',
              type: 'error',
            });
          }
        }
        return;
      }
    },
    [session.collectedInputs, getNextQuestion, addMessage, updateInputs, submitAnswer, setStatus, backendSessionIdRef]
  );

  /**
   * Handle survey image upload
   */
  const handleSurveyUpload = useCallback(
    (base64: string) => {
      setShowUploader(false);
      updateInputs({ surveyImage: base64 });

      addMessage({
        role: 'user',
        content: '📄 Survey document uploaded',
        type: 'text',
      });

      // Simulate dimension extraction
      addMessage({
        role: 'assistant',
        content: 'Analyzing your survey document...',
        type: 'text',
      });

      // In production, this would call the DiagramInterpreter agent
      setTimeout(() => {
        // Mock extracted dimensions
        const plotDimensions = {
          north: 29,
          south: 27.5,
          east: 41,
          west: 43,
        };
        const plotArea = ((plotDimensions.north + plotDimensions.south) / 2) * ((plotDimensions.east + plotDimensions.west) / 2);

        updateInputs({ plotDimensions, plotArea });

        addMessage({
          role: 'assistant',
          content: `I've extracted your plot dimensions:\n\n• North: ${plotDimensions.north}'\n• South: ${plotDimensions.south}'\n• East: ${plotDimensions.east}'\n• West: ${plotDimensions.west}'\n\nTotal area: ~${Math.round(plotArea)} sq.ft.`,
          type: 'text',
        });

        const updatedInputs = { ...session.collectedInputs, plotDimensions, plotArea };
        const nextQuestion = getNextQuestion(updatedInputs);

        if (nextQuestion) {
          setTimeout(() => {
            addMessage({
              role: 'assistant',
              content: nextQuestion.question,
              type: 'options',
              options: nextQuestion.options,
            });
          }, 600);
        }
      }, 2000);
    },
    [session.collectedInputs, getNextQuestion, addMessage, updateInputs]
  );

  /**
   * Start floor plan generation
   */
  const startGeneration = async (inputs: Partial<FloorPlanInputs>) => {
    setIsGenerating(true);
    setStatus('generating');

    addMessage({
      role: 'assistant',
      content: "Perfect! I have all the information I need. Let me design your floor plan...",
      type: 'text',
    });

    try {
      const projectType = (inputs.projectType || session.collectedInputs.projectType) as ProjectType | undefined;
      if (!projectType) {
        throw new Error('Project type is required to start generation.');
      }

      const response = await fetch('/api/planning/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: backendSessionIdRef.current || undefined,
          projectType,
          inputs,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start generation');
      }

      const payload = await response.json();
      const data = payload.data || payload;

      if (data.sessionId) {
        backendSessionIdRef.current = data.sessionId;
      }

      setGenerationProgress({
        stage: data.progress?.stage || 'Starting design process...',
        percent: data.progress?.percent || 0,
        stages: data.progress?.stages || ALL_STAGES,
      });
    } catch (err) {
      console.error('Failed to start backend generation:', err);
      setIsGenerating(false);
      setGenerationProgress(null);
      setStatus('failed');
      addMessage({
        role: 'assistant',
        content: 'Sorry, I could not start the generation process. Please refresh the page and try again.',
        type: 'error',
      });
    }
  };

  /**
   * Handle text input for modifications
   */
  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');

    addMessage({
      role: 'user',
      content: userMessage,
      type: 'text',
    });

    // Handle modification request
    if (session.status === 'iterating' || session.status === 'presenting') {
      addMessage({
        role: 'assistant',
        content: `I understand you want to "${userMessage}". Let me analyze this change and show you the updated design...`,
        type: 'text',
      });

      // In production, call modifyDesign API
      // For now, simulate response
      setTimeout(() => {
        addMessage({
          role: 'assistant',
          content: `I can make that change. This would affect the adjacent rooms slightly. Here's the updated floor plan...

Note: In the production version, this would regenerate the floor plan with your requested changes.

Would you like to make any other changes?`,
          type: 'text',
        });
      }, 2000);
    }
  };

  /**
   * Handle new design
   */
  const handleStartNew = () => {
    clearSession();
    setShowUploader(false);
    setIsGenerating(false);
    setGenerationProgress(null);
  };

  return (
    <div className={`flex flex-col h-full bg-slate-900 ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-700/50 bg-gradient-to-r from-amber-600/10 to-orange-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <span className="text-2xl">🏠</span>
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">Floor Plan Designer</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-xs font-medium">
                  AI Architect • Ready
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={handleStartNew}
            className="p-2.5 hover:bg-white/10 rounded-xl transition-colors"
            title="Start new design"
          >
            <svg
              className="w-5 h-5 text-slate-400 hover:text-amber-400 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {session.messages.map((message, index) => (
          <div key={message.id}>
            <ChatMessage
              message={message}
              onOptionSelect={handleOptionSelect}
              onFormSubmit={handleFormSubmit}
            />
            {/* Render options separately for options messages */}
            {message.type === 'options' && message.options && (
              <div className="mt-3 ml-4">
                <QuickOptions
                  options={message.options}
                  onSelect={handleOptionSelect}
                  multiSelect={getNextQuestion(session.collectedInputs)?.type === 'multi-select'}
                  disabled={index !== session.messages.length - 1}
                />
              </div>
            )}
          </div>
        ))}

        {/* Image uploader */}
        {showUploader && (
          <div className="mt-4">
            <ImageUploader
              onUpload={handleSurveyUpload}
              onCancel={() => {
                setShowUploader(false);
                // Fall back to manual entry
                handleOptionSelect('manual');
              }}
            />
          </div>
        )}

        {/* Generation progress */}
        {isGenerating && generationProgress && (
          <div className="mt-4">
            <ProgressIndicator progress={generationProgress} />
          </div>
        )}

        {/* Open Questions Form - shown when generation is halted */}
        {session.status === 'halted' && pendingQuestions.length > 0 && (
          <div className="mt-4 bg-slate-800/90 rounded-2xl border border-amber-500/30 overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-amber-600/20 to-orange-500/20 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <span className="text-xl">❓</span>
                </div>
                <div>
                  <h3 className="font-semibold text-white">Clarification Needed</h3>
                  <p className="text-slate-400 text-sm">Please answer these questions to continue</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {pendingQuestions.map((question, index) => (
                <div key={index} className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">
                    {index + 1}. {question}
                  </label>
                  <input
                    type="text"
                    value={questionAnswers[index] || ''}
                    onChange={(e) => setQuestionAnswers(prev => ({ ...prev, [index]: e.target.value }))}
                    placeholder="Type your answer..."
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  />
                </div>
              ))}
              <button
                onClick={async () => {
                  // Check all questions are answered
                  const allAnswered = pendingQuestions.every((_, i) => questionAnswers[i]?.trim());
                  if (!allAnswered) {
                    addMessage({
                      role: 'assistant',
                      content: 'Please answer all questions before continuing.',
                      type: 'text',
                    });
                    return;
                  }

                  // Submit answers via chat
                  const answersText = pendingQuestions
                    .map((q, i) => `Q: ${q}\nA: ${questionAnswers[i]}`)
                    .join('\n\n');

                  addMessage({
                    role: 'user',
                    content: answersText,
                    type: 'text',
                  });

                  // Clear pending questions
                  setPendingQuestions([]);
                  setQuestionAnswers({});

                  // Resume generation with answers
                  try {
                    await modifyDesign(answersText);
                    addMessage({
                      role: 'assistant',
                      content: 'Thank you for the clarification! Let me continue with your design...',
                      type: 'text',
                    });
                    setStatus('generating');
                    setIsGenerating(true);
                  } catch (err) {
                    console.error('Failed to submit answers:', err);
                    addMessage({
                      role: 'assistant',
                      content: 'Sorry, I encountered an error processing your answers. Please try again.',
                      type: 'error',
                    });
                  }
                }}
                disabled={!pendingQuestions.every((_, i) => questionAnswers[i]?.trim())}
                className="w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-amber-500/20"
              >
                Submit Answers & Continue
              </button>
            </div>
          </div>
        )}

        {/* Final generated images with download buttons */}
        {session.status === 'complete' && hasDownloads && (
          <div className="mt-4 bg-slate-800/90 rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-600/20 to-teal-500/20 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <span className="text-xl">✅</span>
                </div>
                <div>
                  <h3 className="font-semibold text-white">Design Complete!</h3>
                  <p className="text-slate-400 text-sm">Download your floor plan images below</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {/* Floor Plan Download */}
              {session.generatedImages.floorPlan && (
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📐</span>
                      <div>
                        <h4 className="font-medium text-white">2D Floor Plan</h4>
                        <p className="text-slate-400 text-sm">Detailed blueprint with room dimensions</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        downloadPng(session.generatedImages.floorPlan, 'floor-plan');
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download PNG
                    </button>
                  </div>
                </div>
              )}
              {/* Exterior/3D View Download */}
              {session.generatedImages.exterior && (
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🏠</span>
                      <div>
                        <h4 className="font-medium text-white">3D Exterior View</h4>
                        <p className="text-slate-400 text-sm">Isometric view of your home</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        downloadPng(session.generatedImages.exterior, 'exterior-3d');
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download PNG
                    </button>
                  </div>
                </div>
              )}
              {/* Courtyard View Download (if applicable) */}
              {session.generatedImages.courtyard && (
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🌿</span>
                      <div>
                        <h4 className="font-medium text-white">Courtyard View</h4>
                        <p className="text-slate-400 text-sm">Interior courtyard visualization</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        downloadPng(session.generatedImages.courtyard, 'courtyard');
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download PNG
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {session.status === 'complete' && !hasDownloads && (
          <div className="mt-4 bg-slate-800/90 rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h3 className="font-semibold text-white">Finalizing Downloads</h3>
              <p className="text-slate-400 text-sm">
                Your images are finishing up. Click refresh to load the download buttons.
              </p>
            </div>
            <div className="p-5">
              <button
                onClick={handleRefreshDownloads}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Refresh Downloads
              </button>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !isGenerating && (
          <div className="flex justify-start">
            <div className="bg-slate-700/80 rounded-2xl rounded-bl-md px-4 py-3 border border-slate-600/50">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  <span
                    className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-2 h-2 bg-red-400 rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
                <span className="text-slate-300 text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {(session.status === 'iterating' || session.status === 'presenting') && (
        <div className="p-4 border-t border-slate-700/50 bg-slate-800/80">
          <div className="flex gap-3 items-center">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Describe any changes you'd like..."
              className="flex-1 px-4 py-3.5 bg-slate-900/70 border border-slate-600/50 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all text-sm"
              disabled={isLoading || isGenerating}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || isGenerating || !input.trim()}
              className="w-12 h-12 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:from-slate-600 disabled:to-slate-600 text-white rounded-2xl flex items-center justify-center transition-all shadow-lg hover:shadow-amber-500/30 disabled:shadow-none"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
