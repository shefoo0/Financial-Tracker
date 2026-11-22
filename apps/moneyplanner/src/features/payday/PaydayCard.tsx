// "Safe to spend until payday": the balance after the bills that fall before the next salary.
// Facts only: it shows the numbers and how they add up, never advice.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, SectionHeader, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { paydayView } from '@/engine';
import { shortDate } from '@/features/dashboard/helpers';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney, formatMoneyTrim } from '@/lib/money';
import type { ISODate, PlanInput } from '@/types';

export function PaydayCard({ input, today }: { input: PlanInput; today: ISODate }) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const v = useMemo(() => paydayView(input, today), [input, today]);
  const { currency } = input.settings;
  const money = (n: number) => formatMoney(n, currency);
  const days = `${v.daysLeft} ${v.daysLeft === 1 ? 'day' : 'days'}`;
  const until = v.nextPayday ? `until payday on ${shortDate(v.nextPayday)}` : 'until the end of the month (no payday set)';
  const perDay = v.safeToSpend > 0 ? ` · about ${money(v.perDay)} a day` : '';
  const negative = v.safeToSpend < 0;

  return (
    <Card testID="payday-card">
      <SectionHeader title="Safe to spend" />
      <T
        variant="title"
        tone={negative ? 'negative' : 'default'}
        maxFontSizeMultiplier={1.4}
        style={{ fontVariant: ['tabular-nums'] }}
        accessibilityLabel={`Safe to spend ${until}: ${money(v.safeToSpend)}`}
        testID="payday-safe">
        {formatMoneyTrim(v.safeToSpend, currency)}
      </T>
      <T variant="caption" tone="secondary" testID="payday-summary">
        {until} · {days}
        {perDay}
      </T>

      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide how this is worked out' : 'Show how this is worked out'}
        accessibilityState={{ expanded: open }}
        testID="payday-toggle"
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <T variant="label" tone="accent">
          {open ? 'Hide details' : 'How this adds up'}
        </T>
      </Pressable>

      {open ? (
        <View style={{ gap: Spacing.one }} testID="payday-details">
          <Line label="Balance now" value={money(v.balanceNow)} />
          <Line label={`Bills before payday (${v.items.length})`} value={`- ${money(v.billsBeforePayday)}`} />
          {v.plannedBeforePayday > 0 ? <Line label="of which planned one-time costs" value={money(v.plannedBeforePayday)} muted /> : null}
          <Line label="Buffer" value={`- ${money(v.buffer)}`} />
          <View style={{ height: 1, backgroundColor: c.border }} />
          <Line label="Safe to spend" value={money(v.safeToSpend)} bold negative={negative} />
          {v.items.length === 0 ? (
            <T variant="caption" tone="secondary">
              No bills fall before then.
            </T>
          ) : (
            <View style={{ gap: Spacing.one, marginTop: Spacing.one }} testID="payday-bills">
              {v.items.map((b, i) => (
                <View
                  key={`${b.date}-${b.label}-${i}`}
                  accessible
                  accessibilityLabel={`${b.label}, ${shortDate(b.date)}, ${money(b.amount)}`}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two, minHeight: 28 }}>
                  <T variant="caption" numberOfLines={1} style={{ flex: 1 }}>
                    {shortDate(b.date)} · {b.label}
                  </T>
                  <T variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
                    {money(b.amount)}
                  </T>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}
    </Card>
  );
}

function Line({ label, value, bold, muted, negative }: { label: string; value: string; bold?: boolean; muted?: boolean; negative?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
      <T variant={bold ? 'label' : 'caption'} tone={negative ? 'negative' : muted ? 'secondary' : 'default'} style={{ flex: 1 }}>
        {label}
      </T>
      <T variant={bold ? 'label' : 'caption'} tone={negative ? 'negative' : muted ? 'secondary' : 'default'} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
    </View>
  );
}
