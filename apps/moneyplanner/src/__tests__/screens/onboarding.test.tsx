import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Onboarding from '@/app/onboarding';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { today } from '@/lib/dates';

import { resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
});


// Go on until Start shows.
async function toLastStep() {
  for (let i = 0; i < 10 && !screen.queryByTestId('onboarding-start'); i++) await fireEvent.press(screen.getByTestId('onboarding-next'));
  expect(screen.getByTestId('onboarding-start')).toBeTruthy();
}

describe('Onboarding wizard', () => {
  it('starts on the salary step (with the welcome text) and no Back button', async () => {
    await renderWithRepo(<Onboarding />);
    expect(await screen.findByText('Welcome')).toBeTruthy();
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-back')).toBeNull();
    expect(screen.queryByTestId('onboarding-profile-name')).toBeNull();
  });

  it('asks for a payday when a salary is entered without one', async () => {
    await renderWithRepo(<Onboarding />);
    await fireEvent.changeText(await screen.findByTestId('onboarding-salary'), '18000');
    await fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(await screen.findByText('Choose the day you get paid, or clear the amount.')).toBeTruthy();
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
  });

  it('creates the Salary item, saves settings and marks onboarded', async () => {
    const { repo } = await renderWithRepo(<Onboarding />);
    await fireEvent.changeText(await screen.findByTestId('onboarding-salary'), '18000');
    await fireEvent.press(screen.getByTestId('onboarding-next'));
    await fireEvent.press(screen.getByTestId('onboarding-payday'));
    await fireEvent.press(screen.getByTestId('onboarding-payday-option-25'));
    await fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(screen.getByText('Step 3 of 3')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-buffer')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('onboarding-balance'), '6500');
    await toLastStep();
    const summary = within(screen.getByTestId('onboarding-summary'));
    expect(summary.getByText('Salary: AED 18,000.00 every month, on day 25')).toBeTruthy();
    expect(summary.getByText('Balance today: AED 6,500.00')).toBeTruthy();
    expect(summary.getByText(/^Buffer: AED 1,000\.00/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-start'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));

    const items = await repo.listRecurring();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Salary', kind: 'income', amount: 1800000, categoryId: 'salary', schedule: { type: 'monthly', day: 25 } });
    const s = await repo.getSettings();
    expect(s).toMatchObject({ onboarded: true, payday: 25, startingBalance: 650000, buffer: 100000, startingBalanceDate: today() });
  });

  it('can be skipped through: no salary item, zero balance, still onboarded', async () => {
    const { repo } = await renderWithRepo(<Onboarding />);
    await fireEvent.press(await screen.findByTestId('onboarding-skip'));
    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(screen.queryByTestId('onboarding-start')).toBeTruthy();
    expect(screen.getByText('Salary: not added yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-start'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(await repo.listRecurring()).toEqual([]);
    expect(await repo.getSettings()).toMatchObject({ onboarded: true, startingBalance: 0, buffer: 100000 });
  });

  it('stores an overdrawn balance as negative', async () => {
    const { repo } = await renderWithRepo(<Onboarding />);
    await fireEvent.press(await screen.findByTestId('onboarding-skip'));
    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    await fireEvent.changeText(screen.getByTestId('onboarding-balance'), '300');
    await fireEvent(screen.getByTestId('onboarding-overdrawn'), 'valueChange', true);
    await toLastStep();
    await fireEvent.press(screen.getByTestId('onboarding-start'));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect((await repo.getSettings()).startingBalance).toBe(-30000);
  });

  it('alerts and stays put when saving fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { repo } = await renderWithRepo(<Onboarding />);
    jest.spyOn(repo, 'updateSettings').mockRejectedValue(new Error('disk full'));
    await toLastStep();
    await fireEvent.press(screen.getByTestId('onboarding-start'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not save your setup', 'disk full'));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows "Setting up <name>" only for a second profile, which starts at the wizard', async () => {
    let api: ReturnType<typeof useProfiles> | undefined;
    function Capture() {
      api = useProfiles();
      return null;
    }
    await renderWithRepo(
      <>
        <Capture />
        <Onboarding />
      </>,
    );
    expect(await screen.findByText('Welcome')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-profile-name')).toBeNull();
    await act(async () => {
      await api!.addProfile('Layla', 1);
    });
    expect(await screen.findByText('Setting up Layla')).toBeTruthy();
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    await act(async () => {
      await api!.switchProfile(api!.profiles[0].id);
    });
    await waitFor(() => expect(screen.queryByTestId('onboarding-profile-name')).toBeNull());
  });
});
