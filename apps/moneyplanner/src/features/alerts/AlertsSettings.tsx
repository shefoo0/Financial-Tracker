// The alert editors: phone notifications (with the permission explainer), bill reminders and alert levels.
// Used inside sheets (Home's Alerts card, Settings -> Notifications). Everything saves as soon as it is changed;
// the explainer replaces the editor inside the same sheet (no second pop-up over a pop-up).
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Button, Segmented, T, TextField, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useSettingSetter } from '@/data/useSettingSetter';
import { SAVED_TEXT, useSavedTick } from '@/features/edit/useSavedTick';
import type { Settings } from '@/types';
import { usePermission } from './notifications';
import { LEAD_DAY_OPTIONS, leadLabel, validateThresholds, type ThresholdDrafts, type ThresholdErrors } from './plan';
import { useAlertsSwitch } from './useAlertsSwitch';

/** Bill reminders on/off and how long before a bill they come. */
export function BillRemindersEditor({ settings }: { settings: Settings }) {
  const { set } = useSettingSetter();
  const r = settings.billReminders;
  return (
    <View style={{ gap: Spacing.two }}>
      <ToggleRow
        label="Bill reminders"
        description="A notification before each bill: recurring costs, debt payments, cheques and planned costs. Turn a single bill off with the bell on Home."
        value={r.on}
        onChange={(on) => void set({ billReminders: { ...r, on } })}
        testID="settings-bill-reminders"
      />
      {r.on ? (
        <View style={{ gap: Spacing.one }}>
          <T variant="label">Remind me</T>
          <Segmented
            label="Remind me before a bill is due"
            options={LEAD_DAY_OPTIONS.map((n) => ({ value: String(n), label: leadLabel(n) }))}
            value={String(r.leadDays)}
            onChange={(v) => void set({ billReminders: { ...r, leadDays: Number(v) } })}
            testID="settings-bill-lead"
          />
          <T variant="caption" tone="secondary">
            At 09:00, {r.leadDays === 0 ? 'on the day' : `${leadLabel(r.leadDays)} before`} the bill is due.
            {r.muted.length ? ` ${r.muted.length} bill${r.muted.length === 1 ? '' : 's'} turned off.` : ''}
          </T>
        </View>
      ) : null}
    </View>
  );
}

/** The three alert levels; each is checked and saved when its field loses focus. */
export function AlertLevelsEditor({ settings }: { settings: Settings }) {
  const { set } = useSettingSetter();
  const t = settings.alertThresholds;
  const [drafts, setDrafts] = useState<ThresholdDrafts>({ debtCautionPct: String(t.debtCautionPct), debtHighPct: String(t.debtHighPct), cardUsagePct: String(t.cardUsagePct) });
  const [errors, setErrors] = useState<ThresholdErrors>({});
  const tick = useSavedTick();

  const edit = (key: keyof ThresholdDrafts) => (v: string) => {
    setDrafts({ ...drafts, [key]: v });
    setErrors({});
  };
  const commit = async () => {
    const result = validateThresholds(drafts);
    setErrors(result.errors);
    if (!result.value) return;
    const v = result.value;
    if (v.debtCautionPct === t.debtCautionPct && v.debtHighPct === t.debtHighPct && v.cardUsagePct === t.cardUsagePct) return;
    if (await set({ alertThresholds: v })) tick.flash();
  };

  return (
    <View style={{ gap: Spacing.two }}>
      <T variant="label">{tick.saved ? `Alert levels  ${SAVED_TEXT}` : 'Alert levels'}</T>
      <TextField
        label="Debt payments: caution at (% of income)"
        value={drafts.debtCautionPct}
        onChangeText={edit('debtCautionPct')}
        onBlur={commit}
        keyboardType="number-pad"
        error={errors.debtCautionPct}
        testID="settings-threshold-caution"
      />
      <TextField
        label="Debt payments: high at (% of income)"
        value={drafts.debtHighPct}
        onChangeText={edit('debtHighPct')}
        onBlur={commit}
        keyboardType="number-pad"
        error={errors.debtHighPct}
        testID="settings-threshold-high"
      />
      <TextField
        label="Credit card usage: alert at (% of limit)"
        value={drafts.cardUsagePct}
        onChangeText={edit('cardUsagePct')}
        onBlur={commit}
        keyboardType="number-pad"
        error={errors.cardUsagePct}
        testID="settings-threshold-card"
      />
    </View>
  );
}

/** Phone notifications switch + status + alert levels (and, with `withReminders`, the bill reminders). */
export function AlertsSettings({ settings, withReminders = false }: { settings: Settings; withReminders?: boolean }) {
  const alerts = useAlertsSwitch(settings.notificationsOn);
  const { permission } = usePermission();

  if (alerts.stage !== null) return <View testID="alerts-explainer">{alerts.body}</View>;

  const status =
    permission == null
      ? null
      : permission.state === 'unsupported'
        ? 'Notifications: not available in the web preview'
        : permission.state === 'granted'
          ? 'Notifications: on'
          : 'Notifications: off';

  return (
    <View testID="settings-alerts" style={{ gap: Spacing.three }}>
      <View>
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
      </View>
      {withReminders ? <BillRemindersEditor settings={settings} /> : null}
      <AlertLevelsEditor settings={settings} />
    </View>
  );
}
