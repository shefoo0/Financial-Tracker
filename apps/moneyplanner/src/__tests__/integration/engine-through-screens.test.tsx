// End-to-end engine checks through the screens: a form saves data, then the Plan, Debts,
// Month and Dashboard screens (all reading the same profile repository) must agree.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { useState, type ReactElement } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DashboardScreen from '@/app/(tabs)/index';
import MonthScreen from '@/app/(tabs)/month';
import PlanScreen from '@/app/(tabs)/plan';
import ChequeScreen from '@/app/cheques/[id]';
import ChequesScreen from '@/app/cheques/index';
import DebtScreen from '@/app/debts/[id]';
import DebtsScreen from '@/app/debts/index';
import { defaultSettings } from '@/data/defaults';
import { createMemoryProfileStore } from '@/data/profiles/memory-profile-store';
import { ProfileProvider } from '@/data/profiles/ProfileProvider';
import type { BackupData } from '@/data/repository';

import { params, resetRouterMock } from '../../../test-support/expo-router-mock';
import { recurring, transaction } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

const SAFE_AREA = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const SCREENS: Record<string, () => ReactElement> = {
  plan: () => <PlanScreen />,
  debts: () => <DebtsScreen />,
  debt: () => <DebtScreen />,
  month: () => <MonthScreen />,
  dashboard: () => <DashboardScreen />,
  cheques: () => <ChequesScreen />,
  cheque: () => <ChequeScreen />,
};

let go: (name: string, p?: Record<string, string>) => void = () => undefined;

/** Shows one screen at a time; go() swaps it like navigating (the data stays in the repository). */
function Harness() {
  const [name, setName] = useState('plan');
  go = (n, p = {}) => {
    params.current = p;
    setName(n);
  };
  return (
    <>
      <Text testID="harness-current">{name}</Text>
      {SCREENS[name]()}
    </>
  );
}

const settings = (over: object = {}) => ({
  ...defaultSettings(),
  onboarded: true,
  startingBalance: 10_000_000, // AED 100,000.00
  startingBalanceDate: '2026-01-01',
  enabledModules: { debts: true, cheques: true, alerts: true, import: true },
  ...over,
});
// Income that starts later, so it does not change today's balance.
const salary = () => recurring({ id: 'sal', name: 'Salary', kind: 'income', amount: 1_800_000, categoryId: 'salary', schedule: { type: 'monthly', day: 25 }, startDate: '2026-06-25' });

async function open(seed: Partial<BackupData>) {
  const store = createMemoryProfileStore({ seed });
  const view = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ProfileProvider storeFactory={() => store} renderLoading={() => <Text>Loading</Text>} renderError={(m) => <Text>{m}</Text>}>
        <Harness />
      </ProfileProvider>
    </SafeAreaProvider>,
  );
  await waitFor(() => expect(view.queryByText('Loading')).toBeNull());
  const state = await store.init();
  return { repo: store.repositoryFor(state.activeProfileId)!, store, ...view };
}

const goTo = async (name: string, p?: Record<string, string>) => {
  await act(async () => go(name, p));
};

beforeEach(() => {
  resetRouterMock();
  // Only the clock is faked: Wednesday 10 June 2026, noon.
  jest.useFakeTimers({
    now: new Date(2026, 5, 10, 12, 0, 0),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'requestIdleCallback', 'cancelIdleCallback'],
  });
});
afterEach(() => jest.useRealTimers());

describe('a loan added in the form', () => {
  it('shows on Plan, Debts, Month and the dashboard (totals and Coming up)', async () => {
    const { repo } = await open({ settings: settings(), recurring: [salary()] });

    // Plan: the Debts card is empty before the loan.
    expect(await screen.findByTestId('plan-open-debts')).toHaveTextContent(/Add loans, credit cards and instalment plans/);

    // Form: AED 20,000 left, AED 1,500 a month on the 15th.
    await goTo('debt', { id: 'new', type: 'loan' });
    await fireEvent.changeText(await screen.findByTestId('debt-name'), 'Car loan');
    await fireEvent.changeText(screen.getByTestId('debt-balance'), '20000');
    await fireEvent.changeText(screen.getByTestId('debt-monthly'), '1500');
    await fireEvent.changeText(screen.getByTestId('debt-day'), '15');
    await fireEvent.press(screen.getByTestId('debt-save-bottom'));
    await waitFor(async () => expect(await repo.listDebts()).toHaveLength(1));

    await goTo('plan');
    await waitFor(() => expect(screen.getByTestId('plan-open-debts')).toHaveTextContent(/1 active/));

    await goTo('debts');
    expect(await screen.findByTestId('debts-total')).toHaveTextContent('AED 20,000.00');
    expect(screen.getByTestId('debts-monthly')).toHaveTextContent('AED 1,500.00');
    expect(screen.getByTestId('debt-item-0')).toHaveTextContent(/Car loan/);
    // 1,500 of 18,000 income = 8.3%
    expect(screen.getByTestId('debts-ratio')).toHaveTextContent(/8\.3%/);

    await goTo('month');
    const monthRow = await screen.findByLabelText(/^Car loan payment, cost AED 1,500\.00/);
    expect(monthRow).toBeTruthy();
    expect(within(screen.getByTestId('month-summary')).getByLabelText('Total spend: AED 1,500.00')).toBeTruthy();

    await goTo('dashboard');
    const next = await screen.findByTestId('dashboard-upcoming');
    expect(within(next).getByLabelText(/Car loan payment, in 5 days.*cost AED 1,500\.00/)).toBeTruthy();
    // Today's balance is untouched; June ends at 100,000 + 18,000 salary (25th) - 1,500 loan = 116,500.
    expect(screen.getByLabelText('Balance today: AED 100,000.00')).toBeTruthy();
    expect(screen.getByLabelText(/^Jun 2026: AED 116,500\.00/)).toBeTruthy();
  });

  it('shows nothing from a loan when the Debts module is off for its card', async () => {
    await open({ settings: settings({ enabledModules: { debts: false, cheques: false, alerts: true, import: true } }), recurring: [salary()] });
    await screen.findByTestId('plan-screen');
    expect(screen.queryByTestId('plan-open-debts')).toBeNull();
    expect(screen.queryByTestId('plan-open-cheques')).toBeNull();
  });
});

