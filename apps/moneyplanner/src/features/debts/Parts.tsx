// Pieces of the debts list: progress bar and the debt row.
import { Pressable, StyleSheet, View } from 'react-native';

import { Glass } from '@/components/ui/internal';
import { IconBadge, T } from '@/components/ui';
import { Palette, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/money';
import type { debtStats } from '@/engine';
import type { Debt, ISODate } from '@/types';
import { fraction, pctText, whenLabel } from './helpers';
import { TYPE_GLYPH } from './form';

export type DebtStat = ReturnType<typeof debtStats>['perDebt'][number];

export function Bar({ value, label, color }: { value: number; label: string; color?: string }) {
  const c = useTheme();
  const pct = Math.round(value * 100);
  return (
    <View
      style={[styles.track, { backgroundColor: c.border }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color ?? c.accent }]} />
    </View>
  );
}

const TYPE_COLOR = { loan: Palette[1], card: Palette[7], plan: Palette[2] } as const;

export function DebtRow({
  debt,
  stat,
  currency,
  now,
  cardUsagePct,
  progress,
  onPress,
  testID,
}: {
  debt: Debt;
  stat: DebtStat | undefined;
  currency: string;
  now: ISODate;
  cardUsagePct: number;
  progress: { paid: number; total: number } | null;
  onPress: () => void;
  testID?: string;
}) {
  const c = useTheme();
  const money = (n: number) => formatMoney(n, currency);
  const remaining = stat ? money(stat.remaining) : money(debt.type === 'plan' ? debt.total : debt.balance);
  const next = stat?.nextPayment ? `Next ${money(stat.nextPayment.amount)} ${whenLabel(stat.nextPayment.date, now)}` : 'No payment scheduled';
  let progressText: string | null = null;
  let progressValue = 0;
  let usageText: string | null = null;
  let usageHigh = false;
  if (debt.type !== 'card' && progress) {
    progressText = `${progress.paid} of ${progress.total} paid`;
    progressValue = fraction(progress.paid, progress.total);
  }
  if (stat && debt.type === 'card') {
    const used = stat.usagePct;
    usageText = `Available ${money(stat.availableCredit ?? 0)}${used != null ? ` · ${pctText(used)} used` : ''}`;
    progressValue = fraction(used ?? 0, 100);
    usageHigh = used != null && used >= cardUsagePct;
  }
  const detail = usageText ?? progressText;
  const label = [debt.name, `${debt.type === 'card' ? 'balance' : 'remaining'} ${remaining}`, next, detail].filter(Boolean).join(', ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens the details" testID={testID} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      <View style={styles.row}>
        <IconBadge glyph={TYPE_GLYPH[debt.type]} color={TYPE_COLOR[debt.type]} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.line}>
            <T style={{ flex: 1, fontWeight: '700' }} numberOfLines={2}>
              {debt.name}
            </T>
            <T variant="number">{remaining}</T>
          </View>
          <T variant="caption" tone="secondary">
            {next}
          </T>
          {detail ? (
            <T variant="caption" tone={usageHigh ? 'warning' : 'secondary'}>
              {detail}
              {usageHigh ? ' (near the limit)' : ''}
            </T>
          ) : null}
          {detail ? <Bar value={progressValue} label={detail} color={usageHigh ? c.warning : undefined} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

/** A glass block with a heading and rows separated by hairlines. */
export function DebtGroup({ title, children }: { title: string; children: React.ReactNode[] }) {
  const c = useTheme();
  return (
    <View style={{ gap: Spacing.two }}>
      <T variant="heading" accessibilityRole="header">
        {title}
      </T>
      <Glass style={styles.group}>
        {children.map((child, i) => (
          <View key={i} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
            {child}
          </View>
        ))}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.two, minHeight: 56, alignItems: 'flex-start' },
  line: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  fill: { height: 8, borderRadius: 4 },
  group: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});
