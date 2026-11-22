import { dedupe } from '../dedupe';
import type { ParsedRow } from '../types';
import type { Transaction } from '@/types';

const row = (o: Partial<ParsedRow>): ParsedRow => ({ date: '2026-11-21', description: 'CAREEM RIDE', amount: 4500, kind: 'cost', raw: '', confidence: 1, warnings: [], ...o });
const tx = (o: Partial<Transaction>): Transaction => ({
  id: 't1', kind: 'cost', date: '2026-11-21', description: 'Careem', categoryId: null, amount: 4500, note: '', source: 'manual', importId: null, planned: false, ...o,
});

describe('dedupe', () => {
  it('flags same amount, date within a day and similar description', () => {
    expect(dedupe([row({})], [tx({})])[0].duplicateOf).toBe('t1');
    expect(dedupe([row({ date: '2026-11-22' })], [tx({})])[0].duplicateOf).toBe('t1');
    expect(dedupe([row({ date: '2026-11-20' })], [tx({})])[0].duplicateOf).toBe('t1');
  });
  it('does not flag different amount, kind, date (2 days) or description', () => {
    expect(dedupe([row({ amount: 4501 })], [tx({})])[0].duplicateOf).toBeUndefined();
    expect(dedupe([row({ kind: 'income' })], [tx({})])[0].duplicateOf).toBeUndefined();
    expect(dedupe([row({ date: '2026-11-23' })], [tx({})])[0].duplicateOf).toBeUndefined();
    expect(dedupe([row({ description: 'LULU HYPERMARKET' })], [tx({})])[0].duplicateOf).toBeUndefined();
  });
  it('lets a saved item match only one row, so real twins are kept', () => {
    const out = dedupe([row({}), row({})], [tx({})]);
    expect(out.map((r) => r.duplicateOf)).toEqual(['t1', undefined]);
  });
  it('matches twins to twins', () => {
    const out = dedupe([row({}), row({})], [tx({}), tx({ id: 't2' })]);
    expect(out.map((r) => r.duplicateOf)).toEqual(['t1', 't2']);
  });
  it('prefers the closest date', () => {
    const out = dedupe([row({})], [tx({ id: 'far', date: '2026-11-22' }), tx({ id: 'near' })]);
    expect(out[0].duplicateOf).toBe('near');
  });
  it('matches word overlap, ignoring reference numbers', () => {
    const out = dedupe([row({ description: 'POS-CARREFOUR MOE 12345' })], [tx({ description: 'Carrefour MOE' })]);
    expect(out[0].duplicateOf).toBe('t1');
  });
  it('keeps the other fields and order, and handles empty input', () => {
    const rows = [row({ description: 'A1' }), row({ description: 'B1', amount: 1 })];
    expect(dedupe(rows, []).map((r) => r.description)).toEqual(['A1', 'B1']);
    expect(dedupe([], [tx({})])).toEqual([]);
  });
});
