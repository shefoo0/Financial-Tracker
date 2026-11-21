import { applyOverridePatch, scheduleChanged } from '../overrides';
import { describeEnd, describeSchedule, ordinal } from '../schedule';
import { defaultPlanned, emptyRecurringForm, emptyTransactionForm, formFromRecurring, validateRecurring, validateTransaction, categoryOptions } from '../form';
import type { OccurrenceOverride } from '@/types';

describe('schedule words', () => {
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 25, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '25th', '31st']);
  });
  it('monthly', () => {
    expect(describeSchedule({ type: 'monthly', day: 25 })).toBe('Monthly on the 25th');
    expect(describeSchedule({ type: 'monthly', day: 'last', everyMonths: 3 })).toBe('Every 3 months on the last day');
  });
  it('weekly and yearly', () => {
    expect(describeSchedule({ type: 'weekly', everyWeeks: 2 })).toBe('Every 2 weeks');
    expect(describeSchedule({ type: 'weekly', everyWeeks: 1 }, '2026-11-23')).toBe('Every week on Monday');
    expect(describeSchedule({ type: 'yearly', month: 9, day: 1 })).toBe('Yearly on 1 Sep');
  });
  it('end', () => {
    expect(describeEnd({ endDate: null, count: null })).toBeNull();
    expect(describeEnd({ endDate: '2027-03-15', count: null })).toBe('until Mar 2027');
    expect(describeEnd({ endDate: null, count: 12 })).toBe('12 payments');
    expect(describeEnd({ endDate: null, count: 1 })).toBe('1 payment');
  });
});

describe('recurring validation', () => {
  const valid = () => ({ ...emptyRecurringForm('cost', '2026-11-21'), name: ' Rent ', amount: 350000 });
  it('builds an item', () => {
    const r = validateRecurring({ ...valid(), day: '25' }, 'x');
    expect(r.item).toMatchObject({ id: 'x', name: 'Rent', amount: 350000, schedule: { type: 'monthly', day: 25, everyMonths: 1 }, endDate: null, count: null });
  });
  it('requires name and positive amount', () => {
    const r = validateRecurring({ ...valid(), name: ' ', amount: 0 }, 'x');
    expect(r.item).toBeNull();
    expect(Object.keys(r.errors)).toEqual(['name', 'amount']);
  });
  it('checks day, interval, yearly day', () => {
    expect(validateRecurring({ ...valid(), day: '32' }, 'x').errors.day).toBeDefined();
    expect(validateRecurring({ ...valid(), everyMonths: '13' }, 'x').errors.everyMonths).toBeDefined();
    expect(validateRecurring({ ...valid(), scheduleType: 'yearly', month: 2, day: '30' }, 'x').errors.day).toBeDefined();
    expect(validateRecurring({ ...valid(), scheduleType: 'yearly', month: 2, day: '29' }, 'x').item).not.toBeNull();
  });
  it('last day ignores the day field', () => {
    const r = validateRecurring({ ...valid(), monthlyMode: 'last', day: '' }, 'x');
    expect(r.item?.schedule).toEqual({ type: 'monthly', day: 'last', everyMonths: 1 });
  });
  it('end rules', () => {
    expect(validateRecurring({ ...valid(), endMode: 'date', endDate: '2026-01-01' }, 'x').errors.endDate).toBeDefined();
    expect(validateRecurring({ ...valid(), endMode: 'date', endDate: null }, 'x').errors.endDate).toBeDefined();
    expect(validateRecurring({ ...valid(), endMode: 'count', count: '0' }, 'x').errors.count).toBeDefined();
    expect(validateRecurring({ ...valid(), endMode: 'count', count: '6' }, 'x').item?.count).toBe(6);
    expect(validateRecurring({ ...valid(), endMode: 'date', endDate: '2027-01-01' }, 'x').item?.endDate).toBe('2027-01-01');
  });
  it('round-trips through the form', () => {
    const item = validateRecurring({ ...valid(), scheduleType: 'weekly', everyWeeks: 2, endMode: 'count', count: '8' }, 'x').item!;
    expect(validateRecurring(formFromRecurring(item), 'x').item).toEqual(item);
  });
});

