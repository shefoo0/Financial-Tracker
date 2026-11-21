import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import SettingsScreen from '@/app/(tabs)/settings';
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


const settings = { ...defaultSettings(), onboarded: true, startingBalance: 650000, buffer: 200000, payday: 25 };

const confirm = (alert: jest.SpyInstance, call: number, text: string) =>
  (alert.mock.calls[call][2] as { text: string; onPress?: () => void }[]).find((b) => b.text === text)!.onPress!();

describe('Settings', () => {
  it('shows saved values', async () => {
    await renderWithRepo(<SettingsScreen />, { settings });
    expect(await screen.findByText(/^AED 6,500.00 as of /)).toBeTruthy();
    expect(screen.getByTestId('settings-buffer-current').props.children).toBe('Now AED 2,000.00');
    expect(screen.getByTestId('settings-version')).toBeTruthy();
    expect(screen.getByTestId('settings-currency').props.value).toBe('AED');
  });

  it('validates and saves the currency label', async () => {
    const { repo } = await renderWithRepo(<SettingsScreen />, { settings });
    await fireEvent.changeText(await screen.findByTestId('settings-currency'), '');
    await fireEvent.press(screen.getByTestId('settings-currency-save'));
    expect(await screen.findByText('Enter a currency label, for example AED.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('settings-currency'), 'USD');
    await fireEvent.press(screen.getByTestId('settings-currency-save'));
    await waitFor(async () => expect((await repo.getSettings()).currency).toBe('USD'));
  });

  it('updates the balance as of today and the buffer', async () => {
    const { repo } = await renderWithRepo(<SettingsScreen />, { settings });
    await fireEvent.changeText(await screen.findByTestId('settings-balance'), '7000');
    await fireEvent.press(screen.getByTestId('settings-balance-save'));
    await waitFor(async () => expect((await repo.getSettings()).startingBalance).toBe(700000));
    await fireEvent.changeText(screen.getByTestId('settings-buffer'), '1500');
    await fireEvent.press(screen.getByTestId('settings-buffer-save'));
    await waitFor(async () => expect((await repo.getSettings()).buffer).toBe(150000));
  });

  it('opens the categories screen', async () => {
    await renderWithRepo(<SettingsScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('settings-categories'));
    expect(router.push).toHaveBeenCalledWith('/categories');
  });

  it('delete all data needs two confirmations, then wipes and returns to the wizard', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { repo } = await renderWithRepo(<SettingsScreen />, {
      settings,
      recurring: [recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000 })],
    });
    await fireEvent.press(await screen.findByTestId('settings-delete-all'));
    expect(await repo.listRecurring()).toHaveLength(1);
    await confirm(alert, 0, 'Continue');
    expect(await repo.listRecurring()).toHaveLength(1);
    await confirm(alert, 1, 'Delete everything');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding'));
    expect(await repo.listRecurring()).toEqual([]);
    expect((await repo.getSettings()).onboarded).toBe(false);
  });

  it('cancelling the first prompt deletes nothing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { repo } = await renderWithRepo(<SettingsScreen />, {
      settings,
      recurring: [recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000 })],
    });
    await fireEvent.press(await screen.findByTestId('settings-delete-all'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(await repo.listRecurring()).toHaveLength(1);
  });
});
