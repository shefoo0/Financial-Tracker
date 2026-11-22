// Home card: the latest report's saved amount and savings rate (Pro), or a way into the sample (free).
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { Card, IconBadge, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { buildReport, periodsWithData } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/money';
import type { PlanInput } from '@/types';
import { useToday } from '@/features/dashboard/useToday';
import { usePro } from '@/lib/pro';

/** Pass the plan data the Home screen already loaded; free users never have it turned into figures. */
export function ReportsCard({ input }: { input: PlanInput | null }) {
  const router = useRouter();
  const c = useTheme();
  const { isPro } = usePro();
  const today = useToday();
  const latest = useMemo(() => {
    if (!isPro || !input) return null;
    const period = periodsWithData(input, today)[0];
    return period ? buildReport(input, period, today) : null;
  }, [isPro, input, today]);

  const open = (href: Href) => router.push(href);
  let title = 'Quarterly and yearly reports';
  let detail = 'See a sample report';
  let label = 'See a sample report. Opens the reports';
  if (isPro) {
    if (latest) {
      const money = formatMoney(latest.summary.saved, latest.currency);
      const rate = latest.summary.savingsRate == null ? 'no income recorded' : `savings rate ${latest.summary.savingsRate}%`;
      title = `${latest.period.label}${latest.period.isCurrent ? ' so far' : ''}`;
      detail = `Saved ${money}, ${rate}`;
      label = `Reports. ${title}. ${detail}`;
    } else {
      detail = 'Reports appear once you have income or spending entered';
      label = `Reports. ${detail}`;
    }
  }
  return (
    <Card testID="reports-card">
      <Pressable
        onPress={() => open('/reports' as Href)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens your reports"
        testID="reports-card-open"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48, opacity: pressed ? 0.7 : 1 })}>
        <IconBadge glyph="▤" color={c.accent} />
        <View style={{ flex: 1 }}>
          <T variant="label">{title}</T>
          <T variant="caption" tone="secondary">
            {detail}
          </T>
        </View>
        <T tone="secondary" accessibilityLabel="">
          ›
        </T>
      </Pressable>
    </Card>
  );
}
