// Settings: money, alerts, lock, categories, backup, restore, export, about.
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { Avatar, Button, Card, EmptyState, ListRow, MoneyField, Screen, ScreenHeader, SectionHeader, SelectField, T, TextField, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useData, useRepoMutation, useRepoQuery } from '@/data/DataProvider';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { exportAllCsv, restoreBackupFromFile } from '@/data/backup';
import { backupBeforeChange, exportBackupAndRecord, formatBackupTime } from '@/data/backup/auto';
import { AlertsSettings } from '@/features/alerts/AlertsSettings';
import { AutoBackupsSheet } from '@/features/backup/AutoBackupsSheet';
import { BackupReminderCard } from '@/features/backup/BackupReminderCard';
import { useBackupInfo } from '@/features/backup/useBackupInfo';
import { LockSettings } from '@/features/lock/LockSettings';
import { AppearanceSetting } from '@/features/profiles/AppearanceSetting';
import { ProfileButton } from '@/features/profiles/ProfileButton';
import {
  PAYDAY_OPTIONS,
  choiceToPayday,
  paydayForSettings,
  paydayToChoice,
  signedBalance,
  validateCurrency,
} from '@/features/settings/helpers';
import { ChartStyleSetting } from '@/features/settings/ChartStyleSetting';
import { PRIVACY_POLICY_URL } from '@/features/settings/links';
import { formatDate, today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Fils, Settings } from '@/types';

const showError = (title: string, e: unknown) => Alert.alert(title, e instanceof Error ? e.message : String(e));

