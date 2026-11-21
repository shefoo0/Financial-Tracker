import { render, waitFor, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { DataProvider } from '@/data/DataProvider';
import { createMemoryRepository } from '@/data/memory/memory-repository';
import type { BackupData, Repository } from '@/data/repository';
import { addMonths, monthKey, today } from '@/lib/dates';
import type { RecurringItem, Transaction } from '@/types';

export async function renderWithRepo(ui: ReactElement, seed?: Partial<BackupData>): Promise<{ repo: Repository } & RenderResult> {
  const repo = createMemoryRepository(seed);
  await repo.init();
  const result = await render(<DataProvider repo={repo}>{ui}</DataProvider>);
  return { repo, ...result };
}

export async function settle() {
  await waitFor(() => undefined);
}

/** A first day of the month a few months ago, so monthly items always fall in the current month. */
export const longAgo = () => addMonths(`${monthKey(today())}-01`, -6);

export function recurring(p: Partial<RecurringItem> & Pick<RecurringItem, 'id' | 'name' | 'kind' | 'amount'>): RecurringItem {
  return {
    categoryId: null,
    schedule: { type: 'monthly', day: 5, everyMonths: 1 },
    startDate: longAgo(),
    endDate: null,
    count: null,
    note: '',
    ...p,
  };
}

export function transaction(p: Partial<Transaction> & Pick<Transaction, 'id' | 'description' | 'kind' | 'amount' | 'date'>): Transaction {
  return { categoryId: null, note: '', source: 'manual', importId: null, planned: false, ...p };
}
