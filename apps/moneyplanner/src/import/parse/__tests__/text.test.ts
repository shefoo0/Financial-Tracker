import { fixtures } from '../fixtures-loader';
import { parseSmsText, parseStatementText } from '../text';

const S = fixtures('txt');
const M = fixtures('txt');

const opts = { today: '2026-12-20' };
const brief = (r: ReturnType<typeof parseStatementText>) => r.rows.map((x) => [x.date, x.kind, x.amount]);

describe('parseStatementText: bank account', () => {
  const r = parseStatementText(S.BANK_STATEMENT, opts);
  it('finds the header facts', () => {
    expect(r.source).toBe('text');
    expect(r.period).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(r.account).toBe('2345');
    expect(r.currency).toBe('AED');
  });
  it('reads rows, takes direction from the running balance and skips headers and footers', () => {
    expect(brief(r)).toEqual([
      ['2026-11-03', 'income', 1_800_000],
      ['2026-11-05', 'cost', 31_245],
      ['2026-11-07', 'cost', 125_000],
      ['2026-11-12', 'cost', 50_000],
    ]);
    expect(r.rows.map((x) => x.balance)).toEqual([2_300_000, 2_268_755, 2_143_755, 2_093_755]);
    expect(r.rows[1].description).toBe('POS CARREFOUR MOE DUBAI AE');
    expect(r.rows.every((x) => x.confidence === 1)).toBe(true);
    expect(r.problems).toEqual([]);
  });
});

