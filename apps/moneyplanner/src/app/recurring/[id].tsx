// Create or edit a recurring item: loads it from the route and hands it to the form (features/items/RecurringEditor).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, EmptyState, Screen, T } from '@/components/ui';
import { usePlanInput } from '@/data/DataProvider';
import { RecurringEditor, type Prefill } from '@/features/items/RecurringEditor';
import type { Kind, RecurringItem } from '@/types';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function RecurringScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string; name?: string; amount?: string; category?: string; day?: string }>();
  const id = first(params.id) ?? 'new';
  const isNew = id === 'new';
  const { data, error, reload } = usePlanInput();
  const [cached, setCached] = useState<RecurringItem | null>(null);
  const existing = data?.recurring.find((r) => r.id === id) ?? null;
  // Keep showing the item while it is being deleted (the list refreshes before we leave).
  if (existing && existing !== cached) setCached(existing);
  const item = existing ?? cached;

  if (!data) {
    return (
      <Screen>
        {error ? (
          <EmptyState title="Couldn't load this item" message="Nothing has been lost. Try again." action={<Button label="Try again" onPress={reload} testID="recurring-retry" />} />
        ) : (
          <T tone="secondary">Loading…</T>
        )}
      </Screen>
    );
  }
  if (!isNew && !item) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Recurring item' }} />
        <EmptyState title="Item not found" message="It may have been deleted." action={<Button label="Go back" onPress={() => router.back()} testID="recurring-back" />} />
      </Screen>
    );
  }
  const kind: Kind = first(params.kind) === 'income' ? 'income' : 'cost';
  // "Repeat this" from a one-time item arrives with its details in the link.
  const amount = Number(first(params.amount));
  const day = Number(first(params.day));
  const prefill: Prefill | undefined =
    isNew && first(params.name)
      ? {
          name: first(params.name) as string,
          amount: Number.isInteger(amount) && amount > 0 ? amount : null,
          categoryId: first(params.category) ?? null,
          day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
        }
      : undefined;
  return <RecurringEditor key={id} input={data} item={isNew ? null : item} initialKind={kind} prefill={prefill} />;
}
