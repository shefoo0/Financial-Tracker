// Thumb-reach floating "+" button: opens a bottom sheet with the three things you can add (one-time item first).
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconBadge, Sheet, T } from '@/components/ui';
import { GradientFill, hiddenFromA11y, withAlpha } from '@/components/ui/internal';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { loadLastChoice, QUICK_ADD_DEFAULT, saveLastChoice } from './lastChoice';

export const QUICK_ADD_SIZE = 60;
export const QUICK_ADD_MARGIN = 16;
/** Height of the spacer to put at the end of a scrolling screen so the last row clears the button. */
export const QUICK_ADD_SCROLL_SPACE = 88;

/** End-of-content spacer: lets the last row scroll above the floating button. */
export function QuickAddSpacer() {
  return <View style={{ height: QUICK_ADD_SCROLL_SPACE }} {...hiddenFromA11y} pointerEvents="none" />;
}

/**
 * Render it as a sibling of the screen inside a `flex: 1` wrapper: it is positioned
 * absolutely 16pt from the bottom-right corner of the screen content (above the tab bar).
 */
export function QuickAddButton({ testID = 'quick-add', defaultDate }: { testID?: string; defaultDate?: string }) {
  const c = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [last, setLast] = useState(QUICK_ADD_DEFAULT);
  useEffect(() => {
    if (open) loadLastChoice().then(setLast);
  }, [open]);

  const go = (id: string, href: string) => {
    setLast(id);
    saveLastChoice(id);
    setOpen(false);
    router.push(href as never);
  };
  const oneTime = defaultDate ? `/transaction/new?date=${defaultDate}` : '/transaction/new';

  const options = [
    { id: 'quick-add-one-time', title: 'One-time item', text: 'A single payment or amount received', glyph: '✦', color: c.accent, href: oneTime },
    { id: 'quick-add-income', title: 'Recurring income', text: 'Salary or anything that repeats', glyph: '↓', color: c.positive, href: '/recurring/new?kind=income' },
    { id: 'quick-add-cost', title: 'Recurring cost', text: 'Rent, bills and subscriptions', glyph: '↑', color: c.negative, href: '/recurring/new?kind=cost' },
    { id: 'quick-add-import', title: 'Import a statement', text: 'From a PDF, photo, Excel, CSV or bank SMS', glyph: '⇩', color: c.warning, href: '/import' },
  ];

  return (
    <>
      <View style={styles.anchor} pointerEvents="box-none">
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Add"
          accessibilityHint="Add income, a cost, a one-time item or import a statement"
          testID={testID}
          style={({ pressed }) => [
            styles.fab,
            { boxShadow: `0 8px 20px ${withAlpha(c.hero[0], 0.45)}`, opacity: pressed ? 0.85 : 1 },
          ]}>
          <View style={styles.clip}>
            <GradientFill colors={c.hero} />
            <Text style={styles.plus} maxFontSizeMultiplier={1.2}>
              +
            </Text>
          </View>
        </Pressable>
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Add" testID="quick-add-sheet">
        <View style={styles.list}>
          {options.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => go(o.id, o.href)}
              accessibilityRole="button"
              accessibilityLabel={`${o.title}. ${o.text}`}
              accessibilityState={{ selected: o.id === last }}
              testID={o.id}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? c.backgroundSelected : c.glass, borderColor: o.id === last ? c.accent : c.glassBorder, borderWidth: o.id === last ? 2 : 1 },
              ]}>
              <IconBadge glyph={o.glyph} color={o.color} size={44} />
              <View style={styles.text}>
                <T variant="label" numberOfLines={1}>
                  {o.title}
                </T>
                <T variant="caption" tone="secondary" numberOfLines={1}>
                  {o.text}
                </T>
              </View>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: { ...StyleSheet.absoluteFill, alignItems: 'flex-end', justifyContent: 'flex-end', padding: QUICK_ADD_MARGIN },
  fab: { width: QUICK_ADD_SIZE, height: QUICK_ADD_SIZE, borderRadius: QUICK_ADD_SIZE / 2 },
  clip: { flex: 1, borderRadius: QUICK_ADD_SIZE / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  plus: { color: '#FFFFFF', fontSize: 34, lineHeight: 40, fontWeight: '500' },
  list: { gap: Spacing.two, paddingBottom: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 60,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  text: { flex: 1 },
});
