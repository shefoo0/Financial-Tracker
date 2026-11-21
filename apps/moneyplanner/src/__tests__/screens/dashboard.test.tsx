import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import DashboardScreen from '@/app/(tabs)/index';
import { defaultSettings } from '@/data/defaults';

import { renderWithRepo, recurring, transaction } from '../../../test-support/render';
import { resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { addMonthKey, formatMonth, monthKey, today } from '@/lib/dates';

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
});

