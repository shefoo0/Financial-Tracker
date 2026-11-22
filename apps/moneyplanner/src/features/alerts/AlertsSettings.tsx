// Settings -> Alerts: the switch (with the permission explainer), the
// notification status and the alert thresholds.
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { Button, Card, SectionHeader, T, TextField, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Settings } from '@/types';
import { usePermission } from './notifications';
import { validateThresholds, type ThresholdDrafts, type ThresholdErrors } from './plan';
import { useAlertsSwitch } from './useAlertsSwitch';

export function AlertsSettings({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => Promise<unknown> }) {
  const alerts = useAlertsSwitch(settings.enabledModules, update);
  const { permission } = usePermission();
  const t = settings.alertThresholds;
  const [drafts, setDrafts] = useState<ThresholdDrafts | null>(null);
  const [errors, setErrors] = useState<ThresholdErrors>({});
  const [busy, setBusy] = useState(false);

  const d: ThresholdDrafts = drafts ?? { debtCautionPct: String(t.debtCautionPct), debtHighPct: String(t.debtHighPct), cardUsagePct: String(t.cardUsagePct) };
  const set = (key: keyof ThresholdDrafts) => (v: string) => setDrafts({ ...d, [key]: v });
  const dirty = drafts !== null && (d.debtCautionPct !== String(t.debtCautionPct) || d.debtHighPct !== String(t.debtHighPct) || d.cardUsagePct !== String(t.cardUsagePct));

  const save = async () => {
    const result = validateThresholds(d);
    setErrors(result.errors);
    if (!result.value) return;
    setBusy(true);
    try {
      await update({ alertThresholds: result.value });
      setDrafts(null);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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
          label="Alerts"
          description="Warnings before money runs short, on the dashboard and as reminders"
          value={alerts.value}
          onChange={alerts.onChange}
          testID="settings-module-alerts"
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
