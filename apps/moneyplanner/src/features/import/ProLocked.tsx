// The Pro screen for free users (shared by the import screens): what import does, and "Unlock Pro". No import actions.
import { View } from 'react-native';

import { Button, Pill, Screen, ScreenHeader } from '@/components/ui';

import { showPro } from '@/features/pro/showPro';

import { ImportIntro } from './ImportIntro';

export function ImportProLocked() {
  return (
    <Screen testID="import-screen">
      <ScreenHeader title="Import" right={<View testID="import-pro-badge"><Pill label="Pro" tone="accent" /></View>} />
      <ImportIntro pro={false} />
      <Button label="Unlock Pro" onPress={showPro} testID="import-unlock" accessibilityHint="Opens Money Planner Pro" />
    </Screen>
  );
}
