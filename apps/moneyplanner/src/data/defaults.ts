import { today } from '@/lib/dates';
import type { Category, Settings } from '@/types';

/** The starting categories (editable by the user). Ids are stable so backups and rules keep working. */
export const DEFAULT_CATEGORIES: Category[] = [
  ['salary', 'Salary', 'income'],
  ['other-income', 'Other income', 'income'],
  ['housing', 'Housing', 'cost'],
  ['utilities', 'Utilities & Bills', 'cost'],
  ['transport', 'Transport & Car', 'cost'],
  ['groceries', 'Groceries', 'cost'],
  ['dining', 'Dining & Coffee', 'cost'],
  ['insurance', 'Insurance', 'cost'],
  ['subscriptions', 'Subscriptions', 'cost'],
  ['health', 'Health', 'cost'],
  ['shopping', 'Shopping', 'cost'],
  ['entertainment', 'Entertainment & Travel', 'cost'],
  ['loans-cards', 'Loans & Credit Cards', 'cost'],
  ['family', 'Family & Gifts', 'cost'],
  ['education', 'Education', 'cost'],
  ['savings', 'Savings & Investments', 'cost'],
  ['other', 'Other', 'cost'],
].map(([id, name, kind], sort) => ({ id, name, kind: kind as Category['kind'], sort, archived: false }));

export function defaultSettings(now: Date = new Date()): Settings {
  return {
    currency: 'AED',
    payday: null,
    startingBalance: 0,
    startingBalanceDate: today(now),
    buffer: 0,
    enabledModules: { debts: true, cheques: false, alerts: true, import: true },
    alertThresholds: { debtCautionPct: 40, debtHighPct: 50, cardUsagePct: 80 },
    onboarded: false,
    lockEnabled: false,
  };
}
