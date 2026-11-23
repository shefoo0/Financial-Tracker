// Edit Home: show or hide each card, move it up or down, add a chart, reset to the default. Every change is saved at
// once (no Save button); "Done" just goes back.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { ADDABLE_CHARTS } from '@/components/charts';
import { Button, Card, Pill, Screen, SectionHeader, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { usePlanInput } from '@/data/DataProvider';
import { useSettingSetter } from '@/data/useSettingSetter';
import { ErrorScreen, LoadingScreen } from '@/features/dashboard/Parts';
import { ScreenTitle } from '@/features/settings/ScreenTitle';
import { useTheme } from '@/hooks/use-theme';
import { usePro } from '@/lib/pro';
import type { HomeLayoutEntry } from '@/types';
import { cardFor } from './cards';
import { addChartCard, chartCardId, defaultHomeLayout, homeLayoutOf, isChartCardId, moveCard, removeCard, toggleCard } from './layout';

/** testIDs can't hold the colon of `chart:<id>`. */
const slug = (id: string) => id.replace(/[^a-zA-Z0-9]+/g, '-');

function MoveButton({ dir, title, disabled, onPress, testID }: { dir: 'up' | 'down'; title: string; disabled: boolean; onPress: () => void; testID: string }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Move ${title} ${dir}`}
      accessibilityState={{ disabled }}
      testID={testID}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill, borderWidth: 1, borderColor: c.border, opacity: disabled ? 0.35 : 1 }}>
      <T variant="heading" tone="accent" maxFontSizeMultiplier={1.3}>
        {dir === 'up' ? '↑' : '↓'}
      </T>
    </Pressable>
  );
}

export function EditHomeScreen() {
  const router = useRouter();
  const c = useTheme();
  const { isPro } = usePro();
  const { data, loading, error, reload } = usePlanInput();
  const { set } = useSettingSetter();
  // What is on screen right now: the saved layout until the first change, then our own copy (so quick taps add up).
  const [local, setLocal] = useState<HomeLayoutEntry[] | null>(null);
  if (!data) return error || !loading ? <ErrorScreen onRetry={reload} /> : <LoadingScreen />;
  const layout = local ?? homeLayoutOf(data.settings);

  const apply = (next: HomeLayoutEntry[]) => {
    if (next === layout) return;
    setLocal(next);
    void set({ homeLayout: next }).then((ok) => {
      if (!ok) setLocal(null);
    });
  };
  const isDefault = JSON.stringify(layout) === JSON.stringify(defaultHomeLayout());

  return (
    <Screen testID="home-edit-screen">
      <ScreenTitle testID="home-edit-title">Your Home cards</ScreenTitle>
      <T tone="secondary">Show or hide a card and move it up or down. Changes save as you make them.</T>

      <Card testID="home-edit-list">
        {layout.map((e, i) => {
          const def = cardFor(e.id);
          if (!def) return null;
          const id = slug(e.id);
          return (
            <View key={e.id} testID={`home-edit-row-${id}`} style={{ gap: Spacing.one, paddingVertical: Spacing.two, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' }}>
                <T variant="label">{def.title}</T>
                {def.chartId ? <Pill label="Chart" tone="secondary" /> : null}
              </View>
              <T variant="caption" tone="secondary">
                {def.description}
              </T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap', minHeight: 48 }}>
                {/* Switch and its "Shown" label tap as one control (see ToggleRow). */}
                <Pressable
                  onPress={() => apply(toggleCard(layout, e.id))}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: e.visible }}
                  accessibilityLabel={`Show ${def.title} on Home`}
                  testID={`home-edit-toggle-${id}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flex: 1, minWidth: 140, minHeight: 44 }}>
                  <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Switch value={e.visible} trackColor={{ true: c.accent, false: c.border }} thumbColor={c.thumb} />
                  </View>
                  <T variant="caption" tone="secondary">
                    {e.visible ? 'Shown' : 'Hidden'}
                  </T>
                </Pressable>
                {isChartCardId(e.id) ? (
                  <Pressable
                    onPress={() => apply(removeCard(layout, e.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${def.title} from Home`}
                    testID={`home-edit-remove-${id}`}
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.two }}>
                    <T variant="label" tone="negative">
                      Remove
                    </T>
                  </Pressable>
                ) : null}
                <MoveButton dir="up" title={def.title} disabled={i === 0} onPress={() => apply(moveCard(layout, e.id, -1))} testID={`home-edit-up-${id}`} />
                <MoveButton dir="down" title={def.title} disabled={i === layout.length - 1} onPress={() => apply(moveCard(layout, e.id, 1))} testID={`home-edit-down-${id}`} />
              </View>
            </View>
          );
        })}
      </Card>

      <Card testID="home-edit-charts">
        <SectionHeader title="Add a chart" />
        {ADDABLE_CHARTS.map((chart, i) => {
          const added = layout.some((e) => e.id === chartCardId(chart.id));
          return (
            <View key={chart.id} style={{ gap: Spacing.one, paddingVertical: Spacing.two, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' }}>
                <T variant="label">{chart.title}</T>
                <Pill label={chart.pro ? 'Pro' : 'Free'} tone={chart.pro ? 'accent' : 'positive'} />
              </View>
              <T variant="caption" tone="secondary">
                {chart.description}
                {chart.pro && !isPro ? ' Without Pro it shows a labelled sample.' : ''}
              </T>
              {added ? (
                <T variant="label" tone="secondary" testID={`home-edit-added-${slug(chart.id)}`}>
                  Added to Home
                </T>
              ) : (
                <Button label={`Add ${chart.title}`} variant="secondary" onPress={() => apply(addChartCard(layout, chart.id))} testID={`home-edit-add-${slug(chart.id)}`} />
              )}
            </View>
          );
        })}
      </Card>

      <Button label="Reset to default" variant="secondary" disabled={isDefault} onPress={() => apply(defaultHomeLayout())} testID="home-edit-reset" accessibilityHint="Puts the cards back in their original order and removes added charts" />
      <Button label="Done" onPress={() => router.back()} testID="home-edit-done" />
    </Screen>
  );
}
