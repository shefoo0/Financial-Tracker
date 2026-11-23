import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, EmptyState, Screen, ScreenHeader } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useData, usePlanInput } from '@/data/DataProvider';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { AlertsSheet, BalanceSheet, PaydaySheet, RemindersSheet, SpendingSheet } from '@/features/edit';
import { ErrorScreen, LoadingScreen } from '@/features/dashboard/Parts';
import { useDashboardModel } from '@/features/dashboard/useDashboardModel';
import { HomeCards } from '@/features/home/HomeCards';
import type { HomeCtx, SheetKey } from '@/features/home/ctx';
import { useHomeTips } from '@/features/home/tips';
import { markPaid } from '@/features/payday/markPaid';
import { UndoBar } from '@/features/payday/UndoBar';
import { ProfileButton } from '@/features/profiles/ProfileButton';
import { QuickAddButton, QuickAddSpacer } from '@/features/quickadd/QuickAddButton';
import type { UpcomingItem } from '@/features/dashboard/upcoming';
import { formatMoney } from '@/lib/money';
import type { PlanInput } from '@/types';

export default function Dashboard() {
  const { data, loading, error, reload } = usePlanInput();
  if (error && !data) return <ErrorScreen onRetry={reload} />;
  if (!data) return loading ? <LoadingScreen /> : <ErrorScreen onRetry={reload} />;
  return <DashboardBody input={data} />;
}

function greeting(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function DashboardBody({ input }: { input: PlanInput }) {
  const router = useRouter();
  const { active } = useProfiles();
  const model = useDashboardModel(input);
  const { todayStr, empty } = model;
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const tips = useHomeTips(input.settings, !empty);
  const { repo, bump } = useData();
  const [undo, setUndo] = useState<{ message: string; run: () => Promise<void> } | null>(null);
  const dismissUndo = useCallback(() => setUndo(null), []);
  const { currency } = input.settings;
  const money = (v: number) => formatMoney(v, currency);

  const onPaid = async (u: UpcomingItem) => {
    try {
      const run = await markPaid(repo, input, u.markPaid, todayStr);
      if (run) setUndo({ message: `${u.title} marked as paid`, run });
    } catch {
      Alert.alert("Couldn't save", 'The payment was not recorded. Please try again.');
    } finally {
      bump();
    }
  };
  const reminders = input.settings.billReminders;
  const toggleReminder = async (u: UpcomingItem) => {
    const muted = reminders.muted.includes(u.refId) ? reminders.muted.filter((x) => x !== u.refId) : [...reminders.muted, u.refId];
    try {
      await repo.updateSettings({ billReminders: { ...reminders, muted } });
    } catch {
      Alert.alert("Couldn't save", 'The reminder was not changed. Please try again.');
    } finally {
      bump();
    }
  };
  const onUndo = async () => {
    const u = undo;
    setUndo(null);
    if (!u) return;
    try {
      await u.run();
    } catch {
      Alert.alert("Couldn't undo", 'The change was not reversed. Please try again.');
    } finally {
      bump();
    }
  };

  const header = (
    <ScreenHeader title={active.name} subtitle={greeting(new Date().getHours())} right={<ProfileButton />} testID="dashboard-header" />
  );

  if (empty) {
    return (
      <Screen testID="dashboard-screen">
        {header}
        <EmptyState
          title="Welcome to Money Planner"
          message="Add your salary and your regular costs, and this screen shows how much is free each month and whether your balance will hold up."
          action={
            <View style={{ gap: Spacing.two, alignSelf: 'stretch' }}>
              <Button label="Add your salary" onPress={() => router.push('/recurring/new?kind=income')} testID="dashboard-add-salary" />
              <Button label="Add a cost" variant="secondary" onPress={() => router.push('/recurring/new?kind=cost')} testID="dashboard-add-cost" />
            </View>
          }
        />
      </Screen>
    );
  }

  const closeSheet = () => setSheet(null);
  const ctx: HomeCtx = {
    input,
    model,
    money,
    onPaid,
    toggleReminder,
    openSheet: (key) => {
      if (key === 'balance' && tips.balance) tips.dismiss('edit-balance');
      setSheet(key);
    },
    balanceTip: tips.balance,
    dismissTip: tips.dismiss,
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen testID="dashboard-screen">
        {header}
        <HomeCards ctx={ctx} editHomeTip={tips.editHome} />
        <QuickAddSpacer />
      </Screen>
      {undo ? <UndoBar message={undo.message} onUndo={onUndo} onDismiss={dismissUndo} /> : null}
      <QuickAddButton testID="quick-add" />
      <BalanceSheet visible={sheet === 'balance'} onClose={closeSheet} />
      <PaydaySheet visible={sheet === 'payday'} onClose={closeSheet} />
      <RemindersSheet visible={sheet === 'reminders'} onClose={closeSheet} />
      <AlertsSheet visible={sheet === 'alerts'} onClose={closeSheet} />
      <SpendingSheet visible={sheet === 'spending'} onClose={closeSheet} />
    </View>
  );
}
