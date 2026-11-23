import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { T } from './text';
import { FieldShell } from './FieldShell';

export interface SelectOption<V extends string> {
  value: V;
  label: string;
}

/** A field that opens a list to pick one option. */
export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  error,
  testID,
}: {
  label: string;
  value: V | null;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  placeholder?: string;
  error?: string | null;
  testID?: string;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <FieldShell label={label} error={error}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? 'not chosen'}`}
        accessibilityState={{ expanded: open }}
        testID={testID}
        style={[styles.input, styles.pressableInput, { borderColor: error ? c.negative : open ? c.accent : c.border, backgroundColor: c.backgroundElement }]}>
        <T tone={selected ? 'default' : 'secondary'}>{selected?.label ?? placeholder}</T>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <T tone="secondary">{open ? '▴' : '▾'}</T>
        </View>
      </Pressable>
      {/* The options open right under the field, inside the page (no pop-up):
          pop-ups over the iPhone's modal forms didn't always close, and an
          inline list scrolls with the page. */}
      {open ? (
        // Long lists of short choices (e.g. the 31 days of a month) show as a
        // compact grid, so they fit on one screen without scrolling.
        (() => {
          const grid = options.length > 12 && options.every((o) => o.label.length <= 8);
          return (
            <View
              style={[styles.inlineOptions, grid && styles.optionGrid, { borderColor: c.border, backgroundColor: c.backgroundElement }]}
              testID={testID ? `${testID}-options` : undefined}>
              {options.map((o) => {
                const selectedHere = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={o.label}
                    accessibilityState={{ selected: selectedHere }}
                    testID={testID ? `${testID}-option-${o.value}` : undefined}
                    style={[grid ? styles.gridOption : styles.option, selectedHere && { backgroundColor: c.backgroundSelected }]}>
                    <T style={selectedHere ? { fontWeight: '700' } : undefined} variant={grid ? 'label' : 'body'}>
                      {grid ? o.label.replace(/^Day /, '') : o.label}
                    </T>
                    {selectedHere && !grid ? (
                      <T tone="accent" accessibilityLabel="Selected">
                        ✓
                      </T>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })()
      ) : null}
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  gridOption: { minWidth: 48, minHeight: 44, flexGrow: 1, flexBasis: '12%', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  inlineOptions: { borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden', marginTop: Spacing.one },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, borderRadius: 14 },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.one, gap: Spacing.one },
  pressableInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});
