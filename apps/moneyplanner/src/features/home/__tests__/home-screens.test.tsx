import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import DashboardScreen from '@/app/(tabs)/index';
import { defaultSettings } from '@/data/defaults';
import { usePro } from '@/lib/pro';

import { recurring, renderWithRepo } from '../../../../test-support/render';
import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { defaultHomeLayout, toggleCard, moveCard, addChartCard } from '../layout';
import { tipsToShow } from '../tips';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/features/edit', () => require('../../../../test-support/edit-mock'));
jest.mock('@/global.css', () => ({}));
jest.mock('@/lib/pro', () => ({ usePro: jest.fn() }));

beforeEach(() => {
  resetRouterMock();
  (usePro as jest.Mock).mockReturnValue({ isPro: false, loading: false });
});

// Tips already seen unless a test is about them, so the bubbles do not get in the way.
const settings = { ...defaultSettings(), onboarded: true, startingBalance: 650000, buffer: 200000, tipsSeen: ['edit-balance', 'edit-home'] };
const plan = { recurring: [recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000, schedule: { type: 'monthly', day: 5 } })] };

describe('Home cards from the layout', () => {
  it('shows the default cards in order and leaves the year table and month-end list hidden', async () => {
    await renderWithRepo(<DashboardScreen />, { settings, ...plan });
    expect(await screen.findByTestId('dashboard-forecast')).toBeTruthy();
    for (const id of ['payday-card', 'dashboard-month-tiles', 'dashboard-upcoming', 'reports-card', 'dashboard-month-card', 'dashboard-categories']) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.queryByTestId('dashboard-year-card')).toBeNull();
    expect(screen.queryByTestId('dashboard-end-of-month')).toBeNull();
    expect(screen.getByTestId('home-edit-link')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-edit-link'));
    expect(router.push).toHaveBeenCalledWith('/home-edit');
  });

  it('follows a saved layout: a hidden card is gone, a shown one appears, the order is kept', async () => {
    let l = toggleCard(defaultHomeLayout(), 'payday');
    l = toggleCard(l, 'year');
    l = moveCard(l, 'year', -1); // year before endOfMonth; all the rest stays
    await renderWithRepo(<DashboardScreen />, { settings: { ...settings, homeLayout: l }, ...plan });
    expect(await screen.findByTestId('dashboard-year-card')).toBeTruthy();
    expect(screen.queryByTestId('payday-card')).toBeNull();
    // Order: the hero comes before the tiles, the tiles before Coming up.
    const tree = JSON.stringify(screen.toJSON());
    const at = (id: string) => tree.indexOf(`"testID":"${id}"`);
    const ids = ['dashboard-forecast', 'dashboard-month-tiles', 'dashboard-upcoming', 'dashboard-year-card'];
    expect(ids.map(at).every((i) => i >= 0)).toBe(true);
    expect([...ids].sort((a, b) => at(a) - at(b))).toEqual(ids);
  });

  it('says so when every card is hidden, and still links to Edit Home', async () => {
    const l = defaultHomeLayout().map((e) => ({ ...e, visible: false }));
    await renderWithRepo(<DashboardScreen />, { settings: { ...settings, homeLayout: l }, ...plan });
    expect(await screen.findByTestId('home-no-cards')).toBeTruthy();
    expect(screen.getByTestId('home-edit-link')).toBeTruthy();
  });

  it('draws an added chart: Income vs spending with its own data, a Pro chart as a labelled sample', async () => {
    let l = addChartCard(defaultHomeLayout(), 'income-vs-spending');
    l = addChartCard(l, 'savings-rate');
    await renderWithRepo(<DashboardScreen />, { settings: { ...settings, homeLayout: l }, ...plan });
    expect(await screen.findByTestId('chart-card-income-vs-spending')).toBeTruthy();
    expect(screen.queryByTestId('chart-card-income-vs-spending-unlock')).toBeNull();
    expect(screen.getByTestId('chart-card-savings-rate-sample-note')).toBeTruthy();
    expect(screen.getByTestId('chart-card-savings-rate-unlock')).toBeTruthy();
  });
});

