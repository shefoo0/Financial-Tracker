// Randomised ("fuzz") tests for the statement parsers. Random statements are generated from fixed seeds together with the
// ground truth (date, description, amount, kind per row); the parsers must read back exactly that, and buildReviewRows
// must file known merchants in their default category, unknown spending in "Other" and card payments unticked.
// Replay one statement: genBankText(seed), genCardCsv(seed) ... in random-statements.gen.ts (seeds are in the failure text).
import { DEFAULT_CATEGORIES } from '@/data/defaults';
import { buildReviewRows } from '@/features/import/review';
import { parseCsv, parseOfx, parseSmsText, parseStatementText, parseXlsx, suggestCategory } from '@/import/parse';
import type { ParseResult } from '@/import/parse';

import {
  CATALOGUE,
  genBankCsvColumns,
  genBankCsvSigned,
  genBankText,
  genCardCsv,
  genCardCsvBalance,
  genCardTextBalance,
  genCardText,
  genOfx,
  genXlsx,
  mulberry32,
  money,
  type GenStatement,
  type TruthRow,
} from '../random-statements.gen';

// Each test parses about 100 generated statements: a few seconds, more on a busy machine (pre-flight, CI).
jest.setTimeout(60_000);

const PER_FORMAT = 100;
const PER_CARD_LAYOUT = 40;
const TODAY = '2026-12-20';

const brief = (r: { date: string; amount: number; kind: string; description: string }) => `${r.date} ${r.kind} ${r.amount} "${r.description}"`;

/** First thing that differs between what the parser read and the ground truth, or null. */
function difference(stmt: GenStatement<string | Uint8Array>, res: ParseResult): string | null {
  const bad: string[] = [];
  const allowed = stmt.allowedProblems ?? [];
  const problems = res.problems.filter((p) => !allowed.some((re) => re.test(p)));
  if (problems.length) bad.push(`problems: ${JSON.stringify(problems)}`);
  if (res.rows.length !== stmt.truth.length) bad.push(`row count ${res.rows.length}, expected ${stmt.truth.length}`);
  const n = Math.min(res.rows.length, stmt.truth.length);
  for (let i = 0; i < n && bad.length < 4; i++) {
    const got = res.rows[i];
    const want = stmt.truth[i];
    if (got.date !== want.date || got.amount !== want.amount || got.kind !== want.kind || got.description !== want.description) {
      bad.push(`row ${i}: got ${brief(got)}\n          want ${brief(want)}`);
    }
  }
  if (!bad.length) {
    const review = buildReviewRows(res.rows, [], [], DEFAULT_CATEGORIES);
    review.forEach((r, i) => {
      const want = stmt.truth[i];
      if (r.categoryId !== want.category) bad.push(`row ${i} "${r.description}": category ${r.categoryId}, expected ${want.category}`);
      if (!!r.cardPayment !== want.cardPayment) bad.push(`row ${i} "${r.description}": cardPayment ${r.cardPayment}, expected ${want.cardPayment}`);
      if (r.selected !== !want.cardPayment) bad.push(`row ${i} "${r.description}": selected ${r.selected}, expected ${!want.cardPayment}`);
    });
  }
  return bad.length ? `${stmt.name} (seed ${stmt.seed}): ${bad.slice(0, 4).join('\n        ')}` : null;
}

function fuzz<T extends string | Uint8Array>(seedBase: number, gen: (seed: number) => GenStatement<T>, parse: (input: T) => ParseResult, count = PER_FORMAT) {
  const failures: string[] = [];
  let rows = 0;
  for (let i = 1; i <= count; i++) {
    const stmt = gen(seedBase + i);
    rows += stmt.truth.length;
    let res: ParseResult;
    try {
      res = parse(stmt.input);
    } catch (e) {
      failures.push(`${stmt.name} (seed ${stmt.seed}): threw ${String(e)}`);
      continue;
    }
    const d = difference(stmt, res);
    if (d) failures.push(d);
  }
  return { failures: failures.length > 5 ? [`${failures.length} of ${count} statements failed; first 5:`, ...failures.slice(0, 5)] : failures, rows };
}

const text = (s: string) => parseStatementText(s, { today: TODAY });

