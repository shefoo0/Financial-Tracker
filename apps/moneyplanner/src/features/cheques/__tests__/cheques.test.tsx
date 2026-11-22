import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import ChequeScreen from '@/app/cheques/[id]';
import ChequesScreen from '@/app/cheques/index';
import { defaultSettings } from '@/data/defaults';
import { addDays, today } from '@/lib/dates';
import type { Cheque } from '@/types';

import { params, resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../../test-support/render';
import { seriesDates, validateSeries } from '../logic';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
});

const settings = (over: object = {}) => ({ ...defaultSettings(), onboarded: true, startingBalance: 100_000, startingBalanceDate: today(), ...over });
const cheque = (p: Partial<Cheque> & Pick<Cheque, 'id'>): Cheque => ({
  payee: 'Landlord',
  amount: 300_000,
  date: addDays(today(), 10),
  purpose: 'Rent',
  status: 'upcoming',
  seriesId: null,
  note: '',
  ...p,
});

describe('Cheques list', () => {
  it('shows an empty state with both add buttons', async () => {
    await renderWithRepo(<ChequesScreen />, { settings: settings() });
    expect(await screen.findByText('No cheques yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cheques-add'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/cheques/[id]', params: { id: 'new' } });
    await fireEvent.press(screen.getByTestId('cheques-add-series'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/cheques/[id]', params: { id: 'new', series: '1' } });
  });

  it('groups cheques, orders upcoming by date and collapses cancelled', async () => {
    await renderWithRepo(<ChequesScreen />, {
      settings: settings(),
      cheques: [
        cheque({ id: 'b', payee: 'Later', date: addDays(today(), 20) }),
        cheque({ id: 'a', payee: 'Sooner', date: addDays(today(), 5) }),
        cheque({ id: 'c', payee: 'Done', status: 'cleared' }),
        cheque({ id: 'x', payee: 'Voided', status: 'cancelled' }),
      ],
    });
    expect(await screen.findByTestId('cheques-screen')).toBeTruthy();
    expect(await screen.findByText('Upcoming')).toBeTruthy();
    expect(screen.getAllByText('Cleared').length).toBeGreaterThan(0);
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByTestId('cheque-item-0')).toHaveTextContent(/Sooner/);
    expect(screen.getByTestId('cheque-item-1')).toHaveTextContent(/Later/);
    expect(screen.getByTestId('cheque-item-2')).toHaveTextContent(/Done/);
    expect(screen.getByTestId('cheque-item-0')).toHaveTextContent(/in 5 days/);
    expect(screen.queryByText('Voided')).toBeNull();
    await fireEvent.press(screen.getByTestId('cheques-cancelled-toggle'));
    expect(screen.getByTestId('cheque-item-3')).toHaveTextContent(/Voided/);
    await fireEvent.press(screen.getByTestId('cheque-open-0'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/cheques/[id]', params: { id: 'a' } });
  });

  it('marks an upcoming cheque cleared', async () => {
    const { repo } = await renderWithRepo(<ChequesScreen />, { settings: settings(), cheques: [cheque({ id: 'a' })] });
    await fireEvent.press(await screen.findByTestId('cheque-clear-0'));
    await waitFor(async () => expect((await repo.listCheques())[0].status).toBe('cleared'));
    await waitFor(() => expect(screen.queryByTestId('cheque-clear-0')).toBeNull());
  });

  it('says whether the projected balance covers a cheque', async () => {
    await renderWithRepo(<ChequesScreen />, {
      settings: settings(),
      cheques: [cheque({ id: 'a', payee: 'Big', amount: 300_000 }), cheque({ id: 'b', payee: 'Small', amount: 50_000, date: addDays(today(), 3) })],
    });
    const small = await screen.findByTestId('cheque-item-0');
    expect(small).toHaveTextContent(/Covered/);
    expect(small).toHaveTextContent(/Projected balance that day: AED 1,000\.00/);
    const big = screen.getByTestId('cheque-item-1');
    expect(big).toHaveTextContent(/Short/);
    // The small cheque (AED 500) is already out of the balance by then: 1,000 - 500 = 500; 3,000 - 500 = short by 2,500.
    expect(big).toHaveTextContent(/short by AED 2,500/);
  });
});

describe('Cheque form', () => {
  it('validates required fields', async () => {
    params.current = { id: 'new' };
    const { repo } = await renderWithRepo(<ChequeScreen />, { settings: settings() });
    await fireEvent.press(await screen.findByTestId('cheque-save-bottom'));
    expect(await screen.findByText('Enter who the cheque is for.')).toBeTruthy();
    expect(screen.getByText('Enter an amount greater than zero.')).toBeTruthy();
    expect(await repo.listCheques()).toEqual([]);
  });

  it('saves a new cheque', async () => {
    params.current = { id: 'new' };
    const { repo } = await renderWithRepo(<ChequeScreen />, { settings: settings() });
    await fireEvent.changeText(await screen.findByTestId('cheque-payee'), 'Landlord');
    await fireEvent.changeText(screen.getByTestId('cheque-amount'), '2500');
    await fireEvent.press(screen.getByTestId('cheque-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await repo.listCheques())[0]).toMatchObject({ payee: 'Landlord', amount: 250_000, status: 'upcoming', date: today(), seriesId: null });
  });

  it('changes status and deletes after confirmation', async () => {
    params.current = { id: 'a' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { repo } = await renderWithRepo(<ChequeScreen />, { settings: settings(), cheques: [cheque({ id: 'a' })] });
    await fireEvent.press(await screen.findByTestId('cheque-status-cleared'));
    await fireEvent.press(screen.getByTestId('cheque-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await repo.listCheques())[0].status).toBe('cleared');

    await fireEvent.press(screen.getByTestId('cheque-delete'));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await buttons.find((b) => b.text === 'Delete')!.onPress!();
    await waitFor(async () => expect(await repo.listCheques()).toHaveLength(0));
  });

  it('applies amount and payee to the later cheques of a series only when asked', async () => {
    params.current = { id: 's1' };
    const series = [
      cheque({ id: 's0', seriesId: 'S', date: addDays(today(), -30), status: 'cleared' }),
      cheque({ id: 's1', seriesId: 'S', date: addDays(today(), 30) }),
      cheque({ id: 's2', seriesId: 'S', date: addDays(today(), 60), note: 'keep' }),
      cheque({ id: 'o', seriesId: null, date: addDays(today(), 90) }),
    ];
    const { repo } = await renderWithRepo(<ChequeScreen />, { settings: settings(), cheques: series });
    await fireEvent.changeText(await screen.findByTestId('cheque-amount'), '3500');
    await fireEvent.changeText(screen.getByTestId('cheque-payee'), 'New landlord');
    await fireEvent(screen.getByTestId('cheque-apply-later'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('cheque-save-bottom'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const byId = Object.fromEntries((await repo.listCheques()).map((c) => [c.id, c]));
    expect(byId.s1).toMatchObject({ payee: 'New landlord', amount: 350_000 });
    expect(byId.s2).toMatchObject({ payee: 'New landlord', amount: 350_000, note: 'keep', date: addDays(today(), 60) });
    expect(byId.s0.payee).toBe('Landlord');
    expect(byId.o.payee).toBe('Landlord');
  });

  it('does not offer the series option for a single cheque', async () => {
    params.current = { id: 'a' };
    await renderWithRepo(<ChequeScreen />, { settings: settings(), cheques: [cheque({ id: 'a' })] });
    await screen.findByTestId('cheque-screen');
    expect(screen.queryByTestId('cheque-apply-later')).toBeNull();
  });
});

describe('Series helper', () => {
  it('clamps month-end dates', () => {
    expect(seriesDates('2026-01-31', 4, 1)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(seriesDates('2027-11-30', 3, 3)).toEqual(['2027-11-30', '2028-02-29', '2028-05-30']);
  });

  it('validates counts', () => {
    const base = { payee: 'A', amount: 100, purpose: '', count: '25', every: '13', firstDate: '2026-01-01' };
    const r = validateSeries(base);
    expect(r.cheques).toBeNull();
    expect(r.errors.count).toBeTruthy();
    expect(r.errors.every).toBeTruthy();
  });

  it('previews dates and saves all cheques in one call with a shared series id', async () => {
    params.current = { id: 'new', series: '1' };
    const { repo } = await renderWithRepo(<ChequeScreen />, { settings: settings() });
    const upsert = jest.spyOn(repo, 'upsertCheques');
    await fireEvent.changeText(await screen.findByTestId('series-payee'), 'Landlord');
    await fireEvent.changeText(screen.getByTestId('series-amount'), '4000');
    await fireEvent.changeText(screen.getByTestId('series-purpose'), 'Rent');
    await fireEvent.changeText(screen.getByTestId('series-count'), '4');
    await fireEvent.changeText(screen.getByTestId('series-every'), '3');
    expect(screen.getByTestId('series-preview-3')).toBeTruthy();
    expect(screen.queryByTestId('series-preview-4')).toBeNull();
    await fireEvent.press(screen.getByTestId('series-save'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(upsert).toHaveBeenCalledTimes(1);
    const list = await repo.listCheques();
    expect(list).toHaveLength(4);
    expect(new Set(list.map((c) => c.seriesId)).size).toBe(1);
    expect(list[0].seriesId).toBeTruthy();
    expect(list.map((c) => c.date).sort()).toEqual(seriesDates(today(), 4, 3));
    expect(list.every((c) => c.amount === 400_000 && c.purpose === 'Rent' && c.status === 'upcoming')).toBe(true);
  });

  it('shows errors for an invalid count', async () => {
    params.current = { id: 'new', series: '1' };
    const { repo } = await renderWithRepo(<ChequeScreen />, { settings: settings() });
    await fireEvent.changeText(await screen.findByTestId('series-payee'), 'Landlord');
    await fireEvent.changeText(screen.getByTestId('series-amount'), '4000');
    await fireEvent.changeText(screen.getByTestId('series-count'), '30');
    await fireEvent.press(screen.getByTestId('series-save'));
    expect(await screen.findByText('Enter a whole number from 1 to 24.')).toBeTruthy();
    expect(await repo.listCheques()).toEqual([]);
  });
});
