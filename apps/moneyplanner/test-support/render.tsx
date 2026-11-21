import { render, waitFor, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createMemoryProfileStore } from '@/data/profiles/memory-profile-store';
import { ProfileProvider } from '@/data/profiles/ProfileProvider';
import type { BackupData, Repository } from '@/data/repository';
import { addMonths, monthKey, today } from '@/lib/dates';
import type { RecurringItem, Transaction } from '@/types';

const SAFE_AREA = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

/**
 * Renders `ui` the way the app does: safe areas, then a ProfileProvider with an
 * in-memory profile store whose first profile ("Me") holds `seed`. Returns that
 * profile's repository and the store (for profile tests).
 */
export async function renderWithRepo(
  ui: ReactElement,
  seed?: Partial<BackupData>,
): Promise<{ repo: Repository; store: ReturnType<typeof createMemoryProfileStore> } & RenderResult> {
  const store = createMemoryProfileStore({ seed });
  const result = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ProfileProvider
        storeFactory={() => store}
        renderLoading={() => <Text>Loading profiles</Text>}
        renderError={(message) => <Text>Profiles error: {message}</Text>}>
        {ui}
      </ProfileProvider>
    </SafeAreaProvider>,
  );
  await waitFor(() => expect(result.queryByText('Loading profiles')).toBeNull());
  const state = await store.init();
  const repo = store.repositoryFor(state.activeProfileId);
  if (!repo) throw new Error('No repository for the active profile');
  return { repo, store, ...result };
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