describe('generator self-check', () => {
  it('every catalogue merchant gets the category the generator promises', () => {
    for (const m of CATALOGUE) {
      const rows = [{ date: '2026-11-01', description: m.description, amount: 1000, kind: m.kind, raw: '', confidence: 1, warnings: [] }];
      expect(`${m.description}: ${buildReviewRows(rows, [], [], DEFAULT_CATEGORIES)[0].categoryId}`).toBe(`${m.description}: ${m.category}`);
    }
    // Unknown merchants really are unknown to the built-in word list.
    for (const m of CATALOGUE.filter((x) => x.category === 'other')) expect(suggestCategory(m.description, [], DEFAULT_CATEGORIES)).toBeNull();
  });
  it('is deterministic and covers the amount range', () => {
    expect(genBankText(5).input).toBe(genBankText(5).input);
    expect(genBankText(5).input).not.toBe(genBankText(6).input);
    const rng = mulberry32(1);
    expect(rng()).toBe(mulberry32(1)());
    let min = Infinity;
    let max = 0;
    let x5 = 0;
    let thousands = 0;
    for (let s = 1; s <= PER_FORMAT; s++)
      for (const r of genBankCsvSigned(s).truth) {
        min = Math.min(min, r.amount);
        max = Math.max(max, r.amount);
        if (r.amount % 10 === 5) x5++;
        if (r.amount % 100_000 === 0) thousands++;
      }
    expect(min).toBeLessThan(100);
    expect(max).toBeGreaterThan(10_000_000);
    expect(max).toBeLessThanOrEqual(25_000_000);
    expect(x5).toBeGreaterThan(20);
    expect(thousands).toBeGreaterThan(20);
    expect(money(25_000_000)).toBe('250,000.00');
  });
});

describe('random statements: CSV', () => {
  it(`bank, one signed amount column (${PER_FORMAT} statements, seeds 1001-${1000 + PER_FORMAT})`, () => {
    expect(fuzz(1000, genBankCsvSigned, (s) => parseCsv(s)).failures).toEqual([]);
  });
  it(`bank, debit + credit / Cr-Dr columns, optional balance (${PER_FORMAT}, seeds 2001-)`, () => {
    expect(fuzz(2000, genBankCsvColumns, (s) => parseCsv(s)).failures).toEqual([]);
  });
  it(`card, charges positive and payments negative (${PER_FORMAT}, seeds 3001-)`, () => {
    expect(fuzz(3000, (s) => genCardCsv(s, 'charges-positive'), (s) => parseCsv(s)).failures).toEqual([]);
  });
  it(`card, every purchase negative (${PER_FORMAT}, seeds 4001-)`, () => {
    expect(fuzz(4000, (s) => genCardCsv(s, 'purchases-negative'), (s) => parseCsv(s)).failures).toEqual([]);
  });
});

describe('random statements: plain text / PDF', () => {
  it(`bank, amount + running balance (${PER_FORMAT}, seeds 5001-)`, () => {
    expect(fuzz(5000, (s) => genBankText(s, 'amt-bal'), text).failures).toEqual([]);
  });
  it(`bank, Cr/Dr markers with balance (${PER_FORMAT}, seeds 6001-)`, () => {
    expect(fuzz(6000, (s) => genBankText(s, 'crdr-bal'), text).failures).toEqual([]);
  });
  it(`bank, debit / credit / balance columns with 0.00 (${PER_FORMAT}, seeds 7001-)`, () => {
    expect(fuzz(7000, (s) => genBankText(s, 'three-col'), text).failures).toEqual([]);
  });
  it(`bank, minus (and plus) signs with balance (${PER_FORMAT}, seeds 8001-)`, () => {
    expect(fuzz(8000, (s) => genBankText(s, 'minus-bal'), text).failures).toEqual([]);
  });
  it(`bank, Cr/Dr markers without a balance column (${PER_FORMAT}, seeds 9001-)`, () => {
    expect(fuzz(9000, (s) => genBankText(s, 'crdr-nobal'), text).failures).toEqual([]);
  });
  it(`bank, minus costs and Cr income without a balance column (${PER_FORMAT}, seeds 10001-)`, () => {
    expect(fuzz(10_000, (s) => genBankText(s, 'minus-crdr-nobal'), text).failures).toEqual([]);
  });
  it(`card, charges unsigned and payments marked Cr / minus / (parentheses) / Dr-Cr (${PER_CARD_LAYOUT * 4}, seeds 11001-)`, () => {
    const layouts = ['cr-marker', 'minus-payments', 'paren-payments', 'dr-cr'] as const;
    const failures: string[] = [];
    layouts.forEach((l, i) => failures.push(...fuzz(11_000 + i * 1000, (s) => genCardText(s, l), text, PER_CARD_LAYOUT).failures));
    expect(failures).toEqual([]);
  });
  it(`card, every purchase minus / trailing minus / parentheses, payments Cr (${PER_CARD_LAYOUT * 3}, seeds 15001-)`, () => {
    const layouts = ['all-minus', 'all-minus-trailing', 'all-paren'] as const;
    const failures: string[] = [];
    layouts.forEach((l, i) => failures.push(...fuzz(15_000 + i * 1000, (s) => genCardText(s, l), text, PER_CARD_LAYOUT).failures));
    expect(failures).toEqual([]);
  });
});

