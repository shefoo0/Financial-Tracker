import { fixtures } from '../fixtures-loader';
import { guessCsvMapping, parseCsv, readCsvTable } from '../csv';

const F = fixtures('csv');

describe('readCsvTable', () => {
  it('handles quotes, escaped quotes, newlines inside quotes and sep= lines', () => {
    const t = readCsvTable('sep=;\r\na;"b;c";"d ""q"" e"\r\n"x\ny";2;3\r\n');
    expect(t.delimiter).toBe(';');
    expect(t.rows).toEqual([['a', 'b;c', 'd "q" e'], ['x\ny', '2', '3']]);
  });
  it('detects tab and ignores commas inside quotes', () => {
    expect(readCsvTable('a\tb,c\n1\t"2,5"\n').delimiter).toBe('\t');
  });
});

describe('guessCsvMapping', () => {
  it('finds debit/credit layout', () => {
    expect(guessCsvMapping(F.CSV_DEBIT_CREDIT)).toMatchObject({ delimiter: ',', headerRow: 0, date: 0, description: 1, debit: 2, credit: 3, balance: 4, amount: null });
  });
  it('skips a preamble, prefers the transaction date over the value date', () => {
    const m = guessCsvMapping(F.CSV_SIGNED_SEMICOLON);
    expect(m).toMatchObject({ delimiter: ';', date: 0, description: 2, amount: 3, balance: 4 });
    expect(m.headerRow).toBeGreaterThan(0);
  });
  it('guesses columns without a header', () => {
    expect(guessCsvMapping(F.CSV_TAB_NO_HEADER)).toMatchObject({ delimiter: '\t', headerRow: -1, date: 0, description: 1, amount: 2 });
  });
  it('detects a direction column only when its values are Cr/Dr words', () => {
    expect(guessCsvMapping(F.CSV_TYPE_COLUMN)).toMatchObject({ date: 0, description: 1, amount: 2, direction: 3 });
  });
  it('detects month-first dates only with proof', () => {
    expect(guessCsvMapping(F.CSV_MONTH_FIRST).dateOrder).toBe('mdy');
    expect(guessCsvMapping(F.CSV_DEBIT_CREDIT).dateOrder).toBe('dmy');
  });
  it('returns an empty mapping for empty text', () => {
    expect(guessCsvMapping('')).toMatchObject({ date: null, amount: null });
  });
});

describe('parseCsv', () => {
  it('reads debit and credit columns, quoted commas and thousands', () => {
    const r = parseCsv(F.CSV_DEBIT_CREDIT);
    expect(r.source).toBe('csv');
    expect(r.rows.map((x) => [x.date, x.kind, x.amount, x.balance])).toEqual([
      ['2026-11-03', 'income', 1_800_000, 3_000_000],
      ['2026-11-05', 'cost', 31_245, 2_968_755],
      ['2026-11-07', 'cost', 125_000, 2_843_755],
      ['2026-11-21', 'cost', 4_500, 2_839_255],
    ]);
    expect(r.rows[1].description).toBe('POS-CARREFOUR MALL OF THE EMIRATES, DUBAI');
    expect(r.rows[3].description).toBe('CAREEM RIDE "AIRPORT"');
    expect(r.period).toEqual({ from: '2026-11-03', to: '2026-11-21' });
    expect(r.problems).toEqual([]);
    expect(r.rows.every((x) => x.confidence === 1)).toBe(true);
  });
  it('reads signed and parenthesised amounts, semicolons, month names and AED in the header', () => {
    const r = parseCsv(F.CSV_SIGNED_SEMICOLON);
    expect(r.currency).toBe('AED');
    expect(r.rows.map((x) => [x.date, x.kind, x.amount])).toEqual([
      ['2026-11-02', 'cost', 18_000],
      ['2026-11-09', 'income', 200_000],
      ['2026-11-12', 'cost', 23_650],
      ['2026-11-15', 'cost', 400],
    ]);
    expect(r.rows[0].balance).toBe(482_000);
  });
  it('reads Cr/Dr suffixes in a tab file without a header', () => {
    const r = parseCsv(F.CSV_TAB_NO_HEADER);
    expect(r.rows.map((x) => [x.date, x.description, x.kind, x.amount])).toEqual([
      ['2026-11-21', 'TALABAT DUBAI', 'cost', 8_990],
      ['2026-11-22', 'SALARY NOV', 'income', 1_800_000],
      ['2026-11-23', 'NETFLIX.COM', 'cost', 5_500],
    ]);
  });
  it('uses a direction column, BOM and CRLF', () => {
    const r = parseCsv(F.CSV_TYPE_COLUMN);
    expect(r.rows.map((x) => [x.kind, x.amount])).toEqual([['cost', 30_000], ['income', 7_550]]);
  });
  it('reads month-first dates and says so', () => {
    const r = parseCsv(F.CSV_MONTH_FIRST);
    expect(r.rows.map((x) => x.date)).toEqual(['2026-11-21', '2026-11-03']);
    expect(r.problems.join(' ')).toMatch(/month-first/);
  });
  it('flags unsigned amounts with low confidence instead of guessing silently', () => {
    const r = parseCsv(F.CSV_UNSIGNED);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].confidence).toBeLessThan(0.7);
    expect(r.rows[0].warnings[0]).toMatch(/money in or out/);
    expect(r.problems.join(' ')).toMatch(/no minus sign/);
  });
  it('skips bad rows and reports them', () => {
    const r = parseCsv(F.CSV_BAD_ROWS);
    expect(r.rows).toHaveLength(1);
    expect(r.problems.join(' ')).toMatch(/1 row skipped because the date/);
    expect(r.problems.join(' ')).toMatch(/amount could not be read/);
  });
  it('accepts a user mapping, including swapped columns', () => {
    const text = 'a,b,c\n1500.00,SHOP,21/11/2026\n';
    const r = parseCsv(text, { delimiter: ',', headerRow: 0, date: 2, description: 1, amount: 0, debit: null, credit: null, balance: null, direction: null, dateOrder: 'dmy' });
    expect(r.rows[0]).toMatchObject({ date: '2026-11-21', description: 'SHOP', amount: 150_000 });
  });
  it('explains a missing date or amount column', () => {
    expect(parseCsv('Description,Amount\nA,5.00\n').problems[0]).toMatch(/date column/);
    expect(parseCsv('Date,Description\n21/11/2026,A\n').problems[0]).toMatch(/amount column/);
    expect(parseCsv('').problems[0]).toMatch(/empty/);
  });
  it('converts Excel serial dates with a warning', () => {
    const r = parseCsv('Date,Description,Debit\n46347,X,5.00\n');
    expect(r.rows[0].date).toBe('2026-11-21');
    expect(r.rows[0].confidence).toBeLessThan(1);
  });
  it('notes a non-AED currency', () => {
    const r = parseCsv('Date,Description,Amount (USD)\n21/11/2026,X,-5.00\n');
    expect(r.currency).toBe('USD');
    expect(r.problems.join(' ')).toMatch(/USD/);
  });
  it('flags a row with both debit and credit', () => {
    const r = parseCsv('Date,Description,Debit,Credit\n21/11/2026,X,5.00,3.00\n');
    expect(r.rows[0]).toMatchObject({ kind: 'cost', amount: 200 });
    expect(r.rows[0].confidence).toBeLessThan(0.7);
  });
});

