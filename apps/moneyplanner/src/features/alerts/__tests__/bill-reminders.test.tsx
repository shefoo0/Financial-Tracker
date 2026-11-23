import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import DashboardScreen from '@/app/(tabs)/index';
import { RemindersSheet } from '@/features/edit';
import { defaultSettings } from '@/data/defaults';
import { addDays, today } from '@/lib/dates';

import { resetRouterMock } from '../../../../test-support/expo-router-mock';
import { recurring, renderWithRepo } from '../../../../test-support/render';
import { AlertScheduler } from '../AlertScheduler';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-local-authentication', () => ({ hasHardwareAsync: jest.fn(async () => false), isEnrolledAsync: jest.fn(async () => false), authenticateAsync: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

const N = Notifications as jest.Mocked<typeof Notifications>;
const base = { ...defaultSettings(), onboarded: true, startingBalance: 5000000 };
const dayOfMonth = (offset: number) => Number(addDays(today(), offset).slice(8, 10));
// A monthly cost due about 10 days from now (stays inside the month length in any case: day wraps via addDays).
const rent = () => recurring({ id: 'rent', name: 'Rent', kind: 'cost', amount: 650000, schedule: { type: 'monthly', day: dayOfMonth(10), everyMonths: 1 } });

beforeEach(() => {
  jest.clearAllMocks();
  resetRouterMock();
});

describe('Settings -> Bill reminders', () => {
  it('is on with 1 day by default, and saves a new lead time', async () => {
    const { repo } = await renderWithRepo(<RemindersSheet visible onClose={() => undefined} />, { settings: base });
    expect((await screen.findByTestId('settings-bill-reminders')).props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('settings-bill-lead-1').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByTestId('settings-bill-lead-0'));
    await waitFor(async () => expect((await repo.getSettings()).billReminders).toEqual({ on: true, leadDays: 0, muted: [] }));
  });

  it('turning it off hides the lead time choices', async () => {
    const { repo } = await renderWithRepo(<RemindersSheet visible onClose={() => undefined} />, { settings: base });
    await fireEvent.press(await screen.findByTestId('settings-bill-reminders'));
    await waitFor(async () => expect((await repo.getSettings()).billReminders.on).toBe(false));
    await waitFor(() => expect(screen.queryByTestId('settings-bill-lead-1')).toBeNull());
  });
});

describe('Coming up bell', () => {
  it('mutes and unmutes one item', async () => {
    const { repo } = await renderWithRepo(<DashboardScreen />, { settings: base, recurring: [rent()] });
    const bell = await screen.findByTestId('upcoming-bell-0');
    expect(bell.props.accessibilityLabel).toBe('Reminder for Rent');
    expect(bell.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(bell);
    await waitFor(async () => expect((await repo.getSettings()).billReminders.muted).toEqual(['rent']));
    await waitFor(() => expect(screen.getByTestId('upcoming-bell-0').props.accessibilityState.checked).toBe(false));
    await fireEvent.press(screen.getByTestId('upcoming-bell-0'));
    await waitFor(async () => expect((await repo.getSettings()).billReminders.muted).toEqual([]));
  });

  it('has no bell when bill reminders are off', async () => {
    await renderWithRepo(<DashboardScreen />, { settings: { ...base, billReminders: { on: false, leadDays: 1, muted: [] } }, recurring: [rent()] });
    await screen.findByTestId('dashboard-upcoming-0');
    expect(screen.queryByTestId('upcoming-bell-0')).toBeNull();
  });
});

describe('AlertScheduler with bills', () => {
  const bodies = () => N.scheduleNotificationAsync.mock.calls.map(([r]) => (r as unknown as { content: { body: string } }).content.body);

  it('schedules a reminder for an upcoming bill with the item name and amount', async () => {
    await renderWithRepo(<AlertScheduler />, { settings: base, recurring: [rent()] });
    await waitFor(() => expect(bodies().some((b) => /^Rent AED 6,500(\.00)? due in \d+ days$/.test(b))).toBe(true), { timeout: 4000 });
  });

  it('schedules nothing for a muted bill', async () => {
    await renderWithRepo(<AlertScheduler />, {
      settings: { ...base, billReminders: { on: true, leadDays: 1, muted: ['rent'] } },
      recurring: [rent()],
    });
    await waitFor(() => expect(N.cancelAllScheduledNotificationsAsync).toHaveBeenCalled(), { timeout: 4000 });
    expect(bodies().some((b) => b.startsWith('Rent'))).toBe(false);
  });

  it('uses generic text when the profile is locked', async () => {
    await renderWithRepo(<AlertScheduler />, { settings: { ...base, lockEnabled: true }, recurring: [rent()] });
    await waitFor(() => expect(bodies()).toContain('A bill is due soon in Money Planner'), { timeout: 4000 });
    expect(bodies().join(' ')).not.toMatch(/Rent|AED/);
  });
});
