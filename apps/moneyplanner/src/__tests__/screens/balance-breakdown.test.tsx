import { fireEvent, screen } from '@testing-library/react-native';

import { defaultSettings } from '@/data/defaults';
import { card } from '@/engine/test-fixtures';
import { BalanceSheet } from '@/features/edit/sheets';

import { resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

const settings = { ...defaultSettings(), onboarded: true, startingBalance: 1000000, startingBalanceDate: '2026-01-01', mainAccountName: 'ENBD current' };
const sav = { id: 'sav', name: 'ADCB savings', type: 'bank' as const, startingBalance: 250000, startingBalanceDate: '2026-01-01', archived: false, sort: 1, createdAt: '2026-01-01' };

beforeEach(() => resetRouterMock());

describe('Home balance sheet: by account', () => {
  it('lists each account and what each card owes, and opens Accounts', async () => {
    const onClose = jest.fn();
    await renderWithRepo(<BalanceSheet visible onClose={onClose} />, { settings, accounts: [sav], debts: [card({ id: 'visa', name: 'Visa', balance: 30000, balanceDate: '2026-01-01' })] });
    expect((await screen.findByTestId('balance-account-main')).props.accessibilityLabel).toBe('ENBD current: AED 9,700.00'); // the card's AED 300 was paid from it on 20 Jan
    expect(screen.getByTestId('balance-account-sav').props.accessibilityLabel).toBe('ADCB savings: AED 2,500.00');
    expect(screen.getByTestId('balance-card-visa').props.accessibilityLabel).toMatch(/^Visa \(owed\): /);
    expect(screen.getByTestId('settings-balance').props.accessibilityLabel).toBe('ENBD current: balance today (AED)');
    await fireEvent.press(screen.getByTestId('balance-manage-accounts'));
    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/accounts');
  });

  it('shows nothing extra with only the main account and no cards', async () => {
    await renderWithRepo(<BalanceSheet visible onClose={() => {}} />, { settings: { ...settings, mainAccountName: 'Main account' } });
    expect((await screen.findByTestId('settings-balance')).props.accessibilityLabel).toBe('Balance today (AED)');
    expect(screen.queryByTestId('balance-by-account')).toBeNull();
  });
});
