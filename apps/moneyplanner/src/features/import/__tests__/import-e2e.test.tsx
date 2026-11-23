// Realistic statement imports, end to end: the real ImportScreen -> real readers and parsers -> real ReviewScreen
// (and ColumnsScreen) -> memory repository -> real Month and Dashboard screens. Only the native adapters
// (file bytes, PDF text, OCR) and Pro are mocked. Month totals and balances must move by exactly the imported amounts.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { strToU8, zipSync } from 'fflate';
import { useEffect, useState, type ReactElement } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DashboardScreen from '@/app/(tabs)/index';
import MonthScreen from '@/app/(tabs)/month';
import { defaultSettings } from '@/data/defaults';
import { createMemoryProfileStore } from '@/data/profiles/memory-profile-store';
import { ProfileProvider } from '@/data/profiles/ProfileProvider';
import type { BackupData } from '@/data/repository';
import { readImport, type ImportInput } from '@/import/read';
import { readBytes } from '@/import/read/files';
import { pdfNative } from '@/import/pdf/native';

import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { card } from '@/engine/test-fixtures';
import { recurring, transaction } from '../../../../test-support/render';
import ColumnsScreen from '../ColumnsScreen';
import ImportScreen from '../ImportScreen';
import ReviewScreen from '../ReviewScreen';
import { getSession, resetSession, setSession } from '../session';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
jest.mock('@/lib/pro', () => ({ usePro: () => ({ isPro: true, loading: false }), isProPreviewBuild: () => true }));
jest.mock('@/import/read', () => {
  const actual = jest.requireActual('@/import/read');
  return { ...actual, readImport: jest.fn(actual.readImport) };
});
jest.mock('@/import/ocr/native', () => ({ ocrNative: {} }));
jest.mock('@/import/pdf/native', () => ({ pdfNative: { isAvailable: jest.fn(), extractText: jest.fn(), getPageCount: jest.fn() } }));
jest.mock('@/import/read/files', () => ({ readBytes: jest.fn(), fileSize: jest.fn(async () => null) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const SAFE_AREA = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const SCREENS: Record<string, () => ReactElement> = {
  import: () => <ImportScreen />,
  review: () => <ReviewScreen />,
  columns: () => <ColumnsScreen />,
  month: () => <MonthScreen />,
  dashboard: () => <DashboardScreen />,
};
const nav: { go: (name: string) => void } = { go: () => undefined };

/** Shows one screen at a time; go() swaps it like navigating (the data stays in the repository). */
function Harness() {
  const [name, setName] = useState('month');
  useEffect(() => {
    nav.go = setName;
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
// A recurring cost that already fills every month, so the totals are not trivially zero.
const rent = () => recurring({ id: 'rent', name: 'Rent', kind: 'cost', amount: 500_000, categoryId: 'housing', schedule: { type: 'monthly', day: 1 }, startDate: '2026-01-01' });

async function open(seed: Partial<BackupData> = {}) {
  const store = createMemoryProfileStore({ seed: { settings: settings(), recurring: [rent()], ...seed } });
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

const goTo = async (name: string) => {
  await act(async () => nav.go(name));
};

const fils = (label: string): number => {
  const m = /(-?)\s*AED\s*(-?)\s*([\d,]+)\.(\d{2})/.exec(label) ?? /(-?)()([\d,]+)\.(\d{2})/.exec(label);
  if (!m) throw new Error(`No amount in "${label}"`);
  const n = Number(m[3].replace(/,/g, '')) * 100 + Number(m[4]);
  return m[1] || m[2] ? -n : n;
};
const labelOf = (id: string) => screen.getByTestId(id).props.accessibilityLabel as string;

interface MonthNumbers {
  income: number;
  spent: number;
  closing: number;
}

/** What the Month screen shows for the current month plus `ahead` months. */
async function month(ahead = 0): Promise<MonthNumbers> {
  // Leave and come back, so the screen starts again at the current month with fresh data.
  await goTo('import');
  await goTo('month');
  await screen.findByTestId('month-income');
  for (let i = 0; i < ahead; i++) await fireEvent.press(screen.getByTestId('month-next'));
  return { income: fils(labelOf('month-income')), spent: fils(labelOf('month-spent')), closing: fils(labelOf('month-closing')) };
}

const delta = (after: MonthNumbers, before: MonthNumbers): MonthNumbers => ({
  income: after.income - before.income,
  spent: after.spent - before.spent,
  closing: after.closing - before.closing,
});

const bytes = readBytes as jest.Mock;
const file = (name: string, mimeType?: string): ImportInput => ({ kind: 'file', uri: `file:///${name}`, name, mimeType });

/** A file or text arrives (share-in) and the real Import screen reads it; returns where it went next. */
async function readIt(input: ImportInput, next: '/import/review' | '/import/columns' = '/import/review') {
  router.push.mockClear();
  setSession({ incoming: input });
  await goTo('import');
  await waitFor(() => expect(router.push).toHaveBeenCalledWith(next));
  await goTo(next === '/import/review' ? 'review' : 'columns');
}

const summary = () => screen.getByTestId('review-summary').props.children as string;
const importAll = async () => {
  await fireEvent.press(await screen.findByTestId('review-import'));
  await screen.findByTestId('import-done');
  // "Go to Month" ends the import (and forgets the session), as a user would before the next one.
  await fireEvent.press(screen.getByTestId('review-done'));
  expect(router.navigate).toHaveBeenCalledWith('/month');
  expect(getSession().result).toBeNull();
};

beforeEach(() => {
  resetRouterMock();
  resetSession();
  jest.clearAllMocks();
  // Only the clock is faked: Sunday 22 November 2026, noon.
  jest.useFakeTimers({
    now: new Date(2026, 10, 22, 12, 0, 0),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'requestIdleCallback', 'cancelIdleCallback'],
  });
});
afterEach(() => jest.useRealTimers());

const BANK_DEC_JAN = `EXAMPLE BANK PJSC
Account Statement
Statement Period: 15/12/2026 - 14/01/2027
Date Description Debit Credit Balance
Opening Balance 10,000.00
18/12 POS CARREFOUR DUBAI 200.00 9,800.00
28/12 SALARY ACME TRADING 15,000.00 24,800.00
03/01 DEWA BILL PAYMENT 450.00 24,350.00
Closing Balance 24,350.00
`;

const CARD = `EXAMPLE BANK Credit Card Statement
Statement Date 15 Dec 2026
Statement Period 16 Nov 2026 to 15 Dec 2026
Trans Date Post Date Description Amount (AED)
16 Nov 17 Nov TALABAT DUBAI AE 89.90
28 Nov 29 Nov NETFLIX.COM LOS GATOS 55.00
30 Nov 01 Dec REFUND NOON.COM 120.00 CR
02 Dec 03 Dec PAYMENT RECEIVED - THANK YOU 2,000.00 CR
`;

const CSV_PREAMBLE = `ENBD Account export
Account: 1234-5678
Generated: 22/11/2026

Date,Description,Debit,Credit,Balance
03/11/2026,SALARY CREDIT ACME,,"18,000.00","30,000.00"
05/11/2026,POS-CARREFOUR MOE DUBAI,312.45,,"29,687.55"
`;

const SMS = 'Purchase of AED 45.00 at CAREEM on 21-11-2026 12:30 using card ending 1234. Avl Bal AED 2,345.10.';

describe('bank statement text with a running balance, December into January', () => {
  it('reads the rows with their right years, and Dec and Jan move by exactly the imported amounts', async () => {
    const { repo } = await open();
    const nov0 = await month();
    const dec0 = await month(1);
    const jan0 = await month(2);

    bytes.mockResolvedValue(strToU8(BANK_DEC_JAN));
    await readIt(file('statement-dec.txt', 'text/plain'));
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    expect(getSession().result?.rows.map((r) => r.date)).toEqual(['2026-12-18', '2026-12-28', '2027-01-03']);
    expect(summary()).toBe('Import 3 items · AED 650 spending · AED 15,000 income');
    await importAll();

    const saved = (await repo.listTransactions()).filter((t) => t.source === 'import');
    expect(saved.map((t) => [t.date, t.kind, t.amount]).sort()).toEqual([
      ['2026-12-18', 'cost', 20000],
      ['2026-12-28', 'income', 1500000],
      ['2027-01-03', 'cost', 45000],
    ]);
    // November is untouched.
    expect(delta(await month(), nov0)).toEqual({ income: 0, spent: 0, closing: 0 });
    // December: -200 spent, +15,000 income. January: -450 spent. Balances carry forward.
    expect(delta(await month(1), dec0)).toEqual({ income: 1500000, spent: 20000, closing: 1500000 - 20000 });
    expect(delta(await month(2), jan0)).toEqual({ income: 0, spent: 45000, closing: 1500000 - 20000 - 45000 });
  });
});

describe('credit card statement with CR refunds', () => {
  it('treats CR rows as money in, leaves the card payment out (it is not income), and Month moves by exactly that', async () => {
    const { repo } = await open();
    const nov0 = await month();
    const dec0 = await month(1);

    bytes.mockResolvedValue(strToU8(CARD));
    await readIt(file('card-dec.txt', 'text/plain'));
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    expect(getSession().result?.rows.map((r) => [r.description, r.kind, r.amount])).toEqual([
      ['TALABAT DUBAI AE', 'cost', 8990],
      ['NETFLIX.COM LOS GATOS', 'cost', 5500],
      ['REFUND NOON.COM', 'income', 12000],
      ['PAYMENT RECEIVED - THANK YOU', 'income', 200000],
    ]);
    // The card payment only pays off the card: it is listed but unticked, labelled, and not imported.
    expect(screen.getByTestId('review-card-payment-3')).toBeTruthy();
    expect(summary()).toBe('Import 3 items · AED 144.90 spending · AED 120 income');
    await importAll();
    expect(await repo.listTransactions()).toHaveLength(3);
    expect(delta(await month(), nov0)).toEqual({ income: 12000, spent: 14490, closing: 12000 - 14490 });
    expect(delta(await month(1), dec0)).toEqual({ income: 0, spent: 0, closing: 12000 - 14490 });
  });
});

describe('credit card statement with the card in Debts', () => {
  it('logs the payment on the card (its balance goes down), never as income', async () => {
    const visa = card({ id: 'visa', name: 'Visa', balance: 200000, balanceDate: '2026-11-01' });
    const { repo } = await open({ debts: [visa] });
    bytes.mockResolvedValue(strToU8(CARD));
    await readIt(file('card-dec.txt', 'text/plain'));
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    // The only card is matched by itself; the payment row is ticked and says where it goes.
    expect(screen.getByTestId('review-card-payment-3').props.children).toMatch(/Pays off Visa/);
    expect(summary()).toBe('Import 4 items · AED 144.90 spending · AED 120 income · AED 2,000 card payments');
    await importAll();
    expect(await repo.listTransactions()).toHaveLength(3);
    expect((await repo.listTransactions()).some((t) => /PAYMENT RECEIVED/.test(t.description))).toBe(false);
    expect(await repo.listDebtPayments()).toMatchObject([{ debtId: 'visa', date: '2026-12-02', amount: 200000, kind: 'regular' }]);
  });

  it('asks which card when there are several and none matches, and can leave the payment out', async () => {
    const { repo } = await open({ debts: [card({ id: 'a', name: 'Mastercard' }), card({ id: 'b', name: 'Amex' })] });
    bytes.mockResolvedValue(strToU8(CARD));
    await readIt(file('card-dec.txt', 'text/plain'));
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    expect(summary()).toBe('Import 3 items · AED 144.90 spending · AED 120 income');
    await fireEvent.press(screen.getByTestId('review-card-choose-3'));
    await fireEvent.press(await screen.findByTestId('review-card-option-b'));
    expect(summary()).toBe('Import 4 items · AED 144.90 spending · AED 120 income · AED 2,000 card payments');
    await importAll();
    expect(await repo.listDebtPayments()).toMatchObject([{ debtId: 'b', amount: 200000 }]);
  });
});

describe('CSV export with debit and credit columns and a preamble', () => {
  it('skips the preamble, finds the columns, and Month moves by the salary and the shopping', async () => {
    const { repo } = await open();
    const nov0 = await month();

    bytes.mockResolvedValue(strToU8(CSV_PREAMBLE));
    await readIt(file('ENBD-nov.csv', 'text/csv'));
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    expect(getSession().mapping).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3, balance: 4 });
    expect(summary()).toBe('Import 2 items · AED 312.45 spending · AED 18,000 income');
    await importAll();
    expect(delta(await month(), nov0)).toEqual({ income: 1800000, spent: 31245, closing: 1800000 - 31245 });
    expect((await repo.getImportTemplate('ENBD-nov.csv'))?.mapping).toMatchObject({ debit: 2, credit: 3 });
    expect(await repo.listImports()).toMatchObject([{ sourceName: 'ENBD-nov.csv', fileKind: 'csv', rowCount: 2 }]);
  });
});

describe('an .xlsx workbook built in the test', () => {
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const str = (r: string, v: string) => `<c r="${r}" t="inlineStr"><is><t>${v}</t></is></c>`;
  const num = (r: string, v: number, s?: number) => `<c r="${r}"${s !== undefined ? ` s="${s}"` : ''}><v>${v}</v></c>`;
  // 46336 is 10 Nov 2026 and 46340 is 14 Nov 2026 in Excel's calendar.
  const sheet = `<?xml version="1.0"?><worksheet ${NS}><sheetData>
<row r="1">${str('A1', 'Date')}${str('B1', 'Description')}${str('C1', 'Debit')}${str('D1', 'Credit')}</row>
<row r="2">${num('A2', 46336, 1)}${str('B2', 'CARREFOUR XLSX')}${num('C2', 80.5)}</row>
<row r="3">${num('A3', 46340, 1)}${str('B3', 'REFUND ZARA')}${num('D3', 30)}</row>
</sheetData></worksheet>`;
  const book = () =>
    zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/workbook.xml': strToU8(`<workbook ${NS}><sheets><sheet name="Statement" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/styles.xml': strToU8(`<styleSheet ${NS}><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`),
      'xl/worksheets/sheet1.xml': strToU8(sheet),
    });

  it('reads dates and amounts from the cells, and Month moves by exactly them', async () => {
    const { repo } = await open();
    const nov0 = await month();
    bytes.mockResolvedValue(book());
    await readIt(file('Statement.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    expect(getSession().result?.rows.map((r) => [r.date, r.description, r.kind, r.amount])).toEqual([
      ['2026-11-10', 'CARREFOUR XLSX', 'cost', 8050],
      ['2026-11-14', 'REFUND ZARA', 'income', 3000],
    ]);
    await importAll();
    expect(delta(await month(), nov0)).toEqual({ income: 3000, spent: 8050, closing: 3000 - 8050 });
    expect(await repo.listImports()).toMatchObject([{ sourceName: 'Statement.xlsx', fileKind: 'xlsx', rowCount: 2 }]);
  });
});

describe('a pasted bank SMS', () => {
  it('goes through the Paste SMS box, the review, and shows on Month', async () => {
    await open();
    const nov0 = await month();
    await goTo('import');
    await fireEvent.press(await screen.findByTestId('import-paste-sms'));
    await fireEvent.changeText(screen.getByTestId('import-sms-input'), SMS);
    await fireEvent.press(screen.getByTestId('import-read'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/import/review'));
    await goTo('review');
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    expect(summary()).toBe('Import 1 item · AED 45 spending · AED 0 income');
    await importAll();
    expect(delta(await month(), nov0)).toEqual({ income: 0, spent: 4500, closing: -4500 });
  });
});

describe('a password-protected PDF', () => {
  const pdf = pdfNative as jest.Mocked<typeof pdfNative>;
  const passwordError = (code: string) => Object.assign(new Error('protected'), { code });

  it('asks for the password, says so when it is wrong, then reads the rows with the right one', async () => {
    await open();
    const dec0 = await month(1);
    pdf.isAvailable.mockReturnValue(true);
    pdf.getPageCount.mockResolvedValue(1);
    pdf.extractText.mockImplementation(async (_uri, pw) => {
      if (!pw) throw passwordError('PASSWORD_REQUIRED');
      if (pw !== 'secret1') throw passwordError('INCORRECT_PASSWORD');
      return BANK_DEC_JAN;
    });

    setSession({ incoming: file('statement.pdf', 'application/pdf') });
    await goTo('import');
    expect(await screen.findByTestId('import-password-card')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    expect(getSession().result).toBeNull();

    await fireEvent.changeText(screen.getByTestId('import-password-input'), 'nope');
    await fireEvent.press(screen.getByTestId('import-password-submit'));
    expect(await screen.findByText('That password did not open the PDF. Try again.')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('import-password-input'), 'secret1');
    await fireEvent.press(screen.getByTestId('import-password-submit'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/import/review'));
    expect(readImport).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'statement.pdf' }), expect.objectContaining({ password: 'secret1' }));
    await goTo('review');
    expect(summary()).toBe('Import 3 items · AED 650 spending · AED 15,000 income');
    await importAll();
    expect(delta(await month(1), dec0)).toEqual({ income: 1500000, spent: 20000, closing: 1480000 });
  });

  it('cancel leaves the password card and nothing is imported', async () => {
    const { repo } = await open();
    pdf.isAvailable.mockReturnValue(true);
    pdf.extractText.mockRejectedValue(passwordError('PASSWORD_REQUIRED'));
    setSession({ incoming: file('statement.pdf', 'application/pdf') });
    await goTo('import');
    await fireEvent.press(await screen.findByTestId('import-password-cancel'));
    expect(screen.queryByTestId('import-password-card')).toBeNull();
    expect(screen.getByTestId('import-choose-file')).toBeTruthy();
    expect(await repo.listTransactions()).toEqual([]);
  });
});

describe('a statement that overlaps what is already saved', () => {
  it('unticks the rows already imported, and importing the same file again does not double the totals', async () => {
    const { repo } = await open();
    const nov0 = await month();
    bytes.mockResolvedValue(strToU8(CSV_PREAMBLE));
    await readIt(file('ENBD-nov.csv', 'text/csv'));
    await importAll();
    const once = await month();
    expect(delta(once, nov0)).toEqual({ income: 1800000, spent: 31245, closing: 1800000 - 31245 });

    // The same export again: both rows are flagged and unticked, nothing can be imported.
    await readIt(file('ENBD-nov.csv', 'text/csv'));
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    for (const i of [0, 1]) {
      expect(screen.getByTestId(`review-toggle-${i}`).props.accessibilityState.checked).toBe(false);
      expect(within(screen.getByTestId(`review-row-${i}`)).getByText('Duplicate?')).toBeTruthy();
    }
    expect(summary()).toBe('Import 0 items · AED 0 spending · AED 0 income');
    expect(screen.getByTestId('review-import').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('review-import'));
    expect(await repo.listTransactions()).toHaveLength(2);
    expect(await month()).toEqual(once);
  });

  it('a later export with one old and one new row imports only the new one', async () => {
    const { repo } = await open();
    bytes.mockResolvedValue(strToU8(CSV_PREAMBLE));
    await readIt(file('ENBD-nov.csv', 'text/csv'));
    await importAll();
    const once = await month();

    const overlap = 'Date,Description,Debit,Credit,Balance\n05/11/2026,POS-CARREFOUR MOE DUBAI,312.45,,"29,687.55"\n09/11/2026,SPINNEYS MARINA,77.00,,"29,610.55"\n';
    bytes.mockResolvedValue(strToU8(overlap));
    await readIt(file('ENBD-nov-2.csv', 'text/csv'));
    expect(await screen.findByTestId('review-row-1')).toBeTruthy();
    expect(screen.getByTestId('review-toggle-0').props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId('review-toggle-1').props.accessibilityState.checked).toBe(true);
    expect(summary()).toBe('Import 1 item · AED 77 spending · AED 0 income');
    await importAll();
    expect(await repo.listTransactions()).toHaveLength(3);
    expect(delta(await month(), once)).toEqual({ income: 0, spent: 7700, closing: -7700 });
  });
});

describe('learned rule and remembered columns', () => {
  // A "fee" column sits before the amount, so the guess takes the fee as the amount.
  const ODD = 'ref;when;what;fee;amt\nk1;03/11/2026;CAREEM RIDE 1;1.00;-45.00\nk2;04/11/2026;CAREEM RIDE 2;1.00;-30.00\nk3;05/11/2026;SALARY ACME;1.00;1000.00\n';
  const ODD_2 = 'ref;when;what;fee;amt\nk9;12/11/2026;CAREEM RIDE 9;1.00;-20.00\nk8;13/11/2026;MYSTERY SHOP;1.00;-10.00\n';

  it('the first import saves the rule and the fixed columns; the second file from the same source gets both with no taps', async () => {
    const { repo } = await open();
    const nov0 = await month();

    bytes.mockResolvedValue(strToU8(ODD));
    await readIt(file('mybank.csv', 'text/csv'));
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    // The guess took the fee column: every row is AED 1 of spending.
    expect(summary()).toBe('Import 3 items · AED 3 spending · AED 0 income');
    await fireEvent.press(screen.getByTestId('review-fix-columns'));
    expect(router.push).toHaveBeenCalledWith('/import/columns');
    await goTo('columns');
    await fireEvent.press(await screen.findByTestId('columns-amount'));
    await fireEvent.press(screen.getByTestId('columns-amount-option-4'));
    await fireEvent.press(screen.getByTestId('columns-apply'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/import/review'));
    await goTo('review');
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    expect(summary()).toBe('Import 3 items · AED 75 spending · AED 1,000 income');

    // Teach CAREEM: Always put CAREEM RIDE in Entertainment & Travel.
    const idx = getSession().result!.rows.findIndex((r) => r.description === 'CAREEM RIDE 1');
    await fireEvent.press(screen.getByTestId(`review-category-${idx}`));
    await fireEvent.press(screen.getByTestId('review-category-option-entertainment'));
    await fireEvent.press(screen.getByTestId('rule-confirm-yes'));
    await waitFor(async () => expect(await repo.listCategoryRules()).toMatchObject([{ pattern: 'CAREEM RIDE', categoryId: 'entertainment' }]));
    await importAll();
    expect(delta(await month(), nov0)).toEqual({ income: 100000, spent: 7500, closing: 100000 - 7500 });
    expect((await repo.getImportTemplate('mybank.csv'))?.mapping).toMatchObject({ date: 1, description: 2, amount: 4 });
    const afterFirst = await month();

    // Second file from the same source: straight to the review (no columns step), right amounts, rule applied.
    bytes.mockResolvedValue(strToU8(ODD_2));
    router.replace.mockClear();
    await readIt(file('mybank.csv', 'text/csv'), '/import/review');
    expect(router.push).not.toHaveBeenCalledWith('/import/columns');
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    expect(getSession().result!.rows.map((r) => [r.description, r.amount])).toEqual([['CAREEM RIDE 9', 2000], ['MYSTERY SHOP', 1000]]);
    expect(labelOf('review-category-0')).toContain('Entertainment');
    // Spending that matches no category goes to Other.
    expect(labelOf('review-category-1')).toContain('Other');
    expect(summary()).toBe('Import 2 items · AED 30 spending · AED 0 income');
    await importAll();
    expect(delta(await month(), afterFirst)).toEqual({ income: 0, spent: 3000, closing: -3000 });
    const careem = (await repo.listTransactions()).filter((t) => t.description.startsWith('CAREEM'));
    expect(careem).toHaveLength(3);
    expect(careem.every((t) => t.categoryId === 'entertainment')).toBe(true);
    expect(await repo.listImports()).toHaveLength(2);
  });
});

describe('Dashboard forecast', () => {
  it('shows the balance today moved by exactly the imported November rows', async () => {
    await open({ transactions: [transaction({ id: 'old', description: 'Old coffee', kind: 'cost', amount: 1000, date: '2026-11-01' })] });
    await goTo('dashboard');
    const before = fils((await screen.findByLabelText(/^Balance today: /)).props.accessibilityLabel);
    bytes.mockResolvedValue(strToU8(CSV_PREAMBLE));
    await readIt(file('ENBD-nov.csv', 'text/csv'));
    await importAll();
    await goTo('dashboard');
    const after = fils((await screen.findByLabelText(/^Balance today: /)).props.accessibilityLabel);
    expect(after - before).toBe(1800000 - 31245);
  });
});
