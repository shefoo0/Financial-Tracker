// The Pro screen for free users (shared by the import screens): what import does, and "Unlock Pro". No import actions.
import { Alert, View } from 'react-native';

import { Button, Pill, Screen, ScreenHeader } from '@/components/ui';

import { PRO_ALERT_MESSAGE, PRO_ALERT_TITLE, ImportIntro } from './ImportIntro';

export function ImportProLocked() {
  return (
    <Screen testID="import-screen">
      <ScreenHeader title="Import" right={<View testID="import-pro-badge"><Pill label="Pro" tone="accent" /></View>} />
      <ImportIntro pro={false} />
      <Button label="Unlock Pro" onPress={() => Alert.alert(PRO_ALERT_TITLE, PRO_ALERT_MESSAGE)} testID="import-unlock" accessibilityHint="Shows when Pro is available" />
    </Screen>
  );
}
