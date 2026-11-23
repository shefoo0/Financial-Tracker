// One editor per setting. The sheets (and Settings) are just these in a column, so a setting is edited the same way
// everywhere. Every editor saves as soon as the value is chosen (money and text fields when they lose focus).
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { SelectField, Segmented, T, TextField, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useData } from '@/data/DataProvider';
import { useSettingSetter } from '@/data/useSettingSetter';
import { CHART_RANGES } from '@/data/settingsSchema';
import { ChartStyleSetting } from '@/features/settings/ChartStyleSetting';
import { PAYDAY_OPTIONS, choiceToPayday, paydayForSettings, paydayToChoice, signedBalance, validateCurrency } from '@/features/settings/helpers';
import { formatDate, today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { ChartRange, Settings, SpendingPeriod } from '@/types';
import { InstantMoneyField } from './InstantMoneyField';
import { SAVED_TEXT, useSavedTick } from './useSavedTick';

export function CurrencyEditor({ settings }: { settings: Settings }) {
  const { set } = useSettingSetter();
  const [text, setText] = useState(settings.currency);
  const [error, setError] = useState<string | null>(null);
  const tick = useSavedTick();
  const commit = async () => {
    const problem = validateCurrency(text);
    setError(problem);
    if (problem) return;
    const next = text.trim();
    setText(next);
    if (next !== settings.currency && (await set({ currency: next }))) tick.flash();
  };
  return (
    <TextField
      label="Currency label"
      value={text}
      onChangeText={(t) => {
        setText(t);
        setError(null);
      }}
      onBlur={commit}
      error={error}
      hint={tick.saved ? SAVED_TEXT : 'Label only, no conversion.'}
      testID="settings-currency"
    />
  );
}

export function BalanceEditor({ settings }: { settings: Settings }) {
  const { repo } = useData();
  const { set } = useSettingSetter();
  const cur = settings.currency;
  const negative = settings.startingBalance < 0;

  /** Saves the balance as of today and records a snapshot for the balance history chart. */
  const save = async (amount: number, overdrawn: boolean): Promise<boolean> => {
    const balance = signedBalance(amount, overdrawn);
    const date = today();
    if (!(await set({ startingBalance: balance, startingBalanceDate: date }))) return false;
    try {
      await repo.upsertBalanceSnapshot({ date, balance });
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
      return false;
    }
    return true;
  };

  return (
    <View style={{ gap: Spacing.two }}>
      <T testID="settings-balance-current" variant="caption" tone="secondary">{`${formatMoney(settings.startingBalance, cur)} as of ${formatDate(settings.startingBalanceDate)}`}</T>
      <InstantMoneyField label={settings.mainAccountName && settings.mainAccountName !== 'Main account' ? `${settings.mainAccountName}: balance today` : 'Balance today'} saved={Math.abs(settings.startingBalance)} currency={cur} onCommit={(v) => save(v, negative)} testID="settings-balance" />
      <ToggleRow label="My account is overdrawn" value={negative} onChange={(v) => void save(Math.abs(settings.startingBalance), v)} testID="settings-overdrawn" />
    </View>
  );
}

export function BufferEditor({ settings }: { settings: Settings }) {
  const { set } = useSettingSetter();
  return (
    <InstantMoneyField
      label="Safety buffer"
      saved={settings.buffer}
      currency={settings.currency}
      onCommit={(buffer) => set({ buffer })}
      hint="The least you want to keep in your account."
      testID="settings-buffer"
    />
  );
}

export function PaydayEditor({ settings }: { settings: Settings }) {
  const { set } = useSettingSetter();
  return (
    <SelectField
      label="Payday"
      value={paydayToChoice(settings.payday)}
      options={PAYDAY_OPTIONS}
      onChange={(v) => void set({ payday: paydayForSettings(choiceToPayday(v)) })}
      testID="settings-payday"
    />
  );
}

export function ChartRangeEditor({ settings }: { settings: Settings }) {
  const { set } = useSettingSetter();
  const spoken: Record<ChartRange, string> = { '1M': '1 month', '2M': '2 months', '6M': '6 months', '1Y': '1 year' };
  return (
    <View style={{ gap: Spacing.one }}>
      <T variant="label">Chart range</T>
      <Segmented
        label="Chart range"
        options={CHART_RANGES.map((r) => ({ value: r, label: r }))}
        value={settings.chartRange}
        onChange={(chartRange) => void set({ chartRange })}
        testID="settings-chart-range"
      />
      <T variant="caption" tone="secondary">{`The balance chart starts on ${spoken[settings.chartRange]} back and ahead. You can still change it on the chart.`}</T>
    </View>
  );
}

export function CardStyleEditor({ settings }: { settings: Settings }) {
  const { set } = useSettingSetter();
  return <ChartStyleSetting value={settings.chartStyle} onChange={(chartStyle) => set({ chartStyle })} />;
}

export function SpendingPeriodEditor({ settings }: { settings: Settings }) {
  const { set } = useSettingSetter();
  return (
    <View style={{ gap: Spacing.one }}>
      <T variant="label">Spending by category</T>
      <Segmented
        label="Spending period"
        options={[
          { value: 'month' as SpendingPeriod, label: 'This month' },
          { value: 'year' as SpendingPeriod, label: 'This year' },
        ]}
        value={settings.spendingPeriod}
        onChange={(spendingPeriod) => void set({ spendingPeriod })}
        testID="settings-spending-period"
      />
    </View>
  );
}
