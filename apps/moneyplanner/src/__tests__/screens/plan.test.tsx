import { fireEvent, screen } from '@testing-library/react-native';

import PlanScreen from '@/app/(tabs)/plan';
import { defaultSettings } from '@/data/defaults';

import { resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { recurring, renderWithRepo } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
});


const settings = { ...defaultSettings(), onboarded: true };

describe('Plan tab', () => {
  it('shows the empty state with add buttons', async () => {
    await renderWithRepo(<PlanScreen />, { settings });
    expect(await screen.findByText('Plan your regular money')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-add-cost'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/recurring/[id]', params: { id: 'new', kind: 'cost' } });
    await fireEvent.press(screen.getByTestId('plan-add-income'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/recurring/[id]', params: { id: 'new', kind: 'income' } });
  });

  it('lists income and costs with monthly totals', async () => {
    await renderWithRepo(<PlanScreen />, {
      settings,
      recurring: [
        recurring({ id: 's', name: 'Salary', kind: 'income', amount: 1800000, schedule: { type: 'monthly', day: 25 } }),
        recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000 }),
        recurring({ id: 'g', name: 'Gym', kind: 'cost', amount: 30000 }),
      ],
    });
    expect(await screen.findByText('Salary')).toBeTruthy();
    expect(screen.getByTestId('plan-total-income').props.children).toBe('Total ≈ AED 18,000.00 / month');
    expect(screen.getByTestId('plan-total-cost').props.children).toBe('Total ≈ AED 9,800.00 / month');
    await fireEvent.press(screen.getByTestId('plan-item-r'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/recurring/[id]', params: { id: 'r' } });
  });

  it('says so when one side has no items', async () => {
    await renderWithRepo(<PlanScreen />, {
      settings,
      recurring: [recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000 })],
    });
    expect(await screen.findByText('No recurring income yet.')).toBeTruthy();
  });
});
