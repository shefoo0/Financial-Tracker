import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { T } from './text';

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader} accessibilityRole="header">
      <T variant="heading">{title}</T>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },
});
