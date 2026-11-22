import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Pill, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Cheque } from '@/types';

import { inDaysLabel, STATUS_LABEL, type Coverage } from './logic';

export function ChequeRow({
  cheque,
  index,
  today,
  currency,
  coverage,
  onOpen,
  onClear,
}: {
  cheque: Cheque;
  index: number;
  today: string;
  currency: string;
  coverage?: Coverage;
  onOpen: () => void;
  onClear?: () => void;
}) {
  const c = useTheme();
  const upcoming = cheque.status === 'upcoming';
  const amount = formatMoney(cheque.amount, currency);
  const when = upcoming ? `${formatDate(cheque.date)}, ${inDaysLabel(cheque.date, today)}` : formatDate(cheque.date);
  const fact = coverage
    ? `Projected balance that day: ${formatMoney(coverage.balance, currency)}${coverage.covered ? '' : ` (short by ${formatMoney(coverage.shortBy, currency)})`}`
    : null;
  const label = [cheque.payee, cheque.purpose, amount, when, fact].filter(Boolean).join(', ');
  return (
    <Card testID={`cheque-item-${index}`}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens the cheque" style={styles.main} testID={`cheque-open-${index}`}>
        <View style={styles.flex}>
          <T numberOfLines={2}>{cheque.payee}</T>
          <T variant="caption" tone="secondary">
            {cheque.purpose ? `${cheque.purpose} · ${when}` : when}
          </T>
        </View>
        <View style={styles.right}>
          <T variant="number">{amount}</T>
          {coverage ? <Pill label={coverage.covered ? 'Covered' : 'Short'} tone={coverage.covered ? 'positive' : 'warning'} /> : upcoming ? null : <Pill label={STATUS_LABEL[cheque.status]} tone="secondary" />}
        </View>
      </Pressable>
      {fact && (
        <T variant="caption" tone={coverage?.covered ? 'secondary' : 'warning'}>
          {fact}
        </T>
      )}
      {upcoming && onClear && (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={`Mark cheque to ${cheque.payee} as cleared`}
          testID={`cheque-clear-${index}`}
          style={[styles.clear, { borderColor: c.border }]}>
          <T variant="label" tone="accent">
            Mark cleared
          </T>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  main: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
  right: { alignItems: 'flex-end', gap: 4 },
  clear: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
