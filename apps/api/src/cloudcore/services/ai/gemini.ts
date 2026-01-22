/**
 * Gemini Service
 * Used for STT (Speech-to-Text), embeddings, and multimodal processing
 * Model: gemini-2.5-flash-preview-05-20
 */

import { GoogleGenerativeAI, Part, TaskType } from "@google/generative-ai";
import { GoogleGenAI as GeminiClient } from "@google/genai";
import fs from "fs";
import path from "path";
import os from "os";
import {
  GeminiModels,
  GeminiImageModels,
  type CloudCoreResult,
  type TokenUsage,
  type ImageGenerationConfig,
  type ImageGenerationResult,
  type GeneratedImage,
  type ImageAspectRatio,
} from "../../types";
import {
  createTrace,
  calculateCost,
  getLangfuse,
  type TraceContext,
} from "../../../services/observability";

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

// Default configuration
const DEFAULT_MODEL = GeminiModels.FLASH;
const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIMENSIONS = 768;

export interface GeminiCompletionRequest {
  prompt: string;
  model?: keyof typeof GeminiModels;
  maxTokens?: number;
  temperature?: number;
  parts?: Part[];
  /** Optional trace context for observability */
  traceContext?: {
    traceId?: string;
    userId?: string;
    leadId?: string;
    agentType?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface GeminiCompletionResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface TranscriptionOptions {
  language?: "en" | "ta" | "auto";
  includeTimestamps?: boolean;
  speakerDiarization?: boolean;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  duration?: number;
  speakers?: string[];
}

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
  model: string;
}

/**
 * Generate a completion using Gemini
 */
export async function complete(
  request: GeminiCompletionRequest,
): Promise<CloudCoreResult<GeminiCompletionResponse>> {
  const startTime = Date.now();
  const modelName = request.model ? GeminiModels[request.model] : DEFAULT_MODEL;

  // Create trace for observability (if context provided)
  const trace = request.traceContext
    ? createTrace({
        traceId: request.traceContext.traceId || `gemini-${Date.now()}`,
        userId: request.traceContext.userId,
        leadId: request.traceContext.leadId,
        agentType: request.traceContext.agentType || "gemini-completion",
        metadata: request.traceContext.metadata,
      })
    : null;

  // Create generation span for this LLM call
  const generation = trace?.generation({
    name: `${request.traceContext?.agentType || "gemini"}-llm-call`,
    model: modelName,
    input: request.prompt,
    metadata: {
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      hasParts: Boolean(request.parts?.length),
    },
  });

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        maxOutputTokens: request.maxTokens || 2048,
        temperature: request.temperature ?? 0.7,
      },
    });

    let result;
    if (request.parts && request.parts.length > 0) {
      result = await model.generateContent([
        ...request.parts,
        { text: request.prompt },
      ]);
    } else {
      result = await model.generateContent(request.prompt);
    }

    const content = result.response.text();
    const latencyMs = Date.now() - startTime;

    // Extract usage metadata from Gemini response
    const usageMetadata = result.response.usageMetadata;
    const inputTokens = usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = usageMetadata?.candidatesTokenCount ?? 0;
    const cost = calculateCost(modelName, inputTokens, outputTokens);

    // End generation with success
    generation?.end({
      output: content,
      usage: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      metadata: {
        cost,
        latencyMs,
        provider: "gemini",
      },
    });

    // Update trace with summary
    trace?.update({
      metadata: {
        totalTokens: inputTokens + outputTokens,
        totalCost: cost,
        latencyMs,
        status: "success",
        provider: "gemini",
      },
    });

    return {
      success: true,
      data: {
        content,
        usage: usageMetadata
          ? {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            }
          : undefined,
      },
      meta: {
        processingTime: latencyMs,
        cost,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Gemini completion failed";

    // End generation with error
    generation?.end({
      level: "ERROR",
      statusMessage: errorMessage,
      metadata: {
        latencyMs,
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
    });

    // Update trace with error
    trace?.update({
      metadata: {
        status: "error",
        errorMessage,
        latencyMs,
      },
    });

    console.error("Gemini completion error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "GEMINI_COMPLETION_ERROR",
        message: errorMessage,
      },
      meta: {
        processingTime: latencyMs,
      },
    };
  }
}

/**
 * Generate a JSON completion using Gemini (Adapter for Fallback)
 */
