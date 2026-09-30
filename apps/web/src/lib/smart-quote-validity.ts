/**
 * Smart Quote validity helpers.
 *
 * `valid_until` is stored as a YYYY-MM-DD date. Treat it as valid for the
 * entire named day, and expired only when it is before today's date.
 */
export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function quoteValidUntilDate(
  validityDays: number,
  now: Date = new Date(),
): string {
  const date = new Date(now);
  date.setDate(date.getDate() + validityDays);
  return todayIsoDate(date);
}

export function isQuoteExpired(
  validUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!validUntil) return false;
  return validUntil < todayIsoDate(now);
}

export function shouldRenewQuoteValidity(
  validUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return !validUntil || isQuoteExpired(validUntil, now);
}
