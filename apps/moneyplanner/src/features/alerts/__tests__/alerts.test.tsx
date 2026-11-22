import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Linking, Pressable } from 'react-native';

import SettingsScreen from '@/app/(tabs)/settings';
import { useRepoMutation } from '@/data/DataProvider';
import { defaultSettings } from '@/data/defaults';
import { buildAlerts } from '@/engine';
import { addDays, today } from '@/lib/dates';
import type { AppAlert } from '@/types';

import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../../test-support/render';
import { AlertScheduler } from '../AlertScheduler';
import { AlertsCard } from '../AlertsCard';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
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
jest.mock('@/engine', () => ({ ...jest.requireActual('@/engine'), buildAlerts: jest.fn() }));

const N = Notifications as jest.Mocked<typeof Notifications>;
const build = buildAlerts as jest.MockedFunction<typeof buildAlerts>;
const granted = { granted: true, canAskAgain: true, status: 'granted' } as never;
const denied = { granted: false, canAskAgain: false, status: 'denied' } as never;
const undetermined = { granted: false, canAskAgain: true, status: 'undetermined' } as never;

const alert = (id: string, notifyOn: string | null, severity: AppAlert['severity'] = 'caution', kind: AppAlert['kind'] = 'debt-ratio-caution'): AppAlert => ({
  id,
  kind,
  severity,
  title: `Title ${id}`,
  message: `Message ${id} AED 1,200`,
  date: notifyOn,
  notifyOn,
  refId: null,
});

const base = { ...defaultSettings(), onboarded: true };
const soon = () => addDays(today(), 3);

beforeEach(() => {
  jest.clearAllMocks();
  resetRouterMock();
  N.getPermissionsAsync.mockResolvedValue(granted);
  N.requestPermissionsAsync.mockResolvedValue(granted);
  build.mockReturnValue([alert('a', soon()), alert('b', null), alert('c', addDays(today(), 5), 'high', 'shortfall-zero')]);
});

describe('AlertScheduler', () => {
  it('schedules one 09:00 notification per alert with a notifyOn date', async () => {
    await renderWithRepo(<AlertScheduler />, { settings: base });
    await waitFor(() => expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2), { timeout: 4000 });
    const first = N.scheduleNotificationAsync.mock.calls[0][0] as { content: { title: string; body: string }; trigger: { type: string; date: Date; channelId: string } };
    expect(first.content.title).toBe('Title a');
    expect(first.content.body).toContain('AED 1,200');
    expect(first.trigger.type).toBe('date');
    expect(first.trigger.date.getHours()).toBe(9);
    expect(N.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });

  it('uses generic text when the profile is locked', async () => {
    await renderWithRepo(<AlertScheduler />, { settings: { ...base, lockEnabled: true } });
    await waitFor(() => expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2), { timeout: 4000 });
    for (const [req] of N.scheduleNotificationAsync.mock.calls) {
      const content = (req as { content: { title: string; body: string } }).content;
      expect(content.body).toBe('A payment needs attention in Money Planner');
      expect(JSON.stringify(content)).not.toMatch(/AED|Title/);
    }
  });

  it('cancels everything on unmount (profile switch)', async () => {
    const view = await renderWithRepo(<AlertScheduler />, { settings: base });
    await waitFor(() => expect(N.scheduleNotificationAsync).toHaveBeenCalled(), { timeout: 4000 });
    N.cancelAllScheduledNotificationsAsync.mockClear();
    view.unmount();
    await waitFor(() => expect(N.cancelAllScheduledNotificationsAsync).toHaveBeenCalled());
  });

  it('schedules nothing when the module is off', async () => {
    await renderWithRepo(<AlertScheduler />, { settings: { ...base, enabledModules: { ...base.enabledModules, alerts: false } } });
    await waitFor(() => expect(N.cancelAllScheduledNotificationsAsync).toHaveBeenCalled(), { timeout: 4000 });
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules nothing when permission is denied', async () => {
    N.getPermissionsAsync.mockResolvedValue(denied);
    await renderWithRepo(<AlertScheduler />, { settings: base });
    await waitFor(() => expect(N.cancelAllScheduledNotificationsAsync).toHaveBeenCalled(), { timeout: 4000 });
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('reschedules after a data change', async () => {
    function Harness() {
      const save = useRepoMutation((r, buffer: number) => r.updateSettings({ buffer }));
      return (
        <>
          <AlertScheduler />
          <Pressable testID="change" onPress={() => save(5000)} />
        </>
      );
    }
    await renderWithRepo(<Harness />, { settings: base });
    await waitFor(() => expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2), { timeout: 4000 });
    build.mockReturnValue([alert('z', soon())]);
    await fireEvent.press(screen.getByTestId('change'));
    await waitFor(() => expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(3), { timeout: 4000 });
    expect((N.scheduleNotificationAsync.mock.calls[2][0] as { content: { title: string } }).content.title).toBe('Title z');
  });
});

