// Test helper (not a test): builds random statements together with the ground truth the parsers must read back.
// Everything is driven by a seeded PRNG, so a failing seed can be replayed: genXxx(seed).
import { strToU8, zipSync } from 'fflate';

export type Kind = 'cost' | 'income';

/** What a statement row really is. `category` is what buildReviewRows must suggest with the default categories. */
export interface TruthRow {
  date: string;
  description: string;
  amount: number;
  kind: Kind;
  category: string | null;
  cardPayment: boolean;
}

export interface GenStatement<T = string> {
  name: string;
  seed: number;
  input: T;
  /** Rows in FILE order (newest first when the file is newest first). */
  truth: TruthRow[];
  /** Problems the parser is allowed to print for this input (default none). */
  allowedProblems?: RegExp[];
}

// ---- PRNG ----

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float() {
    return this.next();
  }
  int(a: number, b: number) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
}

// ---- Dates ----

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');
const iso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
};
const toMs = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
export const addDaysISO = (d: string, n: number) => iso(toMs(d) + n * 86_400_000);
/** Days since 1899-12-30 (Excel's calendar). */
export const excelSerial = (d: string) => Math.round((toMs(d) - Date.UTC(1899, 11, 30)) / 86_400_000);

export type DateStyle = 'dmy' | 'dmy-pad' | 'dmy-yy' | 'dmmmy' | 'dmmmy-dash' | 'iso' | 'iso-time' | 'dm' | 'dmmm';
export const FULL_STYLES: DateStyle[] = ['dmy', 'dmy-pad', 'dmy-yy', 'dmmmy', 'dmmmy-dash', 'iso'];

/** Writes an ISO date in a statement style. 'dmy' leaves single-digit days and months unpadded. */
export function fmtDate(d: string, style: DateStyle): string {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  switch (style) {
    case 'dmy':
      return `${day}/${m}/${y}`;
    case 'dmy-pad':
      return `${p2(day)}/${p2(m)}/${y}`;
    case 'dmy-yy':
      return `${p2(day)}-${p2(m)}-${String(y).slice(2)}`;
    case 'dmmmy':
      return `${p2(day)} ${MONTHS[m - 1]} ${y}`;
    case 'dmmmy-dash':
      return `${p2(day)}-${MONTHS[m - 1]}-${y}`;
    case 'iso':
      return d;
    case 'iso-time':
      return `${d} ${p2(day % 24)}:${p2((day * 7) % 60)}:${p2((m * 13) % 60)}`;
    case 'dm':
      return `${p2(day)}/${p2(m)}`;
    case 'dmmm':
      return `${p2(day)} ${MONTHS[m - 1]}`;
  }
}

// ---- Money ----

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const arabicDigits = (s: string) => s.replace(/\d/g, (c) => ARABIC_DIGITS[Number(c)]).replace(/\./g, '٫').replace(/,/g, '٬');
/** Only the digits (dates, reference numbers). */
export const arabicDigitsOnly = (s: string) => s.replace(/\d/g, (c) => ARABIC_DIGITS[Number(c)]);

export function money(fils: number, thousands = true, arabic = false): string {
  const whole = Math.floor(fils / 100);
  const s = `${thousands ? whole.toLocaleString('en-US') : String(whole)}.${p2(fils % 100)}`;
  return arabic ? arabicDigits(s) : s;
}

/** Amounts across 0.01 .. 250,000.00 AED: tiny, everyday, .x5 decimals, round thousands, big. */
export function randomAmount(rng: Rng): number {
  switch (rng.int(0, 6)) {
    case 0:
      return rng.int(1, 99);
    case 1:
      return rng.int(100, 20_000);
    case 2:
      return rng.int(1, 200_000) * 10 + 5; // ends in .x5
    case 3:
      return rng.int(1, 250) * 100_000; // round thousands
    case 4:
      return rng.int(1_000_000, 25_000_000);
    case 5:
      return rng.int(1, 5_000) * 10; // .x0
    default:
      return rng.int(100, 500_000);
  }
}

// ---- Merchants ----

interface Merchant {
  name: string;
  /** Category id buildReviewRows must give it (spending); null = none (income). */
  category: string | null;
}

const KNOWN_COST: Merchant[] = [
  { name: 'CARREFOUR', category: 'groceries' },
  { name: 'Lulu Hypermarket', category: 'groceries' },
  { name: 'ENOC STATION', category: 'transport' },
  { name: 'CAREEM RIDE', category: 'transport' },
  { name: 'SALIK', category: 'transport' },
  { name: 'DEWA BILL PAYMENT', category: 'utilities' },
  { name: 'ETISALAT', category: 'utilities' },
  { name: 'TALABAT', category: 'dining' },
  { name: 'STARBUCKS', category: 'dining' },
  { name: 'NETFLIX.COM', category: 'subscriptions' },
  { name: 'spotify', category: 'subscriptions' },
  { name: 'AMAZON.AE', category: 'shopping' },
  { name: 'IKEA', category: 'shopping' },
  { name: 'LIFE PHARMACY', category: 'health' },
  { name: 'EJARI RENT', category: 'housing' },
  { name: 'GEMS SCHOOL FEES', category: 'education' },
  { name: 'ORIENT INSURANCE', category: 'insurance' },
  { name: 'TABBY', category: 'loans-cards' },
  { name: 'VOX CINEMAS', category: 'entertainment' },
];

