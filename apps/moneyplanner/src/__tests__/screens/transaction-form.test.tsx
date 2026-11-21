import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import TransactionScreen from '@/app/transaction/[id]';
import { defaultSettings } from '@/data/defaults';
import { today } from '@/lib/dates';

import { params, resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { renderWithRepo, transaction } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
});


const settings = { ...defaultSettings(), onboarded: true };

describe('One-time item form', () => {
  it('shows validation errors when empty', async () => {
    params.current = { id: 'new' };
    const { repo } = await renderWithRepo(<TransactionScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('transaction-save-bottom'));
    expect(await screen.findByText('Enter a description, for example "Groceries".')).toBeTruthy();
    expect(screen.getByText('Enter an amount greater than zero.')).toBeTruthy();
    expect(await repo.listTransactions()).toEqual([]);
  });

  it('saves a new spend using the date from the link', async () => {
    params.current = { id: 'new', date: today() };
    const { repo } = await renderWithRepo(<TransactionScreen />, { settings });
    await fireEvent.changeText(await screen.findByTestId('transaction-description'), 'Taxi');
    await fireEvent.changeText(screen.getByTestId('transaction-amount'), '45.5');
    await fireEvent.press(screen.getByTestId('transaction-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const list = await repo.listTransactions();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ description: 'Taxi', kind: 'cost', amount: 4550, date: today(), planned: false, source: 'manual' });
  });

  it('marks a future date as planned by default', async () => {
    params.current = { id: 'new', date: '2100-01-01' };
    await renderWithRepo(<TransactionScreen />, { settings });
    expect((await screen.findByTestId('transaction-planned')).props.value).toBe(true);
  });

  it('switches to income', async () => {
    params.current = { id: 'new' };
    const { repo } = await renderWithRepo(<TransactionScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('transaction-kind-income'));
    await fireEvent.changeText(screen.getByTestId('transaction-description'), 'Bonus');
    await fireEvent.changeText(screen.getByTestId('transaction-amount'), '1000');
    await fireEvent.press(screen.getByTestId('transaction-save-bottom'));
    await waitFor(async () => expect(await repo.listTransactions()).toHaveLength(1));
    expect((await repo.listTransactions())[0].kind).toBe('income');
  });

  it('edits and deletes an existing item', async () => {
    params.current = { id: 't' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { repo } = await renderWithRepo(<TransactionScreen />, {
      settings,
      transactions: [transaction({ id: 't', description: 'Taxi', kind: 'cost', amount: 5000, date: today() })],
    });
    expect((await screen.findByTestId('transaction-description')).props.value).toBe('Taxi');
    await fireEvent.changeText(screen.getByTestId('transaction-amount'), '60');
    await fireEvent.press(screen.getByTestId('transaction-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await repo.listTransactions())[0].amount).toBe(6000);

    await fireEvent.press(screen.getByTestId('transaction-delete'));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await buttons.find((b) => b.text === 'Delete')!.onPress!();
    await waitFor(async () => expect(await repo.listTransactions()).toHaveLength(0));
  });

  it('shows "Item not found" for an unknown id', async () => {
    params.current = { id: 'nope' };
    await renderWithRepo(<TransactionScreen />, { settings });
    expect(await screen.findByText('Item not found')).toBeTruthy();
  });
});
