// Settings -> Alerts: the switch (with the permission explainer), the
// notification status and the alert thresholds.
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Button, Card, Segmented, SectionHeader, T, TextField, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useSettingSetter } from '@/data/useSettingSetter';
import type { Settings } from '@/types';
import { usePermission } from './notifications';
import { LEAD_DAY_OPTIONS, leadLabel, validateThresholds, type ThresholdDrafts, type ThresholdErrors } from './plan';
import { useAlertsSwitch } from './useAlertsSwitch';

export function AlertsSettings({ settings }: { settings: Settings }) {
  const alerts = useAlertsSwitch(settings.notificationsOn);
  const { set: setSetting, busy } = useSettingSetter();
  const { permission } = usePermission();
  const t = settings.alertThresholds;
  const [drafts, setDrafts] = useState<ThresholdDrafts | null>(null);
  const [errors, setErrors] = useState<ThresholdErrors>({});

  const d: ThresholdDrafts = drafts ?? { debtCautionPct: String(t.debtCautionPct), debtHighPct: String(t.debtHighPct), cardUsagePct: String(t.cardUsagePct) };
  const set = (key: keyof ThresholdDrafts) => (v: string) => setDrafts({ ...d, [key]: v });
  const dirty = drafts !== null && (d.debtCautionPct !== String(t.debtCautionPct) || d.debtHighPct !== String(t.debtHighPct) || d.cardUsagePct !== String(t.cardUsagePct));

  const save = async () => {
    const result = validateThresholds(d);
    setErrors(result.errors);
    if (!result.value) return;
    if (await setSetting({ alertThresholds: result.value })) setDrafts(null);
  };

  const status =
    permission == null
      ? null
      : permission.state === 'unsupported'
        ? 'Notifications: not available in the web preview'
        : permission.state === 'granted'
          ? 'Notifications: on'
          : 'Notifications: off';

  return (
    <View testID="settings-alerts">
      <SectionHeader title="Alerts" />
      <Card>
        <ToggleRow
          label="Phone notifications"
          description="Reminders before a payment or when money may run short. Alerts always show in the app."
          value={alerts.value}
          onChange={alerts.onChange}
          testID="settings-notifications"
        />
        {status ? (
          <T variant="caption" tone="secondary" testID="settings-alerts-status">
            {status}
          </T>
        ) : null}
        {alerts.value && permission && (permission.state === 'denied' || permission.state === 'undetermined') ? (
          <Button
            label={permission.state === 'denied' && !permission.canAskAgain ? 'Open phone settings to allow notifications' : 'Allow notifications'}
            variant="secondary"
            onPress={() => (permission.state === 'denied' && !permission.canAskAgain ? Linking.openSettings().catch(() => undefined) : alerts.onChange(true))}
            testID="settings-alerts-allow"
          />
        ) : null}
        <ToggleRow
          label="Bill reminders"
          description="A notification before each bill: recurring costs, debt payments, cheques and planned costs. Turn a single bill off with the bell on Home."
          value={settings.billReminders.on}
          onChange={(on) => setSetting({ billReminders: { ...settings.billReminders, on } })}
          testID="settings-bill-reminders"
        />
        {settings.billReminders.on ? (
          <View style={{ gap: Spacing.one }}>
            <T variant="label">Remind me</T>
            <Segmented
              label="Remind me before a bill is due"
              options={LEAD_DAY_OPTIONS.map((n) => ({ value: String(n), label: leadLabel(n) }))}
              value={String(settings.billReminders.leadDays)}
              onChange={(v) => setSetting({ billReminders: { ...settings.billReminders, leadDays: Number(v) } })}
              testID="settings-bill-lead"
            />
            <T variant="caption" tone="secondary">
              At 09:00, {settings.billReminders.leadDays === 0 ? 'on the day' : `${leadLabel(settings.billReminders.leadDays)} before`} the bill is due.
              {settings.billReminders.muted.length ? ` ${settings.billReminders.muted.length} bill${settings.billReminders.muted.length === 1 ? '' : 's'} turned off.` : ''}
            </T>
          </View>
        ) : null}
        <T variant="label">Alert levels</T>
        <TextField
          label="Debt payments: caution at (% of income)"
          value={d.debtCautionPct}
          onChangeText={set('debtCautionPct')}
          keyboardType="number-pad"
          error={errors.debtCautionPct}
          testID="settings-threshold-caution"
        />
        <TextField
          label="Debt payments: high at (% of income)"
          value={d.debtHighPct}
          onChangeText={set('debtHighPct')}
          keyboardType="number-pad"
          error={errors.debtHighPct}
          testID="settings-threshold-high"
        />
        <TextField
          label="Credit card usage: alert at (% of limit)"
          value={d.cardUsagePct}
          onChangeText={set('cardUsagePct')}
          keyboardType="number-pad"
          error={errors.cardUsagePct}
          testID="settings-threshold-card"
        />
        <Button label="Save alert levels" onPress={save} disabled={busy || !dirty} testID="settings-thresholds-save" />
        <View style={{ height: Spacing.half }} />
      </Card>
      {alerts.sheet}
    </View>
  );
}