export async function completeJson<T>(request: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<CloudCoreResult<T>> {
  // Merge system and user prompt as Flash typically performs better with single context block for instructions
  const mergedPrompt = `${request.systemPrompt}

IMPORTANT: Respond ONLY with valid JSON. No other text or explanation.

${request.userPrompt}`;

  // Override maxTokens to prevent truncation (Gemini usage is cheap, better safe than truncated)
  const SAFE_MAX_TOKENS = 8192;

  const result = await complete({
    prompt: mergedPrompt,
    maxTokens: SAFE_MAX_TOKENS, // Ignore request.maxTokens
    temperature: request.temperature,
  });

  if (!result.success || !result.data) {
    return {
      success: false,
      data: null,
      error: result.error,
      meta: result.meta,
    };
  }

  try {
    const content = result.data.content.trim();
    let jsonStr = content;

    // Robust JSON extraction using Regex
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Fallback: try to find first { or [ and last } or ]
      const firstParen = content.search(/[{[]/);
      const lastParen = content.lastIndexOf(
        content.includes("]") && content.includes("}")
          ? content.lastIndexOf("]") > content.lastIndexOf("}")
            ? "]"
            : "}"
          : content.includes("]")
            ? "]"
            : "}",
      );

      if (firstParen !== -1 && lastParen !== -1 && lastParen > firstParen) {
        jsonStr = content.substring(firstParen, lastParen + 1);
      }
    }

    const parsed = JSON.parse(jsonStr) as T;
    return {
      success: true,
      data: parsed,
      meta: result.meta,
    };
  } catch (parseError) {
    console.error("JSON parse error (Gemini):", parseError);
    return {
      success: false,
      data: null,
      error: {
        code: "JSON_PARSE_ERROR",
        message: "Failed to parse Gemini response as JSON",
        details: { rawContent: result.data.content },
      },
      meta: result.meta,
    };
  }
}

/**
 * Transcribe audio using Gemini
 * Supports Tamil-first with English fallback
 */
export async function transcribeAudio(
  audioUrl: string,
  mimeType: string = "audio/mpeg",
  options: TranscriptionOptions = {},
): Promise<CloudCoreResult<TranscriptionResult>> {
  const startTime = Date.now();

  try {
    const model = genAI.getGenerativeModel({ model: GeminiModels.FLASH });

    // Fetch the audio file
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");

    // Create audio part
    const audioPart: Part = {
      inlineData: {
        mimeType,
        data: base64Audio,
      },
    };

    // Build language instruction
    let languageInstruction = "";
    if (options.language === "ta") {
      languageInstruction =
        "The audio is primarily in Tamil. Transcribe in Tamil script when applicable.";
    } else if (options.language === "en") {
      languageInstruction = "The audio is in English.";
    } else {
      languageInstruction =
        "The audio may be in Tamil, English, or mixed. Preserve the original language.";
    }

    const prompt = `You are a highly accurate transcription assistant.

Instructions:
1. Transcribe ALL spoken words exactly as heard
2. Include punctuation and paragraph breaks where appropriate
3. ${options.speakerDiarization ? "Distinguish between different speakers with [Speaker 1], [Speaker 2], etc." : ""}
4. Include relevant non-speech sounds in [brackets] if important
5. Mark unclear words with [unclear]
6. ${languageInstruction}
${options.includeTimestamps ? "7. Include timestamps in [MM:SS] format at the start of each paragraph" : ""}

Return ONLY the transcription text, no explanations.`;

    const result = await model.generateContent([audioPart, { text: prompt }]);
    const transcriptionText = result.response.text().trim();

    // Estimate confidence
    const hasUnclearMarkers = /\[unclear\]/i.test(transcriptionText);
    const confidence = hasUnclearMarkers ? 0.75 : 0.95;

    // Detect language
    const language = detectLanguage(transcriptionText);

    // Estimate duration (rough approximation based on word count)
    const wordCount = transcriptionText.split(/\s+/).length;
    const estimatedDuration = Math.round(wordCount / 2.5); // ~150 words per minute

    return {
      success: true,
      data: {
        text: transcriptionText,
        confidence,
        language,
        duration: estimatedDuration,
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error("Transcription error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "TRANSCRIPTION_ERROR",
        message:
          error instanceof Error ? error.message : "Transcription failed",
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Transcribe audio from base64 data
 */
export async function transcribeAudioFromBase64(
  base64Data: string,
  mimeType: string = "audio/mpeg",
  options: TranscriptionOptions = {},
): Promise<CloudCoreResult<TranscriptionResult>> {
  const startTime = Date.now();

  try {
    const model = genAI.getGenerativeModel({ model: GeminiModels.FLASH });

    const audioPart: Part = {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };

    // Build language instruction
    let languageInstruction = "";
    if (options.language === "ta") {
      languageInstruction =
        "The audio is primarily in Tamil. Transcribe in Tamil script when applicable.";
    } else if (options.language === "en") {
      languageInstruction = "The audio is in English.";
    } else {
      languageInstruction =
        "The audio may be in Tamil, English, or mixed. Preserve the original language.";
    }

    const prompt = `You are a highly accurate transcription assistant.

Instructions:
1. Transcribe ALL spoken words exactly as heard
2. Include punctuation and paragraph breaks where appropriate
3. Mark unclear words with [unclear]
4. ${languageInstruction}

Return ONLY the transcription text, no explanations.`;

    const result = await model.generateContent([audioPart, { text: prompt }]);
    const transcriptionText = result.response.text().trim();

    const hasUnclearMarkers = /\[unclear\]/i.test(transcriptionText);
    const confidence = hasUnclearMarkers ? 0.75 : 0.95;
    const language = detectLanguage(transcriptionText);

    return {
      success: true,
      data: {
        text: transcriptionText,
        confidence,
        language,
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error("Transcription error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "TRANSCRIPTION_ERROR",
        message:
          error instanceof Error ? error.message : "Transcription failed",
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Generate text embeddings using Gemini
 */
export async function generateEmbedding(
  text: string,
  options?: { taskType?: string; title?: string },
): Promise<CloudCoreResult<EmbeddingResult>> {
  const startTime = Date.now();

  try {
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent({
      content: { role: "user", parts: [{ text }] },
      taskType: options?.taskType as TaskType,
      title: options?.title,
    });

    const embedding = result.embedding;
    if (!embedding || !embedding.values) {
      throw new Error("No embedding returned");
    }

    return {
      success: true,
      data: {
        vector: embedding.values,
        dimensions: embedding.values.length,
        model: EMBEDDING_MODEL,
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error("Embedding error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "EMBEDDING_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Embedding generation failed",
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<CloudCoreResult<EmbeddingResult[]>> {
  const startTime = Date.now();

  try {
    const results = await Promise.all(
      texts.map((text) => generateEmbedding(text)),
    );

    const embeddings: EmbeddingResult[] = [];
    const errors: string[] = [];

    for (const result of results) {
      if (result.success && result.data) {
        embeddings.push(result.data);
      } else {
        errors.push(result.error?.message || "Unknown error");
      }
    }

    if (embeddings.length === 0) {
      return {
        success: false,
        data: null,
        error: {
          code: "BATCH_EMBEDDING_ERROR",
          message: "All embeddings failed",
          details: { errors },
        },
        meta: {
          processingTime: Date.now() - startTime,
        },
      };
    }

    return {
      success: true,
      data: embeddings,
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error("Batch embedding error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "BATCH_EMBEDDING_ERROR",
        message:
          error instanceof Error ? error.message : "Batch embedding failed",
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Summarize transcribed text using Gemini
 */
export async function summarizeTranscription(
  text: string,
): Promise<CloudCoreResult<{ summary: string; highlights: string[] }>> {
  const startTime = Date.now();

  try {
    const model = genAI.getGenerativeModel({ model: GeminiModels.FLASH });

    const result = await model.generateContent([
      {
        text: `Summarize the following conversation/note in 2-3 concise bullet points:

Text to summarize:
${text}

Focus on:
- Key topics discussed
- Action items or decisions
- Important dates, numbers, or commitments

Return a JSON object:
{
  "summary": "2-3 sentence summary",
  "highlights": ["Key point 1", "Key point 2", "Key point 3"]
}`,
      },
    ]);

    const responseText = result.response.text().trim();

    // Try to parse as JSON
    try {
      let jsonStr = responseText;
      if (responseText.startsWith("```json")) {
        jsonStr = responseText.slice(7, responseText.lastIndexOf("```")).trim();
      } else if (responseText.startsWith("```")) {
        jsonStr = responseText.slice(3, responseText.lastIndexOf("```")).trim();
      }

      const parsed = JSON.parse(jsonStr);
      return {
        success: true,
        data: {
          summary: parsed.summary || responseText,
          highlights: parsed.highlights || [],
        },
        meta: {
          processingTime: Date.now() - startTime,
        },
      };
    } catch {
      // If parsing fails, return raw text as summary
      return {
        success: true,
        data: {
          summary: responseText,
          highlights: [],
        },
        meta: {
          processingTime: Date.now() - startTime,
        },
      };
    }
  } catch (error) {
    console.error("Summarization error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "SUMMARIZATION_ERROR",
        message:
          error instanceof Error ? error.message : "Summarization failed",
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Generate images using Gemini Pro Image generation capability
 * Uses gemini-3-pro-image-preview with responseModalities
 *
 * @param prompt - Text description of the image to generate
 * @param options - Image generation configuration options
 * @returns Generated images with optional text response
 *
 * @example
 * const result = await generateImage('A modern brick house with Tamil architecture');
 * if (result.success && result.data) {
 *   const base64Image = result.data.images[0].base64Data;
 * }
 */
export async function generateImage(
  prompt: string,
  options: ImageGenerationConfig = {},
): Promise<CloudCoreResult<ImageGenerationResult>> {
  const startTime = Date.now();

  try {
    // Use the new @google/genai client for image generation
    const geminiClient = new GeminiClient({
      apiKey: process.env.GOOGLE_AI_API_KEY,
    });

    // Build generation config
    const responseModalities = options.includeTextResponse
      ? ["TEXT", "IMAGE"]
      : ["IMAGE"];

    // Build the request with image config if specified
    const generationConfig: Record<string, unknown> = {
      responseModalities,
    };

    // Add image config if aspect ratio is specified
    if (options.aspectRatio) {
      generationConfig.imageConfig = {
        aspectRatio: options.aspectRatio,
      };
    }

    const result = await geminiClient.models.generateContent({
      model: GeminiImageModels.PRO_IMAGE,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: generationConfig,
    });

    // Parse the response to extract images
    const images: GeneratedImage[] = [];
    let textResponse: string | undefined;

    // Handle response from the new SDK format
    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0];
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // Check for inline image data
          if (part.inlineData && part.inlineData.data) {
            images.push({
              base64Data: part.inlineData.data,
              mimeType:
                (part.inlineData.mimeType as "image/png" | "image/jpeg") ||
                "image/png",
            });
          }
          // Check for text response
          if (part.text) {
            textResponse = part.text;
          }
        }
      }
    }

    // Also check the simplified response format
    if (images.length === 0 && result.text) {
      textResponse = result.text;
    }

    if (images.length === 0) {
      return {
        success: false,
        data: null,
        error: {
          code: "IMAGE_GENERATION_FAILED",
          message:
            "No images were generated. The model may have declined the request.",
          details: { response: result },
        },
        meta: {
          processingTime: Date.now() - startTime,
        },
      };
    }

    return {
      success: true,
      data: {
        images,
        text: textResponse,
        model: GeminiImageModels.PRO_IMAGE,
      },
      meta: {
        processingTime: Date.now() - startTime,
        imageCount: images.length,
      },
    };
  } catch (error) {
    console.error("Image generation error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "IMAGE_GENERATION_ERROR",
        message:
          error instanceof Error ? error.message : "Image generation failed",
        details: error instanceof Error ? { stack: error.stack } : undefined,
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Edit an existing image using Gemini's image-to-image capability
 *
 * @param prompt - Text description of how to edit the image
 * @param sourceImage - Base64-encoded source image to edit
 * @param mimeType - MIME type of the source image
 * @param options - Image generation configuration options
 * @returns Modified image with optional text response
 *
 * @example
 * const result = await editImage(
 *   'Add a red brick wall in the background',
 *   base64ImageData,
 *   'image/png'
 * );
 */
export async function editImage(
  prompt: string,
  sourceImage: string,
  mimeType: "image/png" | "image/jpeg" | "image/webp" = "image/png",
  options: ImageGenerationConfig = {},
): Promise<CloudCoreResult<ImageGenerationResult>> {
  const startTime = Date.now();

  try {
    const geminiClient = new GeminiClient({
      apiKey: process.env.GOOGLE_AI_API_KEY,
    });

    // Strip data URL prefix if present
    const base64Data = sourceImage.replace(/^data:image\/\w+;base64,/, "");

    // Build generation config
    const responseModalities = options.includeTextResponse
      ? ["TEXT", "IMAGE"]
      : ["IMAGE"];

    const generationConfig: Record<string, unknown> = {
      responseModalities,
    };

    if (options.aspectRatio) {
      generationConfig.imageConfig = {
        aspectRatio: options.aspectRatio,
      };
    }

    const result = await geminiClient.models.generateContent({
      model: GeminiImageModels.PRO_IMAGE,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: generationConfig,
    });

    // Parse the response
    const images: GeneratedImage[] = [];
    let textResponse: string | undefined;

    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0];
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            images.push({
              base64Data: part.inlineData.data,
              mimeType:
                (part.inlineData.mimeType as "image/png" | "image/jpeg") ||
                "image/png",
            });
          }
          if (part.text) {
            textResponse = part.text;
          }
        }
      }
    }

    if (images.length === 0) {
      return {
        success: false,
        data: null,
        error: {
          code: "IMAGE_EDIT_FAILED",
          message:
            "No edited images were generated. The model may have declined the request.",
        },
        meta: {
          processingTime: Date.now() - startTime,
        },
      };
    }

    return {
      success: true,
      data: {
        images,
        text: textResponse,
        model: GeminiImageModels.PRO_IMAGE,
      },
      meta: {
        processingTime: Date.now() - startTime,
        imageCount: images.length,
      },
    };
  } catch (error) {
    console.error("Image edit error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "IMAGE_EDIT_ERROR",
        message:
          error instanceof Error ? error.message : "Image editing failed",
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Generate images with reference images for style transfer or character consistency
 *
 * @param prompt - Text description of the image to generate
 * @param referenceImages - Array of base64-encoded reference images
 * @param options - Image generation configuration options
 * @returns Generated image influenced by reference images
 *
 * @example
 * const result = await generateImageWithReferences(
 *   'A house in the same architectural style',
 *   [{ data: base64Image1, mimeType: 'image/png' }],
 *   { aspectRatio: '16:9' }
 * );
 */
export async function generateImageWithReferences(
  prompt: string,
  referenceImages: Array<{
    data: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
  }>,
  options: ImageGenerationConfig = {},
): Promise<CloudCoreResult<ImageGenerationResult>> {
  const startTime = Date.now();

  try {
    if (referenceImages.length === 0) {
      return {
        success: false,
        data: null,
        error: {
          code: "INVALID_INPUT",
          message: "At least one reference image is required",
        },
        meta: {
          processingTime: Date.now() - startTime,
        },
      };
    }

    // Gemini Pro Image supports up to 14 reference images
    if (referenceImages.length > 14) {
      console.warn(
        "Gemini Pro Image supports up to 14 reference images. Using first 14.",
      );
      referenceImages = referenceImages.slice(0, 14);
    }

    const geminiClient = new GeminiClient({
      apiKey: process.env.GOOGLE_AI_API_KEY,
    });

    // Build parts array with reference images and prompt
    const parts: Array<{
      inlineData?: { mimeType: string; data: string };
      text?: string;
    }> = [];

    for (const ref of referenceImages) {
      const base64Data = ref.data.replace(/^data:image\/\w+;base64,/, "");
      parts.push({
        inlineData: {
          mimeType: ref.mimeType,
          data: base64Data,
        },
      });
    }

    parts.push({ text: prompt });

    // Build generation config
    const responseModalities = options.includeTextResponse
      ? ["TEXT", "IMAGE"]
      : ["IMAGE"];

    const generationConfig: Record<string, unknown> = {
      responseModalities,
    };

    if (options.aspectRatio) {
      generationConfig.imageConfig = {
        aspectRatio: options.aspectRatio,
      };
    }

    const result = await geminiClient.models.generateContent({
      model: GeminiImageModels.PRO_IMAGE,
      contents: [{ role: "user", parts }],
      config: generationConfig,
    });

    // Parse the response
    const images: GeneratedImage[] = [];
    let textResponse: string | undefined;

    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0];
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            images.push({
              base64Data: part.inlineData.data,
              mimeType:
                (part.inlineData.mimeType as "image/png" | "image/jpeg") ||
                "image/png",
            });
          }
          if (part.text) {
            textResponse = part.text;
          }
        }
      }
    }

    if (images.length === 0) {
      return {
        success: false,
        data: null,
        error: {
          code: "IMAGE_GENERATION_FAILED",
          message: "No images were generated with references.",
        },
        meta: {
          processingTime: Date.now() - startTime,
        },
      };
    }

    return {
      success: true,
      data: {
        images,
        text: textResponse,
        model: GeminiImageModels.PRO_IMAGE,
      },
      meta: {
        processingTime: Date.now() - startTime,
        imageCount: images.length,
        referenceCount: referenceImages.length,
      },
    };
  } catch (error) {
    console.error("Image generation with references error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "IMAGE_GENERATION_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Image generation with references failed",
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Detect language from text
 */
function detectLanguage(text: string): string {
  // Tamil Unicode range: U+0B80 to U+0BFF
  const tamilPattern = /[\u0B80-\u0BFF]/;
  const hasTamil = tamilPattern.test(text);

  // Check for English words
  const englishWordPattern = /[a-zA-Z]+/g;
  const englishWords = text.match(englishWordPattern) || [];

  if (hasTamil && englishWords.length > 5) {
    return "mixed"; // Tamil + English
  } else if (hasTamil) {
    return "ta"; // Tamil
  } else {
    return "en"; // English
  }
}

// --- RAG / File Search Implementation ---

/**
 * Add content to Knowledge Base
 * With Context Stuffing approach, this is a pass-through since actual storage is in Supabase
 * Kept for API compatibility with knowledge-curator
 */
export async function addToKnowledgeBase(
  title: string,
  content: string,
  metadata?: Record<string, any>,
): Promise<CloudCoreResult<{ fileId: string; uri: string }>> {
  const startTime = Date.now();

  // With context stuffing, we don't upload to external File Search store
  // Storage is handled by knowledge-curator directly in Supabase
  // This function exists for API compatibility and future extensibility

  console.log(
    `[Context Stuffing] Knowledge entry prepared: "${title}" (${content.length} chars)`,
  );

  return {
    success: true,
    data: {
      fileId: "local-supabase",
      uri: `supabase://knowledgebase/${Date.now()}`,
    },
    meta: {
      processingTime: Date.now() - startTime,
      provider: "context_stuffing",
    },
  };
}

/**
 * Query the Knowledge Base using Context Stuffing (RAG)
 * Fetches all documents from Supabase and embeds them in the system instruction
 */
export async function queryKnowledgeBase(
  query: string,
  options?: { language?: "en" | "ta" },
): Promise<CloudCoreResult<{ answer: string; citations: string[] }>> {
  const language = options?.language || "en";
  const startTime = Date.now();

  try {
    // 1. Fetch all knowledge entries from Supabase
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: documents, error: fetchError } = await supabase
      .from("knowledgebase")
      .select("id, question_text, answer_text, metadata")
      .order("created_at", { ascending: false })
      .limit(50); // Limit to recent 50 docs to stay within context window

    if (fetchError) {
      throw new Error(`Failed to fetch knowledge: ${fetchError.message}`);
    }

    if (!documents || documents.length === 0) {
      return {
        success: true,
        data: {
          answer:
            "The knowledge base is empty. Please add some documents first.",
          citations: [],
        },
        meta: { processingTime: Date.now() - startTime },
      };
    }

    // 2. Build context block from documents
    const contextBlock = documents
      .map(
        (doc: any) => `
<DOCUMENT>
  <TITLE>${doc.question_text || "Untitled"}</TITLE>
  <CONTENT>
${doc.answer_text || ""}
  </CONTENT>
</DOCUMENT>
`,
      )
      .join("\n");

    // 3. Create system instruction with RAG rules
    const languageInstruction =
      language === "ta"
        ? "\n\nIMPORTANT: Respond entirely in Tamil (தமிழ்). All text must be in Tamil script."
        : "";

    const systemInstruction = `
You are a highly intelligent Knowledge Base Assistant for Maiyuri Bricks.
Your goal is to answer the user's questions strictly based on the provided <DOCUMENT> blocks.

RULES:
1. Use ONLY the information in the provided documents to answer.
2. If the answer is not in the documents, say "I cannot find information regarding this in the knowledge base."
3. Cite the document title when you reference specific facts (e.g., [Document Title]).
4. Be concise and professional.
5. You can use markdown for formatting tables, lists, and code.${languageInstruction}

CONTEXT LIBRARY:
${contextBlock}
`;

    // 4. Generate response using Gemini with thinking mode
    const geminiClient = new GeminiClient({
      apiKey: process.env.GOOGLE_AI_API_KEY,
    });

    const result = await geminiClient.models.generateContent({
      model: "gemini-2.5-pro", // P2: Use pro model for better reasoning
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2, // P1: Low temperature for factual responses
        thinkingConfig: {
          thinkingBudget: 2048, // P1: Enable thinking for better retrieval/reasoning
        },
      },
      contents: [{ role: "user", parts: [{ text: query }] }],
    });

    const responseText =
      result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // 5. Extract cited document titles from the response
    const citations: string[] = [];
    const citationRegex = /\[([^\]]+)\]/g;
    let match;
    while ((match = citationRegex.exec(responseText)) !== null) {
      if (!citations.includes(match[1])) {
        citations.push(match[1]);
      }
    }

    return {
      success: true,
      data: {
        answer: responseText,
        citations,
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error("Knowledge Base Query Error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "RAG_QUERY_ERROR",
        message: error instanceof Error ? error.message : "Query failed",
      },
      meta: { processingTime: Date.now() - startTime },
    };
  }
}

/**
 * Generate high-quality 4K images using Gemini Pro Image model
 * (Nano Banana Pro - gemini-3-pro-image-preview)
 *
 * Best for:
 * - Photorealistic 3D architectural visualizations
 * - 4K resolution output
 * - Complex scenes with multiple rooms and dimensions
 *
 * @param prompt - Detailed text description of the image
 * @param options - Image generation configuration
 * @returns Generated 4K image
 */
export async function generateProImage(
  prompt: string,
  options: ImageGenerationConfig = {},
): Promise<CloudCoreResult<ImageGenerationResult>> {
  const startTime = Date.now();

  try {
    const geminiClient = new GeminiClient({
      apiKey: process.env.GOOGLE_AI_API_KEY,
    });

    // Build generation config for Pro model
    const responseModalities = options.includeTextResponse
      ? ["TEXT", "IMAGE"]
      : ["IMAGE"];

    const generationConfig: Record<string, unknown> = {
      responseModalities,
    };

    // Add image config for aspect ratio and size
    const imageConfig: Record<string, unknown> = {};
    if (options.aspectRatio) {
      imageConfig.aspectRatio = options.aspectRatio;
    }
    // Pro model supports up to 4K - default to high quality
    if (options.imageSize) {
      imageConfig.imageSize = options.imageSize;
    }
    if (Object.keys(imageConfig).length > 0) {
      generationConfig.imageConfig = imageConfig;
    }

    const result = await geminiClient.models.generateContent({
      model: GeminiImageModels.PRO_IMAGE, // gemini-3-pro-image-preview
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: generationConfig,
    });

    // Parse the response
    const images: GeneratedImage[] = [];
    let textResponse: string | undefined;

    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0];
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            images.push({
              base64Data: part.inlineData.data,
              mimeType:
                (part.inlineData.mimeType as "image/png" | "image/jpeg") ||
                "image/png",
            });
          }
          if (part.text) {
            textResponse = part.text;
          }
        }
      }
    }

    if (images.length === 0) {
      return {
        success: false,
        data: null,
        error: {
          code: "PRO_IMAGE_GENERATION_FAILED",
          message:
            "No images were generated by Gemini Pro. The model may have declined the request.",
          details: { response: result },
        },
        meta: {
          processingTime: Date.now() - startTime,
        },
      };
    }

    return {
      success: true,
      data: {
        images,
        text: textResponse,
        model: GeminiImageModels.PRO_IMAGE,
      },
      meta: {
        processingTime: Date.now() - startTime,
        imageCount: images.length,
        model: "gemini-3-pro-image-preview",
        resolution: "4K",
      },
    };
  } catch (error) {
    console.error("Pro image generation error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "PRO_IMAGE_GENERATION_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Pro image generation failed",
        details: error instanceof Error ? { stack: error.stack } : undefined,
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Generate 3D Isometric Floor Plan using Gemini Pro
 *
 * Creates photorealistic 3D isometric floor plan visualizations
 * with exact dimensions, labels, and architectural details.
 *
 * @param floorPlanData - Floor plan specifications
 * @returns Generated 3D isometric floor plan image
 */
export async function generate3DIsometricFloorPlan(floorPlanData: {
  title: string;
  plotDimensions: { north: number; south: number; east: number; west: number };
  setbacks: { north: number; south: number; east: number; west: number };
  rooms: Array<{
    name: string;
    width: number;
    depth: number;
    zone: string;
  }>;
  roadSide: "north" | "south" | "east" | "west";
  roadWidth: number;
  orientation: string;
  ecoFeatures?: string[];
}): Promise<CloudCoreResult<ImageGenerationResult>> {
  // Build room specifications string
  const roomSpecs = floorPlanData.rooms
    .map((r) => `${r.name.toUpperCase()}: ${r.width}'-0" × ${r.depth}'-0"`)
    .join("\n");

  // Build eco features string
  const ecoFeatures = floorPlanData.ecoFeatures || [
    "Traditional mutram (open-to-sky courtyard)",
    "Shaded veranda in the front",
    "Naturally ventilated and well-lit rooms",
    "Rainwater recharge pit in courtyard",
    "Spacious design with future expansion possible",
  ];
  const ecoFeaturesText = ecoFeatures.map((f) => `✓ ${f}`).join("\n");

  // Create the detailed prompt for 3D isometric rendering
  const prompt = `Create a PHOTOREALISTIC 3D ISOMETRIC architectural floor plan visualization.

**TITLE (at top center):**
GROUND FLOOR PLAN: ${floorPlanData.title}

**PLOT DIMENSIONS (header subtitle):**
PLOT DIMENSIONS: NORTH: ${floorPlanData.plotDimensions.north}'-0", SOUTH: ${floorPlanData.plotDimensions.south}'-6", EAST: ${floorPlanData.plotDimensions.east}'-0", WEST: ${floorPlanData.plotDimensions.west}'-0"
SETBACKS: NORTH: ${floorPlanData.setbacks.north}'-0", SOUTH: ${floorPlanData.setbacks.south}'-0", EAST: ${floorPlanData.setbacks.east}'-6", WEST: ${floorPlanData.setbacks.west}'-0"

**ROOM LAYOUT WITH EXACT DIMENSIONS (labels inside each room):**
${roomSpecs}

**VISUAL STYLE:**
- 3D isometric cutaway view showing interior layout
- Camera angle: 45-degree elevated view from ${floorPlanData.roadSide} corner
- Photorealistic rendering with warm lighting
- Terracotta/ceramic floor tiles visible
- Cream/beige lime-washed walls
- Wooden furniture and fixtures
- Traditional Tamil Nadu residential architecture
- Green plants and courtyard vegetation visible
- Dimension lines on exterior showing plot boundaries

**ANNOTATIONS:**
- Black text labels with white background for each room
- Room dimensions in format: WIDTH'-HEIGHT" × DEPTH'-HEIGHT"
- Compass rose in top-right showing ${floorPlanData.orientation}-facing
- Road shown on ${floorPlanData.roadSide} side labeled "${floorPlanData.roadWidth}'-0" WIDE ROAD"

**BOTTOM BANNER (dark green background, white text):**
ECO-FRIENDLY FEATURES: Suitable for construction with CSEB / Mud Bricks
${ecoFeaturesText}

**IMPORTANT ACCURACY REQUIREMENTS:**
- ALL dimensions must be EXACTLY as specified - NO rounding
- Room labels must be clearly visible and legible
- Walls must have proper thickness (9" external, 4.5" internal)
- Scale must be consistent throughout
- Include dimension lines for overall plot size

Generate a single, high-quality, photorealistic 3D isometric floor plan image.`;

  // Use Pro model for 4K output
  return generateProImage(prompt, {
    aspectRatio: "4:3",
    imageSize: "4K",
    includeTextResponse: false,
  });
}

/**
 * Generate 3D Courtyard (Mutram) View using Gemini Pro
 *
 * Creates photorealistic 3D interior courtyard visualization
 * showing the traditional Tamil Nadu open-to-sky space.
 *
 * @param courtyardData - Courtyard specifications
 * @returns Generated 3D courtyard image
 */
export async function generate3DCourtyardView(courtyardData: {
  courtyardSize: { width: number; depth: number };
  surroundingRooms: Array<{ name: string; side: string }>;
  features?: string[];
  style?: string;
}): Promise<CloudCoreResult<ImageGenerationResult>> {
  const surroundingDesc = courtyardData.surroundingRooms
    .map((r) => `${r.name} on the ${r.side}`)
    .join(", ");

  const features = courtyardData.features || [
    "Tulsi (holy basil) plant in decorative pot at center",
    "Terracotta tile flooring with traditional pattern",
    "Rainwater collection pit with decorative grate",
    "Wooden pillared corridors (thinnai) around perimeter",
    "Brass oil lamps (vilakku) in niches",
  ];
  const featuresText = features.map((f) => `- ${f}`).join("\n");

  const prompt = `Create a PHOTOREALISTIC 3D INTERIOR VIEW of a traditional Tamil Nadu courtyard (mutram).

**SCENE DESCRIPTION:**
A beautiful open-to-sky courtyard (${courtyardData.courtyardSize.width}' × ${courtyardData.courtyardSize.depth}') in a traditional Tamil Nadu home.

**CAMERA POSITION:**
- Standing at ground level looking up and across the courtyard
- Eye-level perspective (5 feet height)
- Capturing the open sky above and surrounding rooms

**SURROUNDING ROOMS VISIBLE:**
${surroundingDesc}

**COURTYARD FEATURES:**
${featuresText}

**ARCHITECTURAL DETAILS:**
- Traditional wooden pillars with carved brackets
- Lime-washed cream/white walls
- Terracotta Mangalore tile roof visible at edges
- Traditional wooden doors and windows with brass hardware
- Carved wooden ceiling beams in covered corridors
- Stone or cement jali (lattice) work for ventilation

**LIGHTING:**
- Natural daylight streaming from open sky
- Soft shadows from surrounding roof overhangs
- Warm golden hour lighting
- Dappled light through any vegetation

**VEGETATION:**
- Central Tulsi plant in ornate pot
- Potted flowering plants (jasmine, hibiscus)
- Climbing plants on pillars (optional)
- Fresh green foliage

**ATMOSPHERE:**
- Peaceful, serene traditional home
- Clean, well-maintained surfaces
- ${courtyardData.style || "Traditional Tamil Nadu Brahmin agraharam style"}
- Spiritual and welcoming ambiance

**QUALITY:**
- Photorealistic rendering
- High detail on textures (wood grain, tile patterns, lime wash)
- Accurate proportions and perspective
- Professional architectural visualization quality

Generate a single, stunning, photorealistic interior courtyard view.`;

  return generateProImage(prompt, {
    aspectRatio: "4:3",
    imageSize: "4K",
    includeTextResponse: false,
  });
}

/**
 * Generate 3D Exterior View using Gemini Pro
 *
 * Creates photorealistic 3D exterior facade visualization
 * of a traditional Tamil Nadu eco-friendly house.
 *
 * @param exteriorData - Exterior specifications
 * @returns Generated 3D exterior image
 */
export async function generate3DExteriorView(exteriorData: {
  plotWidth: number;
  plotDepth: number;
  floors: number;
  facingDirection: string;
  roadSide: string;
  roadWidth: number;
  hasVerandah: boolean;
  verandahWidth?: number;
  roofType?: string;
  wallFinish?: string;
  features?: string[];
}): Promise<CloudCoreResult<ImageGenerationResult>> {
  const features = exteriorData.features || [
    "Sloped Mangalore tile roof in terracotta red",
    "Lime-washed exterior walls in cream/off-white",
    "Traditional wooden front door with brass fittings",
    "Carved wooden window frames with iron grilles",
    "Low compound wall with ornate gate",
    "Verandah with wooden pillars and sit-out",
  ];
  const featuresText = features.map((f) => `- ${f}`).join("\n");

  const prompt = `Create a PHOTOREALISTIC 3D EXTERIOR VIEW of a traditional Tamil Nadu eco-friendly house.

**HOUSE SPECIFICATIONS:**
- Plot: ${exteriorData.plotWidth}' × ${exteriorData.plotDepth}'
- Floors: ${exteriorData.floors} (G${exteriorData.floors > 1 ? "+" + (exteriorData.floors - 1) : ""})
- Facing: ${exteriorData.facingDirection}
- Road on ${exteriorData.roadSide} side (${exteriorData.roadWidth}' wide)
${exteriorData.hasVerandah ? `- Front verandah: ${exteriorData.verandahWidth || 4}' deep` : ""}

**CAMERA POSITION:**
- Street-level view from the road
- 3/4 angle showing front facade and one side
- Slight upward angle to capture roof
- Distance: approximately 30-40 feet from house

**ARCHITECTURAL STYLE:**
Traditional Tamil Nadu residential architecture with eco-friendly elements

**EXTERIOR FEATURES:**
${featuresText}

**ROOF DETAILS:**
- ${exteriorData.roofType || "Sloped Mangalore tile roof"} in terracotta red
- Traditional clay ridge tiles
- Roof overhang for rain protection
- Visible wooden rafters at eaves

**WALL FINISH:**
- ${exteriorData.wallFinish || "Lime-washed walls"} in cream/off-white color
- Clean, fresh appearance
- Subtle texture of lime wash visible

**FRONT FEATURES:**
- Main entrance with ornate wooden door
- Traditional kolam (rangoli) pattern at entrance
- Brass door knocker and handle
- Name plate or house number

**LANDSCAPING:**
- Small front garden with flowering plants
- Coconut palm or banana plant
- Jasmine or hibiscus bushes
- Potted plants on verandah

**COMPOUND WALL:**
- Low brick wall (3-4 feet) with lime wash
- Ornate iron or wooden gate
- Brass bell at gate
- House number visible

**LIGHTING:**
- Golden hour (evening) lighting
- Warm, inviting glow
- Soft shadows emphasizing architectural details
- Clear blue sky with few clouds

**ATMOSPHERE:**
- Peaceful residential neighborhood
- Well-maintained property
- Traditional yet timeless design
- Welcoming and homely feel

**QUALITY:**
- Photorealistic architectural visualization
- High detail on materials and textures
- Accurate proportions and perspective
- Magazine-quality exterior shot

Generate a single, stunning, photorealistic exterior facade view.`;

  return generateProImage(prompt, {
    aspectRatio: "16:9",
    imageSize: "4K",
    includeTextResponse: false,
  });
}

export default {
  complete,
  completeJson,
  transcribeAudio,
  transcribeAudioFromBase64,
  generateEmbedding,
  generateEmbeddings,
  summarizeTranscription,
  addToKnowledgeBase,
  queryKnowledgeBase,
  // Image generation
  generateImage,
  generateProImage,
  generate3DIsometricFloorPlan,
  generate3DCourtyardView,
  generate3DExteriorView,
  editImage,
  generateImageWithReferences,
};
