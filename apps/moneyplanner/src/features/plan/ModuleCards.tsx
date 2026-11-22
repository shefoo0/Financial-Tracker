// Entry cards on the Plan tab for the Debts and Cheques screens (milestone 2),
// shown only while their module is switched on. Owned by the lead.
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, IconBadge, T } from '@/components/ui';
import { Palette, Spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/money';
import type { PlanInput } from '@/types';

export function ModuleCards({ input }: { input: PlanInput }) {
  const { enabledModules, currency } = input.settings;
  const upcoming = input.cheques.filter((c) => c.status === 'upcoming');
  const cards = [
    enabledModules.debts && {
      key: 'debts',
      href: '/debts' as const,
      glyph: '🏦',
      color: Palette[1],
      title: 'Debts',
      detail: input.debts.length
        ? `${input.debts.length} active · loans, cards and instalment plans`
        : 'Add loans, credit cards and instalment plans',
    },
    enabledModules.cheques && {
      key: 'cheques',
      href: '/cheques' as const,
      glyph: '🧾',
      color: Palette[0],
      title: 'Cheques',
      detail: upcoming.length
        ? `${upcoming.length} upcoming · ${formatMoney(upcoming.reduce((s, c) => s + c.amount, 0), currency)}`
        : 'Add post-dated cheques, such as rent',
    },
  ].filter(Boolean) as { key: string; href: '/debts' | '/cheques'; glyph: string; color: string; title: string; detail: string }[];

  if (cards.length === 0) return null;
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
