import { Alert } from 'react-native';

import { Button, Card, T } from '@/components/ui';

export const unlockPro = () => Alert.alert('Pro comes with the next update', 'Reports will unlock with Pro. Nothing is charged today.');

/** Shown on the sample reports so nobody takes the demo numbers for their own. */
export function SampleBanner() {
  return (
    <Card testID="report-sample-banner">
      <T variant="heading" accessibilityRole="header">
        Sample: your own reports come with Pro
      </T>
      <T tone="secondary">These are made-up demo numbers for a UAE household, so you can see what a report shows. Your own figures are not used here.</T>
      <Button label="Unlock Pro" onPress={unlockPro} testID="report-unlock" accessibilityHint="Pro comes with the next update" />
    </Card>
  );
}
