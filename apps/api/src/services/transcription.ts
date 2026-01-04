import { GoogleGenerativeAI, Part } from '@google/generative-ai';

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

export interface TranscriptionResult {
  text: string;
  confidence: number;
  duration?: number;
  language?: string;
}

export interface TranscriptionError {
  code: string;
  message: string;
}

/**
 * Transcribe audio file using Gemini 2.5 Flash
 * @param audioUrl - URL to the audio file (signed URL from Supabase Storage)
 * @param mimeType - MIME type of the audio file
 * @returns TranscriptionResult with the transcribed text and confidence score
 */
export async function transcribeAudio(
  audioUrl: string,
  mimeType: string = 'audio/mpeg'
): Promise<TranscriptionResult> {
  try {
    // Use Gemini 2.5 Flash for audio transcription
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

    // Fetch the audio file
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    // Create the audio part for Gemini
    const audioPart: Part = {
      inlineData: {
        mimeType: mimeType,
        data: base64Audio,
      },
    };

    // Generate transcription with detailed prompt
    const result = await model.generateContent([
      audioPart,
      {
        text: `You are a highly accurate transcription assistant. Please transcribe the audio content accurately.

Instructions:
1. Transcribe ALL spoken words exactly as heard
2. Include punctuation and paragraph breaks where appropriate
3. If there are multiple speakers, try to distinguish them
4. Include any relevant non-speech sounds in [brackets] if they are important
5. If any words are unclear, mark them with [inaudible] or [unclear]
6. Preserve the original language (may be English, Tamil, or mixed)

Return ONLY the transcription text, nothing else. Do not include any explanations or metadata.`,
      },
    ]);

    const transcriptionText = result.response.text().trim();

    // Estimate confidence based on response quality
    // Higher confidence if no [inaudible] or [unclear] markers
    const hasUnclearMarkers = /\[(inaudible|unclear)\]/i.test(transcriptionText);
    const confidence = hasUnclearMarkers ? 0.75 : 0.95;

    return {
      text: transcriptionText,
      confidence,
      language: detectLanguage(transcriptionText),
    };
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
}

/**
 * Transcribe audio from base64 data directly
 */
export async function transcribeAudioFromBase64(
  base64Data: string,
  mimeType: string = 'audio/mpeg'
): Promise<TranscriptionResult> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

    const audioPart: Part = {
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    };

    const result = await model.generateContent([
      audioPart,
      {
        text: `You are a highly accurate transcription assistant. Please transcribe the audio content accurately.

Instructions:
1. Transcribe ALL spoken words exactly as heard
2. Include punctuation and paragraph breaks where appropriate
3. If there are multiple speakers, try to distinguish them
4. Include any relevant non-speech sounds in [brackets] if they are important
5. If any words are unclear, mark them with [inaudible] or [unclear]
6. Preserve the original language (may be English, Tamil, or mixed)

Return ONLY the transcription text, nothing else. Do not include any explanations or metadata.`,
      },
    ]);

    const transcriptionText = result.response.text().trim();
    const hasUnclearMarkers = /\[(inaudible|unclear)\]/i.test(transcriptionText);
    const confidence = hasUnclearMarkers ? 0.75 : 0.95;

    return {
      text: transcriptionText,
      confidence,
      language: detectLanguage(transcriptionText),
    };
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
}

/**
 * Simple language detection based on character patterns
 */
function detectLanguage(text: string): string {
  // Tamil Unicode range: U+0B80 to U+0BFF
  const tamilPattern = /[\u0B80-\u0BFF]/;
  const hasTamil = tamilPattern.test(text);

  // Check for English words (simple heuristic)
  const englishWordPattern = /[a-zA-Z]+/g;
  const englishWords = text.match(englishWordPattern) || [];

  if (hasTamil && englishWords.length > 5) {
    return 'mixed'; // Tamil + English
  } else if (hasTamil) {
    return 'ta'; // Tamil
  } else {
    return 'en'; // English
  }
}

/**
 * Summarize transcribed text using Gemini
 */
export async function summarizeTranscription(text: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

    const result = await model.generateContent([
      {
        text: `Summarize the following conversation/note in 2-3 concise bullet points. Focus on:
- Key topics discussed
- Any action items or decisions
- Important dates, numbers, or commitments mentioned

Text to summarize:
${text}

Return only the bullet points, nothing else.`,
      },
    ]);

    return result.response.text().trim();
  } catch (error) {
    console.error('Summarization error:', error);
    throw error;
  }
}

export default {
  transcribeAudio,
  transcribeAudioFromBase64,
  summarizeTranscription,
};
