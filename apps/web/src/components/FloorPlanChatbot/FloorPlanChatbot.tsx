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
import { FloorPlanPreview } from './FloorPlanPreview';
import { ProgressIndicator } from './ProgressIndicator';
import { BlueprintConfirmation } from './BlueprintConfirmation';
import type {
  FloorPlanChatbotProps,
  ChatMessage as ChatMessageType,
  ProjectType,
  FloorPlanInputs,
  GENERATION_STAGES,
  ProgressData,
  BlueprintDesignSummary,
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

// Isometric stages - shown after blueprint confirmation
const ISOMETRIC_STAGES: ProgressData['stages'] = [
  { id: 'visualization', label: 'Preparing 3D visualization', icon: '🎨', status: 'pending' },
  { id: 'isometric', label: 'Rendering isometric view', icon: '🏠', status: 'pending' },
];

// All stages combined
const ALL_STAGES: ProgressData['stages'] = [
  ...BLUEPRINT_STAGES,
  { id: 'confirmation', label: 'Awaiting blueprint confirmation', icon: '✋', status: 'pending' },
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
  const [blueprintData, setBlueprintData] = useState<{
    image: string;
    mimeType: string;
    designSummary: BlueprintDesignSummary;
  } | null>(null);
  const [isConfirmingBlueprint, setIsConfirmingBlueprint] = useState(false);

  // Backend session tracking
  const backendSessionIdRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Hooks
  const {
    session,
    addMessage,
    updateInputs,
    setGeneratedImages,
    clearSession,
    setStatus,
  } = useChatSession();

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
          // Generation complete - stop polling
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          setIsGenerating(false);
          setGenerationProgress(null);
          setStatus('awaiting_blueprint_confirmation');

          // Fetch blueprint data
          if (statusData.blueprint) {
            setBlueprintData({
              image: statusData.blueprint.base64Data || '',
              mimeType: statusData.blueprint.mimeType || 'image/png',
              designSummary: statusData.designSummary || {},
            });

            addMessage({
              role: 'assistant',
              content: `Your blueprint is ready! Please review the floor plan design before I generate the 3D isometric view.

${statusData.message || 'Please confirm the blueprint to proceed with the 3D view.'}`,
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
  }, [isGenerating, getStatus, addMessage, setStatus]);

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

                    addMessage({
                      role: 'assistant',
                      content: nextQ.question,
                      type: 'form',
                      formFields: nextQ.fields?.map((f) => ({
                        name: f,
                        label: isPlotDimensions
                          ? f.charAt(0).toUpperCase() + f.slice(1) + ' (feet)'
                          : f.charAt(0).toUpperCase() + f.slice(1),
                        type: isPlotDimensions ? ('number' as const) : ('text' as const),
                        placeholder: isPlotDimensions ? 'e.g., 30' : '',
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

                  addMessage({
                    role: 'assistant',
                    content: nextQuestion.question,
                    type: 'form',
                    formFields: nextQuestion.fields?.map((f) => ({
                      name: f,
                      label: isPlotDimensions
                        ? f.charAt(0).toUpperCase() + f.slice(1) + ' (feet)'
                        : f.charAt(0).toUpperCase() + f.slice(1),
                      type: isPlotDimensions ? ('number' as const) : ('text' as const),
                      placeholder: isPlotDimensions ? 'e.g., 30' : '',
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
    },
    [session.collectedInputs, getNextQuestion, addMessage, updateInputs, submitAnswer, setStatus]
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

    // Initialize progress with blueprint stages
    const progress: ProgressData = {
      stage: 'Starting design process...',
      percent: 0,
      stages: [...BLUEPRINT_STAGES],
    };
    setGenerationProgress(progress);

    // Simulate blueprint generation stages
    const stages = ['vastu', 'eco', 'zoning', 'dimensioning', 'engineering', 'validation', 'blueprint'];
    const stageLabels = [
      'Applying Vastu principles...',
      'Adding eco-friendly elements...',
      'Organizing room zones...',
      'Calculating dimensions...',
      'Engineering specifications...',
      'Validating design...',
      'Generating blueprint...',
    ];

    for (let i = 0; i < stages.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000));

      setGenerationProgress((prev) => {
        if (!prev) return prev;
        const newStages = [...prev.stages];
        // Mark previous as complete
        if (i > 0) {
          const prevIndex = newStages.findIndex((s) => s.id === stages[i - 1]);
          if (prevIndex >= 0) newStages[prevIndex].status = 'completed';
        }
        // Mark current as in progress
        const currentIndex = newStages.findIndex((s) => s.id === stages[i]);
        if (currentIndex >= 0) newStages[currentIndex].status = 'in_progress';

        return {
          stage: stageLabels[i],
          percent: Math.round(((i + 1) / stages.length) * 70), // Max 70% for blueprint phase
          stages: newStages,
        };
      });
    }

    // Mark blueprint stage as complete
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setGenerationProgress((prev) => {
      if (!prev) return prev;
      const newStages = prev.stages.map((s) => ({ ...s, status: 'completed' as const }));
      return { ...prev, percent: 70, stages: newStages, stage: 'Blueprint ready!' };
    });

    // Show blueprint confirmation
    setTimeout(() => {
      setIsGenerating(false);
      setGenerationProgress(null);
      setStatus('awaiting_blueprint_confirmation');

      // Mock blueprint data (in production, this comes from the API)
      const mockDesignSummary: BlueprintDesignSummary = {
        plotSize: inputs.plotDimensions &&
                  !isNaN(inputs.plotDimensions.east) &&
                  !isNaN(inputs.plotDimensions.north)
          ? `${inputs.plotDimensions.east}'×${inputs.plotDimensions.north}'`
          : "40'×60'",
        roomCount: (parseInt(inputs.bedrooms as string) || 2) + 3, // bedrooms + living + kitchen + bathroom
        rooms: [
          { name: 'Master Bedroom', type: 'bedroom', areaSqft: 180 },
          { name: 'Bedroom 2', type: 'bedroom', areaSqft: 150 },
          { name: 'Living Room', type: 'living', areaSqft: 250 },
          { name: 'Kitchen', type: 'kitchen', areaSqft: 120 },
          { name: 'Bathroom', type: 'bathroom', areaSqft: 45 },
          ...(inputs.hasMutram ? [{ name: 'Courtyard (Mutram)', type: 'courtyard', areaSqft: 100 }] : []),
        ],
        hasCourtyard: !!inputs.hasMutram,
        hasVerandah: !!inputs.hasVerandah,
        vastuCompliant: true,
      };

      // In production, this would be real base64 from API
      // For demo, we'll use a placeholder
      setBlueprintData({
        image: '', // Would be actual base64 from API
        mimeType: 'image/png',
        designSummary: mockDesignSummary,
      });

      addMessage({
        role: 'assistant',
        content: `Your blueprint is ready! Please review the floor plan design before I generate the 3D isometric view.

Key Features:
• ${inputs.bedrooms} Bedroom(s) with attached bathroom
• ${inputs.hasMutram ? 'Traditional mutram (courtyard) for natural ventilation' : 'Spacious living area'}
• Kitchen in SE corner (Vastu compliant)
• ${inputs.hasVerandah ? 'Front verandah (thinnai)' : 'Direct entrance'}
• ${inputs.wallMaterial === 'mud-interlock' ? 'Eco-friendly mud interlock brick walls' : 'Standard brick construction'}

Please confirm the blueprint to proceed with the 3D view, or let me know if you'd like any changes.`,
        type: 'text',
      });
    }, 500);
  };

  /**
   * Handle blueprint confirmation
   */
  const handleBlueprintConfirm = async () => {
    if (!backendSessionIdRef.current) {
      console.error('No backend session ID');
      return;
    }

    setIsConfirmingBlueprint(true);

    try {
      // Call backend API to confirm blueprint
      const result = await confirmBlueprintAPI(true);

      setBlueprintData(null);

      if (result.status === 'complete') {
        // Backend has all images ready - show them
        addMessage({
          role: 'assistant',
          content: result.message || `Your design is complete! Here's your ECO-FRIENDLY ${session.collectedInputs.hasMutram ? 'COURTYARD ' : ''}HOUSE with:

• 3D Isometric View
• Detailed Floor Plan
• Vastu-compliant layout
• Eco-friendly design elements

Would you like to make any changes to this design?`,
          type: 'text',
        });

        setStatus('iterating');
      } else if (result.status === 'generating_isometric') {
        // Backend is generating isometric views
        addMessage({
          role: 'assistant',
          content: result.message || "Great! You've approved the blueprint. Now generating your 3D isometric view...",
          type: 'text',
        });

        setStatus('generating_isometric');
        setIsGenerating(true);

        // Initialize progress if provided
        if (result.progress) {
          setGenerationProgress({
            stage: result.progress.stage || 'Preparing 3D visualization...',
            percent: result.progress.percent || 75,
            stages: result.stages || ISOMETRIC_STAGES,
          });
        }

        // Polling will handle the rest
      }
    } catch (err) {
      console.error('Blueprint confirmation error:', err);
      addMessage({
        role: 'assistant',
        content: 'Sorry, there was an error processing your confirmation. Please try again.',
        type: 'error',
      });
    } finally {
      setIsConfirmingBlueprint(false);
    }
  };

  /**
   * Handle blueprint rejection
   */
  const handleBlueprintReject = async (feedback?: string) => {
    if (!backendSessionIdRef.current) {
      console.error('No backend session ID');
      return;
    }

    setIsConfirmingBlueprint(true);

    try {
      // Call backend API to reject blueprint
      const result = await confirmBlueprintAPI(false, feedback);

      setBlueprintData(null);

      if (feedback) {
        addMessage({
          role: 'user',
          content: `I'd like to make changes: ${feedback}`,
          type: 'text',
        });

        addMessage({
          role: 'assistant',
          content: result.message || `I understand you want to make changes. Let me redesign with those modifications in mind.

What specific aspect would you like me to modify?`,
          type: 'text',
        });
      } else {
        addMessage({
          role: 'assistant',
          content: result.message || `No problem! Let's modify the design. What changes would you like to make to the floor plan?`,
          type: 'text',
        });
      }

      // Update status based on result
      setStatus(result.status === 'collecting' ? 'collecting' : 'iterating');
    } catch (err) {
      console.error('Blueprint rejection error:', err);
      addMessage({
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
        type: 'error',
      });
    } finally {
      setIsConfirmingBlueprint(false);
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
    setBlueprintData(null);
    setIsConfirmingBlueprint(false);
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

        {/* Blueprint confirmation */}
        {session.status === 'awaiting_blueprint_confirmation' && blueprintData && (
          <div className="mt-4">
            <BlueprintConfirmation
              blueprintImage={blueprintData.image}
              mimeType={blueprintData.mimeType}
              designSummary={blueprintData.designSummary}
              onConfirm={handleBlueprintConfirm}
              onReject={handleBlueprintReject}
              isLoading={isConfirmingBlueprint}
            />
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
