import { compareDates, today as deviceToday } from '@/lib/dates';
import { detectCurrency, parseAmountToken } from './amount';
import type { AmountToken } from './amount';
import { findFullDates, matchLeadingDate, parseDateParts, partsToISO } from './date';
import { checkBalances } from './balance';
import { normaliseDigits } from './normalize';
import type { ParsedRow, ParseOptions, ParseResult } from './types';
import type { ISODate } from '@/types';

// ---- Shared pieces ----

const AMT_RE = /^[(+\-]?(?:AED)?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?-?(?:cr|dr)?\.?$/i;

/** OCR often reads 0 as O and 1 as l or I inside numbers. Only fixes tokens that become a valid amount. */
function fixOcrDigits(tok: string): string | null {
  if (!/[OoIl]/.test(tok) || !/\d/.test(tok)) return null;
  const fixed = tok.replace(/[Oo](?=[\d,.OoIl]|\)|$)|(?<=[\d,.])[Oo]/g, '0').replace(/(?<=[\d,.])[Il](?=[\d,.OoIl]|$)/g, '1');
  return AMT_RE.test(fixed) ? fixed : null;
}

interface Popped {
  amounts: AmountToken[];
  rest: string;
  ocrFixed: boolean;
}

/** Takes up to three amounts off the end of a line ("... 45.00", "... 45.00 Cr 1,200.00 Cr"). */
function popAmounts(line: string): Popped {
  const tokens = line.split(/\s+/).filter(Boolean);
  const amounts: AmountToken[] = [];
  let ocrFixed = false;
  while (tokens.length && amounts.length < 3) {
    let tok = tokens[tokens.length - 1];
    let marker: string | null = null;
    // "45.00 CR" or "45.00 AED" written as separate tokens.
    if (/^(cr|dr)\.?$/i.test(tok) && tokens.length > 1) {
      marker = tok;
      tokens.pop();
      tok = tokens[tokens.length - 1];
    } else if (/^(aed|dhs?)\.?$/i.test(tok) && tokens.length > 1) {
      tokens.pop();
      tok = tokens[tokens.length - 1];
    }
    let candidate = tok;
    if (!AMT_RE.test(candidate)) {
      const fixed = fixOcrDigits(candidate);
      if (!fixed) {
        if (marker) tokens.push(marker);
        break;
      }
      candidate = fixed;
      ocrFixed = true;
    }
    const parsed = parseAmountToken(marker ? `${candidate} ${marker}` : candidate);
    if (!parsed) {
      if (marker) tokens.push(marker);
      break;
    }
    tokens.pop();
    if (tokens.length && /^(aed|dhs?)\.?$/i.test(tokens[tokens.length - 1])) tokens.pop();
    amounts.unshift(parsed);
  }
  return { amounts, rest: tokens.join(' '), ocrFixed };
}

const INCOME_WORDS = /\b(salary|salaries|refund|reversal|cashback|deposit|interest paid|inward|credit interest|payment received|transfer from|received from)\b/i;
const TRANSFER_WORDS = /\b(transfer|payment received|thank you|own account|card payment|credit card payment)\b/i;

// ---- Statement text ----

const SKIP_LINE = /^(opening balance|closing balance|balance (brought|carried|b\/f|c\/f|forward)|brought forward|carried forward|previous balance|new balance|total\b|grand total|b\/f\b|c\/f\b)/i;
const OPENING = /^(opening balance|balance (brought forward|b\/f|forward)|brought forward|previous balance|b\/f\b)/i;
const HEADER_LINE = /\b(date|description|narration|particulars)\b.*\b(debit|credit|balance|amount|withdrawal|deposit)\b|^(page \d|page:)|statement of account|account statement|end of statement|customer (care|service)|\bwww\.|@/i;
const NOT_CONTINUATION = /\b(page|statement|balance|limit|total|due|payment|minimum|summary|iban|swift)\b/i;

interface Candidate {
  line: number;
  dateText: string;
  day: number;
  month: number;
  year: number | null;
  description: string;
  amounts: AmountToken[];
  raw: string;
  ocrFixed: boolean;
}

