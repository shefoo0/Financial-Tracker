// The Alerts on/off switch with the permission explainer. Used by Settings and
// anywhere else phone notifications can be switched on (e.g. the setup wizard):
//
//   const alerts = useAlertsSwitch(settings.notificationsOn);
//   <ToggleRow value={alerts.value} onChange={alerts.onChange} ... />
//   {alerts.sheet}
//
// Turning it on shows the explainer first and only then the system prompt.
import { useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';

import { Button, Sheet, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useSettingSetter } from '@/data/useSettingSetter';
import { getPermission, requestPermission } from './notifications';

type Stage = 'explain' | 'denied' | null;

interface ExplainerProps {
  stage: Stage;
  busy: boolean;
  onAllow: () => void;
  onInAppOnly: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

export function AlertsExplainerSheet(props: ExplainerProps) {
  return (
    <Sheet visible={props.stage !== null} onClose={props.onClose} title={explainerTitle(props.stage)} testID="alerts-explainer">
      <AlertsExplainerBody {...props} />
    </Sheet>
  );
}

export const explainerTitle = (stage: Stage) => (stage === 'denied' ? 'Notifications are off' : 'Alerts and notifications');

/** The explainer text and buttons without a sheet around them (for showing inside another sheet). */
export function AlertsExplainerBody({ stage, busy, onAllow, onInAppOnly, onOpenSettings, onClose }: ExplainerProps) {
  return (
    <View testID="alerts-explainer-body">
      {stage === 'denied' ? (
        <View style={{ gap: Spacing.three }}>
          <T testID="alerts-denied-text">
            Notifications are switched off for Money Planner on this phone, so reminders can&apos;t appear. Alerts still show on the dashboard. To get reminders, open your phone&apos;s settings, choose Notifications, and allow
            them for Money Planner.
          </T>
          <Button label="Open phone settings" onPress={onOpenSettings} testID="alerts-open-settings" />
          <Button label="Keep alerts in the app only" variant="secondary" onPress={onInAppOnly} testID="alerts-inapp-only" />
          <Button label="Close" variant="plain" onPress={onClose} testID="alerts-explainer-close" />
        </View>
      ) : (
        <View style={{ gap: Spacing.three }}>
          <T>
            Money Planner can remind you at 9:00 in the morning, a day or so before something happens: a balance that would drop below zero or your buffer, a card near its limit, a cheque that isn&apos;t covered, or a debt
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
    </View>
  );
}

export function useAlertsSwitch(notificationsOn: boolean) {
  const { set } = useSettingSetter();
  const [stage, setStage] = useState<Stage>(null);
  const [busy, setBusy] = useState(false);

  const setModule = (v: boolean) => set({ notificationsOn: v });

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
  const body: ReactNode = (
    <AlertsExplainerBody stage={stage} busy={busy} onAllow={onAllow} onInAppOnly={onInAppOnly} onOpenSettings={onOpenSettings} onClose={() => setStage(null)} />
  );
  /** `stage` is non-null while the explainer is showing; `body` is its content for use inside another sheet. */
  return { value: notificationsOn, onChange, sheet, stage, body };
}
