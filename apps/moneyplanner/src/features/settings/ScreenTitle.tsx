// A screen title that screen readers announce as a heading.
import { View } from 'react-native';

import { T } from '@/components/ui';

export function ScreenTitle({ children, variant = 'title', testID }: { children: string; variant?: 'title' | 'heading'; testID?: string }) {
  return (
    <View accessible accessibilityRole="header" testID={testID}>
      <T variant={variant}>{children}</T>
    </View>
  );
}
