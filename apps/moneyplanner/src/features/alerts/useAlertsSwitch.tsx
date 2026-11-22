// The Alerts on/off switch with the permission explainer. Used by Settings and
// anywhere else the Alerts module can be switched on (e.g. the setup wizard):
//
//   const alerts = useAlertsSwitch(settings.enabledModules, (patch) => update(patch));
//   <ToggleRow value={alerts.value} onChange={alerts.onChange} ... />
//   {alerts.sheet}
//
// Turning it on shows the explainer first and only then the system prompt.
import { useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';

import { Button, Sheet, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { ModuleId, Settings } from '@/types';
import { getPermission, requestPermission } from './notifications';

type Stage = 'explain' | 'denied' | null;

export function AlertsExplainerSheet({
  stage,
  busy,
  onAllow,
  onInAppOnly,
  onOpenSettings,
  onClose,
}: {
  stage: Stage;
  busy: boolean;
  onAllow: () => void;
  onInAppOnly: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={stage !== null} onClose={onClose} title={stage === 'denied' ? 'Notifications are off' : 'Alerts and notifications'} testID="alerts-explainer">
      {stage === 'denied' ? (
        <View style={{ gap: Spacing.three }}>
          <T testID="alerts-denied-text">
            Notifications are switched off for Money Planner on this phone, so reminders can't appear. Alerts still show on the dashboard. To get reminders, open your phone's settings, choose Notifications, and allow
            them for Money Planner.
          </T>
          <Button label="Open phone settings" onPress={onOpenSettings} testID="alerts-open-settings" />
          <Button label="Keep alerts in the app only" variant="secondary" onPress={onInAppOnly} testID="alerts-inapp-only" />
          <Button label="Close" variant="plain" onPress={onClose} testID="alerts-explainer-close" />
        </View>
      ) : (
        <View style={{ gap: Spacing.three }}>
          <T>
            Money Planner can remind you at 9:00 in the morning, a day or so before something happens: a balance that would drop below zero or your buffer, a card near its limit, a cheque that isn't covered, or a debt
            that ends.
          </T>
          <T tone="secondary">
            Reminders are created on this phone from your own numbers. Nothing is sent to a server. If this profile has a lock, a reminder only says that a payment needs attention, with no amounts or names.
          </T>
          <T tone="secondary">Your phone will ask for permission next.</T>
          <Button label="Allow notifications" onPress={onAllow} disabled={busy} testID="alerts-allow" />
          <Button label="Only show alerts in the app" variant="secondary" onPress={onInAppOnly} disabled={busy} testID="alerts-inapp-only" />
          <Button label="Not now" variant="plain" onPress={onClose} testID="alerts-explainer-close" />
        </View>
      )}
    </Sheet>
  );
}

export function useAlertsSwitch(enabledModules: Record<ModuleId, boolean>, update: (patch: Partial<Settings>) => Promise<unknown>) {
  const [stage, setStage] = useState<Stage>(null);
  const [busy, setBusy] = useState(false);

  const setModule = (v: boolean) => update({ enabledModules: { ...enabledModules, alerts: v } });

  const onChange = async (v: boolean) => {
    if (!v) {
      await setModule(false);
      return;
    }
    const p = await getPermission();
    if (p.state === 'granted' || p.state === 'unsupported') {
      await setModule(true);
      return;
    }
    setStage(p.state === 'denied' && !p.canAskAgain ? 'denied' : 'explain');
  };

  const onAllow = async () => {
    setBusy(true);
    try {
      const p = await requestPermission();
      await setModule(true);
      setStage(p.state === 'granted' ? null : 'denied');
    } finally {
      setBusy(false);
    }
  };

  const onInAppOnly = async () => {
    await setModule(true);
    setStage(null);
  };

  const onOpenSettings = () => {
    Linking.openSettings().catch(() => undefined);
  };

  const sheet: ReactNode = (
    <AlertsExplainerSheet stage={stage} busy={busy} onAllow={onAllow} onInAppOnly={onInAppOnly} onOpenSettings={onOpenSettings} onClose={() => setStage(null)} />
  );
  return { value: enabledModules.alerts, onChange, sheet };
}
