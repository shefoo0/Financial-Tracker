import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, isValidISODate, today } from '@/lib/dates';
import type { ISODate } from '@/types';
import { T } from './text';
import { Button } from './Button';
import { FieldShell } from './FieldShell';
import { Sheet } from './Sheet';
import { TextField } from './TextField';

/** Date input: a native picker on the phone, a 'YYYY-MM-DD' text box on the web. */
export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  testID,
}: {
  label: string;
  value: ISODate | null;
  onChange: (d: ISODate) => void;
  error?: string | null;
  hint?: string;
  testID?: string;
}) {
  const c = useTheme();
  const scheme = useColorScheme();
  const [open, setOpen] = useState(false);
  // Web: free typing; the value updates once the text is a valid date.
  const [webText, setWebText] = useState<string | null>(null);
  if (Platform.OS === 'web') {
    const text = webText ?? value ?? '';
    return (
      <TextField
        label={label}
        value={text}
        placeholder="YYYY-MM-DD"
        error={error ?? (text && !isValidISODate(text) ? 'Use the format YYYY-MM-DD' : null)}
        hint={hint}
        testID={testID}
        onChangeText={(t) => {
          setWebText(t);
          if (isValidISODate(t)) onChange(t);
        }}
      />
    );
  }
  const current = value && isValidISODate(value) ? value : today();
  const [y, m, d] = current.split('-').map(Number);
  const pickerValue = new Date(y, m - 1, d);
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDate(value) : 'not set'}`}
        accessibilityHint="Opens a date picker"
        testID={testID}
        style={[styles.input, styles.pressableInput, { borderColor: error ? c.negative : c.border, backgroundColor: c.backgroundElement }]}>
        <T>{value ? formatDate(value) : 'Choose a date'}</T>
      </Pressable>
      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          onChange={(event, date) => {
            setOpen(false);
            if (event.type === 'set' && date) onChange(today(date));
          }}
        />
      )}
      {Platform.OS === 'ios' && (
        <Sheet visible={open} onClose={() => setOpen(false)} title={label} testID={testID ? `${testID}-sheet` : undefined}>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display="inline"
            themeVariant={scheme}
            onChange={(_event, date) => {
              if (date) onChange(today(date));
            }}
          />
          <Button label="Done" onPress={() => setOpen(false)} testID={testID ? `${testID}-done` : undefined} />
        </Sheet>
      )}
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  pressableInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});