const KNOWN_COST_AR: Merchant[] = [
  { name: 'كارفور', category: 'groceries' },
  { name: 'ستاربكس', category: 'dining' },
  { name: 'اتصالات', category: 'utilities' },
  { name: 'نتفلكس', category: 'subscriptions' },
  { name: 'مطعم البيت', category: 'dining' },
  { name: 'صيدلية النور', category: 'health' },
];

const UNKNOWN_COST: Merchant[] = [
  'Quokka Labs',
  'Zephyr Stationers',
  'HARBOUR LIGHTS TRADING',
  'Mirage Studio',
  'PELICAN WORKS LLC',
  'Olive Branch General Trdg',
  'Sandstorm Events',
  'VERTEX AUTO PARTS',
  'Quokka & Sons Trading',
  'ZXQ 77 FZE',
].map((name) => ({ name, category: 'other' }));

const UNKNOWN_COST_AR: Merchant[] = ['شركة الأفق للتجارة', 'مؤسسة النجمة العامة'].map((name) => ({ name, category: 'other' }));

export const CARD_PAYMENTS = [
  'PAYMENT RECEIVED - THANK YOU',
  'Thank you for your payment',
  'AUTOPAY PAYMENT',
  'CREDIT CARD PAYMENT',
  'PAYMENT - THANK YOU',
  'سداد البطاقة',
];

/** Every catalogue entry with the category it should get (used by a self-check of the generator). */
export const CATALOGUE: { description: string; kind: Kind; category: string | null }[] = [
  ...[...KNOWN_COST, ...KNOWN_COST_AR, ...UNKNOWN_COST, ...UNKNOWN_COST_AR].map((m) => ({ description: m.name, kind: 'cost' as Kind, category: m.category })),
  ...CARD_PAYMENTS.map((d) => ({ description: d, kind: 'income' as Kind, category: null })),
  { description: 'SALARY ACME TRADING LLC', kind: 'income', category: 'salary' },
  { description: 'راتب شهر نوفمبر', kind: 'income', category: 'salary' },
  { description: 'REFUND CARREFOUR', kind: 'income', category: null },
  { description: 'INWARD REMITTANCE Zephyr Stationers', kind: 'income', category: null },
];

const PLACES = ['', '', ' DUBAI AE', ' ABU DHABI', ' SHARJAH AE', ' MARINA'];
const PREFIXES = ['', '', '', 'POS ', 'Online '];

export interface RowOptions {
  count: number;
  from: string;
  to: string;
  /** Share of income rows among all rows (0-1). */
  incomeShare: number;
  /** Exactly this many income rows are card payments / refunds (card statements); the rest are salary-like. */
  cardPayments?: number;
  arabic?: boolean;
  /** Reference numbers after the merchant ("CARREFOUR 4471") */
  refs?: boolean;
}

function costDescription(rng: Rng, arabic: boolean, refs: boolean): { description: string; category: string } {
  const known = rng.chance(0.55);
  const useAr = arabic && rng.chance(0.4);
  const m = useAr ? rng.pick(known ? KNOWN_COST_AR : UNKNOWN_COST_AR) : rng.pick(known ? KNOWN_COST : UNKNOWN_COST);
  const ref = refs && rng.chance(0.4) ? ` ${rng.int(10, 99999)}` : '';
  const place = useAr ? '' : rng.pick(PLACES);
  const prefix = useAr ? '' : rng.pick(PREFIXES);
  return { description: `${prefix}${m.name}${ref}${place}`, category: m.category! };
}

