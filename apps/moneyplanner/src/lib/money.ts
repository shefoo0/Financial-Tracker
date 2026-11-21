import type { Fils } from '@/types';

/** 1234567 fils -> "12,345.67" (no currency). Negative values get a leading minus. */
export function formatAmount(fils: Fils): string {
  const negative = fils < 0;
  const abs = Math.abs(Math.round(fils));
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const cents = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${cents}`;
}

/** 1234567 fils, "AED" -> "AED 12,345.67"; negatives -> "-AED 12,345.67". */
export function formatMoney(fils: Fils, currency: string): string {
  const s = formatAmount(Math.abs(fils));
  return `${fils < 0 ? '-' : ''}${currency} ${s}`;
}

/** Largest amount accepted: AED 999,999,999.99. */
export const MAX_FILS: Fils = 99_999_999_999;

/**
 * Parses user or statement text into fils: "1,234.5" -> 123450, "AED 99" -> 9900,
 * "(45.00)" or "-45" -> -4500. Returns null when there's no number, or when it's
 * ambiguous or too big ("12.345", "12,5", "1.234,50", more than MAX_FILS):
 * better to ask again than to store a wrong amount.
 */
export function parseAmount(text: string): Fils | null {
  const t = text.trim();
  if (!t) return null;
  // Ignore currency letters and spaces, then look for "-12", "12-" or "(12)".
  const stripped = t.replace(/[A-Za-z\s]/g, '');
  const negative = /^\(.*\)$/.test(stripped) || stripped.startsWith('-') || stripped.endsWith('-');
  const digits = stripped.replace(/^[(\-]+|[)\-]+$/g, '');
  // Whole part: plain digits, or digits grouped by commas in threes. Then up to 2 decimals.
  const m = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/.exec(digits);
  if (!m) return null;
  const whole = Number(m[1].replace(/,/g, ''));
  const cents = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  const value = whole * 100 + cents;
  if (!Number.isSafeInteger(value) || value > MAX_FILS) return null;
  return negative ? -value : value;
}

/** Percentage (0-100+) with one decimal, e.g. 42.3. Null-safe. */
export function percent(part: Fils, whole: Fils): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}