describe('AlertsCard', () => {
  it('lists alerts most serious first and opens the related screen', async () => {
    await renderWithRepo(<AlertsCard />, { settings: base });
    expect(await screen.findByTestId('alerts-card')).toBeTruthy();
    expect(screen.getByTestId('alert-0')).toHaveTextContent(/Title c/);
    expect(screen.getByTestId('alert-1')).toHaveTextContent(/Title a/);
    await fireEvent.press(screen.getByTestId('alert-0'));
    expect(router.push).toHaveBeenCalledWith('/month');
    await fireEvent.press(screen.getByTestId('alert-1'));
    expect(router.push).toHaveBeenCalledWith('/debts');
  });

  it('renders nothing without alerts', async () => {
    build.mockReturnValue([]);
    await renderWithRepo(<AlertsCard />, { settings: base });
    await waitFor(() => expect(build).toHaveBeenCalled());
    expect(screen.queryByTestId('alerts-card')).toBeNull();
  });

  it('renders nothing when the module is off', async () => {
    await renderWithRepo(<AlertsCard />, { settings: { ...base, enabledModules: { ...base.enabledModules, alerts: false } } });
    await waitFor(() => expect(screen.queryByTestId('alerts-card')).toBeNull());
  });
});

describe('Settings -> Alerts', () => {
  const off = { ...base, enabledModules: { ...base.enabledModules, alerts: false } };

  it('explains first, then asks for permission, then turns alerts on', async () => {
    N.getPermissionsAsync.mockResolvedValue(undetermined);
    const { repo } = await renderWithRepo(<SettingsScreen />, { settings: off });
    await fireEvent(await screen.findByTestId('settings-module-alerts'), 'valueChange', true);
    expect(await screen.findByTestId('alerts-explainer')).toBeTruthy();
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect((await repo.getSettings()).enabledModules.alerts).toBe(false);
    await fireEvent.press(screen.getByTestId('alerts-allow'));
    await waitFor(async () => expect((await repo.getSettings()).enabledModules.alerts).toBe(true));
    expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('explains how to enable notifications when permission is denied', async () => {
    N.getPermissionsAsync.mockResolvedValue(undetermined);
    N.requestPermissionsAsync.mockResolvedValue(denied);
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderWithRepo(<SettingsScreen />, { settings: off });
    await fireEvent(await screen.findByTestId('settings-module-alerts'), 'valueChange', true);
    await fireEvent.press(await screen.findByTestId('alerts-allow'));
    expect(await screen.findByTestId('alerts-denied-text')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('alerts-open-settings'));
    expect(open).toHaveBeenCalled();
  });

  it('turns on without the explainer when permission is already granted, and shows the status', async () => {
    const { repo } = await renderWithRepo(<SettingsScreen />, { settings: off });
    await fireEvent(await screen.findByTestId('settings-module-alerts'), 'valueChange', true);
    await waitFor(async () => expect((await repo.getSettings()).enabledModules.alerts).toBe(true));
    expect(screen.queryByTestId('alerts-explainer')).toBeNull();
    expect(await screen.findByText('Notifications: on')).toBeTruthy();
  });

  it('shows Notifications: off when denied', async () => {
    N.getPermissionsAsync.mockResolvedValue(denied);
    await renderWithRepo(<SettingsScreen />, { settings: base });
    expect(await screen.findByText('Notifications: off')).toBeTruthy();
  });

  it('validates and saves the thresholds', async () => {
    const { repo } = await renderWithRepo(<SettingsScreen />, { settings: base });
    await fireEvent.changeText(await screen.findByTestId('settings-threshold-caution'), '60');
    await fireEvent.press(screen.getByTestId('settings-thresholds-save'));
    expect(await screen.findByText('The caution level must be lower than the high level.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('settings-threshold-caution'), '35');
    await fireEvent.changeText(screen.getByTestId('settings-threshold-card'), '90');
    await fireEvent.press(screen.getByTestId('settings-thresholds-save'));
    await waitFor(async () => expect((await repo.getSettings()).alertThresholds).toEqual({ debtCautionPct: 35, debtHighPct: 50, cardUsagePct: 90 }));
  });
});