/** Rows in time order (oldest first), with the ground truth. */
export function makeRows(rng: Rng, o: RowOptions): TruthRow[] {
  const span = Math.max(0, Math.round((toMs(o.to) - toMs(o.from)) / 86_400_000));
  const rows: TruthRow[] = [];
  const incomeCount = o.cardPayments !== undefined ? o.cardPayments : Math.min(o.count - 1, Math.round(o.count * o.incomeShare + (rng.chance(0.5) ? 1 : 0)));
  const kinds: Kind[] = Array.from({ length: o.count }, (_, i) => (i < incomeCount ? 'income' : 'cost'));
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  for (const kind of kinds) {
    const date = addDaysISO(o.from, rng.int(0, span));
    const amount = randomAmount(rng);
    if (kind === 'cost') {
      const c = costDescription(rng, !!o.arabic, !!o.refs);
      rows.push({ date, description: c.description, amount, kind, category: c.category, cardPayment: false });
    } else if (o.cardPayments !== undefined) {
      // Card statement money-in: mostly payments, sometimes a refund.
      if (rng.chance(0.8)) rows.push({ date, description: rng.pick(CARD_PAYMENTS), amount, kind, category: null, cardPayment: true });
      else rows.push({ date, description: `REFUND ${rng.pick(KNOWN_COST).name}`.replace(/AMAZON\.AE/, 'IKEA'), amount, kind, category: null, cardPayment: false });
    } else {
      const r = rng.int(0, 3);
      const description =
        r === 0 ? 'SALARY ACME TRADING LLC' : r === 1 && o.arabic ? 'راتب شهر نوفمبر' : r === 2 ? 'REFUND CARREFOUR' : 'INWARD REMITTANCE Zephyr Stationers';
      const category = /SALARY|راتب/.test(description) ? 'salary' : null;
      rows.push({ date, description, amount, kind, category, cardPayment: false });
    }
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface Period {
  from: string;
  to: string;
}

export function randomPeriod(rng: Rng, crossYear = false): Period {
  const year = rng.int(2025, 2026);
  const from = crossYear ? `${year}-12-${p2(rng.int(1, 28))}` : `${year}-${p2(rng.int(1, 12))}-${p2(rng.int(1, 28))}`;
  return { from, to: addDaysISO(from, rng.int(12, 62)) };
}

/** Oldest-first -> optionally newest-first (the whole file reversed, including rows on one day). */
export const orderRows = <T>(rows: T[], newestFirst: boolean): T[] => (newestFirst ? [...rows].reverse() : rows);

// ---- Running balances ----

export interface WithBalance extends TruthRow {
  balance: number;
}

/** Opening balance big enough that the account never goes below zero. */
export function withBalances(rng: Rng, rows: TruthRow[]): { rows: WithBalance[]; opening: number; closing: number } {
  const costs = rows.filter((r) => r.kind === 'cost').reduce((a, r) => a + r.amount, 0);
  const opening = costs + rng.int(0, 3_000_000);
  let bal = opening;
  const out = rows.map((r) => {
    bal += r.kind === 'income' ? r.amount : -r.amount;
    return { ...r, balance: bal };
  });
  return { rows: out, opening, closing: bal };
}

// ---- Plain text / PDF-like statements ----

export type BankLayout = 'amt-bal' | 'crdr-bal' | 'three-col' | 'minus-bal' | 'crdr-nobal' | 'minus-crdr-nobal';
export type CardLayout = 'cr-marker' | 'minus-payments' | 'paren-payments' | 'dr-cr' | 'all-minus' | 'all-minus-trailing' | 'all-paren';
type Ccy = 'none' | 'prefix' | 'prefix-attached' | 'suffix';

const wrapCcy = (amount: string, ccy: Ccy) =>
  ccy === 'prefix' ? `AED ${amount}` : ccy === 'prefix-attached' ? `AED${amount}` : ccy === 'suffix' ? `${amount} AED` : amount;

const crdr = (rng: Rng, kind: Kind, upper: boolean) => (kind === 'income' ? (upper ? 'CR' : 'Cr') : upper ? 'DR' : 'Dr');

interface TextCommon {
  style: DateStyle;
  secondDate: boolean;
  arabic: boolean;
  thousands: boolean;
  ccy: Ccy;
}

function pickCommon(rng: Rng, allowYearless = true, markers = false): TextCommon {
  const styles: DateStyle[] = [...FULL_STYLES, ...(allowYearless ? (['dm', 'dmmm'] as DateStyle[]) : [])];
  return {
    style: rng.pick(styles),
    secondDate: rng.chance(0.25),
    arabic: rng.chance(0.2),
    thousands: rng.chance(0.8),
    ccy: rng.pick((markers ? ['none', 'none', 'prefix', 'prefix-attached'] : ['none', 'none', 'prefix', 'prefix-attached', 'suffix']) as Ccy[]),
  };
}

function periodLine(rng: Rng, p: Period, arabic: boolean) {
  const style = rng.pick(['dmy-pad', 'dmmmy', 'dmy', 'dmmmy-dash'] as DateStyle[]);
  const line = `${rng.pick(['Statement Period', 'Statement Period:', 'Period'])} ${fmtDate(p.from, style)} ${rng.pick(['to', '-', 'to'])} ${fmtDate(p.to, style)}`;
  return arabic ? arabicDigitsOnly(line) : line;
}

function datePart(rng: Rng, c: TextCommon, date: string): string {
  let s = fmtDate(date, c.style);
  if (c.secondDate) s += ` ${fmtDate(addDaysISO(date, rng.int(0, 1)), c.style)}`;
  return c.arabic ? arabicDigitsOnly(s) : s;
}

const amt = (c: TextCommon, fils: number) => wrapCcy(money(fils, c.thousands, c.arabic), c.ccy);

type Sign = 'minus' | 'plus' | 'paren' | 'trail' | '';
/** A signed amount with the currency marker where banks put it ("AED -45.00", "-AED45.00", "-45.00 AED", "(45.00)", "45.00-"). */
function signed(c: TextCommon, fils: number, sign: Sign): string {
  const core = money(fils, c.thousands, c.arabic);
  const mark = sign === 'minus' ? '-' : sign === 'plus' ? '+' : '';
  switch (c.ccy) {
    case 'prefix':
      return sign === 'paren' ? `AED (${core})` : sign === 'trail' ? `AED ${core}-` : `AED ${mark}${core}`;
    case 'prefix-attached':
      return sign === 'paren' ? `(AED${core})` : sign === 'trail' ? `AED${core}-` : `${mark}AED${core}`;
    case 'suffix':
      return sign === 'paren' ? `(${core}) AED` : sign === 'trail' ? `${core}- AED` : `${mark}${core} AED`;
    default:
      return sign === 'paren' ? `(${core})` : sign === 'trail' ? `${core}-` : `${mark}${core}`;
  }
}

function pageNoise(rng: Rng, lines: string[], rowLines: string[]) {
  // Interleave blank lines and page footers between rows.
  for (const l of rowLines) {
    lines.push(l);
    if (rng.chance(0.06)) lines.push('');
    if (rng.chance(0.04)) lines.push('Page 1 of 2');
  }
}

/** Bank account statement text as extracted from a PDF. */
export function genBankText(seed: number, forceLayout?: BankLayout): GenStatement {
  const rng = new Rng(seed);
  const layout: BankLayout = forceLayout ?? rng.pick(['amt-bal', 'crdr-bal', 'three-col', 'minus-bal', 'crdr-nobal', 'minus-crdr-nobal']);
  const c = pickCommon(rng, true, layout === 'crdr-bal' || layout === 'crdr-nobal' || layout === 'minus-crdr-nobal');
  const period = randomPeriod(rng, rng.chance(0.15));
  const base = makeRows(rng, { count: rng.int(1, 60), ...period, incomeShare: 0.25, arabic: c.arabic || rng.chance(0.2), refs: true });
  const hasBalance = layout === 'amt-bal' || layout === 'crdr-bal' || layout === 'three-col' || layout === 'minus-bal';
  const bal = withBalances(rng, base);
  const newestFirst = rng.chance(0.5);
  const ordered = orderRows(bal.rows, newestFirst);
  const plus = rng.chance(0.5);

  const rowLines = ordered.map((r) => {
    const a = (f: number) => amt(c, f);
    const d = datePart(rng, c, r.date);
    const cr = rng.chance(0.5);
    const b = (extra = '') => `${a(r.balance)}${extra}`;
    let tail: string;
    switch (layout) {
      case 'amt-bal':
        tail = `${a(r.amount)} ${b()}`;
        break;
      case 'crdr-bal':
        tail = `${a(r.amount)} ${crdr(rng, r.kind, cr)} ${b()} ${cr ? 'CR' : 'Cr'}`;
        break;
      case 'three-col':
        tail = r.kind === 'cost' ? `${a(r.amount)} ${a(0)} ${b()}` : `${a(0)} ${a(r.amount)} ${b()}`;
        break;
      case 'minus-bal':
        tail = `${signed(c, r.amount, r.kind === 'cost' ? 'minus' : plus ? 'plus' : '')} ${b()}`;
        break;
      case 'crdr-nobal':
        tail = `${a(r.amount)} ${crdr(rng, r.kind, cr)}`;
        break;
      case 'minus-crdr-nobal':
        tail = r.kind === 'cost' ? signed(c, r.amount, 'minus') : `${a(r.amount)} ${crdr(rng, 'income', cr)}`;
        break;
    }
    return `${d} ${r.description} ${tail}`;
  });

  const lines: string[] = ['EXAMPLE BANK PJSC', 'Account Statement', 'Account Number: 0123 4567 8901 2345', periodLine(rng, period, c.arabic), 'Currency: AED', ''];
  lines.push(layout === 'three-col' ? 'Date Description Debit Credit Balance' : 'Date Description Amount Balance');
  const opening = hasBalance ? `Opening Balance ${amt({ ...c, ccy: 'none' }, bal.opening)}` : null;
  if (opening && !(newestFirst && rng.chance(0.5))) lines.push(opening);
  pageNoise(rng, lines, rowLines);
  if (opening && lines[lines.length - 1] !== opening && !lines.includes(opening)) lines.push(opening);
  if (hasBalance) lines.push(`Closing Balance ${amt({ ...c, ccy: 'none' }, bal.closing)}`);
  lines.push('Customer Care 600 000000');
  // Newest first: the oldest row has no older balance to compare with, so the parser flags it (see 'known parser bugs').
  const allowedProblems = newestFirst && (layout === 'amt-bal' || layout === 'minus-bal') ? [/could not be told apart/] : undefined;
  return { name: `bank-text/${layout}/${c.style}${c.arabic ? '/ar' : ''}${newestFirst ? '/newest-first' : ''}`, seed, input: lines.join('\n'), truth: ordered, allowedProblems };
}

/** Credit card statement text. */
export function genCardText(seed: number, forceLayout?: CardLayout): GenStatement {
  const rng = new Rng(seed);
  const layout: CardLayout =
    forceLayout ?? rng.pick(['cr-marker', 'minus-payments', 'paren-payments', 'dr-cr', 'all-minus', 'all-minus-trailing', 'all-paren']);
  const c = pickCommon(rng, true, layout !== 'minus-payments' && layout !== 'paren-payments');
  const period = randomPeriod(rng, rng.chance(0.15));
  const count = rng.int(1, 60);
  // Minus-marked payments must stay a clear minority (charges are the unsigned majority).
  const maxIncome = layout === 'minus-payments' || layout === 'paren-payments' ? Math.floor((count - 1) / 2) : count - 1;
  const base = makeRows(rng, { count, ...period, incomeShare: 0, cardPayments: rng.int(0, Math.min(maxIncome, 12)), arabic: c.arabic || rng.chance(0.2), refs: true });
  const newestFirst = rng.chance(0.5);
  const ordered = orderRows(base, newestFirst);
  const crUpper = rng.chance(0.5);
  const rowLines = ordered.map((r) => {
    const a = amt(c, r.amount);
    const d = datePart(rng, c, r.date);
    let tail: string;
    const income = r.kind === 'income';
    switch (layout) {
      case 'cr-marker':
        tail = income ? `${a} ${crdr(rng, 'income', crUpper)}` : a;
        break;
      case 'minus-payments':
        tail = income ? signed(c, r.amount, 'minus') : a;
        break;
      case 'paren-payments':
        tail = income ? signed(c, r.amount, 'paren') : a;
        break;
      case 'dr-cr':
        tail = `${a} ${crdr(rng, r.kind, crUpper)}`;
        break;
      case 'all-minus':
        tail = income ? `${a} ${crdr(rng, 'income', crUpper)}` : signed(c, r.amount, 'minus');
        break;
      case 'all-minus-trailing':
        tail = income ? `${a} ${crdr(rng, 'income', crUpper)}` : signed(c, r.amount, 'trail');
        break;
      case 'all-paren':
        tail = income ? `${a} ${crdr(rng, 'income', crUpper)}` : signed(c, r.amount, 'paren');
        break;
    }
    return `${d} ${r.description} ${tail}`;
  });
  const lines = [
    'EXAMPLE BANK Credit Card Statement',
    'Card Number: 4111 11XX XXXX 5678',
    periodLine(rng, period, c.arabic),
    'Minimum payment due 150.00',
    '',
    c.secondDate ? 'Trans Date Post Date Description Amount (AED)' : 'Date Description Amount (AED)',
  ];
  pageNoise(rng, lines, rowLines);
  lines.push('Total amount due 4,321.00');
  return { name: `card-text/${layout}/${c.style}${newestFirst ? '/newest-first' : ''}`, seed, input: lines.join('\n'), truth: ordered };
}

// ---- CSV ----

const csvCell = (s: string, delimiter: string) => (s.includes(delimiter) || s.includes('"') || s.includes(',') || s.includes('٬') ? `"${s.replace(/"/g, '""')}"` : s);
const csvLine = (cells: string[], delimiter: string) => cells.map((s) => csvCell(s, delimiter)).join(delimiter);

function csvDate(rng: Rng, style: DateStyle, date: string) {
  return fmtDate(date, style);
}

const CSV_STYLES: DateStyle[] = ['dmy', 'dmy-pad', 'dmy-yy', 'dmmmy', 'dmmmy-dash', 'iso', 'iso-time'];

interface CsvCommon {
  delimiter: string;
  style: DateStyle;
  thousands: boolean;
  arabic: boolean;
}
const csvCommon = (rng: Rng): CsvCommon => ({
  delimiter: rng.pick([',', ',', ';', '\t']),
  style: rng.pick(CSV_STYLES),
  thousands: rng.chance(0.5),
  arabic: rng.chance(0.15),
});

const preamble = (rng: Rng, d: string, lines: string[]) => {
  const pool = [
    ['Account Statement'],
    ['Account Number', 'XXXX-XXXX-4821'],
    ['Customer', 'ACME TRADING'],
    ['Currency', 'AED'],
    ['Generated', '2026-11-30'],
    [],
  ];
  const n = rng.int(0, 5);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(csvLine(rng.pick(pool), d));
  return [...lines.slice(0, 0), ...out];
};

const dig = (c: CsvCommon, s: string) => (c.arabic ? arabicDigitsOnly(s) : s);

/** Bank CSV with one signed amount column. */
export function genBankCsvSigned(seed: number): GenStatement {
  const rng = new Rng(seed);
  const c = csvCommon(rng);
  const period = randomPeriod(rng, rng.chance(0.15));
  let base = makeRows(rng, { count: rng.int(2, 60), ...period, incomeShare: 0.3, arabic: rng.chance(0.2), refs: true });
  if (!base.some((r) => r.kind === 'cost')) base = base.map((r, i) => (i === 0 ? { ...r, kind: 'cost' as Kind, description: 'CARREFOUR', category: 'groceries' } : r));
  const withBal = rng.chance(0.4);
  const bal = withBalances(rng, base);
  const newestFirst = rng.chance(0.5);
  const rows = orderRows(bal.rows, newestFirst);
  const plus = rng.chance(0.4);
  const variant = rng.int(0, 2);
  const header =
    variant === 0 ? ['Date', 'Description', 'Amount'] : variant === 1 ? ['Transaction Date', 'Narration', 'Amount (AED)'] : ['Txn Date', 'Value Date', 'Transaction Details', 'Amount'];
  if (withBal) header.push('Balance');
  const lines = preamble(rng, c.delimiter, []);
  lines.push(csvLine(header, c.delimiter));
  for (const r of rows) {
    const date = dig(c, csvDate(rng, c.style, r.date));
    const a = `${r.kind === 'cost' ? '-' : plus ? '+' : ''}${money(r.amount, c.thousands, c.arabic)}`;
    const cells = variant === 2 ? [date, dig(c, csvDate(rng, c.style, r.date)), r.description, a] : [date, r.description, a];
    if (withBal) cells.push(money(r.balance, c.thousands, c.arabic));
    lines.push(csvLine(cells, c.delimiter));
  }
  if (rng.chance(0.3)) {
    const cells = header.map(() => '');
    cells[variant === 2 ? 2 : 1] = 'Closing Balance';
    cells[header.length - 1] = money(bal.closing, true);
    lines.push(csvLine(cells, c.delimiter));
  }
  return { name: `bank-csv-signed/${c.style}/${JSON.stringify(c.delimiter)}${c.thousands ? '/thousands' : ''}${withBal ? '/balance' : ''}`, seed, input: lines.join(rng.pick(['\n', '\r\n'])), truth: rows };
}

/** Bank CSV with debit and credit columns, or a Cr/Dr (type) column. */
export function genBankCsvColumns(seed: number): GenStatement {
  const rng = new Rng(seed);
  const c = csvCommon(rng);
  const period = randomPeriod(rng, rng.chance(0.15));
  const base = makeRows(rng, { count: rng.int(1, 60), ...period, incomeShare: 0.3, arabic: rng.chance(0.2), refs: true });
  const bal = withBalances(rng, base);
  const newestFirst = rng.chance(0.5);
  const rows = orderRows(bal.rows, newestFirst);
  const withBal = rng.chance(0.6);
  const layout = rng.pick(['debit-credit', 'debit-credit', 'withdrawals-deposits', 'paid-out-in', 'type-column', 'drcr-column'] as const);
  const zero = rng.pick(['', '', '0.00']);
  const headers = {
    'debit-credit': ['Date', 'Description', 'Debit', 'Credit'],
    'withdrawals-deposits': ['Transaction Date', 'Details', 'Withdrawals', 'Deposits'],
    'paid-out-in': ['Date', 'Narration', 'Paid out', 'Paid in'],
    'type-column': ['Date', 'Description', 'Amount', 'Type'],
    'drcr-column': ['Date', 'Description', 'Amount', 'DR/CR'],
  }[layout];
  const header = [...headers];
  if (withBal) header.push('Balance');
  const lines = preamble(rng, c.delimiter, []);
  lines.push(csvLine(header, c.delimiter));
  const upper = rng.chance(0.5);
  for (const r of rows) {
    const date = dig(c, csvDate(rng, c.style, r.date));
    const m = money(r.amount, c.thousands, c.arabic);
    let cells: string[];
    if (layout === 'type-column') cells = [date, r.description, m, r.kind === 'cost' ? (upper ? 'Debit' : 'debit') : upper ? 'Credit' : 'credit'];
    else if (layout === 'drcr-column') cells = [date, r.description, m, r.kind === 'cost' ? (upper ? 'DR' : 'Dr') : upper ? 'CR' : 'Cr'];
    else cells = r.kind === 'cost' ? [date, r.description, m, zero] : [date, r.description, zero, m];
    if (withBal) cells.push(money(r.balance, c.thousands, c.arabic));
    lines.push(csvLine(cells, c.delimiter));
  }
  if (withBal && rng.chance(0.4)) {
    const cells = header.map(() => '');
    cells[1] = 'Opening Balance';
    cells[header.length - 1] = money(bal.opening, true);
    lines.push(csvLine(cells, c.delimiter));
  }
  return { name: `bank-csv-columns/${layout}/${c.style}${withBal ? '/balance' : ''}`, seed, input: lines.join('\n'), truth: rows };
}

/**
 * Card CSV. 'charges-positive': purchases positive, payments negative (a minority).
 * 'purchases-negative': every purchase negative, payments positive (a minority, or none).
 */
export function genCardCsv(seed: number, variant?: 'charges-positive' | 'purchases-negative'): GenStatement {
  const rng = new Rng(seed);
  const c = csvCommon(rng);
  const v = variant ?? rng.pick(['charges-positive', 'purchases-negative'] as const);
  const period = randomPeriod(rng, rng.chance(0.15));
  const count = rng.int(3, 60); // two rows, one of each sign, would be a tie
  // Strict minority, so the sign convention is decidable from the counts.
  const payments = rng.int(1, Math.max(1, Math.floor((count - 1) / 2)));
  const base = makeRows(rng, { count, ...period, incomeShare: 0, cardPayments: Math.min(payments, count - 1), arabic: rng.chance(0.2), refs: true });
  const rows = orderRows(base, rng.chance(0.5));
  const header = rng.pick([['Date', 'Description', 'Amount'], ['Transaction Date', 'Merchant', 'Amount (AED)'], ['Posting Date', 'Details', 'Amount']]);
  const lines = [csvLine(['Credit Card Statement'], c.delimiter), csvLine(['Card Number', '4111 11XX XXXX 5678'], c.delimiter)];
  if (rng.chance(0.5)) lines.push(csvLine(['Credit limit', money(5_000_000, true)], c.delimiter));
  lines.push(csvLine(header, c.delimiter));
  for (const r of rows) {
    const sign = v === 'charges-positive' ? (r.kind === 'income' ? '-' : '') : r.kind === 'cost' ? '-' : '';
    lines.push(csvLine([dig(c, csvDate(rng, c.style, r.date)), r.description, `${sign}${money(r.amount, c.thousands, c.arabic)}`], c.delimiter));
  }
  return { name: `card-csv/${v}/${c.style}`, seed, input: lines.join('\n'), truth: rows };
}

// ---- XLSX ----

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const colName = (i: number) => String.fromCharCode(65 + i);
type Cell = { t: 'str'; v: string } | { t: 'num'; v: number | string; style?: number };
const cellXml = (ref: string, c: Cell) => (c.t === 'str' ? `<c r="${ref}" t="inlineStr"><is><t>${esc(c.v)}</t></is></c>` : `<c r="${ref}"${c.style !== undefined ? ` s="${c.style}"` : ''}><v>${c.v}</v></c>`);
const STYLES = `<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mmm\\-yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>`;

function workbook(rows: Cell[][]): Uint8Array {
  const sheetRows = rows.map((r, i) => `<row r="${i + 1}">${r.map((c, j) => cellXml(`${colName(j)}${i + 1}`, c)).join('')}</row>`).join('');
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8(`<workbook ${NS}><sheets><sheet name="Statement" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0"?><worksheet ${NS}><sheetData>${sheetRows}</sheetData></worksheet>`),
    'xl/styles.xml': strToU8(STYLES),
  });
}

