// @maiyuri/shared - Utility Functions

/**
 * Normalize phone number for WhatsApp (E.164 format without +)
 *
 * WhatsApp wa.me links require numbers in format: COUNTRYCODE + NUMBER (no +)
 * For Indian numbers (10 digits), adds 91 prefix
 *
 * @param phone - Raw phone number string
 * @param defaultCountryCode - Country code to add for 10-digit numbers (default: "91" for India)
 * @returns Normalized phone number for WhatsApp
 *
 * @example
 * normalizePhoneForWhatsApp("9876543210")     // "919876543210"
 * normalizePhoneForWhatsApp("+91 98765 43210") // "919876543210"
 * normalizePhoneForWhatsApp("91-9876543210")  // "919876543210"
 */
export function normalizePhoneForWhatsApp(
  phone: string,
  defaultCountryCode: string = "91",
): string {
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, "");

  // If it's a 10-digit number (local Indian format), add country code
  if (normalized.length === 10) {
    normalized = defaultCountryCode + normalized;
  }

  // If it starts with 0 (some local formats), remove it and add country code
  if (normalized.startsWith("0") && normalized.length === 11) {
    normalized = defaultCountryCode + normalized.slice(1);
  }

  return normalized;
}

/**
 * Format phone number for display
 *
 * @param phone - Raw phone number string
 * @returns Formatted phone number for display
 *
 * @example
 * formatPhoneDisplay("919876543210")  // "+91 98765 43210"
 * formatPhoneDisplay("9876543210")    // "98765 43210"
 */
export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  // Indian format with country code
  if (digits.length === 12 && digits.startsWith("91")) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }

  // 10-digit local format
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }

  // Return as-is if format not recognized
  return phone;
}

/**
 * Build WhatsApp URL with normalized phone number
 *
 * @param phone - Raw phone number string
 * @param message - Optional pre-filled message
 * @returns WhatsApp URL ready to open
 *
 * @example
 * buildWhatsAppUrl("9876543210")              // "https://wa.me/919876543210"
 * buildWhatsAppUrl("9876543210", "Hello!")    // "https://wa.me/919876543210?text=Hello!"
 */
export function buildWhatsAppUrl(phone: string, message?: string): string {
  const normalizedPhone = normalizePhoneForWhatsApp(phone);
  const baseUrl = `https://wa.me/${normalizedPhone}`;

  if (message) {
    return `${baseUrl}?text=${encodeURIComponent(message)}`;
  }

  return baseUrl;
}
