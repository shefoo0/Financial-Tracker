import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { defaultSettings } from '@/data/defaults';
import { today } from '@/lib/dates';
import type { Settings } from '@/types';
import { AlertsSheet, AppearanceSheet, BalanceSheet, EditButton, MoneySheet, PaydaySheet, RemindersSheet, SpendingSheet } from '..';

import { resetRouterMock } from '../../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

const mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => mockPermission),
  requestPermissionsAsync: jest.fn(async () => mockPermission),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications = require('expo-notifications') as { getPermissionsAsync: jest.Mock; requestPermissionsAsync: jest.Mock };

const base: Settings = { ...defaultSettings(), onboarded: true, startingBalance: 650000, buffer: 200000, payday: 25 };
const noop = () => undefined;
const type = async (id: string, text: string) => {
  await fireEvent.changeText(await screen.findByTestId(id), text);
  await fireEvent(screen.getByTestId(id), 'blur');
};

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  Notifications.getPermissionsAsync.mockResolvedValue(mockPermission);
});

describe('BalanceSheet', () => {
  it('shows the saved values and saves the balance on blur, with a snapshot and a Saved tick', async () => {
    const { repo } = await renderWithRepo(<BalanceSheet visible onClose={noop} />, { settings: base });
    expect((await screen.findByTestId('settings-balance')).props.value).toBe('6500.00');
    expect(screen.getByTestId('settings-buffer').props.value).toBe('2000.00');
    await type('settings-balance', '7,000');
    await waitFor(async () => expect((await repo.getSettings()).startingBalance).toBe(700000));
    expect((await repo.getSettings()).startingBalanceDate).toBe(today());
    expect(await screen.findByText('✓ Saved')).toBeTruthy();
    const snaps = await repo.listBalanceSnapshots();
    expect(snaps.find((s) => s.date === today())?.balance).toBe(700000);
  });

  it('does not save an invalid amount and says why', async () => {
    const { repo } = await renderWithRepo(<BalanceSheet visible onClose={noop} />, { settings: base });
    await type('settings-balance', '12.345');
    expect(await screen.findByText('Enter an amount like 1,500.00.')).toBeTruthy();
    await type('settings-buffer', '');
    expect(await screen.findByText('Enter an amount (0 for none).')).toBeTruthy();
    expect((await repo.getSettings()).startingBalance).toBe(650000);
    expect((await repo.getSettings()).buffer).toBe(200000);
  });

  it('records a negative balance when overdrawn is switched on', async () => {
    const { repo } = await renderWithRepo(<BalanceSheet visible onClose={noop} />, { settings: base });
    await fireEvent(await screen.findByTestId('settings-overdrawn'), 'valueChange', true);
    await waitFor(async () => expect((await repo.getSettings()).startingBalance).toBe(-650000));
  });

  it('saves the buffer, the chart range (default 2M) and the card style at once', async () => {
    const { repo } = await renderWithRepo(<BalanceSheet visible onClose={noop} />, { settings: base });
    expect((await screen.findByTestId('settings-chart-range-2M')).props.accessibilityState.checked).toBe(true);
    await type('settings-buffer', '1500');
    await waitFor(async () => expect((await repo.getSettings()).buffer).toBe(150000));
    await fireEvent.press(screen.getByTestId('settings-chart-range-1Y'));
    await waitFor(async () => expect((await repo.getSettings()).chartRange).toBe('1Y'));
    await fireEvent.press(screen.getByTestId('chart-style-sunset'));
    await waitFor(async () => expect((await repo.getSettings()).chartStyle).toBe('sunset'));
  });

  it('saves a typed amount when the sheet closes without a blur', async () => {
    const Harness = () => {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Pressable testID="close-sheet" onPress={() => setOpen(false)} />
          <BalanceSheet visible={open} onClose={noop} />
        </>
      );
    };
    const { repo } = await renderWithRepo(<Harness />, { settings: base });
    await fireEvent.changeText(await screen.findByTestId('settings-buffer'), '900');
    await fireEvent.press(screen.getByTestId('close-sheet'));
    expect(screen.queryByTestId('settings-buffer')).toBeNull();
    await waitFor(async () => expect((await repo.getSettings()).buffer).toBe(90000));
  });

  it('shows an alert when the write fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { repo } = await renderWithRepo(<BalanceSheet visible onClose={noop} />, { settings: base });
    jest.spyOn(repo, 'updateSettings').mockRejectedValue(new Error('disk full'));
    await type('settings-buffer', '10');
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not save', 'disk full'));
  });
});

describe('PaydaySheet', () => {
  it('saves the payday when a day is picked', async () => {
    const { repo } = await renderWithRepo(<PaydaySheet visible onClose={noop} />, { settings: base });
    await fireEvent.press(await screen.findByTestId('settings-payday'));
    await fireEvent.press(screen.getByTestId('settings-payday-option-28'));
    await waitFor(async () => expect((await repo.getSettings()).payday).toBe(28));
  });

  it('can clear the payday and set the last day of the month', async () => {
    const { repo } = await renderWithRepo(<PaydaySheet visible onClose={noop} />, { settings: base });
    await fireEvent.press(await screen.findByTestId('settings-payday'));
    await fireEvent.press(screen.getByTestId('settings-payday-option-last'));
    await waitFor(async () => expect((await repo.getSettings()).payday).toBe(31));
    await fireEvent.press(screen.getByTestId('settings-payday'));
    await fireEvent.press(screen.getByTestId('settings-payday-option-none'));
    await waitFor(async () => expect((await repo.getSettings()).payday).toBeNull());
  });
});

