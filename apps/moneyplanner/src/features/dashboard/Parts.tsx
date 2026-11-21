// Small shared pieces for the Dashboard and Month screens.
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Button, EmptyState, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** "‹  Mar 2026  ›" stepper. */
export function Stepper({
  label,
  onPrev,
  onNext,
  prevTestID,
  nextTestID,
  prevLabel,
  nextLabel,
  extra,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  prevTestID: string;
  nextTestID: string;
  prevLabel: string;
  nextLabel: string;
  extra?: ReactNode;
}) {
  const c = useTheme();
  const btn = {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.backgroundSelected,
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
      <Pressable onPress={onPrev} accessibilityRole="button" accessibilityLabel={prevLabel} testID={prevTestID} style={btn}>
        <T variant="heading">‹</T>
      </Pressable>
      <T variant="label" style={{ flex: 1, textAlign: 'center' }} accessibilityLabel={label}>
        {label}
      </T>
      <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel={nextLabel} testID={nextTestID} style={btn}>
        <T variant="heading">›</T>
      </Pressable>
      {extra}
    </View>
  );
}

export function LoadingScreen() {
  return (
    <Screen>
      <View style={{ paddingVertical: Spacing.six }} accessibilityLabel="Loading" accessibilityRole="progressbar">
        <ActivityIndicator size="large" />
      </View>
    </Screen>
  );
}

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen>
      <EmptyState
        title="Couldn't load your plan"
        message="Something went wrong reading the data on this device. Try again."
        action={<Button label="Try again" onPress={onRetry} testID="retry-load" />}
      />
    </Screen>
  );
}
