import { addDays, isValidISODate } from '@/lib/dates';
import { detectCurrency, parseAmountToken } from './amount';
import type { AmountToken } from './amount';
import { checkBalances } from './balance';
import { parseDateParts, partsToISO } from './date';
import { normaliseArabic, normaliseDigits } from './normalize';
import type { CsvMapping, DateOrder, ParsedRow, ParseResult } from './types';

const DELIMITERS = [',', ';', '\t'];

/** Splits CSV text into rows of trimmed cells. Handles quotes (with "" escapes and newlines inside). Empty rows are dropped. */
export function readCsvTable(text: string, delimiter?: string): { delimiter: string; rows: string[][] } {
  let src = normaliseDigits(text.replace(/^﻿/, ''));
  // Excel's "sep=;" first line.
  const sep = /^sep=(.)\r?\n/i.exec(src);
  if (sep) src = src.slice(sep[0].length);
  const d = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === d) endCell();
    else if (ch === '\n') endRow();
    else if (ch === '\r') {
      if (src[i + 1] === '\n') i++;
      endRow();
    } else cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return { delimiter: d, rows };
}

function detectDelimiter(src: string): string {
  const lines = src.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ',';
  let bestScore = 0;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const nonZero = counts.filter((c) => c > 0);
    if (!nonZero.length) continue;
    const mode = [...nonZero].sort((a, b) => nonZero.filter((x) => x === b).length - nonZero.filter((x) => x === a).length)[0];
    const score = counts.filter((c) => c === mode).length * 100 + mode;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, d: string): number {
  let q = false;
  let n = 0;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) n++;
  }
  return n;
}

// ---- Column guessing ----

type Field = 'date' | 'description' | 'debit' | 'credit' | 'amount' | 'balance' | 'direction';

/** Header names, best first. Matched against the lower-cased header with punctuation removed. */
const HEADERS: Record<Field, RegExp[]> = {
  date: [/^(transaction|txn|trans) date( time)?$/, /^date$/, /^(posting|post|booking|posted) date$/, /^date (of )?(transaction|txn)$/, /^(value|val) date$/, /^date/, /^(ال)?تاريخ/],
  description: [
    /^(transaction )?(description|details)$/,
    /^narration$|^narrative$|^particulars$/,
    /^(transaction|txn) (details|narration|description)$/,
    /^(remarks|memo|merchant|payee|reference|details?)$/,
    /description|narration|particulars|details/,
    /^(ال)?(وصف|بيان|تفاصيل|ملاحظات)/,
  ],
  debit: [/^(debit|debits|dr)( amount)?( aed)?$/, /^(withdrawals?|paid out|money out|outflow)( amount)?( aed)?$/, /^debit|^withdrawal/, /^(ال)?(مدين|سحب|مسحوبات|مصروفات)/],
  credit: [/^(credit|credits|cr)( amount)?( aed)?$/, /^(deposits?|paid in|money in|inflow)( amount)?( aed)?$/, /^credit|^deposit/, /^(ال)?(داين|ايداع|ايداعات)/],
  amount: [/^(transaction )?amount( aed)?$/, /^(txn|trans) amount( aed)?$/, /^amount/, /^aed$/, /^(ال)?مبلغ/],
  balance: [/^(running |available |ledger )?balance( aed)?$/, /^closing balance$/, /^balance/, /^(ال)?رصيد/],
  direction: [/^(dr ?cr|cr ?dr|debit credit|credit debit|dr or cr|cr or dr|indicator|(transaction |txn )?type|credit debit indicator)$/],
};

