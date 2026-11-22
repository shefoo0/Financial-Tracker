import { applyDebtOverridePatch } from '../overrides';

const base = { debtId: 'd', originalDate: '2026-12-15' };
let n = 0;
const id = () => `o${++n}`;

describe('applyDebtOverridePatch', () => {
  it('creates an override for a skip', () => {
    expect(applyDebtOverridePatch(undefined, base, { skip: true }, id)).toEqual({
      type: 'upsert',
      override: { id: 'o1', debtId: 'd', originalDate: '2026-12-15', newDate: null, newAmount: null, skip: true },
    });
  });
  it('removes the override when nothing is left changed', () => {
    const existing = { id: 'x', debtId: 'd', originalDate: '2026-12-15', newDate: null, newAmount: null, skip: true };
    expect(applyDebtOverridePatch(existing, base, { skip: false }, id)).toEqual({ type: 'delete', id: 'x' });
    expect(applyDebtOverridePatch(undefined, base, { newDate: '2026-12-15' }, id)).toEqual({ type: 'none' });
  });
  it('keeps other fields when merging', () => {
    const existing = { id: 'x', debtId: 'd', originalDate: '2026-12-15', newDate: null, newAmount: 5000, skip: false };
    const a = applyDebtOverridePatch(existing, base, { newDate: '2026-12-20' }, id);
    expect(a).toMatchObject({ type: 'upsert', override: { id: 'x', newAmount: 5000, newDate: '2026-12-20' } });
  });
});