describe('a cheque series', () => {
  it('shows in Month, the dashboard and the forecast, and clearing one removes it from the forecast', async () => {
    // An old one-time item (on the starting-balance date, so not counted) keeps the dashboard out of its empty state.
    const { repo } = await open({ settings: settings(), transactions: [transaction({ id: 'old', description: 'Old', kind: 'income', amount: 100, date: '2026-01-01' })] });
    await goTo('cheques');
    expect(await screen.findByText('No cheques yet')).toBeTruthy();

    await goTo('cheque', { id: 'new', series: '1' });
    await fireEvent.changeText(await screen.findByTestId('series-payee'), 'Landlord');
    await fireEvent.changeText(screen.getByTestId('series-amount'), '4000');
    await fireEvent.changeText(screen.getByTestId('series-purpose'), 'Rent');
    await fireEvent.changeText(screen.getByTestId('series-count'), '4');
    await fireEvent.changeText(screen.getByTestId('series-every'), '3');
    await fireEvent.press(screen.getByTestId('series-save'));
    await waitFor(async () => expect(await repo.listCheques()).toHaveLength(4));

    // Plan card counts the 4 upcoming cheques, AED 16,000 together.
    await goTo('plan');
    await waitFor(() => expect(screen.getByTestId('plan-open-cheques')).toHaveTextContent(/4 upcoming · AED 16,000\.00/));

    // Month: the first cheque (today, 10 June) is listed.
    await goTo('month');
    expect(await screen.findByLabelText(/^Cheque to Landlord, cost AED 4,000\.00/)).toBeTruthy();

    // Dashboard: first cheque is today, so it is already in "Balance today"; the next is in 92 days.
    await goTo('dashboard');
    expect(await screen.findByLabelText('Balance today: AED 96,000.00')).toBeTruthy();
    const next = screen.getByTestId('dashboard-upcoming');
    expect(within(next).getAllByLabelText(/Cheque to Landlord/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^Sep 2026: AED 92,000\.00/)).toBeTruthy();

    // Mark the first cheque cleared on the list.
    await goTo('cheques');
    await fireEvent.press(await screen.findByTestId('cheque-clear-0'));
    await waitFor(async () => expect((await repo.listCheques()).filter((c) => c.status === 'cleared')).toHaveLength(1));

    await goTo('dashboard');
    // A cleared cheque is no longer an outflow: today's balance is back to 100,000 and September ends at 96,000.
    await waitFor(() => expect(screen.getByLabelText('Balance today: AED 100,000.00')).toBeTruthy());
    expect(screen.getByLabelText(/^Sep 2026: AED 96,000\.00/)).toBeTruthy();
    await goTo('month');
    await waitFor(() => expect(screen.queryByLabelText(/^Cheque to Landlord/)).toBeNull());
    expect((await repo.listCheques()).filter((c) => c.status === 'upcoming')).toHaveLength(3);
  });
});

describe('Home with only a debt or a cheque (no recurring or one-time items)', () => {
  it('shows a loan in Coming up instead of the empty welcome', async () => {
    await open({
      settings: settings(),
      debts: [{ id: 'L', type: 'loan', name: 'Car loan', note: '', archived: false, createdAt: '2026-01-02', balance: 2_000_000, balanceDate: '2026-06-01', monthlyPayment: 150_000, paymentDay: 15, annualRatePct: null, endDate: null }],
    });
    await goTo('dashboard');
    expect(await screen.findByTestId('dashboard-screen')).toBeTruthy();
    expect(screen.queryByText('Welcome to Money Planner')).toBeNull();
    expect(within(screen.getByTestId('dashboard-upcoming')).getByLabelText(/Car loan payment/)).toBeTruthy();
  });

  it('shows an upcoming cheque in Coming up instead of the empty welcome', async () => {
    await open({
      settings: settings(),
      cheques: [{ id: 'Q', payee: 'Landlord', amount: 400_000, date: '2026-06-20', purpose: 'Rent', status: 'upcoming', seriesId: null, note: '' }],
    });
    await goTo('dashboard');
    expect(await screen.findByTestId('dashboard-screen')).toBeTruthy();
    expect(screen.queryByText('Welcome to Money Planner')).toBeNull();
    expect(within(screen.getByTestId('dashboard-upcoming')).getByLabelText(/Cheque to Landlord/)).toBeTruthy();
  });
});