/** Excel workbook: bank (signed or debit/credit columns) or card (charges positive, payments negative). */
export function genXlsx(seed: number): GenStatement<Uint8Array> {
  const rng = new Rng(seed);
  const layout = rng.pick(['signed', 'debit-credit', 'card'] as const);
  const period = randomPeriod(rng, rng.chance(0.15));
  const count = layout === 'card' ? rng.int(3, 60) : rng.int(1, 60);
  const base =
    layout === 'card'
      ? makeRows(rng, { count, ...period, incomeShare: 0, cardPayments: rng.int(1, Math.max(1, Math.floor((count - 1) / 2))), arabic: rng.chance(0.2), refs: true })
      : makeRows(rng, { count, ...period, incomeShare: 0.3, arabic: rng.chance(0.2), refs: true });
  let rowsIn = base;
  if (layout === 'signed' && !rowsIn.some((r) => r.kind === 'cost')) rowsIn = rowsIn.map((r, i) => (i === 0 ? { ...r, kind: 'cost' as Kind, description: 'IKEA', category: 'shopping' } : r));
  const bal = withBalances(rng, rowsIn);
  const rows = orderRows(bal.rows, rng.chance(0.5));
  const dateKind = rng.pick(['styled', 'styled-custom', 'text', 'serial'] as const);
  const textStyle = rng.pick(['dmy-pad', 'dmmmy', 'iso'] as DateStyle[]);
  const amountAsText = rng.chance(0.25);
  const withBal = layout !== 'card' && rng.chance(0.5);
  const header = layout === 'debit-credit' ? ['Date', 'Description', 'Debit', 'Credit'] : ['Date', 'Description', 'Amount'];
  if (withBal) header.push('Balance');
  const out: Cell[][] = [];
  if (layout === 'card') out.push([{ t: 'str', v: 'Credit Card Statement' }]);
  if (rng.chance(0.5)) out.push([{ t: 'str', v: 'Account Statement' }], [{ t: 'str', v: 'Currency: AED' }]);
  out.push(header.map((v) => ({ t: 'str', v })));
  const num = (fils: number, sign = 1): Cell =>
    amountAsText ? { t: 'str', v: `${sign < 0 ? '-' : ''}${money(fils, true)}` } : { t: 'num', v: `${sign < 0 ? '-' : ''}${fils / 100}` };
  for (const r of rows) {
    const date: Cell =
      dateKind === 'styled'
        ? { t: 'num', v: excelSerial(r.date), style: 1 }
        : dateKind === 'styled-custom'
          ? { t: 'num', v: excelSerial(r.date), style: 2 }
          : dateKind === 'serial'
            ? { t: 'num', v: excelSerial(r.date) }
            : { t: 'str', v: fmtDate(r.date, textStyle) };
    const line: Cell[] = [date, { t: 'str', v: r.description }];
    if (layout === 'debit-credit') {
      if (r.kind === 'cost') line.push(num(r.amount), { t: 'str', v: '' });
      else line.push({ t: 'str', v: '' }, num(r.amount));
    } else if (layout === 'signed') line.push(num(r.amount, r.kind === 'cost' ? -1 : 1));
    else line.push(num(r.amount, r.kind === 'income' ? -1 : 1));
    if (withBal) line.push({ t: 'num', v: r.balance / 100 });
    out.push(line);
  }
  return { name: `xlsx/${layout}/${dateKind}${amountAsText ? '/text-amounts' : ''}`, seed, input: workbook(out), truth: rows };
}

