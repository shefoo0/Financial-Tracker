import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import ReportScreen from '@/app/reports/[key]';
import ReportsScreen from '@/app/reports/index';
import { defaultSettings } from '@/data/defaults';
import { ReportsCard } from '@/features/reports/ReportsCard';
import { reportHtml } from '@/features/reports/pdf';
import { periodsWithData, sampleReport } from '@/engine';
import { today } from '@/lib/dates';
import { usePro } from '@/lib/pro';

import { params, resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { recurring, renderWithRepo, transaction } from '../../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
jest.mock('@/lib/pro', () => ({ usePro: jest.fn() }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/report.pdf' })) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

const pro = (isPro: boolean) => (usePro as jest.Mock).mockReturnValue({ isPro, loading: false });
const settings = { ...defaultSettings(), onboarded: true };
const OWN_SALARY = 7654321; // AED 76,543.21: appears only in the user's own data
const seed = {
  settings,
  recurring: [recurring({ id: 's', name: 'Zebra Corp salary', kind: 'income', amount: OWN_SALARY, schedule: { type: 'monthly', day: 1 } })],
  transactions: [transaction({ id: 't', description: 'Own purchase', kind: 'cost', amount: 123457, date: today() })],
};
// One, two or three monthly salaries, depending on the date the test runs.
const OWN_AMOUNT = /76,543\.21|153,086\.42|229,629\.63/;
const currentQuarterKey = () => {
  const t = today();
  return `${t.slice(0, 4)}-Q${Math.floor((Number(t.slice(5, 7)) - 1) / 3) + 1}`;
};

beforeEach(() => {
  resetRouterMock();
  jest.clearAllMocks();
});

describe('free user', () => {
  beforeEach(() => pro(false));

  it('list shows the sample banner and sample reports, not own figures', async () => {
    await renderWithRepo(<ReportsScreen />, seed);
    expect(await screen.findByTestId('reports-screen')).toBeTruthy();
    expect(screen.getByTestId('report-sample-banner')).toBeTruthy();
    expect(screen.getByText(/Sample: your own reports come with Pro/)).toBeTruthy();
    expect(screen.queryByText(OWN_AMOUNT)).toBeNull();
    expect(screen.queryByText(/Zebra/)).toBeNull();
    await fireEvent.press(screen.getByTestId('report-period-0'));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/reports/[key]', params: { key: sampleReport(today()).period.key } }));
  });

  it('Unlock Pro says it comes with the next update', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderWithRepo(<ReportsScreen />, seed);
    await fireEvent.press(await screen.findByTestId('report-unlock'));
    expect(alert).toHaveBeenCalledWith('Pro comes with the next update', expect.any(String));
  });

  it('report screen shows the sample only and no PDF button', async () => {
    params.current = { key: currentQuarterKey() };
    await renderWithRepo(<ReportScreen />, seed);
    expect(await screen.findByTestId('report-sample-banner')).toBeTruthy();
    expect(screen.getByTestId('report-unlock')).toBeTruthy();
    expect(screen.getByText('Salary')).toBeTruthy();
    expect(screen.getByText(/Made-up demo numbers/)).toBeTruthy();
    expect(screen.queryByText(OWN_AMOUNT)).toBeNull();
    expect(screen.queryByText(/Zebra/)).toBeNull();
    expect(screen.queryByText(/1,234.57/)).toBeNull();
    expect(screen.queryByTestId('report-pdf')).toBeNull();
  });

  it('shows the year sample for a year key', async () => {
    params.current = { key: '2025' };
    await renderWithRepo(<ReportScreen />, seed);
    expect(await screen.findByTestId('report-quarters')).toBeTruthy();
  });

  it('Home card offers the sample', async () => {
    await renderWithRepo(<ReportsCard input={null} />, seed);
    expect(screen.getByText('See a sample report')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('reports-card-open'));
    expect(router.push).toHaveBeenCalledWith('/reports');
  });
});

describe('Pro user', () => {
  beforeEach(() => pro(true));

  it('lists own periods, current quarter and year first', async () => {
    await renderWithRepo(<ReportsScreen />, seed);
    expect(await screen.findByTestId('report-period-0')).toBeTruthy();
    expect(screen.queryByTestId('report-sample-banner')).toBeNull();
    expect(screen.getAllByText('So far').length).toBe(2);
    await fireEvent.press(screen.getByTestId('report-period-1'));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ params: { key: today().slice(0, 4) } }));
  });

  it('shows an empty state without data', async () => {
    await renderWithRepo(<ReportsScreen />, { settings });
    expect(await screen.findByText('No reports yet')).toBeTruthy();
  });

  it('shows the real report with own figures', async () => {
    params.current = { key: currentQuarterKey() };
    await renderWithRepo(<ReportScreen />, seed);
    expect(await screen.findByText('Zebra Corp salary')).toBeTruthy();
    expect(screen.queryByTestId('report-sample-banner')).toBeNull();
    expect(screen.queryByTestId('report-unlock')).toBeNull();
    expect(screen.getAllByText(/1,234\.57/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(OWN_AMOUNT).length).toBeGreaterThan(0);
  });

  it('says so for a key that is not a period', async () => {
    params.current = { key: 'nonsense' };
    await renderWithRepo(<ReportScreen />, seed);
    expect(await screen.findByText('Report not found')).toBeTruthy();
  });

  it('Save as PDF prints and shares', async () => {
    params.current = { key: currentQuarterKey() };
    await renderWithRepo(<ReportScreen />, seed);
    await fireEvent.press(await screen.findByTestId('report-pdf'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    const html = (Print.printToFileAsync as jest.Mock).mock.calls[0][0].html as string;
    expect(html).toContain('Zebra Corp salary');
    expect(html).toContain('not financial advice');
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///tmp/report.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
  });

  it('tells the user when the PDF fails', async () => {
    (Print.printToFileAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    params.current = { key: currentQuarterKey() };
    await renderWithRepo(<ReportScreen />, seed);
    await fireEvent.press(await screen.findByTestId('report-pdf'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't save the PDF", 'disk full'));
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('Home card shows the latest saved amount and savings rate', async () => {
    const { repo } = await renderWithRepo(<ReportsCard input={null} />, seed);
    expect(screen.getByText('Reports appear once you have income or spending entered')).toBeTruthy();
    const input = {
      settings: await repo.getSettings(),
      categories: await repo.listCategories(),
      recurring: await repo.listRecurring(),
      overrides: [],
      transactions: await repo.listTransactions(),
      debts: [],
      debtPayments: [],
      debtOverrides: [],
      cheques: [],
    };
    expect(periodsWithData(input, today()).length).toBeGreaterThan(0);
    await renderWithRepo(<ReportsCard input={input} />, seed);
    expect(await screen.findAllByText(/Saved AED/)).toBeTruthy();
  });
});

describe('pdf html', () => {
  it('is escaped, light, and carries the app name, period and footer', () => {
    const r = { ...sampleReport('2026-11-22'), currency: 'AED' };
    r.highlights = ['Fish & <chips> rose 5%'];
    const html = reportHtml(r);
    expect(html).toContain('Fish &amp; &lt;chips&gt; rose 5%');
    expect(html).toContain('Money Planner');
    expect(html).toContain('Q3 2026');
    expect(html).toContain('AED');
    expect(html).toContain('SAMPLE');
    expect(html).toContain('Facts from your own entries; not financial advice.');
    expect(html).toContain('generated 22 Nov 2026');
  });
});
