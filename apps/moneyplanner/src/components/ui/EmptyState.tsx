import { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { Glass } from './internal';
import { T } from './text';

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <Glass style={styles.empty}>
      <T variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </T>
      <T tone="secondary" style={{ textAlign: 'center' }}>
        {message}
      </T>
      {action}
    </Glass>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five, paddingHorizontal: Spacing.three },
});
