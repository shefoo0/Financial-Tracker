// Cheques: upcoming (with a covered/short fact), cleared and cancelled.
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, EmptyState, HeroCard, Screen, ScreenHeader, SectionHeader, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePlanInput, useRepoMutation, useRepoQuery } from '@/data/DataProvider';
import { ChequeRow } from '@/features/cheques/ChequeRow';
import { chequeCoverage, groupCheques, inDaysLabel } from '@/features/cheques/logic';
import { useToday } from '@/features/dashboard/useToday';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Cheque } from '@/types';

const open = (id: string) => router.push({ pathname: '/cheques/[id]', params: { id } });
const openNew = (series: boolean) => router.push({ pathname: '/cheques/[id]', params: series ? { id: 'new', series: '1' } : { id: 'new' } });

export default function ChequesScreen() {
  const plan = usePlanInput();
  const list = useRepoQuery((r) => r.listCheques());
  const data = plan.data;
  const all = list.data;
  const error = plan.error ?? list.error;
  const reload = () => {
    plan.reload();
    list.reload();
  };
  const today = useToday();
  const [showCancelled, setShowCancelled] = useState(false);
  const save = useRepoMutation((r, c: Cheque) => r.upsertCheques([c]));

  if (!data || !all) {
    return (
      <Screen testID="cheques-screen">
        <Stack.Screen options={{ title: 'Cheques' }} />
        <ScreenHeader title="Cheques" />
        {error ? (
          <EmptyState title="Couldn't load your cheques" message="Nothing has been lost. Try again." action={<Button label="Try again" onPress={reload} testID="cheques-retry" />} />
        ) : (
          <T tone="secondary">Loading…</T>
        )}
      </Screen>
    );
  }

  // The list is read directly (the plan input leaves cheques out while the module is off).
  const currency = data.settings.currency;
  const { upcoming, cleared, cancelled } = groupCheques([...all]);
  const coverage = chequeCoverage(data, upcoming, today);
  const total = upcoming.reduce((s, c) => s + c.amount, 0);
  const next = upcoming[0];

  const clear = async (c: Cheque) => {
    try {
      await save({ ...c, status: 'cleared' });
    } catch {
      Alert.alert("Couldn't update", 'The cheque was not changed. Please try again.');
    }
  };

  const rows = (list: Cheque[], offset: number) =>
    list.map((c, i) => (
      <ChequeRow
        key={c.id}
        cheque={c}
        index={offset + i}
        today={today}
        currency={currency}
        coverage={coverage.get(c.id)}
        onOpen={() => open(c.id)}
        onClear={c.status === 'upcoming' ? () => clear(c) : undefined}
      />
    ));

  return (
    <Screen testID="cheques-screen">
      <Stack.Screen options={{ title: 'Cheques' }} />
      <ScreenHeader title="Cheques" />
      {all.length === 0 ? (
        <EmptyState
          title="No cheques yet"
          message="Add post-dated cheques, such as rent, to see each one against your projected balance on its date."
          action={
            <View style={styles.buttons}>
              <Button label="Add cheque" onPress={() => openNew(false)} testID="cheques-add" />
              <Button label="Add a series" variant="secondary" onPress={() => openNew(true)} testID="cheques-add-series" />
            </View>
          }
        />
      ) : (
        <>
          <HeroCard
            testID="cheques-hero"
            accessibilityLabel={`Upcoming cheques: ${formatMoney(total, currency)} in ${upcoming.length} cheques${next ? `. Next: ${next.payee}, ${formatMoney(next.amount, currency)}, ${formatDate(next.date)}` : ''}`}>
            <T variant="caption" tone="onHero">
              Upcoming cheques
            </T>
            <T variant="title" tone="onHero">
              {formatMoney(total, currency)}
            </T>
            <T tone="onHero">
              {next ? `Next: ${next.payee}, ${formatMoney(next.amount, currency)}, ${inDaysLabel(next.date, today)}` : 'No upcoming cheques'}
            </T>
          </HeroCard>
          <View style={styles.buttons}>
            <Button label="Add cheque" onPress={() => openNew(false)} testID="cheques-add" />
            <Button label="Add a series" variant="secondary" onPress={() => openNew(true)} testID="cheques-add-series" />
          </View>

          <SectionHeader title="Upcoming" />
          {upcoming.length === 0 ? <T tone="secondary">Nothing upcoming.</T> : rows(upcoming, 0)}

          {cleared.length > 0 && (
            <>
              <SectionHeader title="Cleared" />
              {rows(cleared, upcoming.length)}
            </>
          )}

          {cancelled.length > 0 && (
            <>
              <SectionHeader title="Cancelled" />
              <Pressable
                onPress={() => setShowCancelled((s) => !s)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showCancelled }}
                accessibilityLabel={`${showCancelled ? 'Hide' : 'Show'} ${cancelled.length} cancelled cheques`}
                testID="cheques-cancelled-toggle"
                style={styles.toggle}>
                <T tone="accent" variant="label">
                  {showCancelled ? 'Hide' : 'Show'} {cancelled.length} cancelled
                </T>
              </Pressable>
              {showCancelled && rows(cancelled, upcoming.length + cleared.length)}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: Spacing.two, alignSelf: 'stretch' },
  toggle: { minHeight: 44, justifyContent: 'center' },
});
