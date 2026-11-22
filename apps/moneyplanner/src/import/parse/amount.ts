import { parseAmount } from '@/lib/money';
import type { Fils } from '@/types';

export interface AmountToken {
  /** Signed: negative for "-45", "(45)" and "45-". */
  fils: Fils;
  marker: 'cr' | 'dr' | null;
  currency?: string;
}

const CURRENCY_RE = /\b(AED|USD|EUR|GBP|SAR|INR|PKR|QAR|KWD|BHD|OMR|EGP)\b/i;

export function detectCurrency(text: string): string | undefined {
  const m = CURRENCY_RE.exec(text);
  if (m) return m[1].toUpperCase();
  if (/\bDhs?\b\.?/i.test(text)) return 'AED';
  return undefined;
}

/**
 * Reads one amount cell or token: "1,234.50", "AED 45.00", "45.00 Cr", "(45.00)", "-45", "45.00-".
 * Returns null when there is no number or it is ambiguous (see parseAmount).
 */
export function parseAmountToken(raw: string): AmountToken | null {
  let t = raw.replace(/−/g, '-').replace(/ /g, ' ').trim();
  if (!t) return null;
  let marker: 'cr' | 'dr' | null = null;
  const suffix = /^(.*[\d)])\s*(cr|dr)\.?$/i.exec(t);
  const prefix = /^(cr|dr)\.?\s+(.*\d.*)$/i.exec(t);
  if (suffix) {
    marker = suffix[2].toLowerCase() as 'cr' | 'dr';
    t = suffix[1];
  } else if (prefix) {
    marker = prefix[1].toLowerCase() as 'cr' | 'dr';
    t = prefix[2];
  }
  const currency = detectCurrency(t);
  t = t.replace(/\b(AED|Dhs?)\b\.?/gi, ' ').replace(/^\s*\+/, '').trim();
  if (!/^[\s()+\-\d,.]+$/.test(t) || !/\d/.test(t)) return null;
  const fils = parseAmount(t);
  if (fils === null) return null;
  return { fils, marker, currency };
}
