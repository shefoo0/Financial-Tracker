import { addDays, addMonths, isValidISODate, monthEnd, weekday } from '@/lib/dates';

describe('dates', () => {
  it('validates real calendar dates in a sane year range', () => {
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('0099-01-01')).toBe(false);
    expect(isValidISODate('2026-1-1')).toBe(false);
  });
  it('does calendar maths without time-zone drift', () => {
    expect(addDays('2026-03-28', 3)).toBe('2026-03-31');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(monthEnd('2028-02')).toBe('2028-02-29');
    expect(weekday('2026-11-21')).toBe(6);
  });
});
