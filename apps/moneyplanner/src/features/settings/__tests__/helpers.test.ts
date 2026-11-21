import {
  activeCategories,
  buildCategory,
  buildSalaryItem,
  choiceToPayday,
  nextPayday,
  paydayForSettings,
  signedBalance,
  validateCategoryName,
  validateCurrency,
} from '../helpers';
import type { Category } from '@/types';

const cat = (p: Partial<Category>): Category => ({ id: 'x', name: 'X', kind: 'cost', sort: 0, archived: false, ...p });

describe('nextPayday', () => {
  it('is today when today is payday', () => expect(nextPayday('2026-11-25', 25)).toBe('2026-11-25'));
  it('later this month', () => expect(nextPayday('2026-11-21', 25)).toBe('2026-11-25'));
  it('next month when passed', () => expect(nextPayday('2026-11-26', 25)).toBe('2026-12-25'));
  it('rolls over the year', () => expect(nextPayday('2026-12-31', 5)).toBe('2027-01-05'));
  it('clamps day 31 in short months', () => expect(nextPayday('2026-02-10', 31)).toBe('2026-02-28'));
  it('last day of month', () => {
    expect(nextPayday('2026-11-21', 'last')).toBe('2026-11-30');
    expect(nextPayday('2028-02-01', 'last')).toBe('2028-02-29');
  });
  it('last day passed -> next month end', () => expect(nextPayday('2026-11-30', 'last')).toBe('2026-11-30'));
});

describe('payday choices', () => {
  it('parses', () => {
    expect(choiceToPayday('none')).toBeNull();
    expect(choiceToPayday('last')).toBe('last');
    expect(choiceToPayday('15')).toBe(15);
    expect(choiceToPayday('40')).toBeNull();
  });
  it('stores last as 31', () => expect(paydayForSettings('last')).toBe(31));
});

describe('buildSalaryItem', () => {
  it('makes a monthly salary income', () => {
    const s = buildSalaryItem(1_000_000, 25, '2026-11-26');
    expect(s).toMatchObject({ kind: 'income', name: 'Salary', categoryId: 'salary', amount: 1_000_000, startDate: '2026-12-25', endDate: null });
    expect(s.schedule).toEqual({ type: 'monthly', day: 25 });
  });
});

describe('signedBalance', () => {
  it('handles sign and empty', () => {
    expect(signedBalance(5000, true)).toBe(-5000);
    expect(signedBalance(5000, false)).toBe(5000);
    expect(signedBalance(null, true)).toBe(0);
  });
});

describe('validation', () => {
  it('currency', () => {
    expect(validateCurrency('AED')).toBeNull();
    expect(validateCurrency('  ')).not.toBeNull();
    expect(validateCurrency('ABCDEFG')).not.toBeNull();
  });
  it('category name', () => {
    const all = [cat({ id: 'a', name: 'Food' }), cat({ id: 'b', name: 'Old', archived: true })];
    expect(validateCategoryName('', all, 'cost')).not.toBeNull();
    expect(validateCategoryName('food', all, 'cost')).not.toBeNull();
    expect(validateCategoryName('food', all, 'cost', 'a')).toBeNull();
    expect(validateCategoryName('food', all, 'income')).toBeNull();
    expect(validateCategoryName('Old', all, 'cost')).toBeNull();
  });
  it('builds and lists categories', () => {
    const all = [cat({ id: 'a', sort: 3 }), cat({ id: 'b', sort: 1, name: 'B' }), cat({ id: 'c', archived: true })];
    expect(buildCategory(' New ', 'income', all)).toMatchObject({ name: 'New', kind: 'income', sort: 4, archived: false });
    expect(activeCategories(all, 'cost').map((c) => c.id)).toEqual(['b', 'a']);
  });
});
