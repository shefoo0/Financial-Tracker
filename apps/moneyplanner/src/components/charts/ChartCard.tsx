import { Fragment, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Circle, Line, Path, Rect } from 'react-native-svg';

import { Button, Card, Pill, Sheet, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { sampleInput } from '@/engine';
import { EditButton } from '@/features/edit';
import { showPro } from '@/features/pro/showPro';
import { useTheme } from '@/hooks/use-theme';
import { usePro } from '@/lib/pro';
import type { ISODate, PlanInput } from '@/types';
import { formatChartValue } from './addedCharts';
import { compactAmount, kindLabel, smoothPath, type SeriesPoint } from './chartMath';
import { ChartFrame } from './ChartFrame';
import { RangeChips } from './RangeChips';
import type { ChartDef, ChartSeries, SeriesTone } from './registry';

const TOOLTIP_W = 176;
const MAX_BAR = 14;

export const unlockChartsPro = showPro;

/** Spoken summary: for each series its lowest and highest point. */
function describe(def: ChartDef, series: ChartSeries[], rangeSpoken: string, currency: string): string {
  const parts = series.map((s) => {
    const lo = s.points.reduce((m, p) => (p.balance < m.balance ? p : m), s.points[0]);
    const hi = s.points.reduce((m, p) => (p.balance > m.balance ? p : m), s.points[0]);
    return `${s.label}: lowest ${formatChartValue(def.unit, lo.balance, currency)} in ${lo.title}, highest ${formatChartValue(def.unit, hi.balance, currency)} in ${hi.title}.`;
  });
  return `${def.title}, ${rangeSpoken}. ${parts.join(' ')}`;
}

/**
 * One card for every added chart (Income vs spending, Debt payoff, Savings rate): title, a pencil that opens the
 * range, the scrubbable chart (bars or a line), its key and a tooltip. A Pro chart for someone without Pro is drawn
 * from the demo household, labelled SAMPLE, with an Unlock Pro button: the user's own figures are never used.
 */
export function ChartCard({ def, input, today, testID = `chart-card-${def.id}` }: { def: ChartDef; input: PlanInput; today: ISODate; testID?: string }) {
  const c = useTheme();
  const { isPro } = usePro();
  const sample = def.pro && !isPro;
  const [range, setRange] = useState(def.defaultRange ?? def.ranges[0].key);
  const [rangeOpen, setRangeOpen] = useState(false);
  const source = useMemo(() => (sample ? sampleInput(today) : input), [sample, input, today]);
  const currency = source.settings.currency;
  const series = useMemo(() => def.build(source, range, today), [def, source, range, today]);
  const points = series[0]?.points ?? [];
  const empty = points.length < 2;
  const r = def.ranges.find((x) => x.key === range) ?? def.ranges[0];
  const tone = (id: string): string => c[(def.tones?.[id] ?? 'accent') as SeriesTone];
  const speak = (p: SeriesPoint, cur: string) => `${p.title}, ${p.kind}: ${series.map((s) => `${s.label} ${formatChartValue(def.unit, s.points[points.indexOf(p)]?.balance ?? p.balance, cur)}`).join(', ')}`;
  const bars = def.style === 'bars';
  const hasActual = points.some((p) => p.kind === 'actual' && p.title !== 'Today');
  const hasForecast = points.some((p) => p.kind === 'forecast');
  const all = series.flatMap((s) => s.points.map((p) => p.balance));

  return (
    <Card testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two }}>
          <T variant="heading" accessibilityRole="header">
            {def.title}
          </T>
          {sample ? <Pill label="SAMPLE" tone="warning" /> : null}
        </View>
        <EditButton onPress={() => setRangeOpen(true)} label={`range of ${def.title}`} testID={`${testID}-edit`} />
      </View>

      {sample ? (
        <T tone="secondary" testID={`${testID}-sample-note`}>
          Sample: made-up demo numbers, not your own. Your own chart comes with Pro.
        </T>
      ) : null}

      {empty ? (
        <T tone="secondary" testID={`${testID}-empty`}>
          {def.emptyMessage ?? 'Nothing to show yet.'}
        </T>
      ) : (
        <>
          <ChartFrame
            points={points}
            domain={[0, ...all]}
            currency={currency}
            accessibilityLabel={describe(def, series, r.spoken, currency)}
            height={200}
            testID={`${testID}-chart`}
            gridColor={c.border}
            labelColor={c.textSecondary}
            todayColor={c.text}
            showToday={false}
            formatTick={(v) => (def.unit === 'percent' ? `${Math.round(v / 100)}%` : compactAmount(v))}
            speak={speak}
            under={({ s, plotW }) => (s.min < 0 && s.max > 0 ? <Line x1={0} x2={plotW} y1={s.y(0)} y2={s.y(0)} stroke={c.textSecondary} strokeWidth={1.25} /> : null)}
            over={({ s, plotW, plotH, active }) => {
              const n = points.length;
              const slot = n > 1 ? (plotW - 16) / (n - 1) : plotW;
              const group = Math.min(slot * 0.8, MAX_BAR * series.length);
              const barW = group / series.length;
              const base = s.y(0);
              return (
                <>
                  {active && <Rect x={active.at.x - slot / 2} y={0} width={slot} height={plotH} fill={c.backgroundSelected} fillOpacity={0.7} />}
                  {series.map((ser, k) => {
                    const color = tone(ser.id);
                    if (bars) {
                      return ser.points.map((p, i) => {
                        if (p.balance === 0) return null; // nothing to draw (a month with no income or spending)
                        const x = s.points[i].x - group / 2 + k * barW;
                        const y = s.y(p.balance);
                        const forecast = p.kind === 'forecast';
                        return (
                          <Rect
                            key={`${ser.id}${i}`}
                            x={x + 0.5}
                            y={Math.min(y, base)}
                            width={Math.max(1, barW - 1)}
                            height={Math.max(1, Math.abs(base - y))}
                            rx={2}
                            fill={color}
                            fillOpacity={forecast ? 0.4 : 1}
                            stroke={color}
                            strokeWidth={forecast ? 1.25 : 0}
                            strokeDasharray={forecast ? '3,2' : undefined}
                          />
                        );
                      });
                    }
                    const pts = ser.points.map((p, i) => ({ ...s.points[i], kind: p.kind }));
                    const firstAhead = pts.findIndex((p) => p.kind === 'forecast');
                    const actualPts = firstAhead < 0 ? pts : pts.slice(0, firstAhead);
                    const aheadPts = firstAhead < 0 ? [] : pts.slice(Math.max(firstAhead - 1, 0));
                    return (
                      <Fragment key={ser.id}>
                        {actualPts.length > 1 && <Path d={smoothPath(actualPts)} stroke={color} strokeWidth={2.75} fill="none" strokeLinejoin="round" strokeLinecap="round" />}
                        {aheadPts.length > 1 && <Path d={smoothPath(aheadPts)} stroke={color} strokeWidth={2.75} strokeDasharray="7,5" fill="none" strokeLinejoin="round" />}
                      </Fragment>
                    );
                  })}
                  {!bars && active && (
                    <>
                      <Line x1={active.at.x} x2={active.at.x} y1={0} y2={plotH} stroke={c.text} strokeWidth={1} strokeDasharray="3,3" />
                      <Circle cx={active.at.x} cy={active.at.y} r={5} fill={tone(series[0].id)} stroke={c.background} strokeWidth={2} />
                    </>
                  )}
                </>
              );
            }}
            overlay={({ plotW, active }) => {
              if (!active) return null;
              const i = active.index;
              const left = active.at.x > plotW / 2 ? Spacing.two : Math.max(Spacing.two, plotW - TOOLTIP_W - Spacing.two);
              const extra = (active.point.lines ?? []).slice(0, 3);
              return (
                <View
                  pointerEvents="none"
                  testID={`${testID}-tooltip`}
                  style={{ position: 'absolute', top: 2, left, width: TOOLTIP_W, borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one + 2, backgroundColor: c.backgroundElement, borderWidth: 1, borderColor: c.border, boxShadow: c.tooltipShadow }}>
                  <T variant="caption" tone="secondary" style={{ fontWeight: '600' }} maxFontSizeMultiplier={1.2}>
                    {`${active.point.title} · ${kindLabel(active.point.kind)}`}
                  </T>
                  {series.map((ser) => (
                    <View key={ser.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
                      <T variant="caption" numberOfLines={1} style={{ flex: 1, color: tone(ser.id), fontWeight: '700' }} maxFontSizeMultiplier={1.2}>
                        {ser.label}
                      </T>
                      <T variant="label" style={{ fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.2}>
                        {formatChartValue(def.unit, ser.points[i].balance, currency)}
                      </T>
                    </View>
                  ))}
                  {series.length === 1 && extra.length > 0 && (
                    <T variant="caption" tone="secondary" maxFontSizeMultiplier={1.2}>
                      {extra.map((l) => `${l.label} ${formatChartValue('money', Math.abs(l.amount), currency)}`).join(' · ')}
                    </T>
                  )}
                </View>
              );
            }}
            legend={
              <View
                accessible
                accessibilityLabel={`Key: ${series.map((s) => s.label).join(' and ')}${hasActual && hasForecast ? '. Solid is actual, lighter or dashed is forecast' : hasForecast ? '. Dashed is forecast' : ''}`}
                testID={`${testID}-legend`}
                style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.three, marginTop: Spacing.one }}>
                {series.map((s) => (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
                    <View style={{ width: bars ? 12 : 22, height: bars ? 12 : 4, borderRadius: 2, backgroundColor: tone(s.id) }} />
                    <T variant="caption" maxFontSizeMultiplier={1.4} style={{ fontWeight: '600' }}>
                      {s.label}
                    </T>
                  </View>
                ))}
                {hasForecast ? (
                  <T variant="caption" tone="secondary" maxFontSizeMultiplier={1.4}>
                    {hasActual ? (bars ? 'Lighter bars are forecast' : 'Dashed is forecast') : 'Dashed is forecast'}
                  </T>
                ) : null}
              </View>
            }
          />
        </>
      )}

      {sample ? (
        // Compact and on the left: Home's floating "+" sits bottom-right, so a full-width button ran under it.
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label="Unlock Pro" onPress={unlockChartsPro} testID={`${testID}-unlock`} accessibilityHint="Opens Money Planner Pro" />
        </View>
      ) : null}

      <Sheet visible={rangeOpen} onClose={() => setRangeOpen(false)} title={`${def.title}: range`} testID={`${testID}-range-sheet`}>
        <View style={{ gap: Spacing.three, paddingBottom: Spacing.three }}>
          <RangeChips ranges={def.ranges} value={range} onChange={setRange} tone={{ plain: true }} testID={testID} />
          <Button label="Done" variant="secondary" onPress={() => setRangeOpen(false)} testID={`${testID}-range-done`} />
        </View>
      </Sheet>
    </Card>
  );
}