const normHeader = (h: string) =>
  normaliseArabic(h)
    .toLowerCase()
    .replace(/[()\[\]:*]/g, ' ')
    .replace(/[\/\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function classify(cell: string, field: Field): number {
  const h = normHeader(cell);
  if (!h) return -1;
  return HEADERS[field].findIndex((re) => re.test(h));
}

function headerScore(row: string[]): { score: number; hasDate: boolean; hasMoney: boolean } {
  let score = 0;
  let hasDate = false;
  let hasMoney = false;
  for (const c of row) {
    for (const f of Object.keys(HEADERS) as Field[]) {
      if (f === 'direction') continue;
      if (classify(c, f) >= 0) {
        score++;
        if (f === 'date') hasDate = true;
        if (f === 'debit' || f === 'credit' || f === 'amount') hasMoney = true;
        break;
      }
    }
  }
  return { score, hasDate, hasMoney };
}

const EMPTY_MAPPING: CsvMapping = {
  delimiter: ',',
  headerRow: -1,
  date: null,
  description: null,
  debit: null,
  credit: null,
  amount: null,
  balance: null,
  direction: null,
  dateOrder: 'dmy',
};

const column = (rows: string[][], from: number, col: number) => rows.slice(from, from + 40).map((r) => r[col] ?? '').filter((c) => c !== '');

const isDateCell = (c: string, order: DateOrder) => {
  const p = parseDateParts(stripTime(c), order);
  return !!p && p.year !== null;
};

// Arabic literals here are in normalised spelling (دائن is written داين).
const looksDirection = (v: string) => /^(cr|dr|c|d|credit|debit|داين|مدين)$/i.test(normaliseArabic(v));
const isCreditWord = (v: string) => /^(cr|c|credit|داين)$/.test(normaliseArabic(v).toLowerCase());

/** Detects the delimiter, the header row and which column holds what. The user can correct the result. */
export function guessCsvMapping(text: string): CsvMapping {
  const { delimiter, rows } = readCsvTable(text);
  return guessMappingFromTable(rows, delimiter);
}

/** Same as guessCsvMapping for a table that is already split into cells (a spreadsheet sheet). */
export function guessMappingFromTable(rows: string[][], delimiter = ','): CsvMapping {
  const m: CsvMapping = { ...EMPTY_MAPPING, delimiter };
  if (!rows.length) return m;

  // Header row: the best-scoring row among the first 20 that names a date and an amount column.
  let headerRow = -1;
  let best = 1;
  rows.slice(0, 20).forEach((r, i) => {
    const s = headerScore(r);
    if (s.hasDate && s.hasMoney && s.score > best) {
      best = s.score;
      headerRow = i;
    }
  });
  m.headerRow = headerRow;
  const width = Math.max(...rows.slice(0, 40).map((r) => r.length));

  if (headerRow >= 0) {
    for (const f of Object.keys(HEADERS) as Field[]) {
      let bestCol: number | null = null;
      let bestRank = 99;
      rows[headerRow].forEach((c, i) => {
        const rank = classify(c, f);
        if (rank >= 0 && rank < bestRank && !usedBy(m, i)) {
          bestRank = rank;
          bestCol = i;
        }
      });
      if (f === 'direction' && bestCol !== null) {
        const vals = column(rows, m.headerRow + 1, bestCol);
        if (!vals.length || !vals.every(looksDirection)) bestCol = null;
      }
      m[f] = bestCol;
    }
  } else {
    // No recognised header: work it out from the values. A first row with no dates or numbers is taken as the header.
    const headerLike = rows[0].every((v) => !isDateCell(v, 'dmy') && !isDateCell(v, 'mdy') && parseAmountToken(v) === null);
    if (headerLike && rows.length > 1) {
      m.headerRow = 0;
    }
    const dataFrom = m.headerRow + 1;
    const stats = Array.from({ length: width }, (_, c) => {
      const vals = column(rows, dataFrom, c);
      return {
        c,
        n: vals.length,
        dates: vals.filter((v) => isDateCell(v, 'dmy') || isDateCell(v, 'mdy')).length,
        nums: vals.filter((v) => parseAmountToken(v) !== null).length,
        len: vals.reduce((a, v) => a + v.length, 0) / Math.max(1, vals.length),
        dir: vals.length > 0 && vals.every(looksDirection),
      };
    });
    const dateCol = stats.find((s) => s.n && s.dates / s.n >= 0.7);
    m.date = dateCol ? dateCol.c : null;
    const numeric = stats.filter((s) => s.c !== m.date && s.n && s.nums / s.n >= 0.7 && s.dates / s.n < 0.7);
    // The last numeric column is the balance when there are two or more.
    if (numeric.length >= 3) {
      m.debit = numeric[0].c;
      m.credit = numeric[1].c;
      m.balance = numeric[2].c;
    } else if (numeric.length === 2) {
      m.amount = numeric[0].c;
      m.balance = numeric[1].c;
    } else if (numeric.length === 1) m.amount = numeric[0].c;
    const dir = stats.find((s) => s.dir);
    m.direction = dir ? dir.c : null;
  }

  if (m.description === null) {
    const taken = new Set(Object.values(m).filter((v): v is number => typeof v === 'number'));
    const stats = Array.from({ length: width }, (_, c) => c)
      .filter((c) => !taken.has(c) || c === m.headerRow)
      .map((c) => ({ c, vals: column(rows, m.headerRow + 1, c) }))
      .filter((s) => s.vals.length && s.vals.some((v) => /[A-Za-z\u0600-\u06FF]{3}/.test(v)));
    stats.sort((a, b) => avgLen(b.vals) - avgLen(a.vals));
    m.description = stats.length ? stats[0].c : null;
  }

  // Month-first dates: only when a value proves it (second number above 12, none above 12 first).
  m.dateOrder = m.date === null ? 'dmy' : guessDateOrder(column(rows, m.headerRow + 1, m.date));
  return m;
}

function usedBy(m: CsvMapping, col: number): boolean {
  return (['date', 'description', 'debit', 'credit', 'amount', 'balance', 'direction'] as Field[]).some((f) => m[f] === col);
}

const avgLen = (v: string[]) => v.reduce((a, s) => a + s.length, 0) / v.length;

function guessDateOrder(values: string[]): DateOrder {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const v of values) {
    const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.]\d{2,4}/.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver12 = true;
    if (Number(m[2]) > 12) secondOver12 = true;
  }
  return secondOver12 && !firstOver12 ? 'mdy' : 'dmy';
}

