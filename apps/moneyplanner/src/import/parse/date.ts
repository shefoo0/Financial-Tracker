import { daysInMonth, toISODate, isValidISODate } from '@/lib/dates';
import type { ISODate } from '@/types';
import { normaliseDigits } from './normalize';
import type { DateOrder } from './types';

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Nov", "NOVEMBER", "Sept" -> 11; null when it isn't a month name. */
export function monthFromName(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return null;
  const i = MONTH_NAMES.indexOf(w.slice(0, 3));
  if (i < 0) return null;
  const full = [
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  ][i];
  return w === full || w === MONTH_NAMES[i] || (w === 'sept' && i === 8) ? i + 1 : null;
}

export interface DateParts {
  day: number;
  month: number;
  /** null when the text had no year. */
  year: number | null;
}

const fullYear = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));

/** Valid in some year? Feb 29 is checked against a leap year when there is no year. */
function plausible(p: DateParts): boolean {
  if (p.month < 1 || p.month > 12 || p.day < 1) return false;
  if (p.year !== null && (p.year < 1990 || p.year > 2100)) return false;
  return p.day <= daysInMonth(p.year ?? 2024, p.month);
}

/** Parses a date written on its own. Numeric dates are day-first unless `order` is 'mdy'. */
export function parseDateParts(text: string, order: DateOrder = 'dmy'): DateParts | null {
  const s = normaliseDigits(text).trim();
  let m: RegExpExecArray | null;
  let p: DateParts | null = null;
  if ((m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(s))) {
    p = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  } else if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) {
    p = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  } else if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})$/.exec(s))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    p = order === 'dmy' ? { day: a, month: b, year: fullYear(m[3]) } : { day: b, month: a, year: fullYear(m[3]) };
  } else if ((m = /^(\d{1,2})[ \-\/.]*([A-Za-z]{3,9})\.?(?:[ ,\-\/.]+(\d{4}|\d{2})|(\d{4}))?$/.exec(s))) {
    const mo = monthFromName(m[2]);
    const yr = m[3] ?? m[4];
    if (mo) p = { day: Number(m[1]), month: mo, year: yr ? fullYear(yr) : null };
  } else if ((m = /^([A-Za-z]{3,9})\.?[ \-\/.]+(\d{1,2})(?:st|nd|rd|th)?,?[ \-\/.]+(\d{4})$/.exec(s))) {
    const mo = monthFromName(m[1]);
    if (mo) p = { day: Number(m[2]), month: mo, year: Number(m[3]) };
  } else if ((m = /^(\d{1,2})[\/\-](\d{1,2})$/.exec(s))) {
    p = order === 'dmy' ? { day: Number(m[1]), month: Number(m[2]), year: null } : { day: Number(m[2]), month: Number(m[1]), year: null };
  }
  return p && plausible(p) ? p : null;
}

/** A complete date, or null when the text has no year or is not a real date. */
export function parseFullDate(text: string, order: DateOrder = 'dmy'): ISODate | null {
  const p = parseDateParts(text, order);
  if (!p || p.year === null) return null;
  return partsToISO(p.day, p.month, p.year);
}

export function partsToISO(day: number, month: number, year: number): ISODate | null {
  const d = toISODate(year, month, day);
  return isValidISODate(d) ? d : null;
}

const MON = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';

/** Finds a date at the start of a line. Returns the text of the date and what is left. */
export function matchLeadingDate(line: string): { text: string; rest: string } | null {
  const patterns = [
    /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.](?:\d{4}|\d{2}))(?=\s|$)/,
    /^(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})(?=\s|$)/,
    new RegExp(`^(\\d{1,2}[ \\-\\/]?${MON}\\.?(?:[ ,\\-\\/]*\\d{4})?)(?=\\s|$)`, 'i'),
    /^(\d{1,2}[\/\-]\d{1,2})(?=\s)/,
  ];
  for (const re of patterns) {
    const m = re.exec(line);
    if (!m) continue;
    // Whole-word month check ("21 Marketplace" is not a date).
    const parts = parseDateParts(m[1].replace(/[ ,]+$/, ''));
    if (!parts) continue;
    return { text: m[1], rest: line.slice(m[0].length).trim() };
  }
  return null;
}

/** All complete dates ("01/11/2026", "01 Nov 2026") in a line, in order. */
export function findFullDates(line: string): ISODate[] {
  const re = new RegExp(`\\b(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[ \\-]?${MON}[ ,\\-]+\\d{4})\\b`, 'gi');
  const out: ISODate[] = [];
  for (const m of line.matchAll(re)) {
    const d = parseFullDate(m[1]);
    if (d) out.push(d);
  }
  return out;
}
