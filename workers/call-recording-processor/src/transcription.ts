/**
 * Gemini Audio Transcription Service
 *
 * Transcribes audio files using Google's Gemini API.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { log, logError } from './logger.js';

// Types
interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
}

/**
 * Get Gemini client
 */
function getGeminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error('Missing GOOGLE_AI_API_KEY');
  }

  return new GoogleGenerativeAI(apiKey);
}

/**
 * Transcribe audio using Gemini
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  const genAI = getGeminiClient();

  // Use Gemini 2.0 Flash for audio transcription
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Convert buffer to base64
  const base64Audio = audioBuffer.toString('base64');

  // Determine MIME type from filename
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

    // Parse response to extract transcript and language
    const { transcript, language } = parseTranscriptionResponse(fullText);

    log('Transcription complete', {
      length: transcript.length,
      language,
      filename,
    });

    return {
      text: transcript,
      language,
      confidence: 0.9, // Gemini doesn't provide confidence scores, use high default
    };
  } catch (error) {
    logError('Gemini transcription failed', error);
    throw error;
  }
}

/**
 * Parse the Gemini response to extract transcript and language
 */
function parseTranscriptionResponse(response: string): {
  transcript: string;
  language: string;
} {
  const lines = response.trim().split('\n');
  const lastLine = lines[lines.length - 1].toLowerCase();

  let language = 'unknown';

  // Detect language from last line
  if (lastLine.includes('tamil-english') || lastLine.includes('mixed')) {
    language = 'ta-en';
  } else if (lastLine.includes('tamil')) {
    language = 'ta';
  } else if (lastLine.includes('english')) {
    language = 'en';
  }

  // Remove language line if it was the last line
  const transcript =
    language !== 'unknown'
      ? lines.slice(0, -1).join('\n').trim()
      : response.trim();

  return { transcript, language };
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();

  const mimeTypes: Record<string, string> = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
    flac: 'audio/flac',
  };

  return mimeTypes[ext || ''] || 'audio/mpeg';
}

/**
 * Summarize a transcript (useful for long calls)
 */
export async function summarizeTranscript(
  transcript: string
): Promise<string> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Summarize this sales call transcript in 3-5 bullet points. Focus on:
- Key topics discussed
- Customer requirements or concerns
- Any commitments made
- Next steps mentioned

If the transcript is in Tamil, provide the summary in Tamil.

Transcript:
${transcript}`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    logError('Summarization failed', error);
    return 'Summary unavailable';
  }
}
