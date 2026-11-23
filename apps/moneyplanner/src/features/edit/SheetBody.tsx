import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Settings } from '@/types';
import { useSettings } from './useSettings';

/** The content of an edit sheet: a loading line or error with Try again until settings are there, then `children(settings)`. */
export function SheetBody({ children, testID }: { children: (settings: Settings) => ReactNode; testID?: string }) {
  const { settings, error, reload } = useSettings();
  if (!settings) {
    return error ? (
      <View style={{ gap: Spacing.two }}>
        <T tone="negative">{`Could not load settings: ${error.message}`}</T>
        <Button label="Try again" onPress={reload} testID="edit-retry" />
      </View>
    ) : (
      <T tone="secondary">Loading…</T>
    );
  }
  return (
    <View style={{ gap: Spacing.three, paddingBottom: Spacing.two }} testID={testID}>
      {children(settings)}
    </View>
  );
}
