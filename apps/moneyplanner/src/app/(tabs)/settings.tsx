// Settings: a short list. Each row shows its current value and opens the same sheet as the pencil on a Home card
// (Appearance, Notifications, Money), or its own screen (Lock, Categories, Backups & export, About).
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Button, Card, EmptyState, Screen, ScreenHeader, T } from '@/components/ui';
import { ChartStyles, chartStyleOf } from '@/constants/theme';
import { useRepoQuery } from '@/data/DataProvider';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { formatBackupTime } from '@/data/backup/auto';
import { AppearanceSheet, AlertsSheet, MoneySheet } from '@/features/edit';
import { useBackupInfo } from '@/features/backup/useBackupInfo';
import { leadLabel } from '@/features/alerts/plan';
import { ProfileButton } from '@/features/profiles/ProfileButton';
import { SettingsRow } from '@/features/settings/SettingsRow';
import { formatPayday } from '@/features/settings/helpers';
import { formatMoney } from '@/lib/money';

const MODE_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const;

type Sheet = 'appearance' | 'notifications' | 'money' | null;

export default function SettingsScreen() {
  const router = useRouter();
  const { active, appearance } = useProfiles();
  const { data: settings, error, reload } = useRepoQuery((r) => r.getSettings());
  const { data: categories } = useRepoQuery((r) => r.listCategories());
  const { meta: backupMeta } = useBackupInfo();
  const [sheet, setSheet] = useState<Sheet>(null);

  if (error) {
    return (
      <Screen>
        <EmptyState title="Could not load settings" message={error.message} action={<Button label="Try again" onPress={reload} testID="settings-retry" />} />
      </Screen>
    );
  }
  if (!settings) {
    return (
      <Screen>
        <T tone="secondary">Loading…</T>
      </Screen>
    );
  }

  const reminders = settings.billReminders.on ? `Bills ${leadLabel(settings.billReminders.leadDays).toLowerCase()} before` : 'Bill reminders off';
  const categoryCount = categories?.filter((c) => !c.archived).length;

  return (
    <Screen testID="settings-screen">
      <ScreenHeader title="Settings" right={<ProfileButton />} testID="settings-header" />
      <Card testID="settings-list">
        <SettingsRow title="Profile" value={active.name} onPress={() => router.push('/profiles')} hint="Rename, recolour or delete profiles" testID="settings-profile" />
        <SettingsRow
          title="Appearance"
          value={`${MODE_LABEL[appearance]} · ${ChartStyles[chartStyleOf(settings.chartStyle)].label}`}
          onPress={() => setSheet('appearance')}
          testID="settings-appearance-row"
        />
        <SettingsRow title="Lock" value={settings.lockEnabled ? 'On' : 'Off'} onPress={() => router.push('/lock-settings')} testID="settings-lock-row" />
        <SettingsRow
          title="Notifications"
          value={`${settings.notificationsOn ? 'On' : 'Off'} · ${reminders}`}
          onPress={() => setSheet('notifications')}
          testID="settings-notifications-row"
        />
        <SettingsRow
          title="Money"
          value={`${settings.currency} · ${formatMoney(settings.startingBalance, settings.currency)} · ${formatPayday(settings.payday)}`}
          onPress={() => setSheet('money')}
          testID="settings-money-row"
        />
        <SettingsRow title="Categories" value={categoryCount == null ? undefined : String(categoryCount)} onPress={() => router.push('/categories')} testID="settings-categories" />
        <SettingsRow
          title="Backups & export"
          value={backupMeta?.lastAutoAt ? `Last copy ${formatBackupTime(backupMeta.lastAutoAt)}` : 'No copy yet'}
          onPress={() => router.push('/backups')}
          testID="settings-backups-row"
        />
        <SettingsRow title="About" value={`Version ${Constants.expoConfig?.version ?? '1.0.0'}`} onPress={() => router.push('/about')} testID="settings-about-row" />
      </Card>

      <AppearanceSheet visible={sheet === 'appearance'} onClose={() => setSheet(null)} />
      <AlertsSheet visible={sheet === 'notifications'} onClose={() => setSheet(null)} withReminders />
      <MoneySheet visible={sheet === 'money'} onClose={() => setSheet(null)} />
    </Screen>
  );
}
