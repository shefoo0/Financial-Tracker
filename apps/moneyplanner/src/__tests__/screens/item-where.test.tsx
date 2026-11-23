// "Paid from / Received into" on item forms (milestone 3b).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import RecurringScreen from '@/app/recurring/[id]';
import TransactionScreen from '@/app/transaction/[id]';
import { defaultSettings } from '@/data/defaults';
import { card } from '@/engine/test-fixtures';
import { defaultWhere, placeOf, whereOf, whereOptions } from '@/features/accounts/where';
import { validateTransaction, formFromTransaction } from '@/features/items/form';
import type { Account } from '@/types';

import { params, resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { renderWithRepo, transaction } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
let mockPro = true;
jest.mock('@/lib/pro', () => ({ usePro: () => ({ isPro: mockPro, loading: false }), isProPreviewBuild: () => mockPro }));

const settings = { ...defaultSettings(), onboarded: true };
const sav: Account = { id: 'sav', name: 'ADCB savings', type: 'bank', startingBalance: 0, startingBalanceDate: '2026-01-01', archived: false, sort: 1, createdAt: '2026-01-01' };
const visa = card({ id: 'visa', name: 'Visa' });

beforeEach(() => {
  resetRouterMock();
  mockPro = true;
});

describe('where helpers', () => {
  it('round-trips an item\'s account or card', () => {
    expect(whereOf({})).toBe('main');
    expect(whereOf({ accountId: 'main' })).toBe('main');
    expect(whereOf({ accountId: 'sav' })).toBe('acc:sav');
    expect(whereOf({ cardId: 'visa', accountId: 'sav' })).toBe('card:visa');
    expect(placeOf('acc:sav')).toEqual({ accountId: 'sav' });
    expect(placeOf('card:visa')).toEqual({ cardId: 'visa' });
    expect(placeOf('main')).toEqual({});
  });
  it('free: main account and cards (an item already elsewhere keeps its place); Pro: every open account', () => {
    const base = { mainName: 'Main account', accounts: [sav, { ...sav, id: 'old', name: 'Old', archived: true }], debts: [visa] };
    expect(whereOptions({ ...base, isPro: false, current: 'main' }).map((o) => o.value)).toEqual(['main', 'card:visa']);
    expect(whereOptions({ ...base, isPro: false, current: 'acc:sav' }).map((o) => o.value)).toEqual(['main', 'acc:sav', 'card:visa']);
    expect(whereOptions({ ...base, isPro: true, current: 'main' }).map((o) => o.value)).toEqual(['main', 'acc:sav', 'card:visa']);
    expect(whereOptions({ ...base, isPro: true, current: 'acc:old' }).map((o) => o.label)).toContain('Old (closed)');
  });
  it('new items start in the default account only for Pro', () => {
    expect(defaultWhere({ defaultAccountId: 'sav' }, [sav], true)).toBe('acc:sav');
    expect(defaultWhere({ defaultAccountId: 'sav' }, [sav], false)).toBe('main');
    expect(defaultWhere({ defaultAccountId: 'gone' }, [sav], true)).toBe('main');
  });
  it('editing one side of a transfer keeps it a transfer', () => {
    const t = transaction({ id: 'x', description: 'To savings', kind: 'cost', amount: 100, date: '2026-01-02', transferId: 'T1', accountId: 'sav' });
    const r = validateTransaction(formFromTransaction(t), t);
    expect(r.item).toMatchObject({ transferId: 'T1', accountId: 'sav' });
  });
});

describe('One-time item form: Paid from', () => {
  it('Pro: a new spend starts in the default account and can be charged to a card', async () => {
    params.current = { id: 'new' };
    const { repo } = await renderWithRepo(<TransactionScreen />, { settings: { ...settings, defaultAccountId: 'sav' }, accounts: [sav], debts: [visa] });
    expect((await screen.findByTestId('transaction-where')).props.accessibilityLabel ?? '').toBeDefined();
    await fireEvent.changeText(screen.getByTestId('transaction-description'), 'Dinner');
    await fireEvent.changeText(screen.getByTestId('transaction-amount'), '120');
    await fireEvent.press(screen.getByTestId('transaction-where'));
    await fireEvent.press(await screen.findByTestId('transaction-where-option-card:visa'));
    expect(screen.getByText('Charged to the card: the bank pays it on the card’s due date.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('transaction-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await repo.listTransactions())[0]).toMatchObject({ description: 'Dinner', cardId: 'visa' });
  });

  it('Pro: a new item with no choice made goes into the default account', async () => {
    params.current = { id: 'new' };
    const { repo } = await renderWithRepo(<TransactionScreen />, { settings: { ...settings, defaultAccountId: 'sav' }, accounts: [sav] });
    await fireEvent.changeText(await screen.findByTestId('transaction-description'), 'Coffee');
    await fireEvent.changeText(screen.getByTestId('transaction-amount'), '15');
    await fireEvent.press(screen.getByTestId('transaction-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await repo.listTransactions())[0]).toMatchObject({ accountId: 'sav' });
  });

  it('free: offers the main account and cards, not other accounts; with neither, the field is hidden', async () => {
    mockPro = false;
    params.current = { id: 'new' };
    await renderWithRepo(<TransactionScreen />, { settings, accounts: [sav], debts: [visa] });
    await fireEvent.press(await screen.findByTestId('transaction-where'));
    expect(screen.queryByTestId('transaction-where-option-acc:sav')).toBeNull();
    expect(screen.getByTestId('transaction-where-option-card:visa')).toBeTruthy();
  });

  it('is hidden when there is only the main account', async () => {
    params.current = { id: 'new' };
    await renderWithRepo(<TransactionScreen />, { settings });
    expect(await screen.findByTestId('transaction-description')).toBeTruthy();
    expect(screen.queryByTestId('transaction-where')).toBeNull();
  });
});

describe('Recurring item form: Paid from', () => {
  it('Pro: a recurring cost charged to a card (Netflix on the Visa)', async () => {
    params.current = { id: 'new', kind: 'cost' };
    const { repo } = await renderWithRepo(<RecurringScreen />, { settings, debts: [visa] });
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Netflix');
    await fireEvent.changeText(screen.getByLabelText('Amount (AED)'), '55');
    await fireEvent.press(screen.getByTestId('recurring-where'));
    await fireEvent.press(await screen.findByTestId('recurring-where-option-card:visa'));
    await fireEvent.press(screen.getByTestId('recurring-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await repo.listRecurring())[0]).toMatchObject({ name: 'Netflix', cardId: 'visa' });
  });
});
