import { useId, useState } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FieldShell } from './FieldShell';
import { DoneBar } from './KeyboardDoneBar';

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  multiline,
  keyboardType,
  onBlur,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'email-address';
  /** Called when the field loses focus or the keyboard's Return/Done key is pressed (for save-on-blur fields). */
  onBlur?: () => void;
  testID?: string;
}) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  // iPhone number pads have no Return key, so numeric fields get a "Done" bar.
  const numericOnIOS = Platform.OS === 'ios' && (keyboardType === 'decimal-pad' || keyboardType === 'number-pad');
  // Each field brings its own bar: one shared bar rendered at the app's root
  // never showed over the forms, which open as iPhone modals.
  const doneBarId = 'done' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {numericOnIOS ? <DoneBar nativeID={doneBarId} /> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textSecondary}
        multiline={multiline}
        keyboardType={keyboardType}
        returnKeyType={multiline ? 'default' : 'done'}
        inputAccessoryViewID={numericOnIOS ? doneBarId : undefined}
        accessibilityLabel={label}
        testID={testID}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        style={[styles.input, { color: c.text, borderColor: error ? c.negative : focused ? c.accent : c.border, backgroundColor: c.backgroundElement }, multiline && { minHeight: 88, textAlignVertical: 'top' }]}
      />
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
});
