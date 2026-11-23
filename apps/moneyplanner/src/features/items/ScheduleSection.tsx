// The Schedule part of the recurring item form: how often it repeats, the start date and when it ends.
import type { Dispatch, SetStateAction } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, DateField, SectionHeader, SelectField, Segmented, T, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { FormErrors, RecurringField, RecurringForm } from '@/features/items/form';
import { MONTH_NAMES, WEEKDAY_NAMES } from '@/features/items/schedule';
import { weekday } from '@/lib/dates';
import type { RecurringItem } from '@/types';

export function ScheduleSection({
  form,
  set,
  setForm,
  errors,
  item,
}: {
  form: RecurringForm;
  set: <K extends keyof RecurringForm>(key: K, value: RecurringForm[K]) => void;
  setForm: Dispatch<SetStateAction<RecurringForm>>;
  errors: FormErrors<RecurringField>;
  item: RecurringItem | null;
}) {
  const weekdayName = WEEKDAY_NAMES[weekday(form.startDate)];
  return (
    <>
      <SectionHeader title="Schedule" />
        <Card style={styles.group}>
          <Segmented
            label="Repeats"
            value={form.scheduleType}
            onChange={(v) => set('scheduleType', v)}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
            testID="recurring-schedule"
          />
          {form.scheduleType === 'monthly' && (
            <>
              <Segmented
                label="Day of the month"
                value={form.monthlyMode}
                onChange={(v) => set('monthlyMode', v)}
                options={[
                  { value: 'day', label: 'On a day' },
                  { value: 'last', label: 'Last day' },
                ]}
                testID="recurring-monthly-mode"
              />
              {form.monthlyMode === 'day' && (
                <TextField
                  label="Day of the month (1-31)"
                  value={form.day}
                  onChangeText={(t) => set('day', t)}
                  keyboardType="number-pad"
                  error={errors.day}
                  hint="In shorter months it happens on the last day."
                  testID="recurring-day"
                />
              )}
              <TextField
                label="Every how many months (1-12)"
                value={form.everyMonths}
                onChangeText={(t) => set('everyMonths', t)}
                keyboardType="number-pad"
                error={errors.everyMonths}
                hint="1 = every month, 3 = every three months."
                testID="recurring-every-months"
              />
            </>
          )}
          {form.scheduleType === 'weekly' && (
            <>
              <Segmented
                label="Every how many weeks"
                value={String(form.everyWeeks) as '1' | '2'}
                onChange={(v) => set('everyWeeks', v === '2' ? 2 : 1)}
                options={[
                  { value: '1', label: 'Every week' },
                  { value: '2', label: 'Every 2 weeks' },
                ]}
                testID="recurring-every-weeks"
              />
              <T variant="caption" tone="secondary">
                Weekly items happen on the same weekday as the start date, which is a {weekdayName}. Change the start date to change the weekday.
              </T>
            </>
          )}
          {form.scheduleType === 'yearly' && (
            <>
              <SelectField
                label="Month"
                value={String(form.month)}
                options={MONTH_NAMES.map((m, i) => ({
                  value: String(i + 1),
                  label: m,
                }))}
                onChange={(v) => set('month', Number(v))}
                testID="recurring-month"
              />
              <TextField label="Day of the month" value={form.day} onChangeText={(t) => set('day', t)} keyboardType="number-pad" error={errors.day} testID="recurring-day" />
            </>
          )}

          <DateField
            label="Start date"
            value={form.startDate}
            onChange={(d) => set('startDate', d)}
            error={errors.startDate}
            hint="The first date it can happen on."
            testID="recurring-start-date"
          />
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <T variant="label">Ends</T>
          </View>
          <Segmented
            label="Ends"
            value={form.endMode}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                endMode: v,
                // An end date only stays with a count when the saved item had both.
                endDate: v === 'none' ? null : v === 'count' && item?.count == null ? null : f.endDate,
              }))
            }
            options={[
              { value: 'none', label: 'No end' },
              { value: 'date', label: 'End date' },
              { value: 'count', label: 'Payments' },
            ]}
            testID="recurring-end-mode"
          />
          {form.endMode === 'date' && (
            <DateField
              label="End date"
              value={form.endDate}
              onChange={(d) => set('endDate', d)}
              error={errors.endDate}
              hint="The last date it can happen on."
              testID="recurring-end-date"
            />
          )}
          {form.endMode === 'count' && (
            <TextField
              label="Number of payments"
              value={form.count}
              onChangeText={(t) => set('count', t)}
              keyboardType="number-pad"
              error={errors.count}
              testID="recurring-count"
            />
          )}
        </Card>
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.three },
});
