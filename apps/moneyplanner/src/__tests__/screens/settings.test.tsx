import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import SettingsScreen from '@/app/(tabs)/settings';
import { defaultSettings } from '@/data/defaults';

import { resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
});


const settings = { ...defaultSettings(), onboarded: true, startingBalance: 650000, buffer: 200000, payday: 25 };

describe('Settings', () => {
  it('shows saved values', async () => {
    await renderWithRepo(<SettingsScreen />, { settings });
    expect(await screen.findByText(/^AED 6,500.00 as of /)).toBeTruthy();
    expect(screen.getByTestId('settings-buffer-current').props.children).toBe('Now AED 2,000.00');
    expect(screen.getByTestId('settings-version')).toBeTruthy();
    expect(screen.getByTestId('settings-currency').props.value).toBe('AED');
  });

  it('shows the active profile and says data actions apply to it only', async () => {
    await renderWithRepo(<SettingsScreen />, { settings });
    expect(await screen.findByText('Profile & appearance')).toBeTruthy();
    expect(screen.getByTestId('profile-button')).toBeTruthy();
        expect(screen.getByTestId('settings-data-note')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-manage-profiles'));
    expect(router.push).toHaveBeenCalledWith('/profiles');
  });

  it('picks the chart card style with swatches (Plain by default) and saves it', async () => {
    await renderWithRepo(<SettingsScreen />, { settings });
    const plain = await screen.findByTestId('chart-style-plain');
    expect(plain.props.accessibilityLabel).toBe('Plain');
    expect(plain.props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('chart-style-ocean').props.accessibilityLabel).toBe('Ocean');
    await fireEvent.press(screen.getByTestId('chart-style-ocean'));
    await waitFor(() => expect(screen.getByTestId('chart-style-ocean').props.accessibilityState.selected).toBe(true));
    expect(screen.getByTestId('chart-style-plain').props.accessibilityState.selected).toBe(false);
  });

  it('changes the appearance', async () => {
    await renderWithRepo(<SettingsScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('settings-appearance-dark'));
    await waitFor(() => expect(screen.getByTestId('settings-appearance-dark').props.accessibilityState.checked).toBe(true));
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

  it('has no Delete all data, no module switches and a single CSV export', async () => {
    await renderWithRepo(<SettingsScreen />, { settings });
    await screen.findByText('Profile & appearance');
    expect(screen.queryByTestId('settings-delete-all')).toBeNull();
    expect(screen.queryByText(/Delete all data/)).toBeNull();
    expect(screen.queryByText('Modules')).toBeNull();
    expect(screen.queryByTestId('settings-module-debts')).toBeNull();
    expect(screen.queryByTestId('settings-module-cheques')).toBeNull();
    expect(screen.getByLabelText('Export to spreadsheet (CSV)')).toBeTruthy();
    expect(screen.queryByTestId('settings-export-debts-csv')).toBeNull();
    expect(screen.queryByTestId('settings-export-cheques-csv')).toBeNull();
    expect(screen.getByText(/To delete this profile and its data, use Manage profiles/)).toBeTruthy();
  });
});
