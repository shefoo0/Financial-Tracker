import { Pressable, StyleSheet, Text } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { GradientFill } from './internal';
import { textStyles } from './text';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  testID,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'plain';
  disabled?: boolean;
  testID?: string;
  accessibilityHint?: string;
}) {
  const c = useTheme();
  const bg = { primary: 'transparent', secondary: c.glass, destructive: c.negative, plain: 'transparent' }[variant];
  const fg = { primary: c.onHero.ink, secondary: c.text, destructive: c.onNegative, plain: c.accent }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: c.border },
      ]}>
      {variant === 'primary' && <GradientFill colors={c.hero} />}
      <Text style={[textStyles.label, variant === 'primary' && { fontWeight: '800' }, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 50, borderRadius: 16, overflow: 'hidden', paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center' },
});
