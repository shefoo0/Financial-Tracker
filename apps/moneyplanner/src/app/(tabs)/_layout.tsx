// Tab bar, and the first-launch redirect to the setup wizard. Owned by the lead.
import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';

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
  const { data: settings, loading } = useRepoQuery((r) => r.getSettings());

  if (loading && !settings) return null;
  if (settings && !settings.onboarded) return <Redirect href="/onboarding" />;

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