describe('RemindersSheet', () => {
  it('turns reminders off and on and changes the lead time', async () => {
    const { repo } = await renderWithRepo(<RemindersSheet visible onClose={noop} />, { settings: base });
    await fireEvent.press(await screen.findByTestId('settings-bill-lead-3'));
    await waitFor(async () => expect((await repo.getSettings()).billReminders.leadDays).toBe(3));
    await fireEvent(screen.getByTestId('settings-bill-reminders'), 'valueChange', false);
    await waitFor(async () => expect((await repo.getSettings()).billReminders.on).toBe(false));
    expect(screen.queryByTestId('settings-bill-lead-3')).toBeNull();
  });
});

describe('AlertsSheet', () => {
  const off = { ...base, notificationsOn: false };
  const undetermined = { granted: false, canAskAgain: true, status: 'undetermined' };

  it('shows the explainer inside the same sheet before asking permission, then turns on', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue(undetermined);
    Notifications.requestPermissionsAsync.mockResolvedValue(mockPermission);
    const { repo } = await renderWithRepo(<AlertsSheet visible onClose={noop} />, { settings: off });
    await fireEvent(await screen.findByTestId('settings-notifications'), 'valueChange', true);
    expect(await screen.findByTestId('alerts-explainer')).toBeTruthy();
    expect(screen.queryByTestId('settings-notifications')).toBeNull();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('alerts-allow'));
    await waitFor(async () => expect((await repo.getSettings()).notificationsOn).toBe(true));
    expect(await screen.findByTestId('settings-notifications')).toBeTruthy();
  });

  it('"Only show alerts in the app" turns it on without the system prompt', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue(undetermined);
    const { repo } = await renderWithRepo(<AlertsSheet visible onClose={noop} />, { settings: off });
    await fireEvent(await screen.findByTestId('settings-notifications'), 'valueChange', true);
    await fireEvent.press(await screen.findByTestId('alerts-inapp-only'));
    await waitFor(async () => expect((await repo.getSettings()).notificationsOn).toBe(true));
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('turns off at once and has no bill reminders unless asked', async () => {
    const { repo } = await renderWithRepo(<AlertsSheet visible onClose={noop} />, { settings: base });
    expect(await screen.findByTestId('settings-threshold-high')).toBeTruthy();
    expect(screen.queryByTestId('settings-bill-reminders')).toBeNull();
    await fireEvent(screen.getByTestId('settings-notifications'), 'valueChange', false);
    await waitFor(async () => expect((await repo.getSettings()).notificationsOn).toBe(false));
  });

  it('validates the alert levels before saving them', async () => {
    const { repo } = await renderWithRepo(<AlertsSheet visible onClose={noop} />, { settings: base });
    await type('settings-threshold-card', '150');
    expect(await screen.findByText('Enter a whole number from 1 to 100.')).toBeTruthy();
    expect((await repo.getSettings()).alertThresholds.cardUsagePct).toBe(80);
    await type('settings-threshold-card', '70');
    await waitFor(async () => expect((await repo.getSettings()).alertThresholds.cardUsagePct).toBe(70));
  });
});

describe('SpendingSheet', () => {
  it('defaults to This month and saves This year', async () => {
    const { repo } = await renderWithRepo(<SpendingSheet visible onClose={noop} />, { settings: base });
    expect((await screen.findByTestId('settings-spending-period-month')).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByTestId('settings-spending-period-year'));
    await waitFor(async () => expect((await repo.getSettings()).spendingPeriod).toBe('year'));
  });
});

describe('AppearanceSheet', () => {
  it('shows a live preview of the balance card in the chosen style', async () => {
    const { repo } = await renderWithRepo(<AppearanceSheet visible onClose={noop} />, { settings: base });
    expect((await screen.findByTestId('appearance-preview')).props.accessibilityLabel).toBe('Preview of the balance card: AED 6,500.00');
    await fireEvent.press(screen.getByTestId('chart-style-graphite'));
    await waitFor(async () => expect((await repo.getSettings()).chartStyle).toBe('graphite'));
    await fireEvent.press(screen.getByTestId('settings-appearance-light'));
    await waitFor(() => expect(screen.getByTestId('settings-appearance-light').props.accessibilityState.checked).toBe(true));
  });
});

describe('MoneySheet', () => {
  it('has currency, payday, balance and buffer, each saved on its own', async () => {
    const { repo } = await renderWithRepo(<MoneySheet visible onClose={noop} />, { settings: base });
    await type('settings-currency', 'EUR');
    await waitFor(async () => expect((await repo.getSettings()).currency).toBe('EUR'));
    await type('settings-balance', '100');
    await waitFor(async () => expect((await repo.getSettings()).startingBalance).toBe(10000));
    await type('settings-buffer', '50');
    await waitFor(async () => expect((await repo.getSettings()).buffer).toBe(5000));
    expect(screen.getByTestId('settings-payday')).toBeTruthy();
  });

  it('rejects an empty or too long currency label', async () => {
    const { repo } = await renderWithRepo(<MoneySheet visible onClose={noop} />, { settings: base });
    await type('settings-currency', '');
    expect(await screen.findByText('Enter a currency label, for example AED.')).toBeTruthy();
    await type('settings-currency', 'TOOLONGLABEL');
    expect(await screen.findByText('Use 6 characters or fewer.')).toBeTruthy();
    expect((await repo.getSettings()).currency).toBe('AED');
  });
});

describe('EditButton', () => {
  it('is labelled "Edit <label>" and calls onPress', async () => {
    const onPress = jest.fn();
    await renderWithRepo(<EditButton onPress={onPress} label="balance card" testID="edit-balance" />);
    const b = await screen.findByTestId('edit-balance');
    expect(b.props.accessibilityLabel).toBe('Edit balance card');
    await fireEvent.press(b);
    expect(onPress).toHaveBeenCalled();
  });
});