// ---- OFX ----

/** OFX in SGML (no closing tags) or XML style; costs negative, money in positive. */
export function genOfx(seed: number): GenStatement {
  const rng = new Rng(seed);
  const xml = rng.chance(0.5);
  const period = randomPeriod(rng);
  const base = makeRows(rng, { count: rng.int(1, 60), ...period, incomeShare: 0.3, arabic: rng.chance(0.2), refs: true });
  const rows = orderRows(base, rng.chance(0.5));
  const truth: TruthRow[] = [];
  const blocks = rows.map((r, i) => {
    const memo = rng.chance(0.3) ? rng.pick(['Purchase', 'POS transaction', 'Online']) : '';
    truth.push(memo ? { ...r, description: `${r.description} - ${memo}` } : r);
    const sign = r.kind === 'cost' ? '-' : '';
    const t = (name: string, v: string) => (xml ? `<${name}>${v}</${name}>` : `<${name}>${v}`);
    const stamp = `${r.date.replace(/-/g, '')}${rng.pick(['', '120000', '000000[+4:GST]'])}`;
    return [
      '<STMTTRN>',
      t('TRNTYPE', r.kind === 'cost' ? 'DEBIT' : 'CREDIT'),
      t('DTPOSTED', stamp),
      t('TRNAMT', `${sign}${(r.amount / 100).toFixed(2)}`),
      t('FITID', String(1000 + i)),
      t('NAME', esc(r.description)),
      ...(memo ? [t('MEMO', memo)] : []),
      '</STMTTRN>',
    ].join('\n');
  });
  const text = [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    '',
    '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>',
    '<CURDEF>AED',
    '<BANKACCTFROM><ACCTID>0123456789012345</ACCTID></BANKACCTFROM>',
    '<BANKTRANLIST>',
    `<DTSTART>${period.from.replace(/-/g, '')}`,
    `<DTEND>${period.to.replace(/-/g, '')}`,
    ...blocks,
    '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
  ].join('\n');
  return { name: `ofx/${xml ? 'xml' : 'sgml'}`, seed, input: text, truth };
}

