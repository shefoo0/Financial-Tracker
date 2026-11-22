// Amount input for the add forms: like MoneyField, plus autofocus and "select all" so a chip can
// fill an amount that typing then replaces.
import { useEffect, useId, useRef, useState, type ComponentRef } from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, parseAmount } from '@/lib/money';
import type { Fils } from '@/types';

const toText = (v: Fils | null) => (v == null ? '' : formatAmount(v).replace(/,/g, ''));

export function AmountField({
  label,
  value,
  onChange,
  currency,
  error,
  hint,
  testID,
  autoFocus,
  focusToken,
}: {
  label: string;
  value: Fils | null;
  onChange: (fils: Fils | null) => void;
  currency: string;
  error?: string | null;
  hint?: string;
  testID?: string;
  autoFocus?: boolean;
  /** Changing this number focuses the field and selects its text (after a chip filled it). */
  focusToken?: number;
}) {
  const c = useTheme();
  const [text, setText] = useState(toText(value));
  const [focused, setFocused] = useState(false);
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const doneBarId = 'done' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const numericOnIOS = Platform.OS === 'ios';
  // The form changed the value from outside (a chip): show it.
  if (parseAmount(text) !== value && !(value == null && parseAmount(text) == null)) setText(toText(value));

  useEffect(() => {
    if (!focusToken) return;
    const input = ref.current;
    input?.blur?.();
    input?.focus?.();
  }, [focusToken]);

  return (
    <View style={styles.field}>
      <T variant="label">{`${label} (${currency})`}</T>
      {numericOnIOS ? (
        <InputAccessoryView nativeID={doneBarId}>
          <View style={[styles.doneBar, { backgroundColor: c.backgroundElement, borderTopColor: c.border }]}>
            <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" accessibilityLabel="Done" testID="keyboard-done" style={styles.doneButton}>
              <T variant="label" tone="accent">
                Done
              </T>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
      <TextInput
        ref={ref}
        value={text}
        onChangeText={(t) => {
          setText(t);
          const parsed = parseAmount(t);
          onChange(parsed == null ? null : Math.abs(parsed));
        }}
        placeholder="0.00"
        placeholderTextColor={c.textSecondary}
        keyboardType="decimal-pad"
        returnKeyType="done"
        autoFocus={autoFocus}
        selectTextOnFocus
        inputAccessoryViewID={numericOnIOS ? doneBarId : undefined}
        accessibilityLabel={`${label} (${currency})`}
        testID={testID}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, { color: c.text, borderColor: error ? c.negative : focused ? c.accent : c.border, backgroundColor: c.backgroundElement }]}
      />
      {error ? (
        <T variant="caption" tone="negative" accessibilityLabel={`Error: ${error}`}>
          {error}
        </T>
      ) : hint ? (
        <T variant="caption" tone="secondary">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  doneBar: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.two },
  doneButton: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
});