function stripTime(c: string): string {
  return c
    .trim()
    .replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm)?(Z|[+-]\d{2}:?\d{2})?$/i, '')
    .trim();
}

// ---- Parsing ----

const SKIP_DESC = /^(opening balance|closing balance|balance (brought|carried|b\/f|c\/f|forward)|brought forward|carried forward|total\b|grand total|summary)/i;

/** Parses a CSV statement. Without a mapping it is guessed with guessCsvMapping. */
export function parseCsv(text: string, mapping?: CsvMapping): ParseResult {
  const map = mapping ?? guessCsvMapping(text);
  const { rows: table } = readCsvTable(text, map.delimiter);
  return parseTable(table, map, map.delimiter === '\t' ? '\t' : map.delimiter);
}

const ASSUMED_SPENDING = 'The file does not say whether this is money in or out; assumed spending.';

/** Parses a table of cells with a mapping. Used for CSV text and for spreadsheet sheets. `rawSeparator` joins the cells of `raw`. */
export function parseTable(table: string[][], map: CsvMapping, rawSeparator = ', '): ParseResult {
  const result: ParseResult = { rows: [], source: 'csv', problems: [] };
  if (!table.length) {
    result.problems.push('The file is empty.');
    return result;
  }
  if (map.date === null) result.problems.push('No date column found. Choose which column holds the date.');
  if (map.amount === null && map.debit === null && map.credit === null) {
    result.problems.push('No amount column found. Choose the amount, or the debit and credit columns.');
  }
  if (result.problems.length) return result;

  const start = map.headerRow + 1;
  if (map.headerRow >= 0) result.currency = detectCurrency(table[map.headerRow].join(' '));
  const cell = (r: string[], c: number | null) => (c === null ? '' : (r[c] ?? '').trim());

  // Is the amount column signed? If every value is unsigned we can't tell income from cost.
  let signed = map.direction !== null;
  if (!signed && map.amount !== null && map.debit === null && map.credit === null) {
    for (let i = start; i < table.length && !signed; i++) {
      const t = parseAmountToken(cell(table[i], map.amount));
      if (t && (t.fils < 0 || t.marker)) signed = true;
    }
  }
  const singleColumn = map.debit === null && map.credit === null;
  const unsignedSingle = singleColumn && !signed;

  const skipped: number[] = [];
  let badAmount = 0;
  for (let i = start; i < table.length; i++) {
    const r = table[i];
    const rowNo = i + 1;
    const desc = cell(r, map.description);
    if (SKIP_DESC.test(desc)) continue;
    const warnings: string[] = [];
    let confidence = 1;
    const lower = (cap: number, w: string) => {
      confidence = Math.min(confidence, cap);
      warnings.push(w);
    };

    // Date
    const dateText = cell(r, map.date);
    if (SKIP_DESC.test(dateText)) continue;
    let date: string | null = null;
    if (/^\d{5}(\.\d+)?$/.test(dateText) && Number(dateText) > 20000 && Number(dateText) < 80000) {
      // Excel serial date (days since 1899-12-30).
      date = addDays('1899-12-30', Math.floor(Number(dateText)));
      lower(0.8, 'The date was an Excel date number; check it.');
    } else {
      const p = parseDateParts(stripTime(dateText), map.dateOrder);
      if (p && p.year !== null) date = partsToISO(p.day, p.month, p.year);
    }
    if (!date || !isValidISODate(date)) {
      if (r.some((c) => c !== '') && !SKIP_DESC.test(desc)) skipped.push(rowNo);
      continue;
    }

    // Amount
    const debitTok = map.debit !== null ? parseAmountToken(cell(r, map.debit)) : null;
    const creditTok = map.credit !== null ? parseAmountToken(cell(r, map.credit)) : null;
    let amount = 0;
    let kind: 'income' | 'cost' = 'cost';
    let tok: AmountToken | null = null;
    const hasDebit = !!debitTok && debitTok.fils !== 0;
    const hasCredit = !!creditTok && creditTok.fils !== 0;
    if (!singleColumn) {
      if (hasDebit && hasCredit) {
        lower(0.4, 'Both a debit and a credit were filled in; check the amount.');
        kind = debitTok!.fils >= creditTok!.fils ? 'cost' : 'income';
        amount = Math.abs(Math.abs(debitTok!.fils) - Math.abs(creditTok!.fils));
        tok = kind === 'cost' ? debitTok : creditTok;
      } else if (hasDebit) {
        amount = Math.abs(debitTok!.fils);
        kind = 'cost';
        tok = debitTok;
      } else if (hasCredit) {
        amount = Math.abs(creditTok!.fils);
        kind = 'income';
        tok = creditTok;
      }
    } else {
      tok = parseAmountToken(cell(r, map.amount));
      if (tok) {
        amount = Math.abs(tok.fils);
        const dirText = cell(r, map.direction).toLowerCase();
        if (dirText) kind = isCreditWord(dirText) ? 'income' : 'cost';
        else if (tok.marker) kind = tok.marker === 'cr' ? 'income' : 'cost';
        else if (signed) kind = tok.fils < 0 ? 'cost' : 'income';
        else lower(0.5, ASSUMED_SPENDING);
      }
    }
    if (!tok || amount === 0) {
      if (cell(r, map.amount ?? map.debit) !== '' || cell(r, map.credit) !== '') badAmount++;
      continue;
    }
    if (tok.currency && !result.currency) result.currency = tok.currency;

    let balance: number | undefined;
    if (map.balance !== null) {
      const b = parseAmountToken(cell(r, map.balance));
      if (b) balance = b.marker === 'dr' ? -Math.abs(b.fils) : b.fils;
    }
    if (!desc) lower(0.7, 'No description.');

    result.rows.push({
      date,
      description: desc || '(no description)',
      amount,
      kind,
      ...(balance !== undefined ? { balance } : {}),
      raw: r.join(rawSeparator),
      confidence,
      warnings,
    } as ParsedRow);
  }

  const check = checkBalances(result.rows);
  if (check.order && check.disagreed > 0) {
    result.problems.push(`${check.disagreed} row${check.disagreed === 1 ? '' : 's'} do not match the running balance; check them.`);
  } else if (!check.order && check.checked >= 2) {
    result.problems.push('The running balance does not match the amounts. Check that the balance column is the right one.');
  }
  const stillAssumed = result.rows.some((x) => x.warnings.includes(ASSUMED_SPENDING));
  const unsignedSingle2 = unsignedSingle && stillAssumed;

  if (skipped.length) {
    result.problems.push(
      `${skipped.length} row${skipped.length === 1 ? '' : 's'} skipped because the date could not be read (first: row ${skipped[0]}).`,
    );
  }
  if (badAmount) result.problems.push(`${badAmount} row${badAmount === 1 ? '' : 's'} skipped because the amount could not be read.`);
  if (unsignedSingle2 && result.rows.length) {
    result.problems.push('Amounts have no minus sign, Cr/Dr or debit/credit columns, so every row is assumed to be spending. Check the direction.');
  }
  if (map.dateOrder === 'mdy') result.problems.push('Dates look month-first (MM/DD/YYYY), so they were read that way.');
  if (result.currency && result.currency !== 'AED') {
    result.problems.push(`The file is in ${result.currency}. Amounts are not converted.`);
  }
  if (!result.rows.length && !result.problems.length) result.problems.push('No transactions found.');
  setPeriod(result);
  return result;
}

function setPeriod(r: ParseResult) {
  if (!r.rows.length) return;
  const dates = r.rows.map((x) => x.date).sort();
  r.period = { from: dates[0], to: dates[dates.length - 1] };
}

export { detectCurrency };
