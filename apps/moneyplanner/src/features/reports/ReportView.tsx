// The sections of a report, shared by the Pro report and the sample.
import { StyleSheet, View } from 'react-native';

import { Card, HeroCard, ListRow, Pill, SectionHeader, StatTile, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Comparison, Delta, Report, ReportRow } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { DISCLAIMER } from './pdf';
import { deltaTone, pillText, rowChangeText, signedMoney, spokenDelta } from './format';

function Bar({ fraction, color }: { fraction: number; color: string }) {
  const c = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: c.backgroundSelected }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ height: 10, borderRadius: 5, backgroundColor: color, width: `${Math.max(2, Math.min(1, fraction) * 100)}%` }} />
    </View>
  );
}

/** Rows with a bar each, sized against the largest; an optional note under each. */
function BarRows({ rows, testID }: { rows: { id: string; label: string; value: number; display: string; note?: string | null }[]; testID?: string }) {
  const c = useTheme();
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.value)), 0);
  return (
    <View style={{ gap: Spacing.three }} testID={testID}>
      {rows.map((r) => (
        <View key={r.id} accessible accessibilityLabel={[r.label, r.display, r.note].filter(Boolean).join(', ')} style={{ gap: 4 }}>
          <View style={styles.rowTop}>
            <T variant="label" style={{ flex: 1 }}>
              {r.label}
            </T>
            <T variant="number">{r.display}</T>
          </View>
          <Bar fraction={max > 0 ? Math.abs(r.value) / max : 0} color={r.value < 0 ? c.negative : c.accent} />
          {r.note ? (
            <T variant="caption" tone="secondary">
              {r.note}
            </T>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Compare({ label, delta, goodWhenUp, onHero }: { label: string; delta: Delta; goodWhenUp: boolean; onHero?: boolean }) {
  return (
    <View style={styles.compare} accessible accessibilityLabel={`${label}, ${spokenDelta(delta)}`}>
      <T variant="caption" tone={onHero ? 'onHero' : 'secondary'}>
        {label}
      </T>
      <Pill label={pillText(delta)} tone={onHero ? 'onHero' : deltaTone(delta, goodWhenUp)} />
    </View>
  );
}

function SummaryLine({ title, amount, field, goodWhenUp, report }: { title: string; amount: number; field: 'income' | 'spending' | 'saved'; goodWhenUp: boolean; report: Report }) {
  const { vsPrevious, vsLastYear } = report.summary;
  const pick = (c: Comparison | null) => (c ? c[field] : null);
  const p = pick(vsPrevious);
  const y = pick(vsLastYear);
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.rowTop}>
        <T tone="onHero" style={{ flex: 1 }}>
          {title}
        </T>
        <T variant="number" tone="onHero" accessibilityLabel={`${title} ${formatMoney(amount, report.currency)}`}>
          {formatMoney(amount, report.currency)}
        </T>
      </View>
      {p || y ? (
        <View style={styles.pills}>
          {p && vsPrevious ? <Compare label={`vs ${vsPrevious.label}`} delta={p} goodWhenUp={goodWhenUp} onHero /> : null}
          {y && vsLastYear ? <Compare label={`vs ${vsLastYear.label}`} delta={y} goodWhenUp={goodWhenUp} onHero /> : null}
        </View>
      ) : null}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <T tone="secondary" variant="caption">
      {text}
    </T>
  );
}

export function ReportView({ report }: { report: Report }) {
  const money = (n: number) => formatMoney(n, report.currency);
  const prevLabel = report.summary.vsPrevious?.label ?? null;
  const s = report.summary;
  const f = report.cashFlow;
  const k = report.keyFigures;
  const d = report.debts;
  const rateText = s.savingsRate == null ? 'No income recorded' : `Savings rate ${s.savingsRate}%`;
  const rowItems = (rows: ReportRow[]) =>
    rows.map((r) => ({ id: r.id, label: r.name, value: r.amount, display: money(r.amount), note: rowChangeText(r, prevLabel, report.currency) }));

  return (
    <>
      <HeroCard testID="report-hero">
        <T variant="caption" tone="onHero">
          {report.rangeText}
        </T>
        <T variant="caption" tone="onHero">
          Saved
        </T>
        <T variant="title" tone="onHero" accessibilityLabel={`Saved ${money(s.saved)}`} testID="report-saved">
          {money(s.saved)}
        </T>
        <T tone="onHero" testID="report-rate">
          {rateText}
          {s.vsPrevious?.savingsRate.changePoints != null && s.vsPrevious.savingsRate.changePoints !== 0
            ? ` (${s.vsPrevious.savingsRate.changePoints > 0 ? '▲' : '▼'} ${Math.abs(s.vsPrevious.savingsRate.changePoints)} points vs ${s.vsPrevious.label})`
            : ''}
        </T>
        <View style={{ height: Spacing.one }} />
        <SummaryLine title="Income" amount={s.income} field="income" goodWhenUp report={report} />
        <SummaryLine title="Spending" amount={s.spending} field="spending" goodWhenUp={false} report={report} />
        {!s.vsPrevious && !s.vsLastYear ? (
          <T variant="caption" tone="onHero">
            No earlier period with entries to compare with.
          </T>
        ) : null}
      </HeroCard>

      {!report.hasData ? (
        <Card>
          <T variant="heading">Nothing recorded in this period</T>
          <T tone="secondary">There is no income or spending between these dates, so the figures below are zero.</T>
        </Card>
      ) : null}

      {report.highlights.length > 0 ? (
        <Card testID="report-highlights">
          <T variant="heading" accessibilityRole="header">
            Highlights
          </T>
          {report.highlights.map((h) => (
            <View key={h} style={styles.bullet}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <T tone="accent">•</T>
              </View>
              <T style={{ flex: 1 }}>{h}</T>
            </View>
          ))}
        </Card>
      ) : null}

      <Card testID="report-income">
        <T variant="heading" accessibilityRole="header">
          Income by source
        </T>
        {report.income.length ? <BarRows rows={rowItems(report.income)} /> : <Empty text="No income in this period." />}
      </Card>

      <Card testID="report-spending">
        <T variant="heading" accessibilityRole="header">
          Spending by category
        </T>
        {report.spending.length ? <BarRows rows={rowItems(report.spending)} /> : <Empty text="No spending in this period." />}
      </Card>

      <Card testID="report-cashflow">
        <T variant="heading" accessibilityRole="header">
          Cash flow
        </T>
        <ListRow title="Balance at the start" value={money(f.startBalance)} />
        <ListRow title="Recurring income" value={signedMoney(f.recurringIncome, report.currency)} valueTone={f.recurringIncome ? 'positive' : undefined} />
        <ListRow title="Recurring costs" value={signedMoney(-f.recurringCosts, report.currency)} />
        <ListRow title="One-time items" subtitle="Income minus costs" value={signedMoney(f.oneTimeNet, report.currency)} />
        <ListRow title="Debt payments" value={signedMoney(-f.debtPayments, report.currency)} />
        <ListRow title="Cheques" value={signedMoney(-f.cheques, report.currency)} />
        <ListRow title="Balance at the end" value={money(f.endBalance)} valueTone={f.endBalance < 0 ? 'negative' : undefined} />
      </Card>

      {d ? (
        <Card testID="report-debts">
          <T variant="heading" accessibilityRole="header">
            Debts
          </T>
          <ListRow title="Owed at the start" value={money(d.owedStart)} />
          <ListRow title="Owed at the end" value={money(d.owedEnd)} />
          <ListRow title="Paid in the period" value={money(d.paid)} />
          <ListRow
            title="Estimated interest"
            subtitle={d.interestEstimate == null ? 'No interest rate entered' : 'From the rates you entered'}
            value={d.interestEstimate == null ? undefined : money(d.interestEstimate)}
          />
          <ListRow
            title="Debt payments vs income"
            subtitle={d.dtiPreviousPct == null ? undefined : `Previous period: ${d.dtiPreviousPct}%`}
            value={d.dtiPct == null ? 'n/a' : `${d.dtiPct}%`}
          />
          <ListRow
            title="Debt-free date"
            subtitle={d.debtFreeThen && d.debtFreeThen !== d.debtFreeNow ? `At the end of the period: ${formatDate(d.debtFreeThen)}` : 'Same as at the end of the period'}
            value={d.debtFreeNow ? formatDate(d.debtFreeNow) : 'Not known'}
          />
        </Card>
      ) : null}

      <View>
        <SectionHeader title="Key figures" />
        <View style={styles.tiles}>
          <StatTile label="Savings rate" value={s.savingsRate == null ? 'n/a' : `${s.savingsRate}%`} tone="accent" />
          <StatTile label="Debt-to-income" value={k.debtToIncomePct == null ? 'n/a' : `${k.debtToIncomePct}%`} />
          <StatTile label="Spending of income" value={k.spendingPct == null ? 'n/a' : `${k.spendingPct}%`} />
          <StatTile label="Months of buffer" value={k.monthsOfBuffer == null ? 'n/a' : String(k.monthsOfBuffer)} />
        </View>
      </View>
      <Card testID="report-keyfigures">
        <ListRow title="Biggest category" subtitle={k.biggestCategory?.sharePct != null ? `${k.biggestCategory.sharePct}% of spending` : undefined} value={k.biggestCategory ? `${k.biggestCategory.name}, ${money(k.biggestCategory.amount)}` : 'None'} />
        <ListRow title="Fixed costs" subtitle="Recurring costs, debt payments and cheques" value={money(k.fixedCosts)} />
        <ListRow title="Flexible costs" subtitle="One-time spending" value={money(k.flexibleCosts)} />
      </Card>

      {report.quarters ? (
        <Card testID="report-quarters">
          <T variant="heading" accessibilityRole="header">
            Quarter by quarter
          </T>
          <BarRows
            rows={report.quarters.map((q) => ({
              id: q.key,
              label: q.label,
              value: q.hasData ? q.saved : 0,
              display: q.hasData ? money(q.saved) : 'No entries',
              note: q.hasData ? `Income ${money(q.income)}, spending ${money(q.spending)}` : null,
            }))}
          />
          {report.bestMonth && report.worstMonth ? (
            <View style={{ gap: Spacing.one }}>
              <ListRow title="Best month" subtitle="Most saved" value={`${report.bestMonth.label}, ${money(report.bestMonth.saved)}`} />
              <ListRow title="Lowest month" subtitle="Least saved" value={`${report.worstMonth.label}, ${money(report.worstMonth.saved)}`} />
            </View>
          ) : null}
        </Card>
      ) : null}

      <T variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
        {report.isSample ? 'Made-up demo numbers. ' : ''}
        {DISCLAIMER} Generated {formatDate(report.generatedOn)}.
      </T>
    </>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
  compare: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  bullet: { flexDirection: 'row', gap: Spacing.two },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