describe('parseStatementText: newest first, DD MMM YYYY, Cr balances', () => {
  it('infers direction from the next (older) balance', () => {
    const r = parseStatementText(S.BANK_STATEMENT_DESC, opts);
    expect(brief(r)).toEqual([
      ['2026-11-28', 'cost', 6_200],
      ['2026-11-20', 'income', 200_000],
      ['2026-11-10', 'cost', 15_000],
    ]);
    expect(r.period).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
});

describe('parseStatementText: credit card', () => {
  const r = parseStatementText(S.CARD_STATEMENT, opts);
  it('treats unmarked as spending and CR as income, ignores the second date, infers years', () => {
    expect(r.account).toBe('5678');
    expect(r.period).toEqual({ from: '2026-11-16', to: '2026-12-15' });
    expect(brief(r).slice(0, 4)).toEqual([
      ['2026-11-16', 'cost', 8_990],
      ['2026-11-28', 'cost', 5_500],
      ['2026-11-30', 'income', 12_000],
      ['2026-12-02', 'income', 200_000],
    ]);
    expect(r.rows[0].description).toBe('TALABAT DUBAI AE');
    expect(r.rows[0].confidence).toBeGreaterThan(0.8);
  });
  it('warns about card payments and dates outside the period', () => {
    expect(r.rows[3].warnings.join(' ')).toMatch(/transfer or card payment/);
    const out = r.rows.find((x) => x.description.startsWith('NOT IN PERIOD'))!;
    expect(out.confidence).toBeLessThanOrEqual(0.6);
    expect(out.warnings.join(' ')).toMatch(/outside the statement period/);
  });
  it('puts a January date after a December period in the nearest year, with a warning', () => {
    const jan = r.rows.find((x) => x.description.startsWith('SALIK'))!;
    expect(jan.date).toBe("2027-01-05");
    expect(jan.warnings.join(' ')).toMatch(/outside/);
  });
});

describe('year rollover and leap days', () => {
  it('assigns Dec to the first year and Jan to the next', () => {
    const r = parseStatementText(S.ROLLOVER_STATEMENT, opts);
    expect(r.account).toBe('9876');
    expect(r.rows[0]).toMatchObject({ date: '2026-12-28', kind: 'income' });
    expect(r.rows[1]).toMatchObject({ date: '2027-01-03', kind: 'cost' });
    // 29 Feb exists in neither 2026 nor 2027.
    expect(r.rows).toHaveLength(2);
    expect(r.problems.join(' ')).toMatch(/not a real date/);
  });
  it('accepts Feb 29 in a leap year', () => {
    const r = parseStatementText(S.LEAP_STATEMENT, opts);
    expect(r.rows[0].date).toBe('2028-02-29');
  });
  it('rejects Feb 29 in a non-leap year', () => {
    const r = parseStatementText(S.NON_LEAP_STATEMENT, opts);
    expect(r.rows.map((x) => x.date)).toEqual(['2027-02-28']);
  });
  it('accepts an explicit 29/02/2028 and rejects 29/02/2027', () => {
    expect(parseStatementText('29/02/2028 X 5.00', opts).rows[0].date).toBe('2028-02-29');
    expect(parseStatementText('29/02/2027 X 5.00', opts).rows).toHaveLength(0);
  });
});

describe('OCR-ish text', () => {
  const r = parseStatementText(S.OCR_STATEMENT, { today: '2026-11-30' });
  it('copes with noise, O-for-0, wrapped descriptions and debit/credit/balance columns', () => {
    expect(brief(r)).toEqual([
      ['2026-11-02', 'cost', 5_000],
      ['2026-11-04', 'cost', 20_000],
      ['2026-11-06', 'income', 500_000],
      ['2026-11-10', 'cost', 150_000],
    ]);
    expect(r.rows[1].description).toBe('ENOC STATION 7 SHEIKH ZAYED ROAD');
  });
  it('lowers confidence where characters were corrected', () => {
    expect(r.rows[0].confidence).toBeLessThanOrEqual(0.6);
    expect(r.rows[0].warnings.join(' ')).toMatch(/corrected from a scan/);
  });
  it('reports lines it could not read', () => {
    expect(r.problems.join(' ')).toMatch(/1 line starts with a date but no amount/);
  });
});

describe('never guesses silently', () => {
  it('marks an unprovable direction on an account statement', () => {
    const r = parseStatementText(S.AMBIGUOUS_STATEMENT, opts);
    expect(r.rows[0]).toMatchObject({ kind: 'cost', confidence: 0.5 });
    expect(r.rows[0].warnings[0]).toMatch(/money in or out/);
    expect(r.problems.join(' ')).toMatch(/could not be told apart/);
  });
  it('warns when the year is assumed', () => {
    const r = parseStatementText(S.NO_YEAR_NO_PERIOD, opts);
    expect(r.rows[0].date).toBe('2026-11-05');
    expect(r.rows[0].confidence).toBeLessThanOrEqual(0.6);
    expect(r.rows[0].warnings[0]).toMatch(/assumed 2026/);
  });
  it('does not put a no-year date in the future', () => {
    const r = parseStatementText('25/12 SHOP 10.00', { today: '2026-03-01' });
    expect(r.rows[0].date).toBe('2025-12-25');
  });
  it('says when nothing was found', () => {
    expect(parseStatementText('hello world', opts).problems[0]).toMatch(/No transaction lines/);
  });
  it('uses the description when the balance gives no proof', () => {
    const r = parseStatementText('Statement Period: 01/11/2026 to 30/11/2026\n05/11/2026 SALARY ACME 5,000.00', opts);
    expect(r.rows[0]).toMatchObject({ kind: 'income' });
    expect(r.rows[0].confidence).toBeLessThan(0.8);
  });
  it('lets a Dr/Cr marker win and flags a balance mismatch', () => {
    const r = parseStatementText('Opening Balance 100.00\n05/11/2026 SHOP 10.00 Dr 110.00', { today: '2026-11-30' });
    expect(r.rows[0].kind).toBe('cost');
    expect(r.rows[0].warnings.join(' ')).toMatch(/disagree/);
  });
  it('reads various date styles at the start of a line', () => {
    const t = ['05-11-2026 A 1.00', '5 Nov 2026 B 2.00', '05.11.26 C 3.00', '2026-11-05 D 4.00', '05NOV2026 E 5.00'].join('\n');
    expect(parseStatementText(t, opts).rows.map((x) => x.date)).toEqual(Array(5).fill('2026-11-05'));
  });
  it('does not treat a word after a day number as a month', () => {
    expect(parseStatementText('21 Marketplace order 10.00', opts).rows).toHaveLength(0);
  });
  it('reads a minus on a card statement as spending when most amounts carry one (the bank prints purchases with a minus)', () => {
    const r = parseStatementText('Credit Card Statement\n05/11/2026 SHOP (10.00)\n06/11/2026 SHOP2 -12.00\n07/11/2026 PAYMENT RECEIVED 50.00', { today: '2026-11-30' });
    expect(r.rows.map((x) => [x.kind, x.amount])).toEqual([['cost', 1000], ['cost', 1200], ['income', 5000]]);
  });

  it('reads a minus on a card statement as a refund when most amounts are unsigned charges', () => {
    const r = parseStatementText('Credit Card Statement\n05/11/2026 SHOP 10.00\n06/11/2026 SHOP2 12.00\n07/11/2026 CAFE 8.00\n08/11/2026 REFUND SHOP -5.00', { today: '2026-11-30' });
    expect(r.rows.map((x) => [x.kind, x.amount])).toEqual([['cost', 1000], ['cost', 1200], ['cost', 800], ['income', 500]]);
  });

  it('reads a minus on a bank statement as spending', () => {
    const r = parseStatementText('Account Statement\n05/11/2026 SHOP -10.00\n06/11/2026 SALARY 100.00', { today: '2026-11-30' });
    expect(r.rows.map((x) => [x.kind, x.amount])).toEqual([['cost', 1000], ['income', 10000]]);
  });
});

describe('parseSmsText', () => {
  const t = '2026-11-22';
  it('purchase', () => {
    const r = parseSmsText(M.SMS_PURCHASE, { today: t });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ date: '2026-11-21', kind: 'cost', amount: 4_500, description: 'CAREEM', balance: 234_510 });
    expect(r.account).toBe('1234');
    expect(r.rows[0].confidence).toBe(1);
  });
  it('debited', () => {
    const r = parseSmsText(M.SMS_DEBITED, { today: t });
    expect(r.account).toBe('123');
    expect(r.rows[0]).toMatchObject({ date: '2026-11-21', kind: 'cost', amount: 150_000, description: 'rent', balance: 300_000 });
  });
  it('credited salary', () => {
    const r = parseSmsText(M.SMS_CREDITED, { today: t });
    expect(r.rows[0]).toMatchObject({ date: '2026-11-25', kind: 'income', amount: 1_800_000 });
    expect(r.rows[0].description).toMatch(/Salary/i);
    expect(r.rows[0].balance).toBe(2_010_000);
  });
  it('credit card spend is not mistaken for a credit', () => {
    const r = parseSmsText(M.SMS_CARD_SPENT, { today: t });
    expect(r.rows[0]).toMatchObject({ date: '2026-11-21', kind: 'cost', amount: 12_050, description: 'TALABAT' });
    expect(r.account).toBe('5678');
  });
  it('ATM withdrawal with a month-name date', () => {
    const r = parseSmsText(M.SMS_ATM, { today: t });
    expect(r.rows[0]).toMatchObject({ date: '2026-12-02', kind: 'cost', amount: 50_000, description: 'ATM DUBAI MARINA' });
  });
  it('refund with a two-digit year', () => {
    const r = parseSmsText(M.SMS_REFUND, { today: t });
    expect(r.rows[0]).toMatchObject({ date: '2026-12-03', kind: 'income', amount: 7_550, description: 'NOON' });
  });
  it('returns no row for OTP, balance-only and unrelated messages', () => {
    expect(parseSmsText(M.SMS_OTP, { today: t }).rows).toHaveLength(0);
    expect(parseSmsText(M.SMS_BALANCE_ONLY, { today: t }).rows).toHaveLength(0);
    expect(parseSmsText(M.SMS_NOT_BANK, { today: t }).rows).toHaveLength(0);
    expect(parseSmsText('  ', { today: t }).problems[0]).toMatch(/empty/);
  });
  it('uses today with a warning when there is no date', () => {
    const r = parseSmsText(M.SMS_NO_DATE, { today: t });
    expect(r.rows[0]).toMatchObject({ date: t, description: 'KFC' });
    expect(r.rows[0].confidence).toBeLessThanOrEqual(0.6);
    expect(r.rows[0].warnings[0]).toMatch(/no date/);
  });
  it('marks an unknown direction', () => {
    const r = parseSmsText('AED 20.00 on 21-11-2026', { today: t });
    expect(r.rows[0].confidence).toBeLessThanOrEqual(0.6);
  });
});

