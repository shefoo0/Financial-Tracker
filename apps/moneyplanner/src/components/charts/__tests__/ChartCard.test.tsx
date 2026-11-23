import { act, fireEvent, screen } from '@testing-library/react-native';

import { sampleInput } from '@/engine';
import { cheque, income, input, loan, settings } from '@/engine/test-fixtures';
import { today } from '@/lib/dates';
import { usePro } from '@/lib/pro';

import { renderWithRepo } from '../../../../test-support/render';
import { debtPayoffChart, incomeVsSpendingChart, savingsRateChart } from '../addedCharts';
import { ChartCard } from '../ChartCard';
import type { ChartDef } from '../registry';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/features/edit', () => require('../../../../test-support/edit-mock'));
jest.mock('@/global.css', () => ({}));
jest.mock('@/lib/pro', () => ({ usePro: jest.fn() }));

const pro = (isPro: boolean) => (usePro as jest.Mock).mockReturnValue({ isPro, loading: false });
beforeEach(() => pro(false));

const TODAY = today();
// A plan whose figures cannot be mistaken for the demo household's (salary 18,000).
const own = input({ settings: settings({ startingBalance: 777700, startingBalanceDate: '2020-01-01' }), recurring: [income(1234500)], debts: [loan({ balance: 4321000, monthlyPayment: 100000, balanceDate: `${TODAY.slice(0, 8)}01` })] });
const spy = (def: ChartDef) => {
  const build = jest.fn(def.build);
  return { def: { ...def, build } as ChartDef, build };
};
const draw = async (def: ChartDef, plan = own) => {
  const r = await renderWithRepo(<ChartCard def={def} input={plan} today={TODAY} />);
  await act(async () => {
    await fireEvent(screen.getByTestId(`chart-card-${def.id}-chart`), 'layout', { nativeEvent: { layout: { width: 340, height: 200 } } });
  });
  return r;
};

describe('ChartCard: free and Pro', () => {
  it('draws Income vs spending (free) from the user own data, no sample label', async () => {
    const { def, build } = spy(incomeVsSpendingChart);
    await draw(def);
    expect(build).toHaveBeenCalled();
    expect(build.mock.calls.every(([plan]) => plan === own)).toBe(true);
    expect(screen.queryByText('SAMPLE')).toBeNull();
    expect(screen.queryByTestId('chart-card-income-vs-spending-unlock')).toBeNull();
    expect(screen.getByLabelText(/Income vs spending, next 6 months\. Income: lowest/)).toBeTruthy();
  });

  it('shows a Pro chart to a free user as a labelled SAMPLE from demo data, never their own figures', async () => {
    for (const base of [savingsRateChart, debtPayoffChart]) {
      const { def, build } = spy(base);
      const { unmount } = await draw(def);
      expect(screen.getByText('SAMPLE')).toBeTruthy();
      expect(screen.getByTestId(`chart-card-${def.id}-unlock`)).toBeTruthy();
      expect(screen.getByTestId(`chart-card-${def.id}-sample-note`)).toBeTruthy();
      expect(build).toHaveBeenCalled();
      for (const [plan] of build.mock.calls) {
        expect(plan).not.toBe(own);
        expect(plan.settings.startingBalance).toBe(sampleInput(TODAY).settings.startingBalance);
        expect(plan.debts.some((d: { id: string }) => d.id === 'demo-car')).toBe(true);
      }
      await unmount();
    }
  });

  it('draws the same chart from the user own data once Pro is on, without the sample label', async () => {
    pro(true);
    const { def, build } = spy(debtPayoffChart);
    await draw(def);
    expect(build.mock.calls.every(([plan]) => plan === own)).toBe(true);
    expect(screen.queryByText('SAMPLE')).toBeNull();
    expect(screen.queryByTestId('chart-card-debt-payoff-unlock')).toBeNull();
  });

  it('Unlock Pro is a live button (an explanation, nothing is charged)', async () => {
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
    await draw(savingsRateChart);
    await fireEvent.press(screen.getByTestId('chart-card-savings-rate-unlock'));
    expect(alert).toHaveBeenCalledWith(expect.stringMatching(/Pro/), expect.stringMatching(/Nothing is charged/));
    alert.mockRestore();
  });
});

describe('ChartCard: states and controls', () => {
  it('says what it needs when there is nothing to draw (Pro, no debts)', async () => {
    pro(true);
    await renderWithRepo(<ChartCard def={debtPayoffChart} input={input({ cheques: [cheque()] })} today={TODAY} />);
    expect(screen.getByTestId('chart-card-debt-payoff-empty')).toHaveTextContent(/Add a loan, card or instalment plan/);
    expect(screen.queryByTestId('chart-card-debt-payoff-chart')).toBeNull();
  });

  it('opens the range from the pencil and rebuilds for the chosen range', async () => {
    const { def, build } = spy(incomeVsSpendingChart);
    await draw(def);
    await fireEvent.press(screen.getByLabelText('Edit range of Income vs spending'));
    await fireEvent.press(await screen.findByTestId('chart-card-income-vs-spending-range-3M'));
    expect(build.mock.calls.at(-1)?.[1]).toBe('3M');
    expect(screen.getByTestId('chart-card-income-vs-spending-range-3M').props.accessibilityState.selected).toBe(true);
  });

  it('scrubbing shows a tooltip with every series; a key explains actual and forecast', async () => {
    await draw(incomeVsSpendingChart);
    expect(screen.queryByTestId('chart-card-income-vs-spending-tooltip')).toBeNull();
    const chart = screen.getByTestId('chart-card-income-vs-spending-chart');
    await act(async () => {
      await fireEvent(chart, 'responderGrant', { nativeEvent: { pageX: 150, locationX: 150 } });
    });
    const tip = screen.getByTestId('chart-card-income-vs-spending-tooltip');
    expect(tip).toHaveTextContent(/Income/);
    expect(tip).toHaveTextContent(/Spending/);
    expect(screen.getByTestId('chart-card-income-vs-spending-legend').props.accessibilityLabel).toMatch(/Income and Spending/);
  });

  it('the savings rate line shows percentages in its tooltip', async () => {
    pro(true);
    await draw(savingsRateChart);
    await act(async () => {
      await fireEvent(screen.getByTestId('chart-card-savings-rate-chart'), 'responderGrant', { nativeEvent: { pageX: 150, locationX: 150 } });
    });
    expect(screen.getByTestId('chart-card-savings-rate-tooltip')).toHaveTextContent(/%/);
  });
});
