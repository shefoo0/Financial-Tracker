// Settings -> About: version, the not-advice note, privacy and support.
import Constants from 'expo-constants';
import { Alert, Linking } from 'react-native';
import { Stack } from 'expo-router';

import { Card, ListRow, Screen, T } from '@/components/ui';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL } from './links';

export function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const open = async (url: string, what: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(`Could not open ${what}`, 'Check that this phone has an app that can open it, then try again.');
    }
  };
  return (
    <Screen testID="about-screen">
      <Stack.Screen options={{ title: 'About' }} />
      <Card>
        <T variant="heading">Money Planner</T>
        <T testID="settings-version">{`Version ${version}`}</T>
        <T variant="caption" tone="secondary">
          Tracking only — not financial advice. Forecasts are estimates based on what you enter.
        </T>
        <T variant="caption" tone="secondary" testID="about-privacy-note">
          Your data never leaves this phone unless you export it. There is no account, no ads and no tracking.
        </T>
      </Card>
      <Card>
        {PRIVACY_POLICY_URL ? (
          <ListRow title="Privacy policy" subtitle="Opens in your browser" onPress={() => open(PRIVACY_POLICY_URL as string, 'the privacy policy')} accessibilityLabel="Privacy policy. Opens in your browser" testID="settings-privacy" />
        ) : null}
        {SUPPORT_EMAIL ? (
          <ListRow title="Support" subtitle={SUPPORT_EMAIL} onPress={() => open(`mailto:${SUPPORT_EMAIL}`, 'your email app')} accessibilityLabel={`Support. Email ${SUPPORT_EMAIL}`} testID="settings-support" />
        ) : (
          <T variant="caption" tone="secondary" testID="about-support-note">
            Questions or ideas? Use the support link on this app&apos;s store page.
          </T>
        )}
      </Card>
    </Screen>
  );
}
