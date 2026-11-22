import { parseAmountToken } from '../amount';
import { findFullDates, matchLeadingDate, parseDateParts, parseFullDate } from '../date';

describe('parseAmountToken', () => {
  it.each([
    ['1,234.50', 123_450, null],
    ['AED 45.00', 4_500, null],
    ['AED1,500.00', 150_000, null],
    ['45.00 Cr', 4_500, 'cr'],
    ['45.00CR', 4_500, 'cr'],
    ['45.00 DR', 4_500, 'dr'],
    ['Dr 45.00', 4_500, 'dr'],
    ['(45.00)', -4_500, null],
    ['-45', -4_500, null],
    ['−45.00', -4_500, null],
    ['45.00-', -4_500, null],
    ['+45.5', 4_550, null],
  ])('%s', (text, fils, marker) => {
    expect(parseAmountToken(text)).toMatchObject({ fils, marker });
  });
  it.each(['', 'abc', 'N/A', '1.234,50', '12.345', 'Ref12', '1,2'])('rejects %p', (t) => expect(parseAmountToken(t)).toBeNull());
  it('reads the currency', () => expect(parseAmountToken('USD 5.00')?.currency).toBe('USD'));
});

describe('dates', () => {
  it('parses day-first by default and month-first on request', () => {
    expect(parseFullDate('03/04/2026')).toBe('2026-04-03');
    expect(parseFullDate('03/04/2026', 'mdy')).toBe('2026-03-04');
    expect(parseFullDate('3-4-26')).toBe('2026-04-03');
  });
  it('parses month names, ISO and OFX styles', () => {
    expect(parseFullDate('21 Nov 2026')).toBe('2026-11-21');
    expect(parseFullDate('21-NOVEMBER-2026')).toBe('2026-11-21');
    expect(parseFullDate('5 Sept 2026')).toBe('2026-09-05');
    expect(parseFullDate('Nov 21, 2026')).toBe('2026-11-21');
    expect(parseFullDate('2026-11-21')).toBe('2026-11-21');
    expect(parseFullDate('20261121')).toBe('2026-11-21');
  });
  it('rejects impossible dates', () => {
    expect(parseDateParts('31/04/2026')).toBeNull();
    expect(parseDateParts('29/02/2027')).toBeNull();
    expect(parseDateParts('00/01/2026')).toBeNull();
    expect(parseDateParts('21/13/2026')).toBeNull();
    expect(parseDateParts('21 Foo 2026')).toBeNull();
    expect(parseFullDate('21 Nov')).toBeNull();
  });
  it('keeps yearless dates as parts', () => {
    expect(parseDateParts('21 Nov')).toEqual({ day: 21, month: 11, year: null });
    expect(parseDateParts('29/02')).toEqual({ day: 29, month: 2, year: null });
  });
  it('matches a date at the start of a line only', () => {
    expect(matchLeadingDate('21/11/2026 SHOP 5.00')).toEqual({ text: '21/11/2026', rest: 'SHOP 5.00' });
    expect(matchLeadingDate('21 Nov SHOP 5.00')).toEqual({ text: '21 Nov', rest: 'SHOP 5.00' });
    expect(matchLeadingDate('SHOP 21/11/2026')).toBeNull();
    expect(matchLeadingDate('21 Marketplace')).toBeNull();
  });
  it('finds full dates in a line', () => {
    expect(findFullDates('Period 01/11/2026 to 30 Nov 2026')).toEqual(['2026-11-01', '2026-11-30']);
  });
});
