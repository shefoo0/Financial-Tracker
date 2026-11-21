import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import MonthScreen from '@/app/(tabs)/month';
import { defaultSettings } from '@/data/defaults';
import { today } from '@/lib/dates';

import { resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { recurring, renderWithRepo, transaction } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
});


const settings = { ...defaultSettings(), onboarded: true };

describe('Month tab', () => {
  it('shows the empty state when nothing falls in the month', async () => {
    await renderWithRepo(<MonthScreen />, { settings });
    expect(await screen.findByText('Nothing in this month')).toBeTruthy();
    expect(screen.getByText('No income')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('month-add-item'));
    expect(router.push).toHaveBeenCalledWith(`/transaction/new?date=${today()}`);
  });

  it('lists recurring occurrences and one-time items with correct totals', async () => {
    await renderWithRepo(<MonthScreen />, {
      settings,
      recurring: [
        recurring({ id: 's', name: 'Salary', kind: 'income', amount: 1800000, schedule: { type: 'monthly', day: 25 } }),
        recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000, schedule: { type: 'monthly', day: 5 } }),
      ],
      transactions: [transaction({ id: 't', description: 'Taxi', kind: 'cost', amount: 5000, date: today() })],
    });
    expect(await screen.findByText('Salary')).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.getByText('Taxi')).toBeTruthy();
    expect(screen.queryByText('Nothing in this month')).toBeNull();
    const summary = within(screen.getByTestId('month-summary'));
    // income 18,000; recurring costs 9,500; one-time 50; spend 9,550; free 8,450; 53.1%
    expect(summary.getByText('AED 18,000.00')).toBeTruthy();
    expect(summary.getByText('AED 9,500.00')).toBeTruthy();
    expect(summary.getByText('AED 50.00')).toBeTruthy();
    expect(summary.getByText('AED 9,550.00')).toBeTruthy();
    expect(summary.getByText('AED 8,450.00')).toBeTruthy();
    expect(summary.getByText('53.1%')).toBeTruthy();
    expect(screen.getByTestId('month-item-0')).toBeTruthy();
    expect(screen.getByTestId('month-item-2')).toBeTruthy();
  });

  it('opens an item when tapped', async () => {
    await renderWithRepo(<MonthScreen />, {
      settings,
      transactions: [transaction({ id: 't1', description: 'Taxi', kind: 'cost', amount: 5000, date: today() })],
    });
    await fireEvent.press(await screen.findByTestId('month-item-0'));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(String((router.push as jest.Mock).mock.calls[0][0])).toContain('t1');
  });

  it('moves between months and back with Today', async () => {
    await renderWithRepo(<MonthScreen />, { settings });
    await screen.findByText('Nothing in this month');
    expect(screen.getByTestId('month-today').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('month-next'));
    await waitFor(() => expect(screen.getByTestId('month-today').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByTestId('month-today'));
    await waitFor(() => expect(screen.getByTestId('month-today').props.accessibilityState.disabled).toBe(true));
  });
});
