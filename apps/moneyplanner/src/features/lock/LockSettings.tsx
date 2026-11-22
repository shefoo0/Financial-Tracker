// Settings -> Lock this profile: set, change and turn off the PIN, and the
// Face ID / fingerprint switch. The lock belongs to the open profile only.
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, SectionHeader, Sheet, T, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import type { Settings } from '@/types';
import { biometricsAvailable } from './biometrics';
import { useLockSession } from './LockGate';
import { lockStore, PIN_MAX, PIN_MIN } from './lockStore';
import { PinPad } from './PinPad';
import { throttle } from './throttle';

type Mode = 'set' | 'change' | 'off';
type Step = { kind: 'current' } | { kind: 'new' } | { kind: 'again'; first: string };

const TITLES: Record<Mode, string> = { set: 'Set a PIN', change: 'Change PIN', off: 'Turn off the lock' };

export function LockSettings({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => Promise<unknown> }) {
  const { active } = useProfiles();
  const { markUnlocked } = useLockSession();
  const [mode, setMode] = useState<Mode | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'new' });
  const [message, setMessage] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(true);
  const on = settings.lockEnabled;

  useEffect(() => {
    let cancelled = false;
    Promise.all([biometricsAvailable(), lockStore.getBiometricPref(active.id)])
      .then(([a, p]) => {
        if (cancelled) return;
        setBioAvailable(a);
        setBioOn(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active.id, on]);

  const open = (m: Mode) => {
    setMode(m);
    setMessage(null);
    setStep(m === 'set' ? { kind: 'new' } : { kind: 'current' });
  };
  const close = () => setMode(null);
  const fail = (e: unknown) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e));

  /** Checks the current PIN (for Change and Turn off). */
  const checkCurrent = async (pin: string): Promise<boolean> => {
    if (throttle.remaining(active.id) > 0) {
      setMessage('Too many wrong tries. Wait a little and try again.');
      return false;
    }
    if (!(await lockStore.verifyPin(active.id, pin))) {
      throttle.fail(active.id);
      setMessage('That is not the current PIN.');
      return false;
    }
    throttle.reset(active.id);
    if (mode === 'off') {
      try {
        await lockStore.clearPin(active.id);
        await update({ lockEnabled: false });
        close();
      } catch (e) {
        fail(e);
        return false;
      }
      return true;
    }
    setMessage(null);
    setStep({ kind: 'new' });
    return true;
  };

  const enteredNew = (pin: string) => {
    setMessage(null);
    setStep({ kind: 'again', first: pin });
    return true;
  };

  const enteredAgain = async (first: string, pin: string): Promise<boolean> => {
    if (pin !== first) {
      setMessage("The two PINs didn't match. Choose a PIN again.");
      setStep({ kind: 'new' });
      return false;
    }
    try {
      await lockStore.setPin(active.id, pin);
      markUnlocked(); // the user just proved who they are: don't lock them out of this screen
      if (!settings.lockEnabled) await update({ lockEnabled: true });
      close();
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const toggleBio = async (v: boolean) => {
    setBioOn(v);
    await lockStore.setBiometricPref(active.id, v).catch(() => setBioOn(!v));
  };

  const prompt =
    step.kind === 'current'
      ? mode === 'off'
        ? 'Enter your PIN to turn the lock off.'
        : 'Enter your current PIN.'
      : step.kind === 'new'
        ? `Choose a PIN of ${PIN_MIN} to ${PIN_MAX} digits.`
        : 'Enter the same PIN again.';

  return (
    <View testID="settings-lock">
      <SectionHeader title="Lock" />
      <Card>
        <ToggleRow
          label="Lock this profile"
          description={`Ask for a PIN to open ${active.name}. Other profiles are not affected.`}
          value={on}
          onChange={(v) => open(v ? 'set' : 'off')}
          testID="settings-lock-toggle"
        />
        {on ? (
          <>
            <Button label="Change PIN" variant="secondary" onPress={() => open('change')} testID="settings-lock-change" />
            {bioAvailable ? <ToggleRow label="Use Face ID / fingerprint" value={bioOn} onChange={toggleBio} testID="settings-lock-biometric" /> : null}
            <T variant="caption" tone="secondary">
              If you forget the PIN, the only way in is to delete this profile's data. It can't be recovered.
            </T>
          </>
        ) : null}
      </Card>

      <Sheet visible={mode !== null} onClose={close} title={mode ? TITLES[mode] : undefined} testID="lock-setup-sheet">
        {mode ? (
          <View style={{ gap: Spacing.three, alignItems: 'stretch' }}>
            <T testID="pin-prompt">{prompt}</T>
            <View style={{ minHeight: 24 }} accessibilityLiveRegion="polite">
              {message ? (
                <T tone="negative" testID="pin-message">
                  {message}
                </T>
              ) : null}
            </View>
            {step.kind === 'again' ? (
              <PinPad
                key={`again-${step.first.length}`}
                minLength={step.first.length}
                maxLength={step.first.length}
                prefix="pin"
                onSubmit={(pin) => enteredAgain(step.first, pin)}
              />
            ) : step.kind === 'new' ? (
              <PinPad key="new" minLength={PIN_MIN} maxLength={PIN_MAX} prefix="pin" submitLabel="Continue" onSubmit={enteredNew} />
            ) : (
              <PinPad key="current" minLength={PIN_MIN} maxLength={PIN_MAX} prefix="pin" submitLabel={mode === 'off' ? 'Turn off lock' : 'Continue'} onSubmit={checkCurrent} />
            )}
            <Button label="Cancel" variant="plain" onPress={close} testID="pin-cancel" />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}
