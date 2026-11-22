import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import DebtScreen from '@/app/debts/[id]';
import { defaultSettings } from '@/data/defaults';
import { today } from '@/lib/dates';

import { params, resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../../test-support/render';
import { card, loan, plan } from '../testing/fixtures';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/engine', () => ({ ...jest.requireActual('@/engine'), ...require('../testing/fake-engine') }));

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
});

const settings = { ...defaultSettings(), onboarded: true };
type Btn = { text: string; onPress?: () => void };

describe('New loan', () => {
  it('shows validation errors and saves nothing', async () => {
    params.current = { id: 'new', type: 'loan' };
    const { repo } = await renderWithRepo(<DebtScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('debt-save-bottom'));
    expect(await screen.findByText(/Enter a name/)).toBeTruthy();
    expect(screen.getByText('Enter the remaining balance, greater than zero.')).toBeTruthy();
    expect(screen.getByText('Enter the monthly payment, greater than zero.')).toBeTruthy();
    expect(await repo.listDebts()).toEqual([]);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('rejects a payment above the balance and a day outside 1-31', async () => {
    params.current = { id: 'new', type: 'loan' };
    await renderWithRepo(<DebtScreen />, { settings });
    await fireEvent.changeText(await screen.findByTestId('debt-name'), 'Car loan');
    await fireEvent.changeText(screen.getByTestId('debt-balance'), '1000');
    await fireEvent.changeText(screen.getByTestId('debt-monthly'), '2000');
    await fireEvent.changeText(screen.getByTestId('debt-day'), '32');
    await fireEvent.press(screen.getByTestId('debt-save-bottom'));
    expect(await screen.findByText(/can’t be more than the remaining balance/)).toBeTruthy();
    expect(screen.getByText('Enter a day from 1 to 31.')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('saves a loan', async () => {
    params.current = { id: 'new', type: 'loan' };
    const { repo } = await renderWithRepo(<DebtScreen />, { settings });
    await fireEvent.changeText(await screen.findByTestId('debt-name'), 'Car loan');
    await fireEvent.changeText(screen.getByTestId('debt-balance'), '20,000');
    await fireEvent.changeText(screen.getByTestId('debt-monthly'), '1,500.50');
    await fireEvent.changeText(screen.getByTestId('debt-day'), '28');
    await fireEvent.changeText(screen.getByTestId('debt-rate'), '4.99');
    await fireEvent.press(screen.getByTestId('debt-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const saved = await repo.listDebts();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ type: 'loan', name: 'Car loan', balance: 2_000_000, monthlyPayment: 150_050, paymentDay: 28, annualRatePct: 4.99, endDate: null, archived: false, balanceDate: today() });
  });
});

describe('New card', () => {
  it('requires a fixed amount for the fixed plan and shows the minimum rule', async () => {
    params.current = { id: 'new', type: 'card' };
    const { repo } = await renderWithRepo(<DebtScreen />, { settings });
    await fireEvent.changeText(await screen.findByTestId('debt-name'), 'Visa');
    await fireEvent.changeText(screen.getByTestId('debt-limit'), '10000');
    await fireEvent.changeText(screen.getByTestId('debt-balance'), '6200');
    expect(screen.getByText(/max\(balance × %, floor\)/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('debt-plan-fixed'));
    await fireEvent.press(screen.getByTestId('debt-save-bottom'));
    expect(await screen.findByText('Enter the amount you plan to pay each month.')).toBeTruthy();
    expect(await repo.listDebts()).toEqual([]);
    await fireEvent.changeText(screen.getByTestId('debt-fixed'), '1000');
    await fireEvent.press(screen.getByTestId('debt-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await repo.listDebts())[0]).toMatchObject({ type: 'card', plan: 'fixed', fixedAmount: 100_000, limit: 1_000_000, balance: 620_000, minPct: 5, dueDay: 25 });
  });

  it('shows the minimum-only interest estimate as a fact', async () => {
    params.current = { id: 'new', type: 'card' };
    await renderWithRepo(<DebtScreen />, { settings });
    await fireEvent.changeText(await screen.findByTestId('debt-balance'), '6200');
    await fireEvent.changeText(screen.getByTestId('debt-monthly-rate'), '3.25');
    await fireEvent.press(screen.getByTestId('debt-plan-minimum'));
    expect(screen.getByTestId('debt-interest-estimate').props.children).toContain('about AED 201.50');
  });

  it('rejects a minimum percentage above 100', async () => {
    params.current = { id: 'new', type: 'card' };
    await renderWithRepo(<DebtScreen />, { settings });
    await fireEvent.changeText(await screen.findByTestId('debt-name'), 'Visa');
    await fireEvent.changeText(screen.getByTestId('debt-limit'), '0');
    await fireEvent.changeText(screen.getByTestId('debt-balance'), '0');
    await fireEvent.changeText(screen.getByTestId('debt-min-pct'), '150');
    await fireEvent.press(screen.getByTestId('debt-save-bottom'));
    expect(await screen.findByText('Enter a percentage from 0 to 100.')).toBeTruthy();
  });
});

describe('New instalment plan', () => {
  it('rejects a monthly amount above the total and zero payments', async () => {
    params.current = { id: 'new', type: 'plan' };
    await renderWithRepo(<DebtScreen />, { settings });
    await fireEvent.changeText(await screen.findByTestId('debt-name'), 'Phone');
    await fireEvent.changeText(screen.getByTestId('debt-total'), '1000');
    await fireEvent.changeText(screen.getByTestId('debt-monthly'), '2000');
    await fireEvent.changeText(screen.getByTestId('debt-payments'), '0');
    await fireEvent.press(screen.getByTestId('debt-save-bottom'));
    expect(await screen.findByText(/can’t be more than the total/)).toBeTruthy();
    expect(screen.getByText('Enter a number of payments from 1 to 600.')).toBeTruthy();
  });

  it('saves a plan linked to a card', async () => {
    params.current = { id: 'new', type: 'plan' };
    const { repo } = await renderWithRepo(<DebtScreen />, { settings, debts: [card()] });
    await fireEvent.changeText(await screen.findByTestId('debt-name'), 'Phone');
    await fireEvent.changeText(screen.getByTestId('debt-total'), '4800');
    await fireEvent.changeText(screen.getByTestId('debt-monthly'), '400');
    await fireEvent.changeText(screen.getByTestId('debt-payments'), '12');
    await fireEvent.press(screen.getByTestId('debt-card'));
    await fireEvent.press(screen.getByTestId('debt-card-option-card1'));
    await fireEvent.press(screen.getByTestId('debt-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const saved = (await repo.listDebts()).find((d) => d.type === 'plan');
    expect(saved).toMatchObject({ total: 480_000, monthlyAmount: 40_000, payments: 12, cardId: 'card1' });
  });
});

describe('Existing debt', () => {
  it('lists the next payments and saves a skip, a changed amount and a reset as overrides', async () => {
    params.current = { id: 'loan1' };
    const { repo } = await renderWithRepo(<DebtScreen />, { settings, debts: [loan()] });
    expect(await screen.findByTestId('debt-payment-0')).toBeTruthy();
    expect(screen.getByTestId('debt-payment-5')).toBeTruthy();
    expect(screen.queryByTestId('debt-payment-6')).toBeNull();

    await fireEvent.press(screen.getByTestId('debt-payment-0-skip'));
    await waitFor(async () => expect(await repo.listDebtOverrides('loan1')).toHaveLength(1));
    expect((await repo.listDebtOverrides('loan1'))[0]).toMatchObject({ skip: true, newDate: null, newAmount: null });
    await fireEvent.press(await screen.findByTestId('debt-payment-0-undo'));
    await waitFor(async () => expect(await repo.listDebtOverrides('loan1')).toHaveLength(0));

    await fireEvent.press(screen.getByTestId('debt-payment-1-amount'));
    await fireEvent.changeText(screen.getByTestId('debt-override-amount'), '1000');
    await fireEvent.press(screen.getByTestId('debt-override-save'));
    await waitFor(async () => expect(await repo.listDebtOverrides('loan1')).toHaveLength(1));
    expect((await repo.listDebtOverrides('loan1'))[0]).toMatchObject({ newAmount: 100_000, skip: false });
    await fireEvent.press(await screen.findByTestId('debt-payment-1-reset'));
    await waitFor(async () => expect(await repo.listDebtOverrides('loan1')).toHaveLength(0));
  });

  it('logs a partial payment and deletes it', async () => {
    params.current = { id: 'loan1' };
    const { repo } = await renderWithRepo(<DebtScreen />, { settings, debts: [loan()] });
    expect(await screen.findByTestId('debt-log-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('debt-log-payment'));
    await fireEvent.press(screen.getByTestId('debt-payment-save'));
    expect(await screen.findByText('Enter an amount greater than zero.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('debt-payment-kind-partial'));
    await fireEvent.changeText(screen.getByTestId('debt-payment-amount'), '500');
    await fireEvent.press(screen.getByTestId('debt-payment-save'));
    await waitFor(async () => expect(await repo.listDebtPayments('loan1')).toHaveLength(1));
    expect((await repo.listDebtPayments('loan1'))[0]).toMatchObject({ amount: 50_000, kind: 'partial', date: today() });
    expect(await screen.findByTestId('debt-log-item-0')).toBeTruthy();

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await fireEvent.press(screen.getByTestId('debt-log-delete-0'));
    await (alert.mock.calls[0][2] as Btn[]).find((b) => b.text === 'Delete')!.onPress!();
    await waitFor(async () => expect(await repo.listDebtPayments('loan1')).toHaveLength(0));
  });

  it('marks a debt as paid off and leaves', async () => {
    params.current = { id: 'plan1' };
    const { repo } = await renderWithRepo(<DebtScreen />, { settings, debts: [plan()] });
    await fireEvent.press(await screen.findByTestId('debt-archive'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await repo.listDebts())[0].archived).toBe(true);
  });

  it('edits and saves changes', async () => {
    params.current = { id: 'loan1' };
    const { repo } = await renderWithRepo(<DebtScreen />, { settings, debts: [loan()] });
    await fireEvent.changeText(await screen.findByTestId('debt-name'), 'Renamed');
    await fireEvent.press(screen.getByTestId('debt-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await repo.listDebts())[0]).toMatchObject({ id: 'loan1', name: 'Renamed', balance: 2_000_000, createdAt: '2026-01-01' });
  });

  it('asks before deleting, then deletes the debt', async () => {
    params.current = { id: 'loan1' };
    const { repo } = await renderWithRepo(<DebtScreen />, { settings, debts: [loan()] });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await fireEvent.press(await screen.findByTestId('debt-delete'));
    expect(await repo.listDebts()).toHaveLength(1);
    await (alert.mock.calls[0][2] as Btn[]).find((b) => b.text === 'Delete')!.onPress!();
    await waitFor(async () => expect(await repo.listDebts()).toHaveLength(0));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('shows "Debt not found" for an unknown id', async () => {
    params.current = { id: 'nope' };
    await renderWithRepo(<DebtScreen />, { settings });
    expect(await screen.findByText('Debt not found')).toBeTruthy();
  });
});
