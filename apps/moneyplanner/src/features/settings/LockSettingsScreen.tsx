// Settings -> Lock: the lock settings on their own screen.
import { Stack } from 'expo-router';

import { Button, EmptyState, Screen, T } from '@/components/ui';
import { useRepoQuery } from '@/data/DataProvider';
import { LockSettings } from '@/features/lock/LockSettings';

export function LockSettingsScreen() {
  const { data: settings, error, reload } = useRepoQuery((r) => r.getSettings());
  return (
    <Screen testID="lock-settings-screen">
      <Stack.Screen options={{ title: 'Lock' }} />
      {error ? (
        <EmptyState title="Could not load settings" message={error.message} action={<Button label="Try again" onPress={reload} testID="lock-settings-retry" />} />
      ) : settings ? (
        <LockSettings settings={settings} />
      ) : (
        <T tone="secondary">Loading…</T>
      )}
    </Screen>
  );
}
