// "By account" on Home's balance sheet (milestone 3b): each bank/cash account's balance today, and what each card owes.
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePlanInput } from '@/data/DataProvider';
import { accountBalances, remainingOf } from '@/engine';
import { today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { CreditCard } from '@/types';

export function AccountBreakdown({ onNavigate }: { onNavigate?: () => void }) {
  const { data: input } = usePlanInput();
  if (!input) return null;
  const balances = accountBalances(input, today()).filter((b) => !b.archived || b.balance !== 0);
  const cards = input.debts.filter((d): d is CreditCard => d.type === 'card' && !d.archived);
  // Nothing to break down with only the main account and no cards.
  if (balances.length < 2 && cards.length === 0) return null;
  const currency = input.settings.currency;
  const line = (key: string, name: string, amount: string, testID: string, tone?: 'secondary') => (
    <View key={key} style={{ flexDirection: 'row', gap: Spacing.two }} accessible accessibilityLabel={`${name}: ${amount}`} testID={testID}>
      <T style={{ flex: 1 }} numberOfLines={1} tone={tone}>
        {name}
      </T>
      <T variant="label" style={{ fontVariant: ['tabular-nums'] }}>
        {amount}
      </T>
    </View>
  );
  return (
    <View style={{ gap: Spacing.one }} testID="balance-by-account">
      <T variant="label" accessibilityRole="header">
        By account
      </T>
      {balances.map((b) => line(b.id, b.name, formatMoney(b.balance, currency), `balance-account-${b.id}`))}
      {cards.map((d) => line(d.id, `${d.name} (owed)`, formatMoney(-remainingOf(d, input), currency), `balance-card-${d.id}`, 'secondary'))}
      <T variant="caption" tone="secondary">
        The balance is the total of your bank and cash accounts. Card purchases are paid from the bank on the card&apos;s due date.
      </T>
      <Button
        label="Manage accounts"
        variant="plain"
        onPress={() => {
          onNavigate?.();
          router.push('/accounts');
        }}
        testID="balance-manage-accounts"
      />
    </View>
  );
}
