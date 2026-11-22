import { fireEvent, screen, within } from '@testing-library/react-native';

import DebtsScreen from '@/app/debts';
import { defaultSettings } from '@/data/defaults';

import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { recurring, renderWithRepo } from '../../../../test-support/render';
import { card, loan, plan } from '../testing/fixtures';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/engine', () => ({ ...jest.requireActual('@/engine'), ...require('../testing/fake-engine') }));

beforeEach(() => resetRouterMock());

const settings = { ...defaultSettings(), onboarded: true };
const salary = recurring({ id: 's', name: 'Salary', kind: 'income', amount: 1_000_000 });

describe('Debts list', () => {
  it('explains the module and offers the three add buttons when empty', async () => {
    await renderWithRepo(<DebtsScreen />, { settings });
    expect(await screen.findByText('Track what you owe')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('debts-add-loan'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/debts/[id]', params: { id: 'new', type: 'loan' } });
    await fireEvent.press(screen.getByTestId('debts-add-card'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/debts/[id]', params: { id: 'new', type: 'card' } });
    await fireEvent.press(screen.getByTestId('debts-add-plan'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/debts/[id]', params: { id: 'new', type: 'plan' } });
  });

  it('shows each type with its figures and the debt-to-income fact', async () => {
    await renderWithRepo(<DebtsScreen />, { settings, debts: [loan(), card(), plan()], recurring: [salary] });
    expect(await screen.findByText('Loans')).toBeTruthy();
    expect(screen.getByText('Cards')).toBeTruthy();
    expect(screen.getByText('Instalment plans')).toBeTruthy();
    // 20,000 + 6,200 + 4,800 owed
    expect(screen.getByTestId('debts-total').props.children).toBe('AED 31,000.00');
    // 3,000 + 1,600 = 4,600 of 10,000 income
    expect(screen.getByText('Debt payments are 46% of income')).toBeTruthy();
    expect(screen.getByText(/At or above your caution level of 40%/)).toBeTruthy();
    const cardRow = screen.getByTestId('debt-item-1');
    expect(within(cardRow).getByText('Visa card')).toBeTruthy();
    expect(within(cardRow).getByText(/Available AED 3,800.00 · 62% used/)).toBeTruthy();
    expect(within(screen.getByTestId('debt-item-2')).getByText('2 of 3 paid')).toBeTruthy();
    expect(within(screen.getByTestId('debt-item-0')).getByText(/Next AED 3,000.00/)).toBeTruthy();
  });

  it('flags a card near its limit and opens a debt when tapped', async () => {
    await renderWithRepo(<DebtsScreen />, { settings, debts: [card({ balance: 900_000 })] });
    expect(await screen.findByText(/90% used/)).toBeTruthy();
    expect(screen.getByText(/near the limit/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('debt-item-0'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/debts/[id]', params: { id: 'card1' } });
  });

  it('says so when there is no income to compare with', async () => {
    await renderWithRepo(<DebtsScreen />, { settings, debts: [loan()] });
    expect(await screen.findByText(/no debt-to-income percentage/)).toBeTruthy();
  });

  it('keeps paid-off debts in a collapsed section', async () => {
    await renderWithRepo(<DebtsScreen />, { settings, debts: [loan(), plan({ archived: true })] });
    expect(await screen.findByText('Paid off (1)')).toBeTruthy();
    expect(screen.queryByText('Phone plan')).toBeNull();
    await fireEvent.press(screen.getByTestId('debts-paid-off-toggle'));
    expect(screen.getByText('Phone plan')).toBeTruthy();
    expect(screen.getByTestId('debts-total').props.children).toBe('AED 20,000.00');
  });
});