describe('card statement with a running balance (the balance is what is owed)', () => {
  const CARD_BAL = `Credit Card Statement
Card Number XXXX XXXX XXXX 4417
Statement Period 01/11/2026 to 30/11/2026
Previous Balance 1,000.00
03/11/2026 CARREFOUR MOE 250.00 1,250.00
05/11/2026 ENOC 1023 100.00 1,350.00
10/11/2026 PAYMENT RECEIVED THANK YOU 1,000.00 350.00
15/11/2026 TALABAT 50.00 400.00`;
  it('reads purchases (balance owed goes up) as spending and the payment (goes down) as money in, with no doubt flagged', () => {
    const r = parseStatementText(CARD_BAL, { today: '2026-12-01' });
    expect(r.rows.map((x) => [x.description, x.kind])).toEqual([
      ['CARREFOUR MOE', 'cost'],
      ['ENOC 1023', 'cost'],
      ['PAYMENT RECEIVED THANK YOU', 'income'],
      ['TALABAT', 'cost'],
    ]);
    expect(r.rows.every((x) => !x.warnings.some((w) => /running balance/.test(w)))).toBe(true);
  });
  it('also works newest first', () => {
    const lines = CARD_BAL.split('\n');
    const r = parseStatementText([...lines.slice(0, 4), ...lines.slice(4).reverse()].join('\n'), { today: '2026-12-01' });
    expect(r.rows.map((x) => x.kind)).toEqual(['cost', 'income', 'cost', 'cost']);
  });
  it('a bank statement balance still goes up with income', () => {
    const r = parseStatementText(`Account Statement\nOpening Balance 1,000.00\n03/11/2026 SALARY 500.00 1,500.00\n05/11/2026 ENOC 100.00 1,400.00`, { today: '2026-12-01' });
    expect(r.rows.map((x) => x.kind)).toEqual(['income', 'cost']);
  });
});

