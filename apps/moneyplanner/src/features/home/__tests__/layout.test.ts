import { ADDABLE_CHARTS } from '@/components/charts';
import { settingsFromStored } from '@/data/settingsSchema';
import { addChartCard, chartCardId, defaultHomeLayout, FIXED_CARD_IDS, homeLayoutOf, moveCard, removeCard, toggleCard, validateHomeLayout } from '../layout';
import { cardFor, FIXED_CARDS } from '../cards';

const ids = (l: { id: string }[]) => l.map((e) => e.id);

describe('Home layout', () => {
  it('defaults to the current Home order with the year table and end-of-month list hidden', () => {
    const l = defaultHomeLayout();
    expect(ids(l)).toEqual(['balance', 'payday', 'tiles', 'alerts', 'upcoming', 'reports', 'month', 'categories', 'endOfMonth', 'year', 'backup']);
    expect(l.filter((e) => !e.visible).map((e) => e.id)).toEqual(['endOfMonth', 'year']);
    expect(settingsFromStored({}).homeLayout).toEqual(l);
  });

  it('keeps a saved order and visibility, drops unknown ids, repeats and bad entries', () => {
    const saved = [
      { id: 'year', visible: true },
      { id: 'gone-card', visible: true },
      { id: 'balance', visible: false },
      { id: 'year', visible: false },
      { id: 'payday', visible: 'yes' },
      null,
      'balance',
      { id: 'chart:nope', visible: true },
    ];
    const out = validateHomeLayout(saved) ?? [];
    expect(out.slice(0, 2)).toEqual([
      { id: 'year', visible: true },
      { id: 'balance', visible: false },
    ]);
    expect(ids(out).filter((i) => i === 'year')).toHaveLength(1);
    expect(ids(out)).not.toContain('gone-card');
    expect(ids(out)).not.toContain('chart:nope');
  });

  it('appends cards added by an update at the end, hidden, without touching the saved order', () => {
    const old = [
      { id: 'upcoming', visible: true },
      { id: 'balance', visible: true },
    ];
    const out = validateHomeLayout(old) ?? [];
    expect(out.slice(0, 2)).toEqual(old);
    const rest = out.slice(2);
    expect(rest.map((e) => e.id)).toEqual(FIXED_CARD_IDS.filter((i) => i !== 'upcoming' && i !== 'balance'));
    expect(rest.every((e) => !e.visible)).toBe(true);
  });

  it('does not add charts the user has not added, and keeps added ones', () => {
    expect(ids(validateHomeLayout([]) ?? []).some((i) => i.startsWith('chart:'))).toBe(false);
    const out = validateHomeLayout([{ id: 'chart:savings-rate', visible: true }]) ?? [];
    expect(out[0]).toEqual({ id: 'chart:savings-rate', visible: true });
  });

  it('is applied by the settings schema: garbage gives the default, a stored layout is completed', () => {
    expect(settingsFromStored({ homeLayout: 'x' }).homeLayout).toEqual(defaultHomeLayout());
    expect(settingsFromStored({ homeLayout: [{ id: 'year', visible: true }] }).homeLayout[0]).toEqual({ id: 'year', visible: true });
    expect(homeLayoutOf({})).toEqual(defaultHomeLayout());
  });

  it('moves, toggles, adds once and removes charts', () => {
    const l = defaultHomeLayout();
    expect(ids(moveCard(l, 'payday', -1)).slice(0, 2)).toEqual(['payday', 'balance']);
    expect(ids(moveCard(l, 'payday', 1)).slice(0, 3)).toEqual(['balance', 'tiles', 'payday']);
    expect(moveCard(l, 'balance', -1)).toBe(l);
    expect(moveCard(l, 'backup', 1)).toBe(l);
    expect(toggleCard(l, 'year').find((e) => e.id === 'year')?.visible).toBe(true);
    const added = addChartCard(l, 'debt-payoff');
    expect(added[added.length - 1]).toEqual({ id: 'chart:debt-payoff', visible: true });
    expect(addChartCard(added, 'debt-payoff')).toBe(added);
    expect(addChartCard(l, 'balance')).toBe(l);
    expect(removeCard(added, 'chart:debt-payoff')).toEqual(l);
    expect(removeCard(l, 'payday')).toEqual(l); // fixed cards cannot be removed
  });

  it('has a card definition for every id, and the addable chart ids match the chart registry', () => {
    expect(FIXED_CARDS.map((c) => c.id)).toEqual([...FIXED_CARD_IDS]);
    for (const c of FIXED_CARDS) expect(c.title.length).toBeGreaterThan(0);
    expect(FIXED_CARDS.filter((c) => c.sheet).map((c) => `${c.id}:${c.sheet}`)).toEqual(['balance:balance', 'payday:payday', 'alerts:alerts', 'upcoming:reminders', 'categories:spending']);
    for (const chart of ADDABLE_CHARTS) {
      expect(cardFor(chartCardId(chart.id))?.chartId).toBe(chart.id);
      expect(validateHomeLayout([{ id: chartCardId(chart.id), visible: true }])?.[0].id).toBe(chartCardId(chart.id));
    }
    expect(ADDABLE_CHARTS.map((c) => c.pro)).toEqual([false, true, true]);
    expect(cardFor('nope')).toBeUndefined();
  });
});