// ---- Card statements with a running balance (the balance is what is OWED: it rises with spending) ----

/** Owed balance after each row (oldest first); starts high enough never to go below zero. */
function owedBalances(rng: Rng, rows: TruthRow[]) {
  const paid = rows.filter((r) => r.kind === 'income').reduce((a, r) => a + r.amount, 0);
  const opening = paid + rng.int(0, 3_000_000);
  let bal = opening;
  return {
    opening,
    rows: rows.map((r) => {
      bal += r.kind === 'cost' ? r.amount : -r.amount;
      return { ...r, balance: bal };
    }),
  };
}

/** Card statement text: unsigned amounts plus the amount owed after each row. */
export function genCardTextBalance(seed: number): GenStatement {
  const rng = new Rng(seed);
  const c = pickCommon(rng);
  const period = randomPeriod(rng, rng.chance(0.15));
  const count = rng.int(1, 60);
  const base = makeRows(rng, { count, ...period, incomeShare: 0, cardPayments: rng.int(0, Math.min(count - 1, 12)), arabic: rng.chance(0.2), refs: true });
  // The oldest row's direction can only come from an opening balance, which the parser does not use for it when newest first
  // (see 'known parser bugs'), so the generated oldest row is a purchase.
  if (base[0].kind === 'income') base[0] = { ...base[0], kind: 'cost', description: 'CARREFOUR', category: 'groceries', cardPayment: false };
  const owed = owedBalances(rng, base);
  const newestFirst = rng.chance(0.5);
  const ordered = orderRows(owed.rows, newestFirst);
  const rowLines = ordered.map((r) => `${datePart(rng, c, r.date)} ${r.description} ${amt(c, r.amount)} ${amt(c, r.balance)}`);
  const lines = ['EXAMPLE BANK Credit Card Statement', 'Card Number: 4111 11XX XXXX 5678', periodLine(rng, period, c.arabic), 'Minimum payment due 150.00', '', 'Date Description Amount Balance'];
  const opening = `Previous Balance ${amt({ ...c, ccy: 'none' }, owed.opening)}`;
  if (!newestFirst || rng.chance(0.5)) lines.push(opening);
  pageNoise(rng, lines, rowLines);
  if (!lines.includes(opening)) lines.push(opening);
  const allowedProblems = newestFirst ? [/could not be told apart/] : undefined;
  return { name: `card-text-balance/${c.style}${newestFirst ? '/newest-first' : ''}`, seed, input: lines.join('\n'), truth: ordered, allowedProblems };
}

