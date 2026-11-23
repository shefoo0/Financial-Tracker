import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { T } from './text';

export function FieldShell({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <T variant="label">{label}</T>
      {children}
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
});
