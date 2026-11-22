// Reports: the periods that have data (Pro), or the sample reports (free).
import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Button, Card, EmptyState, HeroCard, Pill, Screen, ScreenHeader, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { ReportPeriod } from '@/engine';
import { SampleBanner } from '@/features/reports/SampleBanner';
import { useReportList } from '@/features/reports/useReports';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/dates';

const open = (key: string) => router.push({ pathname: '/reports/[key]', params: { key } } as Href);

function PeriodRow({ index, label, range, badge, onPress }: { index: number; label: string; range: string; badge?: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${range}${badge ? `, ${badge}` : ''}`}
      accessibilityHint="Opens the report"
      testID={`report-period-${index}`}
      style={({ pressed }) => [{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, borderBottomWidth: 1, borderBottomColor: c.border }, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <T variant="label">{label}</T>
        <T variant="caption" tone="secondary">
          {range}
        </T>
      </View>
      {badge ? <Pill label={badge} tone="accent" /> : null}
      <T tone="secondary" accessibilityLabel="">
        ›
      </T>
    </Pressable>
  );
}

const rangeOf = (p: ReportPeriod) => `${formatDate(p.from)} to ${formatDate(p.to)}`;

export default function ReportsScreen() {
  const { isPro, loading, error, reload, periods, samples } = useReportList();

  const intro = (
    <HeroCard testID="reports-hero">
      <T variant="heading" tone="onHero" accessibilityRole="header">
        Your money, quarter by quarter
      </T>
      <T tone="onHero">Income, spending, cash flow, debts and key figures for every quarter and year, with what changed since the one before. Facts only, never advice.</T>
    </HeroCard>
  );

  if (!isPro) {
    return (
      <Screen testID="reports-screen">
        <ScreenHeader title="Reports" />
        {intro}
        <SampleBanner />
        <Card>
          <T variant="heading" accessibilityRole="header">
            Sample reports
          </T>
          {samples.map((r, i) => (
            <PeriodRow key={r.period.key} index={i} label={`${r.period.label} (sample)`} range={rangeOf(r.period)} badge="Sample" onPress={() => open(r.period.key)} />
          ))}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen testID="reports-screen">
      <ScreenHeader title="Reports" />
      {intro}
      {error ? (
        <EmptyState title="Couldn't load your reports" message="Nothing has been lost. Try again." action={<Button label="Try again" onPress={reload} testID="reports-retry" />} />
      ) : loading ? (
        <T tone="secondary">Loading…</T>
      ) : periods.length === 0 ? (
        <EmptyState title="No reports yet" message="Add your regular income and costs, or record what you spend, and your first quarterly report appears here." />
      ) : (
        <Card>
          {periods.map((p, i) => (
            <PeriodRow key={p.key} index={i} label={p.label} range={rangeOf(p)} badge={p.isCurrent ? 'So far' : undefined} onPress={() => open(p.key)} />
          ))}
        </Card>
      )}
    </Screen>
  );
}
