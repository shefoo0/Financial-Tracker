import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import DashboardScreen from '@/app/(tabs)/index';
import { defaultSettings } from '@/data/defaults';

import { renderWithRepo, recurring, transaction } from '../../../test-support/render';
import { resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { addDays, addMonthKey, formatMonth, monthKey, today } from '@/lib/dates';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

beforeEach(resetRouterMock);

const settings = { ...defaultSettings(), onboarded: true, startingBalance: 650000, buffer: 200000 };

describe('Dashboard', () => {
  it('shows the empty state with add buttons when there is no data', async () => {
    await renderWithRepo(<DashboardScreen />, { settings });
    expect(await screen.findByText('Welcome to Money Planner')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('dashboard-add-salary'));
    expect(router.push).toHaveBeenCalledWith('/recurring/new?kind=income');
    await fireEvent.press(screen.getByTestId('dashboard-add-cost'));
    expect(router.push).toHaveBeenCalledWith('/recurring/new?kind=cost');
  });

  it('shows hand-checked figures for a small plan: salary 18,000, rent 9,500', async () => {
    await renderWithRepo(<DashboardScreen />, {
      settings,
      recurring: [
        recurring({ id: 's', name: 'Salary', kind: 'income', amount: 1800000, categoryId: 'salary', schedule: { type: 'monthly', day: 25 } }),
        recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000, categoryId: 'housing', schedule: { type: 'monthly', day: 5 } }),
      ],
    });
    expect(await screen.findByTestId('dashboard-forecast')).toBeTruthy();
    expect(screen.getByText('BALANCE TODAY')).toBeTruthy();
    expect(screen.getByLabelText('Balance today: AED 6,500.00')).toBeTruthy();
    // This month: income 18,000, spend 9,500, free 8,500, spent 9,500/18,000 = 52.8%.
    const month = within(screen.getByTestId('dashboard-month-card'));
    expect(month.getByText('AED 18,000.00')).toBeTruthy();
    expect(month.getAllByText('AED 9,500.00').length).toBeGreaterThan(0);
    expect(screen.getByTestId('dashboard-free-money').props.accessibilityLabel).toBe('Free money: AED 8,500.00');
    expect(month.getByText('52.8%')).toBeTruthy();
  });

  it('shows a warning when the forecast dips below the buffer', async () => {
    await renderWithRepo(<DashboardScreen />, {
      settings: { ...settings, startingBalance: 100000, buffer: 500000 },
      transactions: [transaction({ id: 't', description: 'x', kind: 'income', amount: 100, date: today() })],
      recurring: [recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000, schedule: { type: 'weekly', everyWeeks: 1 } })],
    });
    expect(await screen.findByTestId('dashboard-forecast-warning')).toBeTruthy();
  });

  it('lists what is coming up and links to the Month tab', async () => {
    await renderWithRepo(<DashboardScreen />, {
      settings,
      recurring: [recurring({ id: 'r', name: 'Gym', kind: 'cost', amount: 15000, schedule: { type: 'weekly', everyWeeks: 1 } })],
    });
    expect(await screen.findByTestId('dashboard-upcoming-0')).toBeTruthy();
    expect(within(screen.getByTestId('dashboard-upcoming')).getAllByText('Gym').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('dashboard-see-all'));
    expect(router.push).toHaveBeenCalledWith('/month');
  });

  it('changes the month with the stepper', async () => {
    await renderWithRepo(<DashboardScreen />, {
      settings,
      recurring: [recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000 })],
    });
    const card = await screen.findByTestId('dashboard-month-card');
    const label = (formatMonth(monthKey(today())));
    expect(within(card).getByText(label)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('dashboard-month-next'));
    await waitFor(() => expect(within(screen.getByTestId('dashboard-month-card')).getByText(formatMonth(addMonthKey(monthKey(today()), 1)))).toBeTruthy());
  });

  describe('Coming up', () => {
    const upcoming = () => within(screen.getByTestId('dashboard-upcoming'));

    it('says so when nothing is upcoming', async () => {
      await renderWithRepo(<DashboardScreen />, {
        settings,
        transactions: [transaction({ id: 'old', description: 'Past', kind: 'cost', amount: 100, date: addDays(today(), -3) })],
      });
      expect(await screen.findByText('Nothing planned in the next 90 days.')).toBeTruthy();
      expect(screen.queryByTestId('dashboard-upcoming-0')).toBeNull();
    });

    it('shows one row per item, soonest first, with planned one-time items, and ignores past, unplanned and far ones', async () => {
      await renderWithRepo(<DashboardScreen />, {
        settings,
        recurring: [
          recurring({ id: 'gym', name: 'Gym', kind: 'cost', amount: 15000, startDate: today(), schedule: { type: 'weekly', everyWeeks: 1 } }),
        ],
        transactions: [
          transaction({ id: 'p1', description: 'Visa fee', kind: 'cost', amount: 50000, date: addDays(today(), 3), planned: true }),
          transaction({ id: 'p2', description: 'Bonus', kind: 'income', amount: 200000, date: addDays(today(), 1), planned: true }),
          transaction({ id: 'u', description: 'Unplanned', kind: 'cost', amount: 100, date: addDays(today(), 2) }),
          transaction({ id: 'past', description: 'Past planned', kind: 'cost', amount: 100, date: addDays(today(), -1), planned: true }),
          transaction({ id: 'far', description: 'Far planned', kind: 'cost', amount: 100, date: addDays(today(), 200), planned: true }),
        ],
      });
      expect(await screen.findByTestId('dashboard-upcoming-0')).toBeTruthy();
      // Gym (today), Bonus (tomorrow), Visa fee (in 3 days); Gym appears once although it repeats weekly.
      expect(screen.queryByTestId('dashboard-upcoming-3')).toBeNull();
      expect(screen.getByTestId('dashboard-upcoming-0').props.accessibilityLabel).toBe('Gym, today, cost AED 150.00');
      expect(screen.getByTestId('dashboard-upcoming-1').props.accessibilityLabel).toBe('Bonus, tomorrow, income AED 2,000.00');
      expect(screen.getByTestId('dashboard-upcoming-2').props.accessibilityLabel).toBe('Visa fee, in 3 days, cost AED 500.00');
      expect(upcoming().queryByText('Unplanned')).toBeNull();
      expect(upcoming().queryByText('Past planned')).toBeNull();
      expect(upcoming().queryByText('Far planned')).toBeNull();
      expect(upcoming().getByText('+AED 2,000.00')).toBeTruthy();
      expect(upcoming().getByText('-AED 500.00')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('dashboard-upcoming-2'));
      expect(router.push).toHaveBeenCalledWith('/transaction/p1');
      await fireEvent.press(screen.getByTestId('dashboard-upcoming-0'));
      expect(router.push).toHaveBeenCalledWith('/recurring/gym');
    });

    it('shows "k of N paid" for items with a fixed number of payments', async () => {
      await renderWithRepo(<DashboardScreen />, {
        settings,
        recurring: [
          recurring({ id: 'loan', name: 'Car loan', kind: 'cost', amount: 100000, startDate: addDays(today(), -14), count: 5, schedule: { type: 'weekly', everyWeeks: 1 } }),
        ],
      });
      expect(await screen.findByTestId('dashboard-upcoming-0')).toBeTruthy();
      expect(upcoming().getByText(/2 of 5 paid/)).toBeTruthy();
      expect(screen.getByTestId('dashboard-upcoming-0').props.accessibilityLabel).toBe('Car loan, today, 2 of 5 paid, cost AED 1,000.00');
    });

    it('limits the list to five rows', async () => {
      await renderWithRepo(<DashboardScreen />, {
        settings,
        transactions: Array.from({ length: 8 }, (_, i) =>
          transaction({ id: `x${i}`, description: `Plan ${i}`, kind: 'cost', amount: 100, date: addDays(today(), i + 1), planned: true }),
        ),
      });
      expect(await screen.findByTestId('dashboard-upcoming-4')).toBeTruthy();
      expect(screen.queryByTestId('dashboard-upcoming-5')).toBeNull();
    });
  });

  it('shows compact tile values with the full amount as the accessibility label', async () => {
    await renderWithRepo(<DashboardScreen />, {
      settings,
      transactions: [
        transaction({ id: 'big', description: 'Sale', kind: 'income', amount: 125_000_050, date: today() }),
        transaction({ id: 'c', description: 'Rent', kind: 'cost', amount: 150_000_000 + 25, date: today() }),
      ],
    });
    const income = await screen.findByTestId('dashboard-tile-income');
    expect(income.props.accessibilityLabel).toBe('Income: AED 1,250,000.50');
    expect(within(income).getByText('1.25M')).toBeTruthy();
    const spent = screen.getByTestId('dashboard-tile-spent');
    expect(spent.props.accessibilityLabel).toBe('Spent: AED 1,500,000.25');
    expect(within(spent).getByText('1.5M')).toBeTruthy();
    const free = screen.getByTestId('dashboard-tile-free');
    expect(free.props.accessibilityLabel).toBe('Free: -AED 249,999.75');
    expect(within(free).getByText('-250,000')).toBeTruthy();
  });
});
