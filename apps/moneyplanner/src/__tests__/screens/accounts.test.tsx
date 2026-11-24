import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Accounts from '@/app/accounts';
import { defaultSettings } from '@/data/defaults';
import { card } from '@/engine/test-fixtures';
import { buildAccount, validateAccountName } from '@/features/accounts/helpers';
import type { Account } from '@/types';

import { resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
let mockPro = true;
jest.mock('@/lib/pro', () => ({ usePro: () => ({ isPro: mockPro, loading: false }), isProPreviewBuild: () => mockPro }));

const settings = { ...defaultSettings(), onboarded: true, startingBalance: 1000000, startingBalanceDate: '2026-01-01' };
const sav: Account = { id: 'sav', name: 'ADCB savings', type: 'bank', startingBalance: 250000, startingBalanceDate: '2026-01-01', archived: false, sort: 1, createdAt: '2026-01-01' };

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
  mockPro = true;
});

describe('account helpers', () => {
  it('validates names: required, at most 40 characters, unique (ignoring case) with the main account and open accounts', () => {
    expect(validateAccountName('  ', 'Main account', [])).toMatch(/Enter a name/);
    expect(validateAccountName('x'.repeat(41), 'Main account', [])).toMatch(/40 characters/);
    expect(validateAccountName('main ACCOUNT', 'Main account', [])).toMatch(/already/);
    expect(validateAccountName('adcb savings', 'Main account', [sav])).toMatch(/already/);
    expect(validateAccountName('ADCB savings', 'Main account', [sav], 'sav')).toBeNull();
    expect(validateAccountName('ADCB savings', 'Main account', [{ ...sav, archived: true }])).toBeNull();
    expect(validateAccountName('Main account', 'Main account', [], 'main')).toBeNull();
  });
  it('builds a new account after the others', () => {
    const a = buildAccount({ name: ' Cash ', type: 'cash', balance: 5000, date: '2026-11-01', existing: [sav], today: '2026-11-23' });
    expect(a).toMatchObject({ name: 'Cash', type: 'cash', startingBalance: 5000, startingBalanceDate: '2026-11-01', sort: 2, archived: false });
  });
});

