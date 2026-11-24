import { type ReactNode, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ScrollLockContext } from './scrollLock';
import { AuroraBackground } from './surfaces';
import { T } from './text';

/** A full screen with the aurora behind it, safe-area padding, optional scrolling and a centred max width. */
export function Screen({ children, scroll = true, testID }: { children: ReactNode; scroll?: boolean; testID?: string }) {
  // How many children (charts being scrubbed) hold the scroll still; it scrolls again when none do.
  const [holds, setHolds] = useState(0);
  const lock = useMemo(() => ({ lock: () => setHolds((n) => n + 1), unlock: () => setHolds((n) => Math.max(0, n - 1)) }), []);
  const inner = (
    <ScrollLockContext.Provider value={lock}>
      <View style={styles.screenInner}>{children}</View>
    </ScrollLockContext.Provider>
  );
  return (
    <View style={styles.screen}>
      <AuroraBackground />
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']} testID={testID}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            scrollEnabled={holds === 0}
            testID={testID ? `${testID}-scroll` : undefined}>
            {inner}
          </ScrollView>
        ) : (
          inner
        )}
      </SafeAreaView>
    </View>
  );
}

/** Big title row: small subtitle above the title (e.g. "Good morning" / "Sam") and an optional right element. */
export function ScreenHeader({ title, subtitle, right, testID }: { title: string; subtitle?: string; right?: ReactNode; testID?: string }) {
  return (
    <View style={styles.screenHeader} testID={testID}>
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <T variant="label" tone="secondary" numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
        <T variant="title" accessibilityRole="header" numberOfLines={2}>
          {title}
        </T>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  screenInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.three },
  scrollContent: { flexGrow: 1, paddingBottom: 120 },
});
