// The Pro screen (milestone 4): what Pro adds, the price from the store, buy once, and restore.
import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ScreenTitle } from '@/features/settings/ScreenTitle';
import { usePro } from '@/lib/pro';

export const PRO_FEATURES = [
  { title: 'Charts and reports', text: 'Every chart on Home, and quarterly and yearly reports with a PDF you can share.' },
  { title: 'Statement import', text: 'CSV, Excel, OFX, PDF, photos and shared text, read on your phone. Files never leave it.' },
  { title: 'Several accounts', text: 'More bank and cash accounts, moving money between them, the account of each item and a default account.' },
] as const;

export default function ProScreen() {
  const pro = usePro();
  return (
    <Screen testID="pro-screen">
      <Stack.Screen options={{ title: 'Money Planner Pro' }} />
      <ScreenTitle>{pro.isPro ? 'Pro is unlocked' : 'Money Planner Pro'}</ScreenTitle>
      <T tone="secondary">
        {pro.isPro
          ? 'Thank you for supporting Money Planner. Everything below is yours on this phone.'
          : 'Pay once and keep it. Not a subscription, no ads, no account. Planning, the forecast, debts, cheques, alerts, profiles, the lock and backups stay free.'}
      </T>
      <Card style={{ gap: Spacing.three }}>
        {PRO_FEATURES.map((f) => (
          <View key={f.title} accessible accessibilityLabel={`${f.title}. ${f.text}`} style={{ gap: Spacing.one }}>
            <T variant="label">{`✓ ${f.title}`}</T>
            <T variant="caption" tone="secondary">
              {f.text}
            </T>
          </View>
        ))}
      </Card>
      {pro.message ? (
        <View accessibilityLiveRegion="polite" accessibilityRole="alert" testID="pro-message">
          <T>{pro.message}</T>
        </View>
      ) : null}
      {pro.isPro ? null : pro.loading ? (
        <ActivityIndicator accessibilityLabel="Checking Pro" />
      ) : pro.available ? (
        <>
          <Button
            label={pro.price ? `Unlock Pro for ${pro.price}` : 'Unlock Pro'}
            onPress={pro.buy}
            disabled={pro.busy}
            accessibilityHint="Opens the store to pay once"
            testID="pro-buy"
          />
          <Button label="Restore purchase" variant="secondary" onPress={pro.restore} disabled={pro.busy} accessibilityHint="Unlocks Pro again if this store account already bought it" testID="pro-restore" />
          <T variant="caption" tone="secondary">
            Paid through {process.env.EXPO_OS === 'ios' ? 'the App Store' : 'Google Play'} with your store account. Money Planner never sees your payment details.
          </T>
        </>
      ) : (
        <T tone="secondary" testID="pro-unavailable">
          Pro can&apos;t be bought in this version of the app. Install Money Planner from Google Play or the App Store to unlock it.
        </T>
      )}
    </Screen>
  );
}