describe('The pencil on a card', () => {
  const sheetFor = async (edit: string, sheet: string, extra: object = {}) => {
    await renderWithRepo(<DashboardScreen />, { settings, ...plan, ...extra });
    await fireEvent.press(await screen.findByTestId(edit));
    expect(await screen.findByTestId(`sheet-${sheet}`)).toBeTruthy();
  };

  it('opens the balance sheet from the balance card, and from the big number', async () => {
    await sheetFor('edit-balance', 'balance');
    await fireEvent.press(screen.getByTestId('sheet-balance')); // closes
    await waitFor(() => expect(screen.queryByTestId('sheet-balance')).toBeNull());
    await fireEvent.press(screen.getByTestId('dashboard-balance-value'));
    expect(await screen.findByTestId('sheet-balance')).toBeTruthy();
    expect(screen.queryByTestId('sheet-payday')).toBeNull();
  });

  it('opens the payday sheet from Safe to spend', async () => sheetFor('edit-payday', 'payday'));
  it('opens the reminders sheet from Coming up', async () => sheetFor('edit-reminders', 'reminders'));
  it('opens the spending sheet from Spending by category', async () => sheetFor('edit-spending', 'spending'));

  it('opens the alerts sheet from the Alerts card', async () => sheetFor('edit-alerts', 'alerts')); // rent 9,500 against 6,500 is an alert

  it('has no alerts card, so no alerts pencil, when there is nothing to alert', async () => {
    await renderWithRepo(<DashboardScreen />, { settings: { ...settings, startingBalance: 90_000_000 }, ...plan });
    expect(await screen.findByTestId('dashboard-forecast')).toBeTruthy();
    expect(screen.queryByTestId('alerts-card')).toBeNull();
    expect(screen.queryByTestId('edit-alerts')).toBeNull();
  });

  it('has a pencil only on the five cards with a sheet', async () => {
    await renderWithRepo(<DashboardScreen />, { settings, ...plan });
    await screen.findByTestId('dashboard-forecast');
    expect(screen.queryByTestId('edit-month')).toBeNull();
    for (const id of ['edit-balance', 'edit-payday', 'edit-alerts', 'edit-reminders', 'edit-spending']) expect(screen.getByTestId(id)).toBeTruthy();
  });
});

describe('Settings the cards follow', () => {
  it('starts the balance chart on the saved range and saves a chip tap', async () => {
    const { repo } = await renderWithRepo(<DashboardScreen />, { settings: { ...settings, chartRange: '6M' }, ...plan });
    const six = await screen.findByTestId('dashboard-balance-chart-range-6M');
    expect(six.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByTestId('dashboard-balance-chart-range-1Y'));
    await waitFor(async () => expect((await repo.getSettings()).chartRange).toBe('1Y'));
    expect(screen.getByTestId('dashboard-balance-chart-range-1Y').props.accessibilityState.selected).toBe(true);
  });

  it('shows the spending period from the setting', async () => {
    await renderWithRepo(<DashboardScreen />, { settings: { ...settings, spendingPeriod: 'year' }, ...plan });
    expect((await screen.findByTestId('dashboard-category-period')).props.children).toMatch(/^Year \d{4}$/);
  });
});

describe('One-time tips', () => {
  const fresh = { ...settings, tipsSeen: [] as string[] };

  it('decides which tip shows: the balance one first, Edit Home only after it and 3 visits', () => {
    expect(tipsToShow({ tipsSeen: [], homeVisits: 0 })).toEqual({ balance: true, editHome: false });
    expect(tipsToShow({ tipsSeen: [], homeVisits: 9 })).toEqual({ balance: true, editHome: false });
    expect(tipsToShow({ tipsSeen: ['edit-balance'], homeVisits: 2 })).toEqual({ balance: false, editHome: false });
    expect(tipsToShow({ tipsSeen: ['edit-balance'], homeVisits: 3 })).toEqual({ balance: false, editHome: true });
    expect(tipsToShow({ tipsSeen: ['edit-balance', 'edit-home'], homeVisits: 30 })).toEqual({ balance: false, editHome: false });
  });

  it('shows "Tap ✎ to edit" the first time, counts the visit, and never again once dismissed', async () => {
    const { repo } = await renderWithRepo(<DashboardScreen />, { settings: fresh, ...plan });
    expect(await screen.findByTestId('tip-edit-balance')).toBeTruthy();
    expect(screen.queryByTestId('tip-edit-home')).toBeNull();
    await waitFor(async () => expect((await repo.getSettings()).homeVisits).toBe(1));
    await fireEvent.press(screen.getByTestId('tip-edit-balance'));
    await waitFor(async () => expect((await repo.getSettings()).tipsSeen).toEqual(['edit-balance']));
    await waitFor(() => expect(screen.queryByTestId('tip-edit-balance')).toBeNull());
  });

  it('opening the pencil counts as seeing the tip', async () => {
    const { repo } = await renderWithRepo(<DashboardScreen />, { settings: fresh, ...plan });
    await fireEvent.press(await screen.findByTestId('edit-balance'));
    await waitFor(async () => expect((await repo.getSettings()).tipsSeen).toContain('edit-balance'));
  });

  it('shows the Edit Home tip after 3 visits, and opening Edit Home dismisses it', async () => {
    const { repo } = await renderWithRepo(<DashboardScreen />, { settings: { ...settings, tipsSeen: ['edit-balance'], homeVisits: 3 }, ...plan });
    expect(await screen.findByTestId('tip-edit-home')).toBeTruthy();
    expect(screen.queryByTestId('tip-edit-balance')).toBeNull();
    await fireEvent.press(screen.getByTestId('home-edit-link'));
    expect(router.push).toHaveBeenCalledWith('/home-edit');
    await waitFor(async () => expect((await repo.getSettings()).tipsSeen).toContain('edit-home'));
  });

  it('keeps the Edit Home tip back before the third visit', async () => {
    await renderWithRepo(<DashboardScreen />, { settings: { ...settings, tipsSeen: ['edit-balance'], homeVisits: 1 }, ...plan });
    await screen.findByTestId('dashboard-forecast');
    expect(screen.queryByTestId('tip-edit-home')).toBeNull();
  });
});