export default function SettingsScreen() {
  const router = useRouter();
  const { repo, bump } = useData();
  const { active } = useProfiles();
  const { data: settings, error, reload } = useRepoQuery((r) => r.getSettings());
  const update = useRepoMutation((r, patch: Partial<Settings>) => r.updateSettings(patch));

  // The text box shows what's saved until the user starts typing.
  const [currencyDraft, setCurrency] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<Fils | null>(null);
  const [overdrawn, setOverdrawn] = useState(false);
  const [balanceKey, setBalanceKey] = useState(0);
  const [bufferKey, setBufferKey] = useState(0);
  const [newBuffer, setNewBuffer] = useState<Fils | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiesOpen, setCopiesOpen] = useState(false);
  const { meta: backupMeta, copies } = useBackupInfo();

  const currency = currencyDraft ?? settings?.currency ?? '';

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

  const cur = settings.currency;
  // Start the text boxes from the saved values again (after Restore).
  const resetDrafts = () => {
    setCurrency(null);
    setCurrencyError(null);
    setNewBalance(null);
    setOverdrawn(false);
    setBalanceKey((k) => k + 1);
    setNewBuffer(null);
    setBufferKey((k) => k + 1);
  };

  const openPrivacyPolicy = async () => {
    try {
      if (PRIVACY_POLICY_URL) await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      Alert.alert('Could not open the privacy policy', 'Check that this phone has a web browser, then try again.');
    }
  };

  const run = async (title: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showError(title, e);
    } finally {
      setBusy(false);
    }
  };

  const saveCurrency = async () => {
    const problem = validateCurrency(currency);
    setCurrencyError(problem);
    if (problem) return;
    await run('Could not save', async () => {
      await update({ currency: currency.trim() });
    });
  };

  const saveBalance = () =>
    run('Could not save', async () => {
      const balance = signedBalance(newBalance, overdrawn);
      const date = today();
      await update({ startingBalance: balance, startingBalanceDate: date });
      await repo.upsertBalanceSnapshot({ date, balance }); // an anchor for the balance history chart
      setNewBalance(null);
      setOverdrawn(false);
      setBalanceKey((k) => k + 1);
    });

  const saveBuffer = () =>
    run('Could not save', async () => {
      await update({ buffer: newBuffer ?? 0 });
      setNewBuffer(null);
      setBufferKey((k) => k + 1);
    });

  const restore = () =>
    run('Could not restore', async () => {
      const result = await restoreBackupFromFile(repo, (s) =>
        new Promise<boolean>((resolve) => {
          Alert.alert(
            'Replace everything with this backup?',
            `Backup from ${s.exportedAt.slice(0, 10)}: ${s.recurring} recurring items and ${s.transactions} one-time items.\n\nThis replaces everything now on this phone. A safety copy of your current data is saved first and kept for 7 days in Automatic backups.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              {
                text: 'Replace',
                style: 'destructive',
                onPress: () => {
                  // Save the current data first; if that fails the restore stops and nothing changes.
                  backupBeforeChange(repo, active.id, 'before-restore').then(() => resolve(true), (e) => { showError('Could not restore', e); resolve(false); });
                },
              },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        }),
      );
      resetDrafts();
      bump();
      if (result === 'restored') Alert.alert('Backup restored', 'Your data has been replaced with the backup.');
    });

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen testID="settings-screen">
      <ScreenHeader title="Settings" right={<ProfileButton />} testID="settings-header" />

      <SectionHeader title="Profile & appearance" />
      <Card testID="settings-profile-card">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
          <Avatar name={active.name} color={active.color} />
          <View style={{ flex: 1 }}>
            <T variant="heading" numberOfLines={1}>
              {active.name}
            </T>
            <T variant="caption" tone="secondary">
              Everything below belongs to this profile.
            </T>
          </View>
        </View>
        <Button label="Manage profiles" variant="secondary" onPress={() => router.push('/profiles')} testID="settings-manage-profiles" />
        <T variant="label">Appearance</T>
        <AppearanceSetting testID="settings-appearance" />
        <ChartStyleSetting value={settings.chartStyle} onChange={async (v) => {
            await update({ chartStyle: v });
          }} />
      </Card>

      <SectionHeader title="Money" />
      <Card>
        <TextField
          label="Currency label"
          value={currency}
          onChangeText={setCurrency}
          error={currencyError}
          hint="Label only, no conversion."
          testID="settings-currency"
        />
        <Button label="Save currency" variant="secondary" onPress={saveCurrency} disabled={busy || currency.trim() === cur} testID="settings-currency-save" />
        <SelectField
          label="Payday"
          value={paydayToChoice(settings.payday)}
          options={PAYDAY_OPTIONS}
          onChange={(v) => {
            const d = choiceToPayday(v);
            run('Could not save', async () => {
              await update({ payday: paydayForSettings(d) });
            });
          }}
          testID="settings-payday"
        />
      </Card>
      <Card>
        <T variant="label">{"Today's balance"}</T>
        <T testID="settings-balance-current">{`${formatMoney(settings.startingBalance, cur)} as of ${formatDate(settings.startingBalanceDate)}`}</T>
        <MoneyField key={`b${balanceKey}`} label="Update today's balance" value={newBalance} onChange={setNewBalance} currency={cur} testID="settings-balance" />
        <ToggleRow label="My account is overdrawn" value={overdrawn} onChange={setOverdrawn} testID="settings-overdrawn" />
        <Button label="Save balance" onPress={saveBalance} disabled={busy || newBalance == null} testID="settings-balance-save" />
      </Card>
      <Card>
        <T variant="label">Buffer</T>
        <T testID="settings-buffer-current">{`Now ${formatMoney(settings.buffer, cur)}`}</T>
        <MoneyField
          key={`u${bufferKey}`}
          label="New buffer"
          value={newBuffer}
          onChange={setNewBuffer}
          currency={cur}
          hint="The least you want to keep in your account."
          testID="settings-buffer"
        />
        <Button label="Save buffer" onPress={saveBuffer} disabled={busy || newBuffer == null} testID="settings-buffer-save" />
      </Card>

      <AlertsSettings settings={settings} update={update} />
      <LockSettings settings={settings} update={update} />

      <SectionHeader title="Categories" />
      <Card>
        <ListRow title="Categories" subtitle="Add, rename or remove" onPress={() => router.push('/categories')} testID="settings-categories" />
      </Card>

      <SectionHeader title={`Your data in ${active.name}`} />
      <BackupReminderCard testID="settings-backup-reminder" />
      <Card>
        <T variant="caption" tone="secondary" testID="settings-data-note">
          {`Backup, restore and CSV export apply to ${active.name} only, not to the other profiles. To delete this profile and its data, use Manage profiles.`}
        </T>
        <Button label="Back up to a file" variant="secondary" disabled={busy} onPress={() => run('Backup failed', () => exportBackupAndRecord(repo, active.id))} testID="settings-backup" />
        <ListRow
          title="Automatic backups"
          subtitle={
            backupMeta?.lastAutoAt
              ? `${formatBackupTime(backupMeta.lastAutoAt)} · ${copies.filter((c) => c.kind === 'daily').length} kept on this phone`
              : 'None yet. A copy is saved once a day.'
          }
          onPress={() => setCopiesOpen(true)}
          accessibilityLabel={`Automatic backups. ${backupMeta?.lastAutoAt ? `Last copy ${formatBackupTime(backupMeta.lastAutoAt)}` : 'None yet'}. Opens the list of copies`}
          testID="settings-auto-backups"
        />
        <Button label="Restore from a backup" variant="secondary" disabled={busy} onPress={restore} testID="settings-restore" />
        <Button label="Export to spreadsheet (CSV)" variant="secondary" disabled={busy} onPress={() => run('Export failed', () => exportAllCsv(repo))} testID="settings-export-csv" />
      </Card>

      <AutoBackupsSheet
        visible={copiesOpen}
        onClose={() => setCopiesOpen(false)}
        copies={copies}
        profileId={active.id}
        profileName={active.name}
        onRestored={() => {
          resetDrafts();
          bump();
        }}
      />

      <SectionHeader title="About" />
      <Card>
        <T testID="settings-version">{`Version ${version}`}</T>
        <T variant="caption" tone="secondary">
          Tracking only — not financial advice. Forecasts are estimates based on what you enter.
        </T>
        <T variant="caption" tone="secondary">
          Your data never leaves this phone unless you export it.
        </T>
        {PRIVACY_POLICY_URL && (
          <ListRow title="Privacy policy" subtitle="Opens in your browser" onPress={openPrivacyPolicy} accessibilityLabel="Privacy policy. Opens in your browser" testID="settings-privacy" />
        )}
      </Card>
      <View style={{ height: Spacing.four }} />
    </Screen>
  );
}
