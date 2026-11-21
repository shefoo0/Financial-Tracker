import { formatAmount, formatMoney, parseAmount, percent } from '@/lib/money';

describe('money', () => {
  it('formats fils', () => {
    expect(formatAmount(123456789)).toBe('1,234,567.89');
    expect(formatAmount(5)).toBe('0.05');
    expect(formatMoney(-12345, 'AED')).toBe('-AED 123.45');
  });
  it('parses user and statement text', () => {
    expect(parseAmount('1,234.5')).toBe(123450);
    expect(parseAmount('AED 99')).toBe(9900);
    expect(parseAmount('(45.00)')).toBe(-4500);
    expect(parseAmount('-45')).toBe(-4500);
    expect(parseAmount('45.10-')).toBe(-4510);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
  it('computes percentages safely', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(1, 0)).toBeNull();
  });
});
