// The lock screen: PIN pad, Face ID / fingerprint shortcut and "Forgot PIN?".
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

import { Avatar, Button, Screen, Sheet, T, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import type { Profile } from '@/data/profiles/types';
import { useTheme } from '@/hooks/use-theme';
import { authenticateWithBiometrics, biometricsAvailable } from './biometrics';
import { lockStore, PIN_MAX, PIN_MIN } from './lockStore';
import { PinPad } from './PinPad';
import { formatWait, throttle } from './throttle';

export function LockScreen({ profile, onUnlocked }: { profile: Profile; onUnlocked: () => void }) {
  const c = useTheme();
  const { profiles, switchProfile, deleteProfile } = useProfiles();
  const [len, setLen] = useState<number | null | undefined>(undefined);
  const [bio, setBio] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [forgot, setForgot] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const waitMs = throttle.remaining(profile.id, now);
  const waiting = waitMs > 0;

  useEffect(() => {
    let cancelled = false;
    throttle.hydrate(profile.id).then(() => !cancelled && setNow(Date.now()));
    lockStore.pinLength(profile.id).then(
      (l) => !cancelled && setLen(l),
      () => !cancelled && setLen(null),
    );
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  // Count the wait down.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  const tryBiometrics = async () => {
    if (await authenticateWithBiometrics(profile.name)) onUnlocked();
  };

  // Offer biometrics, and prompt once as the lock screen appears.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [available, pref] = await Promise.all([biometricsAvailable(), lockStore.getBiometricPref(profile.id).catch(() => false)]);
      if (cancelled || !available || !pref) return;
      setBio(true);
      if (await authenticateWithBiometrics(profile.name)) onUnlocked();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const submit = async (pin: string): Promise<boolean> => {
    if (throttle.remaining(profile.id) > 0) return false;
    if (await lockStore.verifyPin(profile.id, pin)) {
      throttle.reset(profile.id);
      onUnlocked();
      return true;
    }
    const wait = throttle.fail(profile.id);
    setNow(Date.now());
    setMessage(wait ? null : `Wrong PIN. ${throttle.triesLeft(profile.id)} ${throttle.triesLeft(profile.id) === 1 ? 'try' : 'tries'} left.`);
    return false;
  };

  const others = profiles.filter((p) => p.id !== profile.id);
  const nameMatches = typed.trim().toLowerCase() === profile.name.trim().toLowerCase();

  const switchTo = async (id: string) => {
    setBusy(true);
    try {
      await switchProfile(id);
    } catch (e) {
      Alert.alert('Could not switch profile', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const deleteData = async () => {
    setBusy(true);
    try {
      throttle.reset(profile.id);
      // A safety copy is kept 7 days; the PIN goes too. The screens then show another profile, or a fresh "Me" with the setup wizard.
      await deleteProfile(profile.id);
    } catch (e) {
      Alert.alert('Could not delete', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Screen testID="lock-screen">
      <View style={{ alignItems: 'center', gap: Spacing.three, paddingTop: Spacing.four, paddingBottom: Spacing.four }}>
        <Avatar name={profile.name} color={profile.color} size={56} />
        <T variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
          {profile.name}
        </T>
        <T tone="secondary" style={{ textAlign: 'center' }}>
          Enter your PIN to open this profile.
        </T>
        <View style={{ minHeight: 40 }} accessibilityLiveRegion="polite">
          {waiting ? (
            <T tone="negative" testID="lock-message" style={{ textAlign: 'center' }}>
              {`Too many wrong tries. Try again in ${formatWait(waitMs)}.`}
            </T>
          ) : message ? (
            <T tone="negative" testID="lock-message" style={{ textAlign: 'center' }}>
              {message}
            </T>
          ) : null}
        </View>
        {len === undefined ? null : (
          <PinPad
            // A different PIN length (after a change) needs a fresh pad.
            key={len ?? 'any'}
            minLength={len ?? PIN_MIN}
            maxLength={len ?? PIN_MAX}
            submitLabel="Unlock"
            onSubmit={submit}
            disabled={waiting || busy}
            extraKey={
              bio ? (
                <Pressable
                  onPress={tryBiometrics}
                  accessibilityRole="button"
                  accessibilityLabel="Unlock with Face ID or fingerprint"
                  testID="lock-biometric"
                  style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                    {Platform.OS === 'ios' ? 'Face ID' : 'Finger-\nprint'}
                  </Text>
                </Pressable>
              ) : null
            }
          />
        )}
        <Button label="Forgot PIN?" variant="plain" onPress={() => setForgot(true)} testID="lock-forgot" />
      </View>

      <Sheet visible={forgot} onClose={() => (busy ? undefined : setForgot(false))} title="Forgot your PIN?" testID="lock-forgot-sheet">
        <View style={{ gap: Spacing.three }}>
          <T>
            {`The PIN can't be recovered or reset, so that nobody else can see your money. The only way back in is to delete this profile with everything in it: its items, balances and settings. The other profiles on this phone are not touched. A safety copy is kept for 7 days in Automatic backups.${others.length === 0 ? ' This is your only profile, so a new empty profile starts with the setup wizard.' : ''}`}
          </T>
          {others.length > 0 ? (
            <View style={{ gap: Spacing.two }}>
              <T variant="label">Or open another profile</T>
              {others.map((p, i) => (
                <Button key={p.id} label={`Switch to ${p.name}`} variant="secondary" onPress={() => switchTo(p.id)} disabled={busy} testID={`lock-switch-${i}`} />
              ))}
            </View>
          ) : null}
          <TextField
            label={`Type "${profile.name}" to confirm`}
            value={typed}
            onChangeText={setTyped}
            hint="This cannot be undone."
            testID="lock-confirm-input"
          />
          <Button label="Delete this profile" variant="destructive" onPress={deleteData} disabled={!nameMatches || busy} testID="lock-delete-confirm" />
          <Button label="Cancel" variant="plain" onPress={() => setForgot(false)} disabled={busy} testID="lock-forgot-cancel" />
        </View>
      </Sheet>
    </Screen>
  );
}
