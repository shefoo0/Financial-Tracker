// The explanation shown at the top of the import screens (what can be imported).
import { StyleSheet, View } from 'react-native';

import { Card, HeroCard, IconBadge, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const WHAT = [
  { glyph: '📄', title: 'PDF statements', text: 'Including password-protected ones' },
  { glyph: '📷', title: 'Photos and screenshots', text: 'Of a statement, a receipt or a banking app' },
  { glyph: '▦', title: 'Excel and CSV', text: 'Downloaded from your bank (OFX too)' },
  { glyph: '💬', title: 'A bank SMS', text: 'Share it from Messages, or paste it here' },
];

export function ImportIntro({ pro }: { pro: boolean }) {
  const c = useTheme();
  return (
    <>
      <HeroCard testID="import-hero">
        <T variant="heading" tone="onHero" accessibilityRole="header">
          Bring in your real spending
        </T>
        <T tone="onHero">
          Read a bank statement, a photo or a text message and review every item before anything is saved. Everything is read on your phone: nothing is uploaded.
        </T>
      </HeroCard>
      <Card>
        <T variant="heading" accessibilityRole="header">
          What you can import
        </T>
        {WHAT.map((w) => (
          <View key={w.title} style={styles.what}>
            <IconBadge glyph={w.glyph} color={c.accent} size={40} />
            <View style={{ flex: 1 }}>
              <T variant="label">{w.title}</T>
              <T variant="caption" tone="secondary">
                {w.text}
              </T>
            </View>
          </View>
        ))}
        {!pro ? (
          <T variant="caption" tone="secondary">
            Import is part of Money Planner Pro.
          </T>
        ) : null}
      </Card>
    </>
  );
}


const styles = StyleSheet.create({
  what: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48 },
});
