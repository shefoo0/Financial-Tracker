// End-to-end engine checks through the screens: a form saves data, then the Plan, Debts,
// Month and Dashboard screens (all reading the same profile repository) must agree.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { useEffect, useState, type ReactElement } from 'react';
import { Text } from 'react-native';
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
import { defaultHomeLayout, toggleCard } from '@/features/home/layout';

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

const nav: { go: (name: string, p?: Record<string, string>) => void } = { go: () => undefined };

/** Shows one screen at a time; go() swaps it like navigating (the data stays in the repository). */
function Harness() {
  const [name, setName] = useState('plan');
  useEffect(() => {
    nav.go = (n, p = {}) => {
      params.current = p;
      setName(n);
    };
  }, []);
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
  await act(async () => nav.go(name, p));
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

    // The end-of-month list is hidden by default: show it for this check.
    await repo.updateSettings({ homeLayout: toggleCard(defaultHomeLayout(), 'endOfMonth') });
    await goTo('dashboard');
    const next = await screen.findByTestId('dashboard-upcoming');
    expect(within(next).getByLabelText(/Car loan payment, in 5 days.*cost AED 1,500\.00/)).toBeTruthy();
    // Today's balance is untouched; June ends at 100,000 + 18,000 salary (25th) - 1,500 loan = 116,500.
    expect(screen.getByLabelText('Balance today: AED 100,000.00')).toBeTruthy();
    expect(screen.getByLabelText(/^Jun 2026: AED 116,500\.00/)).toBeTruthy();
  });

  it('always shows the Debts and Cheques cards, whatever the old module flags say', async () => {
    await open({ settings: settings(), recurring: [salary()] });
    await screen.findByTestId('plan-screen');
    expect(screen.getByTestId('plan-open-debts')).toBeTruthy();
    expect(screen.getByTestId('plan-open-cheques')).toBeTruthy();
  });
});