describe('random statements: card statements with a running balance (the balance is what is owed)', () => {
  it(`text: unsigned amounts, balance up = spending, balance down = payment (${PER_FORMAT}, seeds 22001-)`, () => {
    expect(fuzz(22_000, genCardTextBalance, text).failures).toEqual([]);
  });
  it(`csv: Amount + owed Balance columns, signed or unsigned (${PER_FORMAT}, seeds 23001-)`, () => {
    expect(fuzz(23_000, genCardCsvBalance, (s) => parseCsv(s)).failures).toEqual([]);
  });
});

describe('random statements: XLSX and OFX', () => {
  it(`xlsx workbooks: signed / debit-credit / card, date cells of every kind (${PER_FORMAT}, seeds 20001-)`, () => {
    expect(fuzz(20_000, genXlsx, (b) => parseXlsx(b)).failures).toEqual([]);
  });
  it(`ofx, SGML and XML (${PER_FORMAT}, seeds 21001-)`, () => {
    expect(fuzz(21_000, genOfx, (s) => parseOfx(s)).failures).toEqual([]);
  });
});

// ---- Nasty input: never crash, and say what could not be read ----

const rowsOf = (rows: TruthRow[]) => rows.map((r) => [r.date, r.amount, r.kind]);
const readRows = (res: ParseResult) => res.rows.map((r) => [r.date, r.amount, r.kind]);