describe('Accounts screen', () => {
  it('lists the main account, other accounts with their balances, and the cards (read-only, opening Debts)', async () => {
    await renderWithRepo(<Accounts />, { settings, accounts: [sav], debts: [card({ id: 'visa', name: 'Visa', balance: 30000, balanceDate: '2026-01-01' })] });
    expect(await screen.findByTestId('account-main')).toBeTruthy();
    expect(screen.getByTestId('account-sav').props.accessibilityLabel).toMatch(/ADCB savings, Bank account, AED 2,500\.00/);
    await fireEvent.press(screen.getByTestId('account-card-visa'));
    expect(router.push).toHaveBeenCalledWith('/debts/visa');
  });

  it('Pro: adds an account with its balance and date', async () => {
    const { repo } = await renderWithRepo(<Accounts />, { settings });
    await fireEvent.press(await screen.findByTestId('accounts-add'));
    await fireEvent.press(screen.getByTestId('account-kind'));
    await fireEvent.press(await screen.findByTestId('account-kind-option-cash'));
    await fireEvent.changeText(screen.getByTestId('account-name'), 'Cash');
    await fireEvent.press(screen.getByTestId('account-save'));
    await waitFor(async () => expect((await repo.listAccounts()).map((a) => [a.name, a.type])).toEqual([['Cash', 'cash']]));
  });

  it('an overdrawn bank account saves a negative balance; a card shows what it owes as a minus and "Add a credit card" opens the card form', async () => {
    const { repo } = await renderWithRepo(<Accounts />, { settings, debts: [card({ id: 'visa', name: 'Visa', balance: 30000, balanceDate: '2026-01-01' })] });
    expect((await screen.findByTestId('account-card-visa')).props.accessibilityLabel).toMatch(/off your balance, -?AED/);
    await fireEvent.press(screen.getByTestId('accounts-add-card'));
    expect(router.push).toHaveBeenCalledWith('/debts/new?type=card');
    await fireEvent.press(screen.getByTestId('accounts-add'));
    await fireEvent.changeText(screen.getByTestId('account-name'), 'Overdraft');
    await fireEvent.changeText(screen.getByTestId('account-balance'), '120');
    await fireEvent.press(screen.getByTestId('account-overdrawn'));
    await fireEvent.press(screen.getByTestId('account-save'));
    await waitFor(async () => expect((await repo.listAccounts()).map((a) => a.startingBalance)).toEqual([-12000]));
  });

  it('renames the main account (its balance stays the one set on Home)', async () => {
    const { repo } = await renderWithRepo(<Accounts />, { settings });
    await fireEvent.press(await screen.findByTestId('account-main'));
    expect(screen.queryByTestId('account-balance')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('account-name'), 'ENBD current');
    await fireEvent.press(screen.getByTestId('account-save'));
    await waitFor(async () => expect((await repo.getSettings()).mainAccountName).toBe('ENBD current'));
  });

  it('removing an account items use closes it; the default account falls back to the main one', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === 'Remove')?.onPress?.());
    const { repo } = await renderWithRepo(<Accounts />, {
      settings: { ...settings, defaultAccountId: 'sav' },
      accounts: [sav],
      transactions: [{ id: 't', kind: 'cost', date: '2026-02-01', description: 'x', categoryId: null, amount: 100, note: '', source: 'manual', importId: null, planned: false, accountId: 'sav' }],
    });
    await fireEvent.press(await screen.findByTestId('account-sav'));
    await fireEvent.press(screen.getByTestId('account-remove'));
    expect(alert).toHaveBeenCalled();
    await waitFor(async () => expect((await repo.listAccounts())[0].archived).toBe(true));
    expect((await repo.getSettings()).defaultAccountId).toBeNull();
  });

  it('Pro: sets the default account for new items', async () => {
    const { repo } = await renderWithRepo(<Accounts />, { settings, accounts: [sav] });
    await fireEvent.press(await screen.findByTestId('accounts-default'));
    await fireEvent.press(await screen.findByTestId('accounts-default-option-sav'));
    await waitFor(async () => expect((await repo.getSettings()).defaultAccountId).toBe('sav'));
  });

  it('adding: choosing a credit card or a loan continues to the Debts form', async () => {
    await renderWithRepo(<Accounts />, { settings });
    await fireEvent.press(await screen.findByTestId('accounts-add'));
    await fireEvent.press(screen.getByTestId('account-kind'));
    await fireEvent.press(await screen.findByTestId('account-kind-option-card'));
    expect(screen.queryByTestId('account-name')).toBeNull();
    expect(screen.getByTestId('account-debt-note')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('account-save'));
    expect(router.push).toHaveBeenCalledWith('/debts/new?type=card');
    await fireEvent.press(screen.getByTestId('accounts-add'));
    await fireEvent.press(screen.getByTestId('account-kind'));
    await fireEvent.press(await screen.findByTestId('account-kind-option-loan'));
    await fireEvent.press(screen.getByTestId('account-save'));
    expect(router.push).toHaveBeenCalledWith('/debts/new?type=loan');
  });

  it('free: one main account plus cards and debts; a bank or cash account, or a default, shows the Pro message', async () => {
    mockPro = false;
    const { repo } = await renderWithRepo(<Accounts />, { settings });
    await fireEvent.press(await screen.findByTestId('accounts-add'));
    // A free user starts on a credit card (free); a bank account is Pro.
    expect(screen.getByTestId('account-debt-note')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('account-kind'));
    await fireEvent.press(await screen.findByTestId('account-kind-option-bank'));
    await fireEvent.changeText(screen.getByTestId('account-name'), 'ADCB');
    await fireEvent.press(screen.getByTestId('account-save'));
    expect(router.push).toHaveBeenCalledWith('/pro');
    // The form closes so it does not cover the Pro screen.
    expect(screen.queryByTestId('account-save')).toBeNull();
    expect(screen.queryByTestId('accounts-default')).toBeNull();
    await fireEvent.press(screen.getByTestId('accounts-default-locked'));
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(await repo.listAccounts()).toEqual([]);
  });
});
