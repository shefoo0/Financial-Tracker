// Settings: money, modules, categories, backup and restore, delete, about.
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, EmptyState, ListRow, MoneyField, Screen, SectionHeader, SelectField, T, TextField, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useData, useRepoMutation, useRepoQuery } from '@/data/DataProvider';
import { exportBackup, exportTransactionsCsv, restoreBackupFromFile } from '@/data/backup';
import {
  MODULE_INFO,
  PAYDAY_OPTIONS,
  choiceToPayday,
  paydayForSettings,
  paydayToChoice,
  signedBalance,
  validateCurrency,
} from '@/features/settings/helpers';
import { formatDate, today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Fils, ModuleId, Settings } from '@/types';

const showError = (title: string, e: unknown) => Alert.alert(title, e instanceof Error ? e.message : String(e));

export default function SettingsScreen() {
  const router = useRouter();
  const { repo, bump } = useData();
  const { data: settings, error, reload } = useRepoQuery((r) => r.getSettings());
  const update = useRepoMutation((r, patch: Partial<Settings>) => r.updateSettings(patch));

  const [currency, setCurrency] = useState('');
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<Fils | null>(null);
  const [overdrawn, setOverdrawn] = useState(false);
  const [balanceKey, setBalanceKey] = useState(0);
  const [bufferKey, setBufferKey] = useState(0);
  const [newBuffer, setNewBuffer] = useState<Fils | null>(null);
  const [busy, setBusy] = useState(false);

  const savedCurrency = settings?.currency;
  useEffect(() => {
    if (savedCurrency != null) setCurrency(savedCurrency);
  }, [savedCurrency]);

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
      await update({ startingBalance: signedBalance(newBalance, overdrawn), startingBalanceDate: today() });
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
            `Backup from ${s.exportedAt.slice(0, 10)}: ${s.recurring} recurring items and ${s.transactions} one-time items.\n\nThis replaces everything now on this phone. It cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Replace', style: 'destructive', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        }),
      );
      bump();
      if (result === 'restored') Alert.alert('Backup restored', 'Your data has been replaced with the backup.');
    });

  const deleteAll = () => {
    Alert.alert('Delete all data?', 'This removes every item, balance and setting from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Are you sure?', 'This cannot be undone. Back up first if you might want your data again.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete everything',
              style: 'destructive',
              onPress: () =>
                run('Could not delete', async () => {
                  await repo.deleteAll();
                  bump();
                  router.replace('/onboarding');
                }),
            },
          ]),
      },
    ]);
  };

  const toggleModule = (id: ModuleId, v: boolean) =>
    run('Could not save', async () => {
      await update({ enabledModules: { ...settings.enabledModules, [id]: v } });
    });

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen testID="settings-screen">
      <T variant="title" accessibilityLabel="Settings">
        Settings
      </T>

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
        <T variant="label">Today's balance</T>
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

      <SectionHeader title="Modules" />
      <Card>
        {MODULE_INFO.map((m) => (
          <ToggleRow
            key={m.id}
            label={m.label}
            description={m.description}
            value={settings.enabledModules[m.id]}
            onChange={(v) => toggleModule(m.id, v)}
            testID={`settings-module-${m.id}`}
          />
        ))}
      </Card>

      <SectionHeader title="Categories" />
      <Card>
        <ListRow title="Categories" subtitle="Add, rename or remove" onPress={() => router.push('/categories')} testID="settings-categories" />
      </Card>

      <SectionHeader title="Your data" />
      <Card>
        <Button label="Back up to a file" variant="secondary" disabled={busy} onPress={() => run('Backup failed', () => exportBackup(repo))} testID="settings-backup" />
        <Button label="Restore from a backup" variant="secondary" disabled={busy} onPress={restore} testID="settings-restore" />
        <Button
          label="Export one-time items as CSV"
          variant="secondary"
          disabled={busy}
          onPress={() => run('Export failed', () => exportTransactionsCsv(repo))}
          testID="settings-export-csv"
        />
        <Button label="Delete all data" variant="destructive" disabled={busy} onPress={deleteAll} testID="settings-delete-all" />
      </Card>

      <SectionHeader title="About" />
      <Card>
        <T testID="settings-version">{`Version ${version}`}</T>
        <T variant="caption" tone="secondary">
          Tracking only — not financial advice. Forecasts are estimates based on what you enter.
        </T>
        <T variant="caption" tone="secondary">
          Your data never leaves this phone unless you export it.
        </T>
      </Card>
      <View style={{ height: Spacing.four }} />
    </Screen>
  );
}
