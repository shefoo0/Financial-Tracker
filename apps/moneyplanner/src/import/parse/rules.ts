import { normaliseArabic } from './normalize';
import type { CategoryRule } from './types';

// ---- Merchant keys ----

const MONTHS = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC';

/** Leading words that say how the card was used, not where. */
const PREFIX = /^(?:(?:POS|PURCHASE|PUR|CARD|DEBIT|CREDIT|VISA|MASTERCARD|MC|ECOM|E-COM|ONLINE|CONTACTLESS|TAP|NFC|APPLE PAY|GOOGLE PAY|SAMSUNG PAY|PAYMENT TO|PAYMENT|PMT|TRANSACTION|TXN|SALE|DR|CR|IPP|SMS)\b[\s\-:*.]*)+/;

/** Places printed at the end of a description. Longest first so "ABU DHABI" goes before "ABU". */
const PLACES = [
  'UNITED ARAB EMIRATES', 'RAS AL KHAIMAH', 'UMM AL QUWAIN', 'ABU DHABI', 'DUBAI', 'SHARJAH', 'AJMAN', 'FUJAIRAH', 'AL AIN', 'ABUDHABI',
  'UAE', 'ARE', 'AE', 'DXB', 'AUH', 'SHJ', 'RAK', 'UAQ', 'FUJ', 'AJM',
  'دبي', 'ابوظبي', 'ابو ظبي', 'الشارقه', 'عجمان', 'الفجيره', 'العين', 'راس الخيمه', 'الامارات',
];

const ARTICLES = new Set(['AL', 'EL', 'THE', 'ST', 'MR', 'MRS', 'DR', 'MY', 'NEW', 'OLD', 'ال']);

/** Uppercased, Arabic-normalised, single-spaced. The form rules are compared in. */
export function normaliseForRules(s: string): string {
  return normaliseArabic(s).toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * A stable merchant key from a noisy bank description: card numbers, dates, times, amounts, reference
 * and branch/store numbers, "POS"-style prefixes and trailing city/country words are removed, and the
 * first two words (three after "AL", "THE"...) are kept. "POS 1234XXXX5678 CAREEM HALA 21/11 DUBAI AE" -> "CAREEM HALA".
 */
export function merchantKey(description: string): string {
  let t = ' ' + normaliseForRules(description) + ' ';
  t = t
    .replace(/\b\d{4,6}[X*#]{2,}\d{2,4}\b/g, ' ')
    .replace(/[X*#]{2,}\s?\d{2,4}\b/g, ' ')
    .replace(/\b(?:\d[ -]?){12,19}\b/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, ' ')
    .replace(new RegExp(`\\b\\d{1,2}\\s?(?:${MONTHS})[A-Z]*\\.?(?:\\s?\\d{2,4})?\\b`, 'g'), ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM)?\b/g, ' ')
    .replace(/\b(?:AED|USD|EUR|GBP|DHS?)\s*[\d,]+(?:\.\d+)?\b/g, ' ')
    .replace(/\b\d[\d,]*\.\d{2}\b/g, ' ')
    .replace(/\b(?:REF(?:ERENCE)?|TXN|TRN|AUTH|RRN|ARN|ID)\.?\s*(?:NO\.?|NUMBER|#|:)?\s*[A-Z0-9-]*\d[A-Z0-9-]*/g, ' ')
    .replace(/#\s*\d+/g, ' ')
    .replace(/\b(?:BRANCH|BR|STORE|STR|SHOP|OUTLET|TERMINAL|TERM|ATM|LOC|UNIT)\s*(?:NO\.?)?\s*#?\d+\b/g, ' ')
    .replace(/[*_,;:|/\\()[\]"]+/g, ' ');
  let tokens = t.split(/\s+/).filter(Boolean);
  // Numbers and long mixed codes are noise; one digit in a name ("7ELEVEN") is not.
  tokens = tokens.filter((w) => !/^\d+$/.test(w) && (w.match(/\d/g) ?? []).length < 3);
  t = tokens.join(' ');
  for (let i = 0; i < 6; i++) {
    const before = t;
    t = t.replace(PREFIX, '').trim();
    if (t === before) break;
  }
  // Trailing places, repeatedly ("... DUBAI AE").
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const place of PLACES) {
      const p = normaliseForRules(place);
      if (t === p) continue;
      if (t.endsWith(' ' + p)) {
        t = t.slice(0, -p.length).trim();
        stripped = true;
        break;
      }
    }
  }
  tokens = t
    .replace(/[^\p{L}\p{N}&.'\- ]+/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-.']+|[-.']+$/g, ''))
    .filter(Boolean);
  const keep = tokens.length && ARTICLES.has(tokens[0]) ? 3 : 2;
  return tokens.slice(0, keep).join(' ');
}

/** A rule for "descriptions like this one go to this category". The pattern is the merchant key. */
export function learnRule(description: string, categoryId: string): CategoryRule {
  const key = merchantKey(description);
  return { pattern: key || normaliseForRules(description).split(' ').slice(0, 3).join(' '), categoryId };
}

/**
 * The user's rule that fits a description, or null. A rule fits when its pattern is contained in the
 * description (or in its cleaned merchant key); the longest pattern wins. Empty patterns never match.
 */
export function matchRules(description: string, rules: CategoryRule[]): CategoryRule | null {
  const full = normaliseForRules(description);
  if (!full) return null;
  const key = merchantKey(description);
  let best: CategoryRule | null = null;
  let bestLen = 0;
  for (const r of rules) {
    const p = normaliseForRules(r.pattern);
    if (!p || p.length <= bestLen) continue;
    if (full.includes(p) || key.includes(p)) {
      best = r;
      bestLen = p.length;
    }
  }
  return best;
}

// ---- Apply to all similar ----

const tokensOf = (key: string) => key.split(' ').filter(Boolean);

/** Same merchant: equal keys, or one key's words are the start of the other's ("CAREEM" and "CAREEM HALA"). */
export function sameMerchant(a: string, b: string): boolean {
  const ka = merchantKey(a);
  const kb = merchantKey(b);
  if (!ka || !kb) return false;
  const ta = tokensOf(ka);
  const tb = tokensOf(kb);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((w, i) => long[i] === w);
}

/** Indexes of the other rows that share the merchant of `rows[rowIndex]`. */
export function similarRows(rows: { description: string }[], rowIndex: number): number[] {
  const base = rows[rowIndex];
  if (!base) return [];
  return rows.flatMap((r, i) => (i !== rowIndex && sameMerchant(base.description, r.description) ? [i] : []));
}

/** The other rows that share the merchant, each paired with the same `change` (a category id, an exclusion...), for "apply to all similar". */
export function applySimilar<C>(rows: { description: string }[], rowIndex: number, change: C): { index: number; change: C }[] {
  return similarRows(rows, rowIndex).map((index) => ({ index, change }));
}
