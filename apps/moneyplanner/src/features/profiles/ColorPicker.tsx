// A row of avatar colour swatches (the Palette), one selected.
import { Pressable, View } from 'react-native';

import { T } from '@/components/ui';
import { Palette, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { COLOR_NAMES } from './validate';

export function ColorPicker({ value, onChange, testID = 'profile-color' }: { value: number; onChange: (i: number) => void; testID?: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      <T variant="label">Colour</T>
      <View accessibilityRole="radiogroup" accessibilityLabel="Profile colour" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {Palette.map((color, i) => {
          const selected = i === value;
          return (
            <Pressable
              key={color}
              onPress={() => onChange(i)}
              accessibilityRole="radio"
              accessibilityLabel={COLOR_NAMES[i] ?? `Colour ${i + 1}`}
              accessibilityState={{ checked: selected }}
              testID={`${testID}-${i}`}
              hitSlop={4}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: selected ? c.accent : 'transparent',
              }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                {selected ? <T variant="label" style={{ color: '#FFFFFF' }}>✓</T> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
