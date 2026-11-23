import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import SettingsScreen from '@/app/(tabs)/settings';
import { AboutScreen } from '@/features/settings/AboutScreen';
import { BackupsScreen } from '@/features/settings/BackupsScreen';
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

describe('Settings (short list)', () => {
  it('shows the eight rows with their current values', async () => {
    await renderWithRepo(<SettingsScreen />, { settings: { ...settings, lockEnabled: true, notificationsOn: false } });
    const label = async (id: string) => (await screen.findByTestId(id)).props.accessibilityLabel as string;
    expect(await label('settings-profile')).toBe('Profile, Me');
    expect(await label('settings-appearance-row')).toBe('Appearance, System · Plain');
    expect(await label('settings-lock-row')).toBe('Lock, On');
    expect(await label('settings-notifications-row')).toBe('Notifications, Off · Bills 1 day before');
    expect(await label('settings-money-row')).toBe('Money, AED · AED 6,500.00 · Day 25');
    expect(await label('settings-categories')).toMatch(/^Categories, \d+$/);
    expect(await label('settings-backups-row')).toBe('Backups & export, No copy yet');
    expect(await label('settings-about-row')).toMatch(/^About, Version /);
  });

  it('navigates from the rows that open a screen', async () => {
    await renderWithRepo(<SettingsScreen />, { settings });
    const go = async (id: string, path: string) => {
      await fireEvent.press(await screen.findByTestId(id));
      expect(router.push).toHaveBeenLastCalledWith(path);
    };
    await go('settings-profile', '/profiles');
    await go('settings-lock-row', '/lock-settings');
    await go('settings-categories', '/categories');
    await go('settings-backups-row', '/backups');
    await go('settings-about-row', '/about');
  });

  it('opens the Money sheet from its row, saves instantly and the row shows the new value', async () => {
    const { repo } = await renderWithRepo(<SettingsScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('settings-money-row'));
    expect(await screen.findByTestId('money-sheet')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('settings-currency'), 'USD');
    await fireEvent(screen.getByTestId('settings-currency'), 'blur');
    await waitFor(async () => expect((await repo.getSettings()).currency).toBe('USD'));
    await waitFor(() => expect(screen.getByTestId('settings-money-row').props.accessibilityLabel).toBe('Money, USD · USD 6,500.00 · Day 25'));
  });

  it('opens the Appearance sheet: mode and card style apply at once, with a preview', async () => {
    const { repo } = await renderWithRepo(<SettingsScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('settings-appearance-row'));
    expect(await screen.findByTestId('appearance-preview')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-appearance-dark'));
    await waitFor(() => expect(screen.getByTestId('settings-appearance-dark').props.accessibilityState.checked).toBe(true));
    await fireEvent.press(screen.getByTestId('chart-style-ocean'));
    await waitFor(async () => expect((await repo.getSettings()).chartStyle).toBe('ocean'));
    expect(screen.getByTestId('chart-style-ocean').props.accessibilityState.selected).toBe(true);
  });

  it('opens Notifications with the bill reminders and alert levels', async () => {
    await renderWithRepo(<SettingsScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('settings-notifications-row'));
    expect(await screen.findByTestId('settings-notifications')).toBeTruthy();
    expect(screen.getByTestId('settings-bill-reminders')).toBeTruthy();
    expect(screen.getByTestId('settings-threshold-card')).toBeTruthy();
  });

  it('fits on one screen: no Save buttons, no long sections', async () => {
    await renderWithRepo(<SettingsScreen />, { settings });
    const list = await screen.findByTestId('settings-list');
    expect(within(list).getAllByRole('button')).toHaveLength(8);
    expect(screen.queryByTestId('settings-balance-save')).toBeNull();
    expect(screen.queryByTestId('settings-delete-all')).toBeNull();
  });
});

describe('Backups & export screen', () => {
  it('has backup, automatic backups, restore and one CSV export, and says it applies to this profile', async () => {
    await renderWithRepo(<BackupsScreen />, { settings });
    expect(await screen.findByTestId('settings-backup')).toBeTruthy();
    expect(screen.getByTestId('settings-auto-backups')).toBeTruthy();
    expect(screen.getByTestId('settings-restore')).toBeTruthy();
    expect(screen.getByLabelText('Export to spreadsheet (CSV)')).toBeTruthy();
    expect(screen.queryByTestId('settings-export-debts-csv')).toBeNull();
    expect(screen.queryByText(/Delete all data/)).toBeNull();
    expect(screen.getByText(/To delete this profile and its data, use Manage profiles/)).toBeTruthy();
  });
});

describe('About screen', () => {
  it('shows the version, the not-advice note and where data lives', async () => {
    await renderWithRepo(<AboutScreen />, { settings });
    expect(await screen.findByTestId('settings-version')).toBeTruthy();
    expect(screen.getByText(/not financial advice/)).toBeTruthy();
    expect(screen.getByTestId('about-privacy-note')).toBeTruthy();
    expect(screen.getByTestId('about-support-note')).toBeTruthy();
  });
});
