// First-launch setup wizard: 3 steps (salary, payday, today's balance), then Start. The buffer starts at AED 1,000 (Settings changes it).
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, View } from 'react-native';

import { Button, Card, HeroCard, MoneyField, Screen, SelectField, T, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useData } from '@/data/DataProvider';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { DEFAULT_BUFFER, defaultSettings } from '@/data/defaults';
import {
  PAYDAY_OPTIONS,
  buildSalaryItem,
  choiceToPayday,
  describePayday,
  paydayForSettings,
  signedBalance,
  WIZARD_STEPS,
} from '@/features/settings/helpers';
import { ScreenTitle } from '@/features/settings/ScreenTitle';
import { newId } from '@/lib/id';
import { today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Fils } from '@/types';

const initial = defaultSettings();

export default function Onboarding() {
  const router = useRouter();
  const c = useTheme();
  const { repo, bump } = useData();
  const { active, profiles } = useProfiles();
  // The first profile is "Me"; later ones say whose setup this is.
  const isFirstProfile = profiles[0]?.id === active.id;
  const currency = initial.currency;

  const steps = WIZARD_STEPS;
  // The last screen ('done') is the summary with Start; only the first three are numbered steps.
  const STEPS = steps.length - 1;
  const [index, setIndex] = useState(0);
  const step = steps[index];
  // One id for the whole wizard, so saving twice updates the same Salary item.
  const salaryId = useRef(newId());
  const startingRef = useRef(false);
  const [salary, setSalary] = useState<Fils | null>(null);
  const [paydayChoice, setPaydayChoice] = useState('none');
  const [balance, setBalance] = useState<Fils | null>(null);
  const [overdrawn, setOverdrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const payday = choiceToPayday(paydayChoice);
  const hasSalary = salary != null && salary > 0;
  const finalBalance = signedBalance(balance, overdrawn);

  const next = () => {
    if (step === 'payday' && hasSalary && payday == null) {
      setError('Choose the day you get paid, or clear the amount.');
      return;
    }
    setError(null);
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  };
  const back = () => {
    setError(null);
    setIndex((i) => Math.max(0, i - 1));
  };
  // Skipping a step also forgets what was typed on it.
  const skip = () => {
    if (step === 'salary') {
      setSalary(null);
    } else if (step === 'payday') {
      // A salary needs a payday: skipping the payday forgets the salary too.
      setSalary(null);
      setPaydayChoice('none');
    } else if (step === 'balance') {
      setBalance(null);
      setOverdrawn(false);
    }
    setError(null);
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  };

  // Android Back goes to the previous step; on the first step (or while saving) it does nothing.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!saving && index > 0) {
        setError(null);
        setIndex(index - 1);
      }
      return true;
    });
    return () => sub.remove();
  }, [index, saving]);

  const start = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setSaving(true);
    try {
      const todayDate = today();
      if (hasSalary && payday != null) {
        await repo.upsertRecurring(buildSalaryItem(salary as Fils, payday, todayDate, salaryId.current));
      }
      await repo.updateSettings({
        payday: paydayForSettings(payday),
        startingBalance: finalBalance,
        startingBalanceDate: todayDate,
        buffer: DEFAULT_BUFFER,
        onboarded: true,
      });
      bump();
      router.replace('/');
    } catch (e) {
      startingRef.current = false;
      setSaving(false);
      Alert.alert('Could not save your setup', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen testID="onboarding-screen">
      {step !== 'done' && (
        <T variant="caption" tone="secondary" accessibilityLabel={`Step ${index + 1} of ${STEPS}`} testID="onboarding-step">
          {`Step ${index + 1} of ${STEPS}`}
        </T>
      )}
      <View style={{ flexDirection: 'row', gap: Spacing.one }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {steps.slice(0, STEPS).map((s, i) => (
          <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= index ? c.accent : c.border }} />
        ))}
      </View>

      {step === 'salary' && (
        <View style={{ gap: Spacing.three }}>
          <HeroCard testID="onboarding-hero">
            <View accessible accessibilityRole="header">
              <T variant="title" style={{ color: '#FFFFFF' }}>
                Welcome
              </T>
            </View>
            {!isFirstProfile && (
              <T variant="label" style={{ color: '#FFFFFF' }} testID="onboarding-profile-name">
                {`Setting up ${active.name}`}
              </T>
            )}
            <T style={{ color: '#FFFFFF' }}>See where your money goes and what is left each month. Your data stays on this phone: no account, no bank login. Tracking only, not financial advice.</T>
          </HeroCard>
          <ScreenTitle>Your salary</ScreenTitle>
          <T tone="secondary">We will add it as a monthly income so your plan starts with it. You can skip this and add it later.</T>
          <Card>
            <MoneyField label="Monthly salary" value={salary} onChange={setSalary} currency={currency} testID="onboarding-salary" />
          </Card>
        </View>
      )}

      {step === 'payday' && (
        <View style={{ gap: Spacing.three }}>
          <ScreenTitle>Your payday</ScreenTitle>
          <T tone="secondary">The day you usually get paid. The app counts your month from it.</T>
          <Card>
            <SelectField
              label="Payday"
              value={paydayChoice}
              options={PAYDAY_OPTIONS}
              onChange={setPaydayChoice}
              error={error}
              testID="onboarding-payday"
            />
          </Card>
        </View>
      )}

      {step === 'balance' && (
        <View style={{ gap: Spacing.three }}>
          <ScreenTitle>Your balance today</ScreenTitle>
          <T tone="secondary">The forecast starts from what is in your bank account now.</T>
          <Card>
            <MoneyField label="Bank balance today" value={balance} onChange={setBalance} currency={currency} testID="onboarding-balance" />
            <ToggleRow label="My account is overdrawn" value={overdrawn} onChange={setOverdrawn} testID="onboarding-overdrawn" />
          </Card>
        </View>
      )}

      {step === 'done' && (
        <View style={{ gap: Spacing.three }}>
          <ScreenTitle>All set</ScreenTitle>
          <Card testID="onboarding-summary">
            <T>{hasSalary && payday != null ? `Salary: ${formatMoney(salary as Fils, currency)} every month, ${describePayday(payday)}` : 'Salary: not added yet'}</T>
            <T>{`Balance today: ${formatMoney(finalBalance, currency)}`}</T>
            <T>{`Buffer: ${formatMoney(DEFAULT_BUFFER, currency)} (the least you want to keep in your account)`}</T>
          </Card>
          <T variant="caption" tone="secondary">
            Everything, including the buffer, can be changed later in Settings.
          </T>
          <T variant="caption" tone="secondary" testID="onboarding-alerts-note">
            Turn on phone notifications later in Settings → Alerts.
          </T>
        </View>
      )}

      <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
        {step !== 'done' ? (
          <Button label="Next" onPress={next} testID="onboarding-next" />
        ) : (
          <Button label="Start" onPress={start} disabled={saving} testID="onboarding-start" />
        )}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          {index > 0 && (
            <View style={{ flex: 1 }}>
              <Button label="Back" variant="secondary" onPress={back} disabled={saving} testID="onboarding-back" />
            </View>
          )}
          {step !== 'done' && (
            <View style={{ flex: 1 }}>
              <Button label="Skip" variant="plain" onPress={skip} accessibilityHint="Skips this step" testID="onboarding-skip" />
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
