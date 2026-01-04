/**
 * AI Service Layer
 * Provides unified access to AI providers (Claude for reasoning, Gemini for STT/embeddings)
 */

import * as claude from './claude';
import * as gemini from './gemini';
import * as provider from './provider';

export { claude, gemini, provider };