describe('nasty input never crashes', () => {
  it('empty, blank-only and punctuation-only input of every kind gives problems and no rows', () => {
    for (const s of ['', '\n\n\n', '   \r\n  \r\n', ',,,\n,,,', '----\n====', '\u0000\u0001']) {
      for (const res of [parseCsv(s), text(s), parseOfx(s), parseSmsText(s)]) {
        expect(res.rows).toEqual([]);
        expect(res.problems.length).toBeGreaterThan(0);
      }
    }
  });

  it('random garbage never throws (all parsers, 300 inputs)', () => {
    const rng = mulberry32(777);
    const alphabet = 'abcXYZ 0123456789,.;:-()/"\n\r\t<>=&٠١٢٣ٱ$€%*+AEDCrDr';
    for (let i = 0; i < 300; i++) {
      const len = Math.floor(rng() * 400);
      let s = '';
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(rng() * alphabet.length)];
      expect(() => parseCsv(s)).not.toThrow();
      expect(() => text(s)).not.toThrow();
      expect(() => parseOfx(s)).not.toThrow();
      expect(() => parseSmsText(s)).not.toThrow();
      const bytes = new Uint8Array(Math.floor(rng() * 200)).map(() => Math.floor(rng() * 256));
      const x = parseXlsx(bytes);
      expect(x.rows).toEqual([]);
      expect(x.problems.length).toBeGreaterThan(0);
    }
  });

  it('text: a row with no amount is reported, the other rows are still read (bank, 100 statements)', () => {
    let checked = 0;
    for (let seed = 30_001; seed <= 30_100; seed++) {
      const stmt = genBankText(seed, 'crdr-nobal');
      if (stmt.truth.length < 2) continue;
      const lines = stmt.input.split('\n');
      // Rows are the lines that start with a digit and have an amount at the end.
      const rowIdx = lines.map((l, i) => (/^[\d٠-٩]/.test(l) && /\d\.\d\d( (Cr|Dr|CR|DR))?( AED)?$/.test(l) ? i : -1)).filter((i) => i >= 0);
      if (rowIdx.length !== stmt.truth.length) continue;
      const pick = rowIdx[seed % rowIdx.length];
      const k = rowIdx.indexOf(pick);
      lines[pick] = lines[pick].replace(/\s+\S*\d\.\d\d.*$/, '');
      const res = text(lines.join('\n'));
      const expected = stmt.truth.filter((_r, i) => i !== k);
      expect({ seed, rows: readRows(res) }).toEqual({ seed, rows: rowsOf(expected) });
      expect(res.problems.join(' ')).toMatch(/no amount could be read/);
      checked++;
    }
    expect(checked).toBeGreaterThan(60);
  });

  it('csv: a row with an unreadable amount or date is skipped and reported (100 statements)', () => {
    for (let seed = 31_001; seed <= 31_100; seed++) {
      const stmt = genBankCsvSigned(seed);
      if (stmt.truth.length < 2) continue;
      const k = seed % stmt.truth.length;
      if (!stmt.truth.some((r, i) => i !== k && r.kind === 'cost')) continue; // only unsigned amounts would be left
      const brokenDate = seed % 2 === 0;
      const lines = ['Date,Description,Amount'];
      stmt.truth.forEach((r, i) => {
        const date = brokenDate && i === k ? '31/02/2026' : `${r.date.slice(8)}/${r.date.slice(5, 7)}/${r.date.slice(0, 4)}`;
        const amount = !brokenDate && i === k ? 'abc' : `${r.kind === 'cost' ? '-' : ''}${(r.amount / 100).toFixed(2)}`;
        lines.push(`${date},${r.description.replace(/,/g, ' ')},${amount}`);
      });
      const res = parseCsv(lines.join('\n'));
      const expected = stmt.truth.filter((_r, i) => i !== k);
      expect({ seed, rows: readRows(res) }).toEqual({ seed, rows: rowsOf(expected) });
      expect(res.problems.join(' ')).toMatch(brokenDate ? /date could not be read/ : /amount could not be read/);
    }
  });

  it('csv: header only, missing amount column and missing date column give a problem', () => {
    expect(parseCsv('Date,Description,Amount\n').problems.length).toBeGreaterThan(0);
    expect(parseCsv('Date,Description\n01/11/2026,Shop\n').problems.join(' ')).toMatch(/amount/i);
    expect(parseCsv('Description,Amount\nShop,10.00\n').problems.join(' ')).toMatch(/date/i);
  });

  it('ofx: transactions with a missing amount or date are counted as skipped', () => {
    for (let seed = 32_001; seed <= 32_050; seed++) {
      const stmt = genOfx(seed);
      if (stmt.truth.length < 2) continue;
      const broken = stmt.input.replace(/<TRNAMT>[^<\r\n]*/, '<TRNAMT>n/a');
      const res = parseOfx(broken);
      expect(res.rows).toHaveLength(stmt.truth.length - 1);
      expect(res.problems.join(' ')).toMatch(/skipped/);
    }
  });
});

// ---- Parser bugs the fuzzer found, fixed; kept as regression tests ----