/**
 * Reads transaction lines out of statement text (from a PDF or OCR): a date at the start, a
 * description, and one or two amounts (amount + running balance). Day-first dates only.
 */
export function parseStatementText(text: string, options: ParseOptions = {}): ParseResult {
  const todayISO = options.today ?? deviceToday();
  const result: ParseResult = { rows: [], source: 'text', problems: [] };
  const lines = normaliseDigits(text)
    .replace(/\t/g, '  ')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[^\w(]+/, '').replace(/\s+/g, ' ').trim());

  const whole = lines.join('\n');
  const isCard = /credit card|card statement|minimum (payment|amount) due|total amount due|card number|card no/i.test(whole);
  result.currency = detectCurrency(whole);
  result.account = findAccount(lines);
  const period = findPeriod(lines);
  if (period.from && period.to) result.period = { from: period.from, to: period.to };

  const candidates: Candidate[] = [];
  let openingBalance: number | undefined;
  let unreadable = 0;
  let lastWasRow = false;
  let continuation = 0;
  // A date line with a description but no amount: the amounts may be on the next line (wrapped by OCR).
  let pending: { text: string; day: number; month: number; year: number | null; rest: string; raw: string; line: number } | null = null;
  const flushPending = () => {
    if (pending) unreadable++;
    pending = null;
  };

  lines.forEach((line, idx) => {
    if (!line) {
      flushPending();
      lastWasRow = false;
      return;
    }
    const lead = matchLeadingDate(line);
    if (pending && !lead) {
      const p0: NonNullable<typeof pending> = pending;
      const merged = popAmounts(line);
      pending = null;
      if (merged.amounts.length && !HEADER_LINE.test(line)) {
        const full = popAmounts(`${p0.rest} ${line}`);
        candidates.push({
          line: p0.line,
          dateText: p0.text,
          day: p0.day,
          month: p0.month,
          year: p0.year,
          description: full.rest,
          amounts: full.amounts,
          raw: `${p0.raw}\n${line}`,
          ocrFixed: full.ocrFixed,
        });
        lastWasRow = true;
        continuation = 0;
      } else unreadable++;
      return;
    }
    if (lead) flushPending();
    // Opening balance, with or without a date in front.
    const afterDate = lead ? lead.rest.replace(/^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2} ?[A-Za-z]{3,9} \d{4})\s+/, '') : line;
    if (OPENING.test(afterDate)) {
      const p = popAmounts(afterDate);
      if (p.amounts.length) openingBalance = signedBalance(p.amounts[p.amounts.length - 1]);
      lastWasRow = false;
      return;
    }
    if (SKIP_LINE.test(afterDate) || (HEADER_LINE.test(line) && !(lead && popAmounts(lead.rest).amounts.length))) {
      lastWasRow = false;
      return;
    }
    if (!lead) {
      // A wrapped description: short text under a transaction, with no amounts and no long numbers.
      if (
        lastWasRow &&
        continuation < 2 &&
        line.length <= 40 &&
        /[A-Za-z\u0600-\u06FF]{2}/.test(line) &&
        !/\d{4,}/.test(line) &&
        !NOT_CONTINUATION.test(line) &&
        popAmounts(line).amounts.length === 0
      ) {
        const last = candidates[candidates.length - 1];
        last.description = `${last.description} ${line}`.trim();
        last.raw += `\n${line}`;
        continuation++;
      } else lastWasRow = false;
      return;
    }
    const parts = parseDateParts(lead.text.replace(/[ ,]+$/, ''));
    if (!parts) return;
    let rest = lead.rest;
    // A second date (value or posting date) right after the first.
    const second = matchLeadingDate(rest);
    if (second) rest = second.rest;
    const p = popAmounts(rest);
    if (!p.amounts.length && /[A-Za-z\u0600-\u06FF]{2}/.test(rest)) {
      pending = { text: lead.text, day: parts.day, month: parts.month, year: parts.year, rest, raw: line, line: idx };
      lastWasRow = false;
      return;
    }
    if (!p.amounts.length || !p.rest) {
      unreadable++;
      lastWasRow = false;
      return;
    }
    candidates.push({
      line: idx,
      dateText: lead.text,
      day: parts.day,
      month: parts.month,
      year: parts.year,
      description: p.rest,
      amounts: p.amounts,
      raw: line,
      ocrFixed: p.ocrFixed,
    });
    lastWasRow = true;
    continuation = 0;
  });

  flushPending();

  // Years for dates that have none.
  const explicitYears = candidates.filter((c) => c.year !== null).map((c) => c.year as number);
  const common = mostCommon(explicitYears);

  const resolved = candidates.map((c) => {
    const warnings: string[] = [];
    let cap = 1;
    let date: ISODate | null = null;
    if (c.year !== null) date = partsToISO(c.day, c.month, c.year);
    else {
      const r = resolveYear(c.day, c.month, period, common, todayISO);
      date = r.date;
      if (r.warning) {
        warnings.push(r.warning);
        cap = Math.min(cap, r.cap);
      }
    }
    return { c, date, warnings, cap };
  });

  // Direction from the running balance, checked against the previous row (oldest first) and the next row (newest first).
  type Dir = { kind: 'income' | 'cost' | null; why: string };
  const dirs: Dir[] = resolved.map(() => ({ kind: null, why: '' }));
  const mainAmount = (c: Candidate) => balanceSplit(c);
  const balances = resolved.map((r) => mainAmount(r.c).balance);
  resolved.forEach((r, i) => {
    const { amount, balance } = mainAmount(r.c);
    if (balance === undefined || amount === null) return;
    const prev = i > 0 ? balances[i - 1] : openingBalance;
    const next = i < resolved.length - 1 ? balances[i + 1] : undefined;
    const tryFrom = (ref: number | undefined, newestFirst: boolean): 'income' | 'cost' | null => {
      if (ref === undefined) return null;
      const abs = Math.abs(amount);
      if (!newestFirst) {
        if (ref + abs === balance) return 'income';
        if (ref - abs === balance) return 'cost';
      } else {
        // newest first: this row's balance minus its amount is the next (older) row's balance.
        if (balance - abs === ref) return 'income';
        if (balance + abs === ref) return 'cost';
      }
      return null;
    };
    const k = tryFrom(prev, false) ?? tryFrom(next, true);
    if (k) dirs[i] = { kind: k, why: 'balance' };
  });

  // Card statements: a minus sign usually marks payments and refunds when most rows are unsigned charges, but some
  // banks print every purchase with a minus. When most signed amounts are negative, a minus means spending.
  const single = resolved.map(({ c }) => (c.amounts.length === 1 || c.amounts.length === 2 ? c.amounts[0] : null)).filter((t) => t && !t.marker && t.fils !== 0);
  const negatives = single.filter((t) => t!.fils < 0).length;
  const minusIsSpending = !isCard || negatives * 2 > single.length;

  const rows: ParsedRow[] = [];
  let ambiguousDirection = 0;
  let badDates = 0;
  resolved.forEach(({ c, date, warnings, cap }, i) => {
    if (!date) {
      badDates++;
      return;
    }
    const { amount, balance } = mainAmount(c);
    if (amount === null) return;
    let confidence = cap;
    const lower = (n: number, w: string) => {
      confidence = Math.min(confidence, n);
      warnings.push(w);
    };
    const tok = c.amounts.length >= 3 ? null : c.amounts[0];
    const markerTok = c.amounts.length === 3 ? null : tok;
    let kind: 'income' | 'cost' | null = null;
    // 1. explicit Cr/Dr on the amount
    if (markerTok?.marker) kind = markerTok.marker === 'cr' ? 'income' : 'cost';
    // 3 columns: debit, credit, balance
    if (c.amounts.length === 3 && !kind) {
      const [d, cr] = c.amounts;
      kind = d.fils !== 0 && cr.fils === 0 ? 'cost' : cr.fils !== 0 && d.fils === 0 ? 'income' : null;
    }
    if (dirs[i].kind) {
      if (kind && kind !== dirs[i].kind) lower(0.6, 'The Cr/Dr marker and the running balance disagree; check the direction.');
      kind = kind ?? dirs[i].kind;
    }
    if (!kind && markerTok && markerTok.fils < 0) kind = minusIsSpending ? 'cost' : 'income';
    if (!kind) {
      if (INCOME_WORDS.test(c.description)) {
        kind = 'income';
        lower(0.7, 'Direction guessed from the description; check it.');
      } else if (isCard) {
        kind = 'cost';
        confidence = Math.min(confidence, 0.85);
      } else {
        kind = 'cost';
        ambiguousDirection++;
        lower(0.5, 'The statement line does not say whether this is money in or out; assumed spending.');
      }
    }
    if (c.ocrFixed) lower(0.6, 'Some characters in the amount were corrected from a scan; check it.');
    if (TRANSFER_WORDS.test(c.description)) warnings.push('Looks like a transfer or card payment; exclude it if it is between your own accounts.');
    rows.push({
      date,
      description: c.description,
      amount: Math.abs(amount),
      kind,
      ...(balance !== undefined ? { balance } : {}),
      raw: c.raw,
      confidence: Math.round(confidence * 100) / 100,
      warnings,
    } as ParsedRow);
  });

  checkBalances(rows, openingBalance);
  result.rows = rows;
  if (unreadable) result.problems.push(`${unreadable} line${unreadable === 1 ? ' starts' : 's start'} with a date but no amount could be read, so they were skipped.`);
  if (badDates) result.problems.push(`${badDates} line${badDates === 1 ? '' : 's'} skipped because the date is not a real date or is far outside the statement period.`);
  if (ambiguousDirection > 0) {
    result.problems.push(`${ambiguousDirection} row${ambiguousDirection === 1 ? '' : 's'} could not be told apart as money in or out; check the direction.`);
  }
  if (!rows.length && !result.problems.length) result.problems.push('No transaction lines found in the text.');
  if (!result.period && rows.length) {
    const d = rows.map((r) => r.date).sort(compareDates);
    result.period = { from: d[0], to: d[d.length - 1] };
  }
  return result;
}