describe('card statement with a transaction amount and an AED equivalent, and a page header on every page', () => {
  // Layout of a UAE Islamic bank's card statement (made-up names, card number and amounts).
  const r = parseStatementText(S.CARD_STATEMENT_TWO_AMOUNTS, { today: '2026-11-23' });
  it('skips the repeated page header (billing date, card number, minimum due, due date, credit limit)', () => {
    expect(r.rows.some((x) => /XXXX/.test(x.description) || x.amount === 1000000)).toBe(false);
    expect(r.rows).toHaveLength(12);
  });
  it('purchases with a minus are spending; the payment, profit credited and bonus are money in; profit charged is spending', () => {
    const by = Object.fromEntries(r.rows.map((x) => [x.description, [x.kind, x.amount]]));
    expect(by['Credit Card Payment']).toEqual(['income', 120000]);
    expect(by['ADNOC AL SALAM 915 ABUDHABI UAE']).toEqual(['cost', 7500]);
    expect(by['MURABAHA PROFIT']).toEqual(['cost', 2530]);
    expect(by['WAKALA PROFIT']).toEqual(['income', 21001]);
    expect(by.BONUS).toEqual(['income', 4729]);
  });
  it('a foreign purchase takes its AED equivalent, not the foreign amount', () => {
    expect(r.rows.find((x) => x.description.startsWith('SAMPLE AI SUB'))).toMatchObject({ amount: 7400, description: 'SAMPLE AI SUB SAN FRANCISCO CA' });
  });
  it('takes the year from the billing date without flagging every row', () => {
    expect(r.rows.map((x) => x.date)).toContain('2026-08-29');
    expect(r.rows.every((x) => !x.warnings.some((w) => /year/.test(w)))).toBe(true);
    expect(r.rows.filter((x) => x.confidence < 0.7)).toEqual([]);
  });
});