describe('parser bugs the fuzzer found (fixed)', () => {
  const lines = (...l: string[]) => l.join('\n');
  const kinds = (r: ParseResult) => r.rows.map((x) => [x.date, x.kind, x.amount, x.description]);
  const BANK = ['Account Statement', 'Statement Period 01/11/2026 to 30/11/2026'];
  const CARD = ['Credit Card Statement', 'Statement Period 01/11/2026 to 30/11/2026'];

  // Card, newest first, "Previous Balance" given: the oldest row (last line) is never checked against it, so a payment whose
  // text has no income word is silently read as spending (text.ts ~line 232: `next` is undefined for the last row, opening unused).
  it('card text, newest first: the oldest row is checked against the previous balance', () => {
    const r = text(lines(...CARD, 'Date Description Amount Balance', '10/11/2026 NETFLIX 55.00 1,055.00', '05/11/2026 AUTOPAY PAYMENT 200.00 1,000.00', 'Previous Balance 1,200.00'));
    expect(kinds(r)).toEqual([['2026-11-10', 'cost', 5500, 'NETFLIX'], ['2026-11-05', 'income', 20000, 'AUTOPAY PAYMENT']]);
  });

  // Bank, newest first, "Opening Balance" given: the row is corrected afterwards, yet the "could not be told apart" problem stays.
  it('bank text, newest first: no false "could not be told apart" when the opening balance settles the oldest row', () => {
    const r = text(lines(...BANK, 'Date Description Amount Balance', '10/11/2026 NETFLIX 55.00 945.00', '05/11/2026 Quokka Labs INVOICE 200.00 1,000.00', 'Opening Balance 800.00'));
    expect(r.rows.map((x) => x.kind)).toEqual(['cost', 'income']);
    expect(r.problems).toEqual([]);
  });

  // A minus in front of the currency code ("-AED 55.00") is dropped and "-AED" is glued to the description.
  it('text: "-AED 200.00" is a minus amount, and the description stays clean', () => {
    const r = text(lines(...CARD, '10/11/2026 NETFLIX 55.00', '11/11/2026 CARREFOUR 20.00', '12/11/2026 AUTOPAY PAYMENT -AED 200.00'));
    expect(kinds(r)).toEqual([['2026-11-10', 'cost', 5500, 'NETFLIX'], ['2026-11-11', 'cost', 2000, 'CARREFOUR'], ['2026-11-12', 'income', 20000, 'AUTOPAY PAYMENT']]);
  });

  // A line with an impossible date (31/02) has amounts but is skipped with no problem at all (date.ts matchLeadingDate -> null).
  it('text: a row with an impossible date is reported, not silently dropped', () => {
    const r = text(lines('Account Statement', 'Statement Period 01/02/2026 to 28/02/2026', '10/02/2026 NETFLIX 55.00 Dr', '31/02/2026 CARREFOUR 20.00 Dr', '12/02/2026 SALARY 200.00 Cr'));
    expect(r.rows).toHaveLength(2);
    expect(r.problems.length).toBeGreaterThan(0);
  });

  // "+200.00" is not read as money in on a bank statement without a balance column (text.ts: only a minus/marker sets the kind).
  it('text: a plus sign means money in (bank, no balance column)', () => {
    const r = text(lines(...BANK, '10/11/2026 NETFLIX -55.00', '11/11/2026 Quokka Labs INVOICE +200.00'));
    expect(r.rows.map((x) => x.kind)).toEqual(['cost', 'income']);
  });

  // Payments as plain positive amounts on a card statement whose purchases are all "-x": CSV reads them as money in, text as spending.
  it('text: positive payment on a card statement whose purchases carry a minus is income (as in CSV)', () => {
    const r = text(lines(...CARD, '10/11/2026 NETFLIX -55.00', '11/11/2026 CARREFOUR -20.00', '12/11/2026 AUTOPAY PAYMENT 200.00'));
    expect(r.rows.map((x) => x.kind)).toEqual(['cost', 'cost', 'income']);
  });

  // "د.إ" (Arabic for AED) after an amount is not a known currency marker: nothing is read (reported, but nothing imports).
  it('text: amount followed by د.إ', () => {
    expect(text(lines(...BANK, '10/11/2026 NETFLIX 55.00 د.إ Dr', '11/11/2026 CARREFOUR 20.00 د.إ Dr')).rows).toHaveLength(2);
  });
  it('csv: amount followed by د.إ', () => {
    expect(parseCsv('Date,Description,Amount\n10/11/2026,NETFLIX,-55.00 د.إ\n11/11/2026,CARREFOUR,-20.00 د.إ\n').rows).toHaveLength(2);
  });

  // Currency code between the amount and its Cr/Dr marker ("55.00 AED Dr"): popAmounts stops at the marker.
  it('text: "55.00 AED Dr"', () => {
    const r = text(lines(...BANK, '10/11/2026 NETFLIX 55.00 AED Dr', '11/11/2026 SALARY 20.00 AED Cr'));
    expect(r.rows.map((x) => [x.kind, x.amount])).toEqual([['cost', 5500], ['income', 2000]]);
  });

  // SILENT WRONG AMOUNT: readCsvTable turns the Arabic thousands mark ٬ into "," BEFORE splitting cells, so "-١٬٢٣٤٫٥٠"
  // becomes two columns and the amount is read as 1.00 (csv.ts:12 normaliseDigits, then the "," delimiter split).
  it('csv: unquoted Arabic thousands separator (٬) stays inside the amount', () => {
    const r = parseCsv('Date,Description,Amount\n10/11/2026,NETFLIX,-١٬٢٣٤٫٥٠\n11/11/2026,CARREFOUR,-٢٠٫٠٠\n');
    expect(r.rows.map((x) => x.amount)).toEqual([123450, 2000]);
  });
});
