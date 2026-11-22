// Entry cards on the Plan tab for the Debts and Cheques screens (milestone 2),
// shown only while their module is switched on. Owned by the lead.
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, IconBadge, T } from '@/components/ui';
import { Palette, Spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/money';
import { usePro } from '@/lib/pro';
import type { PlanInput } from '@/types';

export function ModuleCards({ input }: { input: PlanInput }) {
  const { currency } = input.settings;
  const { isPro } = usePro();
  const upcoming = input.cheques.filter((c) => c.status === 'upcoming');
  const cards = [
    {
      key: 'debts',
      href: '/debts' as const,
      glyph: '🏦',
      color: Palette[1],
      title: 'Debts',
      detail: input.debts.length
        ? `${input.debts.length} active · loans, cards and instalment plans`
        : 'Add loans, credit cards and instalment plans',
    },
    {
      key: 'cheques',
      href: '/cheques' as const,
      glyph: '🧾',
      color: Palette[0],
      title: 'Cheques',
      detail: upcoming.length
        ? `${upcoming.length} upcoming · ${formatMoney(upcoming.reduce((s, c) => s + c.amount, 0), currency)}`
        : 'Add post-dated cheques, such as rent',
    },
    {
      key: 'import',
      href: '/import',
      glyph: '⇩',
      color: Palette[2],
      title: 'Import statements',
      detail: isPro ? 'Read a PDF, photo, Excel, CSV or bank SMS' : 'Pro: read a PDF, photo, Excel, CSV or bank SMS',
    },
  ] as { key: string; href: '/debts' | '/cheques' | '/import'; glyph: string; color: string; title: string; detail: string }[];

  return (
    <View style={styles.wrap}>
      {cards.map((c) => (
        <Pressable
          key={c.key}
          onPress={() => router.push(c.href)}
          accessibilityRole="button"
          accessibilityLabel={`${c.title}. ${c.detail}`}
          testID={`plan-open-${c.key}`}>
          <Card style={styles.card}>
            <IconBadge glyph={c.glyph} color={c.color} size={44} />
            <View style={styles.text}>
              <T variant="heading">{c.title}</T>
              <T variant="caption" tone="secondary">
                {c.detail}
              </T>
            </View>
            <T tone="secondary">›</T>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 72 },
  text: { flex: 1, gap: 2 },
});
