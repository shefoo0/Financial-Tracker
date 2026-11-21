// Name field + colour picker + save/cancel. Used to add and to edit a profile.
import { useState } from 'react';
import { View } from 'react-native';

import { Button, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ColorPicker } from './ColorPicker';
import { validateProfileName } from './validate';

export function ProfileForm({
  initialName = '',
  initialColor,
  submitLabel,
  onSubmit,
  onCancel,
  testIDPrefix,
}: {
  initialName?: string;
  initialColor: number;
  submitLabel: string;
  /** Throw to show the message under the name field. */
  onSubmit: (name: string, color: number) => Promise<void>;
  onCancel: () => void;
  /** e.g. 'profile' gives profile-name-input, profile-color-<i>, profile-create. */
  testIDPrefix: { name: string; color: string; submit: string; cancel: string };
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const problem = validateProfileName(name);
    setError(problem);
    if (problem || busy) return;
    setBusy(true);
    try {
      await onSubmit(name.trim(), color);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: Spacing.three }}>
      <TextField
        label="Name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (error) setError(validateProfileName(t));
        }}
        error={error}
        testID={testIDPrefix.name}
      />
      <ColorPicker value={color} onChange={setColor} testID={testIDPrefix.color} />
      <Button label={submitLabel} onPress={submit} disabled={busy} testID={testIDPrefix.submit} />
      <Button label="Cancel" variant="plain" onPress={onCancel} disabled={busy} testID={testIDPrefix.cancel} />
    </View>
  );
}