/** Card CSV with an Amount column (unsigned, or signed the card way) and an owed-balance column. */
export function genCardCsvBalance(seed: number): GenStatement {
  const rng = new Rng(seed);
  const c = csvCommon(rng);
  const period = randomPeriod(rng);
  const count = rng.int(3, 60);
  const base = makeRows(rng, { count, ...period, incomeShare: 0, cardPayments: rng.int(1, Math.max(1, Math.floor((count - 1) / 2))), refs: true });
  const signedAmounts = rng.chance(0.5); // charges positive, payments negative
  // Unsigned amounts: the first row's direction can't be known without an opening balance, so it is a purchase.
  if (!signedAmounts && base[0].kind === 'income') base[0] = { ...base[0], kind: 'cost', description: 'CARREFOUR', category: 'groceries', cardPayment: false };
  const owed = owedBalances(rng, base);
  const rows = orderRows(owed.rows, rng.chance(0.5));
  const lines = [csvLine(['Credit Card Statement'], c.delimiter), csvLine(['Credit limit', money(5_000_000, true)], c.delimiter), csvLine(['Date', 'Description', 'Amount', 'Balance'], c.delimiter)];
  for (const r of rows) {
    const sign = signedAmounts && r.kind === 'income' ? '-' : '';
    lines.push(csvLine([csvDate(rng, c.style, r.date), r.description, `${sign}${money(r.amount, c.thousands)}`, money(r.balance, c.thousands)], c.delimiter));
  }
  const allowedProblems = signedAmounts ? undefined : [/no minus sign|do not match|does not match/];
  return { name: `card-csv-balance/${signedAmounts ? 'signed' : 'unsigned'}/${c.style}`, seed, input: lines.join('\n'), truth: rows, allowedProblems };
}
