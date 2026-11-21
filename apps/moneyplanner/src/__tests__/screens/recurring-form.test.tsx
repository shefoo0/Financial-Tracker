import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';

import PlanScreen from '@/app/(tabs)/plan';
import RecurringScreen from '@/app/recurring/[id]';
import { defaultSettings } from '@/data/defaults';

import { params, resetRouterMock, router } from '../../../test-support/expo-router-mock';
import { recurring, renderWithRepo } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
});


const settings = { ...defaultSettings(), onboarded: true };

describe('Recurring form', () => {
  it('shows validation errors and saves nothing when the form is empty', async () => {
    params.current = { id: 'new', kind: 'cost' };
    const { repo } = await renderWithRepo(<RecurringScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('recurring-save-bottom'));
    expect(await screen.findByText('Enter a name, for example "Salary" or "Rent".')).toBeTruthy();
    expect(screen.getByText('Enter an amount greater than zero.')).toBeTruthy();
    expect(await repo.listRecurring()).toEqual([]);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('rejects a day outside 1-31', async () => {
    params.current = { id: 'new', kind: 'cost' };
    await renderWithRepo(<RecurringScreen />, { settings });
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Rent');
    await fireEvent.changeText(screen.getByLabelText('Amount (AED)'), '9500');
    await fireEvent.changeText(screen.getByTestId('recurring-day'), '32');
    await fireEvent.press(screen.getByTestId('recurring-save-bottom'));
    expect(await screen.findByText('Enter a day from 1 to 31.')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('saves a new cost and it appears on the Plan screen', async () => {
    params.current = { id: 'new', kind: 'cost' };
    const { repo } = await renderWithRepo(
      <>
        <RecurringScreen />
        <PlanScreen />
      </>,
      { settings },
    );
    expect(await screen.findByText('Plan your regular money')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Rent');
    await fireEvent.changeText(screen.getByLabelText('Amount (AED)'), '9,500');
    await fireEvent.changeText(screen.getByTestId('recurring-day'), '1');
    await fireEvent.press(screen.getByTestId('recurring-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const saved = await repo.listRecurring();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Rent', kind: 'cost', amount: 950000, schedule: { type: 'monthly', day: 1, everyMonths: 1 } });
    const row = await screen.findByTestId(`plan-item-${saved[0].id}`);
    expect(within(row).getByText('Rent')).toBeTruthy();
    expect(screen.getByTestId('plan-total-cost').props.children).toBe('Total ≈ AED 9,500.00 / month');
  });

  it('starts as income when opened with kind=income', async () => {
    params.current = { id: 'new', kind: 'income' };
    await renderWithRepo(<RecurringScreen />, { settings });
    expect(await screen.findByText('Add income')).toBeTruthy();
  });

  it('edits an existing item', async () => {
    params.current = { id: 'r' };
    const { repo } = await renderWithRepo(<RecurringScreen />, {
      settings,
      recurring: [recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000 })],
    });
    expect((await screen.findByLabelText('Name')).props.value).toBe('Rent');
    expect(screen.getByLabelText('Amount (AED)').props.value).toBe('9500.00');
    await fireEvent.changeText(screen.getByLabelText('Amount (AED)'), '9800');
    await fireEvent.press(screen.getByTestId('recurring-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await repo.listRecurring())[0].amount).toBe(980000);
  });

  it('shows upcoming payments for an existing item', async () => {
    params.current = { id: 'r' };
    await renderWithRepo(<RecurringScreen />, {
      settings,
      recurring: [recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000 })],
    });
    expect(await screen.findByTestId('occurrence-0')).toBeTruthy();
  });

  it('deletes only after confirmation', async () => {
    params.current = { id: 'r' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { repo } = await renderWithRepo(<RecurringScreen />, {
      settings,
      recurring: [recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000 })],
    });
    await fireEvent.press(await screen.findByTestId('recurring-delete'));
    expect(await repo.listRecurring()).toHaveLength(1);
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await buttons.find((b) => b.text === 'Delete')!.onPress!();
    await waitFor(async () => expect(await repo.listRecurring()).toHaveLength(0));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('shows "Item not found" for an unknown id', async () => {
    params.current = { id: 'nope' };
    await renderWithRepo(<RecurringScreen />, { settings });
    expect(await screen.findByText('Item not found')).toBeTruthy();
  });
});