const signedBalance = (t: AmountToken) => (t.marker === 'dr' ? -Math.abs(t.fils) : t.fils);

/** Splits a candidate's amounts into the transaction amount and the running balance. */
function balanceSplit(c: Candidate): { amount: number | null; balance?: number } {
  const a = c.amounts;
  if (a.length === 1) return { amount: a[0].fils };
  if (a.length === 2) return { amount: a[0].fils, balance: signedBalance(a[1]) };
  // Three: debit, credit, balance when one of the first two is zero; otherwise the first belongs to the description.
  const [x, y, z] = a;
  if (x.fils === 0 || y.fils === 0) return { amount: x.fils !== 0 ? x.fils : y.fils, balance: signedBalance(z) };
  return { amount: y.fils, balance: signedBalance(z) };
}

function mostCommon(values: number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

interface Period {
  from?: ISODate;
  to?: ISODate;
}

function findPeriod(lines: string[]): Period {
  let anchor: ISODate | undefined;
  for (const line of lines) {
    const dates = findFullDates(line);
    if (!dates.length) continue;
    const keyword = /period|statement (date|from)|from\b.*\bto\b|\bto\b|as (of|at|on)|closing date|statement for/i.test(line);
    if (dates.length >= 2 && (keyword || /\d\s*(-|–|—)\s*\d|\w\s*(-|–|—)\s*\d/.test(line)) && popAmounts(line).amounts.length === 0) {
      const sorted = [...dates].sort(compareDates);
      return { from: sorted[0], to: sorted[sorted.length - 1] };
    }
    if (dates.length === 1 && /statement (date|closing)|period (end|ending)|closing date|as (of|at|on)/i.test(line) && !anchor) anchor = dates[0];
  }
  return anchor ? { to: anchor } : {};
}

function findAccount(lines: string[]): string | undefined {
  for (const line of lines) {
    const iban = /\bAE\d{2}[\s\d]{15,}/i.exec(line);
    if (iban) {
      const digits = iban[0].replace(/\D/g, '');
      if (digits.length >= 4) return digits.slice(-4);
    }
    const m = /(?:account|acct|a\/c|card)\s*(?:no\.?|number|num\.?|#)?\s*:?\s*([0-9Xx*•\- ]{4,})/i.exec(line);
    if (m) {
      const last = /(\d{4})\s*$/.exec(m[1].trim());
      if (last) return last[1];
    }
  }
  return undefined;
}

/** Picks the year for a date written without one, from the statement period or the other dates. */
function resolveYear(
  day: number,
  month: number,
  period: Period,
  commonYear: number | null,
  todayISO: ISODate,
): { date: ISODate | null; warning?: string; cap: number } {
  if (period.from && period.to) {
    const y0 = Number(period.from.slice(0, 4));
    const y1 = Number(period.to.slice(0, 4));
    for (let y = y0; y <= y1; y++) {
      const d = partsToISO(day, month, y);
      if (d && d >= period.from && d <= period.to) return { date: d, cap: 1 };
    }
    // Outside the period: take the closest valid year, but not when it is far away (a wrong date or a
    // 29 Feb that doesn't exist in the statement's years).
    const candidates = [y0 - 1, y0, y1, y1 + 1]
      .map((y) => partsToISO(day, month, y))
      .filter((d): d is ISODate => !!d);
    const near = (d: ISODate) => Math.min(Math.abs(diffAbs(d, period.from!)), Math.abs(diffAbs(d, period.to!)));
    candidates.sort((a, b) => near(a) - near(b));
    if (!candidates.length || near(candidates[0]) > 62) return { date: null, cap: 0 };
    return { date: candidates[0], warning: 'The date is outside the statement period; check the year.', cap: 0.6 };
  }
  if (period.to) {
    const y = Number(period.to.slice(0, 4));
    const a = partsToISO(day, month, y);
    const b = partsToISO(day, month, y - 1);
    const date = a && a <= period.to ? a : (b ?? a);
    return { date, warning: 'The statement start date was not found; the year comes from the statement date.', cap: 0.8 };
  }
  const ty = Number(todayISO.slice(0, 4));
  const base = commonYear ?? ty;
  let d = partsToISO(day, month, base);
  if (d && commonYear === null && d > todayISO) d = partsToISO(day, month, base - 1) ?? d;
  if (!d) d = partsToISO(day, month, base - 1) ?? partsToISO(day, month, base + 1);
  return { date: d, warning: `The statement shows no year; assumed ${d ? d.slice(0, 4) : base}.`, cap: 0.6 };
}

function diffAbs(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

// ---- SMS ----

const AMOUNT_IN_TEXT = /(?:AED|Dhs?\.?)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:AED|Dhs?\b)/gi;
const INCOME_SMS = /\b(credited|credit of|received|deposit(?:ed)?|salary|refund(?:ed)?|reversal|cashback|credit alert)\b/i;
const COST_SMS = /\b(debited|debit of|purchase|purchased|spent|withdrawal|withdrawn|paid|payment|used for|charged|transferred|sent|pos|debit alert)\b/i;

const SMS_DATE = new RegExp(
  '\\b(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.](?:\\d{4}|\\d{2})|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[ \\-]?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ ,\\-]+(?:\\d{4}|\\d{2}))\\b',
  'i',
);

/** A pasted bank SMS -> zero or one transaction. Returns no row for OTP and balance-only messages. */
export function parseSmsText(text: string, options: ParseOptions = {}): ParseResult {
  const todayISO = options.today ?? deviceToday();
  const result: ParseResult = { rows: [], source: 'text', problems: [] };
  const sms = normaliseDigits(text).replace(/\s+/g, ' ').trim();
  if (!sms) {
    result.problems.push('The message is empty.');
    return result;
  }
  result.currency = detectCurrency(sms);
  const acct = /(?:a\/c|account|acct|card)(?:\s*(?:no\.?|number|ending(?: with| in)?|ending))?\s*[:#]?\s*(?:[Xx*•]+\s*)?(\d{3,4})\b/i.exec(sms);
  if (acct) result.account = acct[1];

  // Amounts, leaving out balances and limits.
  let amountMatch: { value: number; index: number; end: number } | null = null;
  let balance: number | undefined;
  for (const m of sms.matchAll(AMOUNT_IN_TEXT)) {
    const tok = parseAmountToken(m[1] ?? m[2]);
    if (!tok) continue;
    const before = sms.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0);
    if (/(avail\w*|bal(?:ance)?|limit|outstanding)\W{0,12}(?:is|of|:|-)?\W{0,6}$/i.test(before)) {
      if (balance === undefined) balance = tok.fils;
      continue;
    }
    if (!amountMatch) amountMatch = { value: tok.fils, index: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
  }
  if (!amountMatch || amountMatch.value === 0) {
    result.problems.push('No transaction amount found in the message.');
    return result;
  }
  if (/\b(otp|one[- ]time password|verification code|do not share)\b/i.test(sms) && !/\b(debited|credited|purchase of|spent)\b/i.test(sms)) {
    result.problems.push('This looks like a one-time code, not a transaction.');
    return result;
  }

  // Direction: whichever keyword comes first (ignoring "credit card" / "debit card").
  const neutral = sms.replace(/\b(credit|debit) card\b/gi, 'card');
  const inc = INCOME_SMS.exec(neutral);
  const cost = COST_SMS.exec(neutral);
  const warnings: string[] = [];
  let confidence = 1;
  let kind: 'income' | 'cost';
  if (inc && (!cost || inc.index < cost.index)) kind = 'income';
  else if (cost) kind = 'cost';
  else {
    kind = 'cost';
    confidence = 0.3;
    warnings.push('The message does not say whether this is money in or out; assumed spending.');
  }
  if (inc && cost) {
    confidence = Math.min(confidence, 0.8);
  }

  // Date
  let date: ISODate;
  const dm = SMS_DATE.exec(sms);
  const dp = dm ? parseDateParts(dm[1].replace(/[ ,]+$/, '')) : null;
  const full = dp && dp.year !== null ? partsToISO(dp.day, dp.month, dp.year) : null;
  if (full) date = full;
  else {
    date = todayISO;
    confidence = Math.min(confidence, 0.6);
    warnings.push("The message has no date; today's date was used.");
  }

  // Description
  let description = '';
  const merchant =
    /\b(?:at|to|towards|from|merchant:?|info:?)\s+([A-Za-z0-9][A-Za-z0-9&'.\-\/ ]*?)(?=\s+(?:on|dated|using|via|ref|with|for|avl|avail|available|balance|bal|card|a\/c|account|is|has|was|received|credited|debited|in\s+your)\b|\s+\d{1,2}[-\/.]|[.,;]|$)/i.exec(
      sms.slice(amountMatch.end),
    );
  if (merchant && !/^\d{1,2}:\d{2}/.test(merchant[1])) description = merchant[1].trim();
  if (!description) {
    const before = /\bfrom\s+([A-Za-z0-9][A-Za-z0-9&'.\-\/ ]*?)(?=\s+(?:on|dated|to|ref|avl|avail|balance)\b|[.,;]|$)/i.exec(sms);
    if (before) description = before[1].trim();
  }
  if (!description) {
    if (/\bsalary\b/i.test(sms)) description = 'Salary';
    else if (/\batm\b|cash withdrawal/i.test(sms)) description = 'ATM cash withdrawal';
    else {
      description = kind === 'income' ? 'Bank credit' : 'Bank debit';
      confidence = Math.min(confidence, 0.8);
      warnings.push('No merchant or purpose in the message.');
    }
  }
  if (kind === 'income' && /\bsalary\b/i.test(sms) && !/salary/i.test(description)) description = `Salary - ${description}`;

  const row: ParsedRow = {
    date,
    description,
    amount: Math.abs(amountMatch.value),
    kind,
    ...(balance !== undefined ? { balance } : {}),
    raw: sms,
    confidence: Math.round(confidence * 100) / 100,
    warnings,
  };
  result.rows.push(row);
  result.period = { from: date, to: date };
  return result;
}