describe('transaction validation', () => {
  it('requires description, amount and date', () => {
    const f = emptyTransactionForm('cost', '2026-11-21');
    expect(Object.keys(validateTransaction(f, { id: 't' }).errors)).toEqual(['description', 'amount']);
    const ok = validateTransaction({ ...f, description: ' Lunch ', amount: 4500 }, { id: 't' });
    expect(ok.item).toMatchObject({ description: 'Lunch', source: 'manual', importId: null, planned: false });
  });
  it('planned defaults to future dates', () => {
    expect(defaultPlanned('2026-11-22', '2026-11-21')).toBe(true);
    expect(defaultPlanned('2026-11-21', '2026-11-21')).toBe(false);
  });
});

describe('categoryOptions', () => {
  it('filters by kind, hides archived, sorts', () => {
    const c = (id: string, kind: 'income' | 'cost', sort: number, archived = false) => ({ id, name: id, kind, sort, archived });
    const opts = categoryOptions([c('b', 'cost', 2), c('a', 'cost', 1), c('i', 'income', 0), c('old', 'cost', 0, true)], 'cost', null);
    expect(opts.map((o) => o.value)).toEqual(['a', 'b']);
    expect(categoryOptions([c('old', 'cost', 0, true)], 'cost', 'old')).toHaveLength(1);
  });
});

describe('applyOverridePatch', () => {
  const ids = { recurringId: 'r', originalDate: '2026-12-01', baseAmount: 1000 };
  let n = 0;
  const mk = () => `id${++n}`;
  it('creates then merges then deletes', () => {
    const a = applyOverridePatch(undefined, ids, { skip: true }, mk);
    expect(a.type).toBe('upsert');
    const o1 = (a as { override: OccurrenceOverride }).override;
    const b = applyOverridePatch(o1, ids, { paid: true }, mk);
    const o2 = (b as { override: OccurrenceOverride }).override;
    expect(o2).toMatchObject({ id: o1.id, skip: true, paid: true });
    const c = applyOverridePatch(o2, ids, { skip: false, paid: false }, mk);
    expect(c).toEqual({ type: 'delete', id: o1.id });
  });
  it('does nothing when there is nothing to store', () => {
    expect(applyOverridePatch(undefined, ids, { paid: false }, mk)).toEqual({ type: 'none' });
  });
  it('treats original date and base amount as no change', () => {
    expect(applyOverridePatch(undefined, ids, { newDate: '2026-12-01', newAmount: 1000 }, mk)).toEqual({ type: 'none' });
    const r = applyOverridePatch(undefined, ids, { newDate: '2026-12-05', newAmount: 1200 }, mk);
    expect(r).toMatchObject({ type: 'upsert', override: { newDate: '2026-12-05', newAmount: 1200 } });
  });
});

describe('scheduleChanged', () => {
  const base = { schedule: { type: 'monthly', day: 25 } as const, startDate: '2026-11-25' };
  it('ignores equal schedules and a default everyMonths', () => {
    expect(scheduleChanged(base, { ...base, schedule: { type: 'monthly', day: 25, everyMonths: 1 } })).toBe(false);
  });
  it('detects a new day, type or start date', () => {
    expect(scheduleChanged(base, { ...base, schedule: { type: 'monthly', day: 26 } })).toBe(true);
    expect(scheduleChanged(base, { ...base, schedule: { type: 'weekly', everyWeeks: 1 } })).toBe(true);
    expect(scheduleChanged(base, { ...base, startDate: '2026-12-25' })).toBe(true);
  });
});

describe('end date with a count', () => {
  it('keeps both when both were saved', () => {
    const item = { id: 'a', kind: 'cost', name: 'Loan', categoryId: null, amount: 100, schedule: { type: 'monthly', day: 5 }, startDate: '2026-01-05', endDate: '2027-01-05', count: 6, note: '' } as const;
    const form = formFromRecurring(item);
    expect(form.endMode).toBe('count');
    const r = validateRecurring(form, 'a');
    expect(r.item).toMatchObject({ count: 6, endDate: '2027-01-05' });
  });
});
