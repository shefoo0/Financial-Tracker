// First-launch setup wizard: welcome, salary, balance, modules, done.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, MoneyField, Screen, SelectField, T, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useData } from '@/data/DataProvider';
import { defaultSettings } from '@/data/defaults';
import {
  MODULE_INFO,
  PAYDAY_OPTIONS,
  buildSalaryItem,
  choiceToPayday,
  paydayForSettings,
  signedBalance,
} from '@/features/settings/helpers';
import { today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Fils, ModuleId } from '@/types';

const STEPS = 5;
const initial = defaultSettings();

export default function Onboarding() {
  const router = useRouter();
  const { repo, bump } = useData();
  const currency = initial.currency;

  const [step, setStep] = useState(1);
  const [salary, setSalary] = useState<Fils | null>(null);
  const [paydayChoice, setPaydayChoice] = useState('none');
  const [balance, setBalance] = useState<Fils | null>(null);
  const [overdrawn, setOverdrawn] = useState(false);
  const [buffer, setBuffer] = useState<Fils | null>(null);
  const [modules, setModules] = useState<Record<ModuleId, boolean>>(initial.enabledModules);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const payday = choiceToPayday(paydayChoice);
  const hasSalary = salary != null && salary > 0;
  const finalBalance = signedBalance(balance, overdrawn);

  const next = () => {
    if (step === 2 && hasSalary && payday == null) {
      setError('Choose the day you get paid, or clear the amount.');
      return;
    }
    setError(null);
    setStep((s) => Math.min(STEPS, s + 1));
  };
  const back = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };
  const skip = () => {
    setError(null);
    setStep((s) => Math.min(STEPS, s + 1));
  };

  const start = async () => {
    setSaving(true);
    try {
      const todayDate = today();
      if (hasSalary && payday != null) {
        await repo.upsertRecurring(buildSalaryItem(salary as Fils, payday, todayDate));
      }
      await repo.updateSettings({
        payday: paydayForSettings(payday),
        startingBalance: finalBalance,
        startingBalanceDate: todayDate,
        buffer: buffer ?? 0,
        enabledModules: modules,
        onboarded: true,
      });
      bump();
      router.replace('/');
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save your setup', e instanceof Error ? e.message : String(e));
    }
  };

  const enabledNames = MODULE_INFO.filter((m) => modules[m.id]).map((m) => m.label);

  return (
    <Screen testID="onboarding-screen">
      <T variant="caption" tone="secondary" accessibilityLabel={`Step ${step} of ${STEPS}`} testID="onboarding-step">
        {`Step ${step} of ${STEPS}`}
      </T>

      {step === 1 && (
        <View style={{ gap: Spacing.three }}>
          <T variant="title">Welcome</T>
          <T>See where your money goes and what is left each month. Add your income and bills once, and the app shows what is coming.</T>
          <Card>
            <T variant="label">Your data stays on this phone. No account, no bank login.</T>
          </Card>
          <T variant="caption" tone="secondary">
            Tracking only — not financial advice.
          </T>
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: Spacing.three }}>
          <T variant="title">Your salary</T>
          <T tone="secondary">We will add it as a monthly income so your plan starts with it. You can skip this and add it later.</T>
          <MoneyField label="Monthly salary" value={salary} onChange={setSalary} currency={currency} testID="onboarding-salary" />
          <SelectField
            label="Payday"
            value={paydayChoice}
            options={PAYDAY_OPTIONS}
            onChange={setPaydayChoice}
            error={error}
            testID="onboarding-payday"
          />
        </View>
      )}

      {step === 3 && (
        <View style={{ gap: Spacing.three }}>
          <T variant="title">Your balance today</T>
          <T tone="secondary">The forecast starts from what is in your bank account now.</T>
          <MoneyField label="Bank balance today" value={balance} onChange={setBalance} currency={currency} testID="onboarding-balance" />
          <Card>
            <ToggleRow label="My account is overdrawn" value={overdrawn} onChange={setOverdrawn} testID="onboarding-overdrawn" />
          </Card>
          <MoneyField
            label="Buffer"
            value={buffer}
            onChange={setBuffer}
            currency={currency}
            hint="The least you want to keep in your account. You get a warning if the forecast goes below it."
            testID="onboarding-buffer"
          />
        </View>
      )}

      {step === 4 && (
        <View style={{ gap: Spacing.three }}>
          <T variant="title">Extra features</T>
          <T tone="secondary">Switch on what you need. You can change these any time in Settings.</T>
          <Card>
            {MODULE_INFO.map((m) => (
              <ToggleRow
                key={m.id}
                label={m.label}
                description={m.description}
                value={modules[m.id]}
                onChange={(v) => setModules((prev) => ({ ...prev, [m.id]: v }))}
                testID={`onboarding-module-${m.id}`}
              />
            ))}
          </Card>
        </View>
      )}

      {step === 5 && (
        <View style={{ gap: Spacing.three }}>
          <T variant="title">All set</T>
          <Card testID="onboarding-summary">
            <T>{hasSalary && payday != null ? `Salary: ${formatMoney(salary as Fils, currency)} every month, ${payday === 'last' ? 'on the last day' : `on day ${payday}`}` : 'Salary: not added yet'}</T>
            <T>{`Balance today: ${formatMoney(finalBalance, currency)}`}</T>
            <T>{`Buffer: ${formatMoney(buffer ?? 0, currency)}`}</T>
            <T>{`Extra features: ${enabledNames.length ? enabledNames.join(', ') : 'none'}`}</T>
          </Card>
          <T variant="caption" tone="secondary">
            Everything can be changed later in Settings.
          </T>
        </View>
      )}

      <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
        {step < STEPS ? (
          <Button label="Next" onPress={next} testID="onboarding-next" />
        ) : (
          <Button label="Start" onPress={start} disabled={saving} testID="onboarding-start" />
        )}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          {step > 1 && (
            <View style={{ flex: 1 }}>
              <Button label="Back" variant="secondary" onPress={back} disabled={saving} testID="onboarding-back" />
            </View>
          )}
          {step >= 2 && step < STEPS && (
            <View style={{ flex: 1 }}>
              <Button label="Skip" variant="plain" onPress={skip} accessibilityHint="Skips this step" testID="onboarding-skip" />
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
