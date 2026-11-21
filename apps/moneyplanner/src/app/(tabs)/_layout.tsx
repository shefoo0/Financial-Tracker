// Tab bar, and the first-launch redirect to the setup wizard. Owned by the lead.
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, Image, Platform, View } from 'react-native';
import { NativeTabs } from 'expo-router/native-tabs';

import { Button, EmptyState, Screen } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useRepoQuery } from '@/data/DataProvider';
import { useColorScheme } from '@/hooks/use-color-scheme';

const TABS = [
  { name: 'index', label: 'Home', icon: require('@/assets/images/tabs/dashboard.png') },
  { name: 'month', label: 'Month', icon: require('@/assets/images/tabs/month.png') },
  { name: 'plan', label: 'Plan', icon: require('@/assets/images/tabs/plan.png') },
  { name: 'settings', label: 'Settings', icon: require('@/assets/images/tabs/settings.png') },
] as const;

export default function TabLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
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
  // Never unmount the tabs while settings reload: every save reloads them, and
  // swapping the tab bar for a spinner reset it to Home (after saving an item
  // the app jumped back to Home — found by the emulator flows). Only wait for
  // fresh settings before sending someone to the setup wizard: right after the
  // wizard finishes, the cached value still says onboarded = false.
  if (!settings || (!settings.onboarded && loading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator accessibilityLabel="Loading" color={colors.accent} />
      </View>
    );
  }
  if (!settings.onboarded) return <Redirect href="/onboarding" />;

  // The web preview (store screenshots) has no native tab bar: draw the same
  // bar at the bottom, where the thumb reaches it, like on the phone.
  if (Platform.OS === 'web') {
    return (
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.glassBorder, height: 64, paddingTop: 6 },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          sceneStyle: { backgroundColor: colors.background },
        }}>
        {TABS.map((t) => (
          <Tabs.Screen
            key={t.name}
            name={t.name}
            options={{
              title: t.label,
              tabBarIcon: ({ color }) => <Image source={t.icon} style={{ width: 24, height: 24, tintColor: color }} />,
            }}
          />
        ))}
      </Tabs>
    );
  }

  return (
    <NativeTabs
      backgroundColor={colors.tabBar}
      blurEffect={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
      indicatorColor={colors.backgroundSelected}
      iconColor={{ default: colors.textSecondary, selected: colors.accent }}
      labelStyle={{ default: { color: colors.textSecondary }, selected: { color: colors.accent } }}>
      {TABS.map((t) => (
        <NativeTabs.Trigger key={t.name} name={t.name}>
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={t.icon} renderingMode="template" />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
