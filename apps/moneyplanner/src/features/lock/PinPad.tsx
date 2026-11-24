// PIN entry: dots plus a big number pad (keys are 72pt for one-handed use).
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, View } from 'react-native';

import { Button, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const KEY = 72;

export function PinPad({
  minLength,
  maxLength,
  onSubmit,
  submitLabel = 'Continue',
  disabled,
  extraKey,
  prefix = 'lock',
}: {
  minLength: number;
  maxLength: number;
  /** Return false to say the PIN was wrong: the dots shake and clear. */
  onSubmit: (pin: string) => Promise<boolean | void> | boolean | void;
  submitLabel?: string;
  disabled?: boolean;
  /** Fills the empty cell at the bottom left (e.g. the Face ID button). */
  extraKey?: ReactNode;
  prefix?: string;
}) {
  const c = useTheme();
  const [pin, setPin] = useState('');
  const [shake] = useState(() => new Animated.Value(0));
  // No shake when the phone asks for less motion (accessibility, milestone 4).
  const [lessMotion, setLessMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setLessMotion, () => {});
  }, []);
  // With a fixed length the PIN is submitted by the last digit; otherwise a button does it.
  const auto = minLength === maxLength;

  const submit = async (value: string) => {
    const ok = await onSubmit(value);
    if (ok === false) {
      setPin('');
      AccessibilityInfo.announceForAccessibility('Wrong PIN. Try again.');
      if (lessMotion) return;
      Animated.sequence(
        [10, -10, 8, -8, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true })),
      ).start();
    }
  };

  const press = (digit: string) => {
    if (disabled || pin.length >= maxLength) return;
    const next = pin + digit;
    setPin(next);
    if (auto && next.length === maxLength) submit(next);
  };

  const label = auto ? `${pin.length} of ${maxLength} digits entered` : `${pin.length} ${pin.length === 1 ? 'digit' : 'digits'} entered, ${minLength} to ${maxLength} needed`;

  const key = (content: string, onPress: () => void, a11y: string, testID: string, enabled = true) => (
    <Pressable
      key={testID}
      onPress={onPress}
      disabled={disabled || !enabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      testID={testID}
      style={({ pressed }) => ({
        minWidth: KEY,
        minHeight: KEY,
        paddingHorizontal: Spacing.two,
        borderRadius: KEY / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.backgroundSelected : c.glass,
        borderWidth: 1,
        borderColor: c.border,
        opacity: disabled ? 0.5 : 1,
      })}>
      <Text style={{ fontSize: 28, fontWeight: '600', color: c.text }}>
        {content}
      </Text>
    </Pressable>
  );

  const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];
  return (
    <View style={{ alignItems: 'center', gap: Spacing.four }}>
      <Animated.View
        accessible
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
        testID={`${prefix}-dots`}
        style={{ flexDirection: 'row', gap: Spacing.three, transform: [{ translateX: shake }] }}>
        {Array.from({ length: maxLength }, (_, i) => (
          <View
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: c.accent,
              backgroundColor: i < pin.length ? c.accent : 'transparent',
            }}
          />
        ))}
      </Animated.View>
      {/* The confirm button sits right under the dots, above the keys, so it is
          on screen even on small phones (below the keypad it scrolled out of view). */}
      {!auto ? (
        <View style={{ alignSelf: 'stretch' }}>
          <Button label={submitLabel} onPress={() => submit(pin)} disabled={disabled || pin.length < minLength} testID={`${prefix}-submit`} />
        </View>
      ) : null}
      {!auto && pin.length < minLength ? (
        <T variant="caption" tone="secondary">
          {`Use ${minLength} to ${maxLength} digits.`}
        </T>
      ) : null}
      <View style={{ gap: Spacing.three }}>
        {rows.map((row) => (
          <View key={row[0]} style={{ flexDirection: 'row', gap: Spacing.four }}>
            {row.map((d) => key(d, () => press(d), d, `${prefix}-key-${d}`))}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: Spacing.four }}>
          <View style={{ minWidth: KEY, minHeight: KEY, alignItems: 'center', justifyContent: 'center' }}>{extraKey}</View>
          {key('0', () => press('0'), '0', `${prefix}-key-0`)}
          {key('⌫', () => setPin((p) => p.slice(0, -1)), 'Delete last digit', `${prefix}-delete`, pin.length > 0)}
        </View>
      </View>

    </View>
  );
}