describe('card export sign convention', () => {
  const head = 'Card statement\nDate,Description,Amount\n';
  it('positive = charge when the file is card-like and most rows are positive', () => {
    const r = parseCsv(`${head}01/11/2026,SHOP,100.00\n02/11/2026,CAFE,50.00\n03/11/2026,GROCER,70.00\n04/11/2026,PAYMENT THANK YOU,-200.00\n`);
    expect(r.rows.map((x) => x.kind)).toEqual(['cost', 'cost', 'cost', 'income']);
    expect(r.rows.every((x) => x.confidence === 1)).toBe(true);
  });
  it('keeps negative = spending for bank files', () => {
    const r = parseCsv('Date,Description,Amount\n01/11/2026,SHOP,-100.00\n02/11/2026,SALARY,500.00\n');
    expect(r.rows.map((x) => x.kind)).toEqual(['cost', 'income']);
  });
  it('warns and lowers confidence when a card file is mixed', () => {
    const r = parseCsv(`${head}01/11/2026,SHOP,100.00\n02/11/2026,CAFE,-50.00\n`);
    expect(r.rows[0].confidence).toBeLessThanOrEqual(0.6);
    expect(r.rows[0].warnings).toContain('Signs may be reversed — use Flip all if needed');
  });
});

describe('card CSV with a balance column (the balance is what is owed)', () => {
  it('reads unsigned purchases as spending and the payment as money in from the balance', () => {
    const csv = `Credit card statement,Card ending 4417\nDate,Description,Amount,Balance\n03/11/2026,CARREFOUR,250.00,1250.00\n05/11/2026,ENOC,100.00,1350.00\n10/11/2026,PAYMENT RECEIVED,1000.00,350.00\n15/11/2026,TALABAT,50.00,400.00`;
    const r = parseCsv(csv);
    expect(r.rows.map((x) => [x.description, x.kind])).toEqual([
      ['CARREFOUR', 'cost'],
      ['ENOC', 'cost'],
      ['PAYMENT RECEIVED', 'income'],
      ['TALABAT', 'cost'],
    ]);
  });
});

describe('card CSV with unsigned charges only', () => {
  it('reads charges as spending without a "check this" on every row; a payment line is money in', () => {
    const r = parseCsv('Credit card statement,Card ending 4417\nDate,Description,Amount\n03/11/2026,CARREFOUR,250.00\n05/11/2026,ENOC,100.00\n10/11/2026,PAYMENT THANK YOU,300.00\n');
    expect(r.rows.map((x) => [x.description, x.kind])).toEqual([['CARREFOUR', 'cost'], ['ENOC', 'cost'], ['PAYMENT THANK YOU', 'income']]);
    expect(r.rows.slice(0, 2).every((x) => x.confidence >= 0.7 && x.warnings.length === 0)).toBe(true);
    expect(r.problems).toEqual([]);
  });
});
