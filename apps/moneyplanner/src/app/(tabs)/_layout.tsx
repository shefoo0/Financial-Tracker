// Tab bar, and the first-launch redirect to the setup wizard. Owned by the lead.
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { NativeTabs } from 'expo-router/native-tabs';

import { Button, EmptyState, Screen } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useRepoQuery } from '@/data/DataProvider';
import { useColorScheme } from '@/hooks/use-color-scheme';

const TABS = [
  { name: 'index', label: 'Dashboard', icon: require('@/assets/images/tabs/dashboard.png') },
  { name: 'month', label: 'Month', icon: require('@/assets/images/tabs/month.png') },
  { name: 'plan', label: 'Plan', icon: require('@/assets/images/tabs/plan.png') },
  { name: 'settings', label: 'Settings', icon: require('@/assets/images/tabs/settings.png') },
] as const;

export default function TabLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { data: settings, loading, error, reload } = useRepoQuery((r) => r.getSettings());

  if (error && !settings) {
    return (
      <Screen>
        <EmptyState
          title="Your settings couldn't be loaded"
          message="Nothing has been deleted. Try again."
          action={<Button label="Try again" onPress={reload} testID="tabs-retry" />}
        />
      </Screen>
    );
  }
  // Wait for fresh settings before deciding: right after the setup wizard
  // finishes, the cached value still says onboarded = false.
  if (!settings || loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator accessibilityLabel="Loading" color={colors.accent} />
      </View>
    );
  }
  if (!settings.onboarded) return <Redirect href="/onboarding" />;

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundSelected}
      labelStyle={{ selected: { color: colors.accent } }}>
      {TABS.map((t) => (
        <NativeTabs.Trigger key={t.name} name={t.name}>
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={t.icon} renderingMode="template" />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
