/**
 * Gemini Audio Transcription Service
 *
 * Transcribes audio files using Google's Gemini 2.0 Flash API.
 * Accepts raw audio (WAV, OGG, M4A) natively - no ffmpeg conversion needed.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { log, logError } from "./logger";
import type { TranscriptionResult } from "./types";

function getGeminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Transcribe audio using Gemini 2.0 Flash
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
): Promise<TranscriptionResult> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const base64Audio = audioBuffer.toString("base64");
  const mimeType = getMimeType(filename);

  const prompt = `Transcribe this audio recording of a sales call. The call may be in Tamil, English, or a mix of both languages (Tamil-English code-switching is common).

Instructions:
1. Transcribe the entire audio accurately
2. If the audio is in Tamil, provide the transcription in Tamil script
3. If English words are used within Tamil conversation, keep them in English
4. Include speaker labels if you can distinguish different speakers (e.g., "Sales Staff:", "Customer:")
5. Note any unclear or inaudible portions as [inaudible]
6. Do not translate - transcribe in the original language spoken

At the end, on a new line, state the primary language detected (Tamil, English, or Tamil-English mixed).`;

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64Audio,
        },
      },
      { text: prompt },
    ]);

    const response = result.response;
    const fullText = response.text();

    const { transcript, language } = parseTranscriptionResponse(fullText);

    log("Transcription complete", {
      length: transcript.length,
      language,
      filename,
    });

    return {
      text: transcript,
      language,
      confidence: 0.9,
    };
  } catch (error) {
    logError("Gemini transcription failed", error);
    throw error;
  }
}

function parseTranscriptionResponse(response: string): {
  transcript: string;
  language: string;
} {
  const lines = response.trim().split("\n");
  const lastLine = lines[lines.length - 1].toLowerCase();

  let language = "unknown";

  if (lastLine.includes("tamil-english") || lastLine.includes("mixed")) {
    language = "ta-en";
  } else if (lastLine.includes("tamil")) {
    language = "ta";
  } else if (lastLine.includes("english")) {
    language = "en";
  }

  const transcript =
    language !== "unknown"
      ? lines.slice(0, -1).join("\n").trim()
      : response.trim();

  return { transcript, language };
}

function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();

  const mimeTypes: Record<string, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    webm: "audio/webm",
    flac: "audio/flac",
  };

  return mimeTypes[ext ?? ""] ?? "audio/mpeg";
}
