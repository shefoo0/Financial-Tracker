import { formatAmount, formatCompact, formatMoney, formatMoneyTrim, parseAmount, percent } from '@/lib/money';

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

describe('parseAmount rejects ambiguous or unsafe input', () => {
  it.each(['12.345', '12,5', '1.234,50', '1,23', '1000000000.00', '99999999999999999'])('%s -> null', (t) => {
    expect(parseAmount(t)).toBeNull();
  });
  it('accepts grouped thousands and the maximum', () => {
    expect(parseAmount('1,234,567.89')).toBe(123456789);
    expect(parseAmount('999,999,999.99')).toBe(99999999999);
    expect(parseAmount('AED -1,000')).toBe(-100000);
  });
});


describe('formatCompact', () => {
  it('shows whole units with separators', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(1800000)).toBe('18,000');
    expect(formatCompact(99)).toBe('1');
    expect(formatCompact(49)).toBe('0');
  });
  it('rounds fils to the nearest unit', () => {
    expect(formatCompact(1850)).toBe('19');
    expect(formatCompact(1849)).toBe('18');
  });
  it('keeps the sign on negatives', () => {
    expect(formatCompact(-1800000)).toBe('-18,000');
    expect(formatCompact(-50)).toBe('-1');
  });
  it('uses M from a million, truncated to 2 decimals', () => {
    expect(formatCompact(100_000_000)).toBe('1M');
    expect(formatCompact(125_000_000)).toBe('1.25M');
    expect(formatCompact(129_999_999)).toBe('1.29M');
    expect(formatCompact(-250_000_000)).toBe('-2.5M');
    expect(formatCompact(99_999_999_999)).toBe('999.99M');
  });
  it('stays in thousands just under a million', () => {
    expect(formatCompact(99_999_900)).toBe('999,999');
  });
});

describe('formatMoneyTrim', () => {
  it('drops .00 for whole amounts', () => {
    expect(formatMoneyTrim(650000, 'AED')).toBe('AED 6,500');
    expect(formatMoneyTrim(0, 'AED')).toBe('AED 0');
  });
  it('keeps fils otherwise', () => {
    expect(formatMoneyTrim(650050, 'AED')).toBe('AED 6,500.50');
    expect(formatMoneyTrim(5, 'AED')).toBe('AED 0.05');
  });
  it('handles negatives and millions', () => {
    expect(formatMoneyTrim(-650000, 'AED')).toBe('-AED 6,500');
    expect(formatMoneyTrim(-650025, 'AED')).toBe('-AED 6,500.25');
    expect(formatMoneyTrim(123_456_700, 'AED')).toBe('AED 1,234,567');
  });
});
