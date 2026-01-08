export type LanguageCode = 'en' | 'ta';

/**
 * Returns a system prompt instruction for generating content in the specified language.
 * Use this to prefix AI prompts with the appropriate language instruction.
 */
export function getLanguageInstruction(lang: LanguageCode): string {
  if (lang === 'ta') {
    return `IMPORTANT: Generate ALL responses in Tamil (தமிழ்). Use Tamil script exclusively for the main content.
Technical terms and proper nouns may remain in English when necessary for clarity.
Ensure the Tamil is natural and conversational, suitable for business communication.`;
  }
  return 'Generate all responses in English.';
}

/**
 * Returns the language name in its native script
 */
export function getLanguageName(lang: LanguageCode): string {
  const names: Record<LanguageCode, string> = {
    en: 'English',
    ta: 'தமிழ் (Tamil)',
  };
  return names[lang] || names.en;
}

/**
 * Validates if a string is a valid language code
 */
export function isValidLanguageCode(value: string): value is LanguageCode {
  return value === 'en' || value === 'ta';
}

/**
 * Returns the default language code
 */
export function getDefaultLanguage(): LanguageCode {
  return 'en';
}
