// /import: what can be imported, and the ways to start. Free users see the same screen with a Pro badge and
// an "Unlock Pro" button, and no import actions: their files are never read.
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Screen, ScreenHeader, T, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useData } from '@/data/DataProvider';
import { useTheme } from '@/hooks/use-theme';
import type { ImportInput } from '@/import/read';
import { usePro } from '@/lib/pro';

import { deleteInputFile, discardShared } from './cleanup';
import { startReading, type ReadStep } from './flow';
import { ImportIntro } from './ImportIntro';
import { ImportProLocked } from './ProLocked';
import { getSession, setSession, useSession } from './session';
import { choosePhoto, pickFile, takePhoto, type Picked } from './sources';

function PasswordPrompt({ wrong, onSubmit, onCancel }: { wrong: boolean; onSubmit: (password: string) => void; onCancel: () => void }) {
  const c = useTheme();
  const [value, setValue] = useState('');
  return (
    <Card testID="import-password-card">
      <T variant="heading" accessibilityRole="header">
        This PDF is protected
      </T>
      <T tone="secondary">Enter its password. Banks often use your date of birth or the last digits of your card; check the email the statement came with.</T>
      {wrong ? (
        <T tone="negative" accessibilityRole="alert">
          That password did not open the PDF. Try again.
        </T>
      ) : null}
      <TextInput
        value={value}
        onChangeText={setValue}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => value && onSubmit(value)}
        accessibilityLabel="PDF password"
        placeholder="Password"
        placeholderTextColor={c.textSecondary}
        testID="import-password-input"
        style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.backgroundElement }]}
      />
      <Button label="Open the PDF" onPress={() => onSubmit(value)} disabled={!value} testID="import-password-submit" />
      <Button label="Cancel" variant="plain" onPress={onCancel} testID="import-password-cancel" />
    </Card>
  );
}

export default function ImportScreen() {
  const { isPro, loading: proLoading } = usePro();
  const { repo } = useData();
  const session = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState<{ input: ImportInput; wrong: boolean; shared: boolean } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [sms, setSms] = useState('');

  const go = (step: ReadStep, input: ImportInput, shared: boolean) => {
    setPassword(step.kind === 'password' ? { input, wrong: step.wrongPassword, shared } : null);
    if (step.kind === 'review') router.push('/import/review');
    else if (step.kind === 'columns') router.push('/import/columns');
    else if (step.kind === 'message') setMessage(step.message);
  };

  /** Rows waiting in a review are only replaced after a yes. */
  const confirmReplace = () =>
    new Promise<boolean>((resolve) => {
      if (!getSession().result) return resolve(true);
      Alert.alert(
        'Replace the current import?',
        'You have rows waiting for review. Starting a new import discards them.',
        [
          { text: 'Keep current', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Replace', style: 'destructive', onPress: () => resolve(true) },
        ],
        { onDismiss: () => resolve(false) },
      );
    });

  /** Files are copies in the cache: removed as soon as reading has ended (a protected PDF is kept until its password is tried). */
  const finish = (input: ImportInput, shared: boolean) => {
    deleteInputFile(input);
    if (shared) discardShared();
  };

  const read = async (input: ImportInput, pw?: string, shared = false) => {
    if (pw === undefined && !(await confirmReplace())) {
      finish(input, shared);
      return;
    }
    setMessage(null);
    setBusy('Reading…');
    let step: ReadStep | null = null;
    try {
      step = await startReading({
        repo,
        isPro,
        input,
        password: pw,
        onProgress: (p) => setBusy(p.step === 'ocr' && p.total ? `Reading page ${Math.min((p.done ?? 0) + 1, p.total)} of ${p.total}…` : 'Reading…'),
      });
      go(step, input, shared);
    } catch {
      // startReading never throws on purpose; anything unexpected (the phone's file access, a native reader) lands here.
      setMessage("This couldn't be read. Try again, or import a different file: a PDF or CSV from your bank app works best.");
    } finally {
      setBusy(null);
      if (step?.kind !== 'password') finish(input, shared);
    }
  };

  const pick = async (picker: () => Promise<Picked>) => {
    if (!isPro || busy) return;
    const picked = await picker();
    if ('input' in picked) await read(picked.input);
    else if ('message' in picked) setMessage(picked.message);
  };

  // A file or text shared into the app: read it (Pro), or drop it (free: nothing is ever read).
  const handled = useRef<ImportInput | null>(null);
  useEffect(() => {
    const incoming = session.incoming;
    // Wait until we know whether this is a Pro phone.
    if (!incoming || proLoading || handled.current === incoming) return;
    handled.current = incoming;
    setSession({ incoming: null });
    // Start after this render, not inside the effect.
    if (isPro) Promise.resolve().then(() => read(incoming, undefined, true));
    else finish(incoming, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.incoming, isPro, proLoading]);

  // Something shared that is not a file, picture or text.
  useEffect(() => {
    const problem = session.shareProblem;
    if (!problem || proLoading) return;
    setSession({ shareProblem: null });
    // After this render, not inside the effect.
    if (isPro) Promise.resolve().then(() => setMessage(problem));
  }, [session.shareProblem, isPro, proLoading]);

  if (!isPro) return <ImportProLocked />;

  return (
    <Screen testID="import-screen">
      <ScreenHeader title="Import" />
      <ImportIntro pro />
      {busy ? (
        <Card testID="import-reading">
          <View style={styles.reading}>
            <ActivityIndicator accessibilityLabel="Reading" />
            <T accessibilityRole="alert">{busy}</T>
          </View>
          <T variant="caption" tone="secondary">
            Scanned pages and photos can take a few seconds.
          </T>
        </Card>
      ) : password ? (
        <PasswordPrompt wrong={password.wrong} onSubmit={(pw) => read(password.input, pw, password.shared)} onCancel={() => { finish(password.input, password.shared); setPassword(null); }} />
      ) : (
        <View style={{ gap: Spacing.two }}>
          {message ? (
            <Card testID="import-message">
              <T tone="negative" accessibilityRole="alert">
                {message}
              </T>
            </Card>
          ) : null}
          <Button label="Choose a file" onPress={() => pick(pickFile)} testID="import-choose-file" accessibilityHint="PDF, Excel, CSV or OFX" />
          <Button label="Take a photo" variant="secondary" onPress={() => pick(takePhoto)} testID="import-take-photo" />
          <Button label="Choose a photo" variant="secondary" onPress={() => pick(choosePhoto)} testID="import-choose-photo" />
          <Button label="Paste SMS text" variant="secondary" onPress={() => setPasteOpen((o) => !o)} testID="import-paste-sms" />
          {pasteOpen ? (
            <Card>
              <TextField
                label="Bank SMS text"
                value={sms}
                onChangeText={setSms}
                multiline
                placeholder="Paste the message here"
                hint="You can paste one message, or several."
                testID="import-sms-input"
              />
              <Button label="Read" onPress={() => read({ kind: 'text', text: sms })} disabled={!sms.trim()} testID="import-read" />
            </Card>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  reading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, minHeight: 48, fontSize: 16 },
});
