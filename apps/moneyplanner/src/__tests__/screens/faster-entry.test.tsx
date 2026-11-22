import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import RecurringScreen from '@/app/recurring/[id]';
import TransactionScreen from '@/app/transaction/[id]';
import { defaultSettings } from '@/data/defaults';
import { addDays, today } from '@/lib/dates';

import { params, resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { renderWithRepo, transaction } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

beforeEach(resetRouterMock);

const settings = { ...defaultSettings(), onboarded: true };
const categories = [
  { id: 'c-food', name: 'Food', kind: 'cost' as const, sort: 1, archived: false },
  { id: 'c-fun', name: 'Fun', kind: 'cost' as const, sort: 2, archived: false },
];
const seed = () => ({
  settings,
  categories,
  transactions: [
    transaction({ id: '1', description: 'Taxi', kind: 'cost', amount: 4500, date: addDays(today(), -3), categoryId: 'c-fun' }),
    transaction({ id: '2', description: 'Taxi', kind: 'cost', amount: 5000, date: addDays(today(), -10), categoryId: 'c-fun' }),
    transaction({ id: '3', description: 'Lunch', kind: 'cost', amount: 3000, date: addDays(today(), -1), categoryId: 'c-food' }),
  ],
});

describe('Faster entry: one-time form', () => {
  it('opens with the amount focused and offers recent chips', async () => {
    params.current = { id: 'new' };
    await renderWithRepo(<TransactionScreen />, seed());
    expect((await screen.findByTestId('transaction-amount')).props.autoFocus).toBe(true);
    expect(await screen.findByTestId('recent-chip-0')).toBeTruthy();
    expect(screen.getByTestId('recent-chip-1')).toBeTruthy();
    expect(screen.queryByTestId('recent-chip-2')).toBeNull();
  });

  it('a chip fills description, category and amount; typing replaces the amount', async () => {
    params.current = { id: 'new' };
    const { repo } = await renderWithRepo(<TransactionScreen />, seed());
    await fireEvent.press(await screen.findByTestId('recent-chip-0')); // Taxi (2 uses)
    expect(screen.getByTestId('transaction-description').props.value).toBe('Taxi');
    expect(screen.getByTestId('transaction-amount').props.value).toBe('45.00');
    expect(screen.getByTestId('transaction-amount').props.selectTextOnFocus).toBe(true);
    await fireEvent.changeText(screen.getByTestId('transaction-amount'), '60');
    await fireEvent.press(screen.getByTestId('transaction-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const added = (await repo.listTransactions()).find((t) => t.id !== '1' && t.id !== '2' && t.id !== '3');
    expect(added).toMatchObject({ description: 'Taxi', amount: 6000, categoryId: 'c-fun' });
  });

  it('preselects the last used category, and a chip keeps its own', async () => {
    params.current = { id: 'new' };
    await renderWithRepo(<TransactionScreen />, seed());
    // Most recent item is Lunch (Food).
    expect(await screen.findByText('Food')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('recent-chip-0')); // Taxi -> Fun
    expect(await screen.findByText('Fun')).toBeTruthy();
    expect(screen.queryByText('Food')).toBeNull();
  });

  it('has no chips or autofocus when editing', async () => {
    params.current = { id: '1' };
    await renderWithRepo(<TransactionScreen />, seed());
    expect((await screen.findByTestId('transaction-amount')).props.autoFocus).toBeFalsy();
    expect(screen.queryByTestId('recent-chip-0')).toBeNull();
  });

  it('Repeat this opens a recurring item prefilled from the item', async () => {
    params.current = { id: '1' };
    await renderWithRepo(<TransactionScreen />, seed());
    await fireEvent.press(await screen.findByTestId('transaction-repeat'));
    const href = router.push.mock.calls[0][0] as string;
    const q = new URLSearchParams(href.split('?')[1]);
    expect(href.startsWith('/recurring/new?')).toBe(true);
    expect(Object.fromEntries(q)).toMatchObject({ kind: 'cost', name: 'Taxi', amount: '4500', category: 'c-fun', day: String(Number(addDays(today(), -3).slice(8))) });
  });
});

describe('Faster entry: recurring form', () => {
  it('prefills from the Repeat this link', async () => {
    params.current = { id: 'new', kind: 'cost', name: 'Taxi', amount: '4500', category: 'c-fun', day: '17' };
    await renderWithRepo(<RecurringScreen />, seed());
    expect((await screen.findByTestId('recurring-name')).props.value).toBe('Taxi');
    expect(screen.getByTestId('recurring-amount').props.value).toBe('45.00');
    expect(screen.getByText('Fun')).toBeTruthy();
    expect(screen.getByTestId('recurring-day').props.value).toBe('17');
  });

  it('chips offer past one-time descriptions and fill the form', async () => {
    params.current = { id: 'new', kind: 'cost' };
    await renderWithRepo(<RecurringScreen />, seed());
    await fireEvent.press(await screen.findByTestId('recent-chip-0'));
    expect(screen.getByTestId('recurring-name').props.value).toBe('Taxi');
    expect(screen.getByTestId('recurring-amount').props.value).toBe('45.00');
  });
});
