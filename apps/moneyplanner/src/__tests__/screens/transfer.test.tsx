// Move money between own accounts, the quick-add option and Month's "Paid to cards" (milestone 3b).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import MonthScreen from '@/app/(tabs)/month';
import TransferScreen from '@/app/transfer';
import { defaultSettings } from '@/data/defaults';
import { card } from '@/engine/test-fixtures';
import { buildTransfer } from '@/features/accounts/transfer';
import { QuickAddButton } from '@/features/quickadd/QuickAddButton';
import { today } from '@/lib/dates';
import type { Account } from '@/types';

import { resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
let mockPro = true;
jest.mock('@/lib/pro', () => ({ usePro: () => ({ isPro: mockPro, loading: false }), isProPreviewBuild: () => mockPro }));

const settings = { ...defaultSettings(), onboarded: true };
const sav: Account = { id: 'sav', name: 'ADCB savings', type: 'bank', startingBalance: 0, startingBalanceDate: '2026-01-01', archived: false, sort: 1, createdAt: '2026-01-01' };

beforeEach(() => {
  resetRouterMock();
  mockPro = true;
});

describe('buildTransfer', () => {
  const ids = { out: 'o', in: 'i', transfer: 'T' };
  it('makes a cost in one account and income in the other with one transferId', () => {
    const r = buildTransfer({ from: 'main', to: 'sav', amount: 50000, date: '2026-11-10', note: ' rent pot ' }, { from: 'Main account', to: 'ADCB savings' }, ids);
    expect(r.items).toEqual([
      expect.objectContaining({ id: 'o', kind: 'cost', amount: 50000, transferId: 'T', description: 'To ADCB savings', note: 'rent pot' }),
      expect.objectContaining({ id: 'i', kind: 'income', amount: 50000, transferId: 'T', accountId: 'sav', description: 'From Main account' }),
    ]);
    expect(r.items?.[0].accountId).toBeUndefined();
  });
  it('needs two different accounts and an amount', () => {
    expect(buildTransfer({ from: 'sav', to: 'sav', amount: null, date: '2026-11-10', note: '' }, { from: '', to: '' }, ids).errors).toEqual({
      to: 'Choose a different account to move the money to.',
      amount: 'Enter an amount greater than zero.',
    });
  });
});

describe('Move money screen', () => {
  it('Pro with two accounts: saves both sides as one transfer', async () => {
    const { repo } = await renderWithRepo(<TransferScreen />, { settings, accounts: [sav] });
    await fireEvent.changeText(await screen.findByLabelText('Amount (AED)'), '500');
    await fireEvent.press(screen.getByTestId('transfer-save'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const list = await repo.listTransactions();
    expect(list.map((t) => [t.kind, t.accountId ?? 'main', t.amount, t.date])).toEqual(
      expect.arrayContaining([
        ['cost', 'main', 50000, today()],
        ['income', 'sav', 50000, today()],
      ]),
    );
    expect(new Set(list.map((t) => t.transferId)).size).toBe(1);
  });

  it('free, or a single account: explains what is needed instead', async () => {
    mockPro = false;
    await renderWithRepo(<TransferScreen />, { settings, accounts: [sav] });
    expect(await screen.findByText('Moving money needs two accounts')).toBeTruthy();
    expect(screen.queryByTestId('transfer-save')).toBeNull();
  });
});

describe('Quick add: Move money', () => {
  it('shows for Pro with a second account, not otherwise', async () => {
    await renderWithRepo(<QuickAddButton />, { settings, accounts: [sav] });
    await fireEvent.press(screen.getByTestId('quick-add'));
    expect(await screen.findByTestId('quick-add-transfer')).toBeTruthy();
  });
  it('is hidden without a second account', async () => {
    await renderWithRepo(<QuickAddButton />, { settings });
    await fireEvent.press(screen.getByTestId('quick-add'));
    expect(await screen.findByTestId('quick-add-sheet')).toBeTruthy();
    expect(screen.queryByTestId('quick-add-transfer')).toBeNull();
  });
});

describe('Month: Paid to cards', () => {
  it('shows the payment to a card whose purchases are recorded, separately from spending', async () => {
    const m = today().slice(0, 7);
    const visa = card({ id: 'visa', name: 'Visa', balance: 0, balanceDate: `${m}-01`, statementDay: 1, dueDay: 28, plan: 'full' });
    const prev = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 2, 15).toISOString().slice(0, 10);
    await renderWithRepo(<MonthScreen />, {
      settings: { ...settings, startingBalanceDate: `${m}-01` },
      debts: [{ ...visa, balanceDate: prev.slice(0, 8) + '01' }],
      transactions: [{ id: 'p', kind: 'cost', date: prev, description: 'Dinner', categoryId: null, amount: 12000, note: '', source: 'manual', importId: null, planned: false, cardId: 'visa' }],
    });
    expect(await screen.findByTestId('month-paid-to-cards')).toBeTruthy();
  });
});
