import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { readImport } from '@/import/read';
import { readBytes } from '@/import/read/files';

import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../../test-support/render';
import ColumnsScreen from '../ColumnsScreen';
import { startReading } from '../flow';
import ImportScreen from '../ImportScreen';
import ReviewScreen from '../ReviewScreen';
import { getSession, resetSession, setSession } from '../session';
import { createMemoryRepository } from '@/data/memory/memory-repository';
import { defaultSettings } from '@/data/defaults';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
let mockPro = true;
jest.mock('@/lib/pro', () => ({ usePro: () => ({ isPro: mockPro, loading: false }), isProPreviewBuild: () => mockPro }));
jest.mock('@/import/read', () => {
  const actual = jest.requireActual('@/import/read');
  return { ...actual, readImport: jest.fn(actual.readImport) };
});
jest.mock('@/import/ocr/native', () => ({ ocrNative: {} }));
jest.mock('@/import/pdf/native', () => ({ pdfNative: {} }));
jest.mock('@/import/read/files', () => ({ readBytes: jest.fn(), fileSize: jest.fn(async () => null) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const settings = { ...defaultSettings(), onboarded: true };
const SMS = 'Purchase of AED 45.00 at CAREEM on 21-11-2026 12:30 using card ending 1234. Avl Bal AED 2,345.10.';
const bytes = (s: string) => new TextEncoder().encode(s);

beforeEach(() => {
  resetRouterMock();
  resetSession();
  mockPro = true;
  jest.clearAllMocks();
});

describe('free users', () => {
  it('see the Pro screen with Unlock Pro and no import actions', async () => {
    mockPro = false;
    await renderWithRepo(<ImportScreen />, { settings });
    expect(await screen.findByTestId('import-screen')).toBeTruthy();
    expect(screen.getByTestId('import-pro-badge')).toBeTruthy();
    for (const id of ['import-choose-file', 'import-take-photo', 'import-choose-photo', 'import-paste-sms', 'import-sms-input', 'import-read']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await fireEvent.press(screen.getByTestId('import-unlock'));
    expect(alert).toHaveBeenCalledWith('Pro comes with the next update', expect.any(String));
  });

  it('never read a shared item, and the item is dropped', async () => {
    mockPro = false;
    setSession({ incoming: { kind: 'text', text: SMS } });
    await renderWithRepo(<ImportScreen />, { settings });
    await screen.findByTestId('import-unlock');
    await waitFor(() => expect(getSession().incoming).toBeNull());
    expect(readImport).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('never read anything through startReading, and the review and column screens show the Pro screen too', async () => {
    mockPro = false;
    const repo = createMemoryRepository();
    const step = await startReading({ repo, isPro: false, input: { kind: 'text', text: SMS } });
    expect(step.kind).toBe('message');
    expect(readImport).not.toHaveBeenCalled();
    await renderWithRepo(<ReviewScreen />, { settings });
    expect(await screen.findByTestId('import-unlock')).toBeTruthy();
    expect(screen.queryByTestId('review-import')).toBeNull();
    await renderWithRepo(<ColumnsScreen />, { settings });
    expect((await screen.findAllByTestId('import-unlock')).length).toBeGreaterThan(0);
  });
});

describe('Pro: pasted SMS, end to end with the real parsers', () => {
  it('reads the text, opens the review, and imports the row', async () => {
    const { repo, unmount } = await renderWithRepo(<ImportScreen />, { settings });
    expect(await screen.findByTestId('import-choose-file')).toBeTruthy();
    expect(screen.queryByTestId('import-unlock')).toBeNull();
    expect(screen.queryByTestId('import-pro-badge')).toBeNull();
    await fireEvent.press(screen.getByTestId('import-paste-sms'));
    await fireEvent.changeText(screen.getByTestId('import-sms-input'), SMS);
    await fireEvent.press(screen.getByTestId('import-read'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/import/review'));
    expect(getSession().sourceName).toBe('Shared text');
    expect(getSession().result?.rows).toHaveLength(1);
    await unmount();

    const second = await renderWithRepo(<ReviewScreen />, { settings });
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    expect(screen.getByTestId('review-summary').props.children).toBe('Import 1 item · AED 45 spending · AED 0 income');
    await fireEvent.press(screen.getByTestId('review-import'));
    await waitFor(async () => expect(await second.repo.listTransactions()).toHaveLength(1));
    const [t] = await second.repo.listTransactions();
    expect(t).toMatchObject({ kind: 'cost', amount: 4500, date: '2026-11-21', source: 'import', planned: false });
    expect((await second.repo.listImports())[0]).toMatchObject({ id: t.importId, sourceName: 'Shared text', fileKind: 'text', rowCount: 1 });
    // Pasted text has no column layout to remember.
    expect(await second.repo.getImportTemplate('Shared text')).toBeNull();
    expect(repo).toBeTruthy();
  });

  it('shows the reader message when nothing is found', async () => {
    await renderWithRepo(<ImportScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('import-paste-sms'));
    await fireEvent.changeText(screen.getByTestId('import-sms-input'), 'Your OTP is 123456. Do not share it.');
    await fireEvent.press(screen.getByTestId('import-read'));
    expect(await screen.findByTestId('import-message')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('Pro: a bank CSV and its remembered columns', () => {
  const CSV = 'Date,Description,Debit,Credit,Balance\n03/11/2026,SALARY CREDIT ACME,,"18,000.00","30,000.00"\n05/11/2026,POS-CARREFOUR MOE DUBAI,312.45,,"29,687.55"\n';
  const file = { kind: 'file' as const, uri: 'file:///bank.csv', name: 'ENBD-nov.csv', mimeType: 'text/csv' };

  it('goes to the review with the guessed layout, which the import then saves as the template', async () => {
    (readBytes as jest.Mock).mockResolvedValue(bytes(CSV));
    const { repo } = await renderWithRepo(<ReviewScreen />, { settings });
    let step: Awaited<ReturnType<typeof startReading>> | undefined;
    await act(async () => {
      step = await startReading({ repo, isPro: true, input: file });
    });
    expect(step?.kind).toBe('review');
    expect(getSession().mapping).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
    expect(getSession().result?.rows).toHaveLength(2);
    await fireEvent.press(await screen.findByTestId('review-import'));
    await waitFor(async () => expect((await repo.getImportTemplate('ENBD-nov.csv'))?.mapping).toMatchObject({ date: 0, debit: 2, credit: 3 }));
    const imports = await repo.listImports();
    expect(imports).toMatchObject([{ sourceName: 'ENBD-nov.csv', fileKind: 'csv', rowCount: 2 }]);
  });

  it('uses the remembered layout for the next file with that name', async () => {
    const odd = 'Posted,Memo,Out,In\n2026-11-03,SALARY,,100.00\n2026-11-05,COFFEE,5.00,\n';
    (readBytes as jest.Mock).mockResolvedValue(bytes(odd));
    const repo = createMemoryRepository();
    await repo.init();
    await repo.saveImportTemplate({
      sourceName: 'ENBD-nov.csv',
      mapping: { delimiter: ',', headerRow: 0, date: 0, description: 1, debit: 2, credit: 3, amount: null, balance: null, direction: null, dateOrder: 'dmy' },
      lastUsed: '2026-11-01T00:00:00.000Z',
    });
    const step = await startReading({ repo, isPro: true, input: file });
    expect(step.kind).toBe('review');
    expect(getSession().result?.rows.map((r) => r.kind)).toEqual(['income', 'cost']);
  });

  it('asks for the columns when the guess finds nothing', async () => {
    (readBytes as jest.Mock).mockResolvedValue(bytes('a;b;c\nx;y;z\nq;w;e\n'));
    const repo = createMemoryRepository();
    await repo.init();
    let step: Awaited<ReturnType<typeof startReading>> | undefined;
    await act(async () => {
      step = await startReading({ repo, isPro: true, input: { ...file, name: 'odd.csv' } });
    });
    expect(step?.kind).toBe('columns');
    expect(getSession().table?.rows).toHaveLength(3);
    expect(getSession().message).toMatch(/No transactions/);
    await renderWithRepo(<ColumnsScreen />, { settings });
    expect(await screen.findByTestId('columns-preview')).toBeTruthy();
  });

  it('maps columns by hand: date, description and one amount column', async () => {
    const table = { rows: [['x', 'when', 'what', 'amt'], ['k', '03/11/2026', 'Coffee', '-12.50'], ['k', '04/11/2026', 'Salary', '100.00']], delimiter: ',' };
    setSession({
      table,
      sourceName: 'manual.csv',
      fileKind: 'csv',
      message: 'No transactions were found.',
      mapping: { delimiter: ',', headerRow: 0, date: null, description: null, debit: null, credit: null, amount: null, balance: null, direction: null, dateOrder: 'dmy' },
    });
    await renderWithRepo(<ColumnsScreen />, { settings });
    expect(await screen.findByTestId('columns-message')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('columns-apply'));
    expect(await screen.findByTestId('columns-error')).toBeTruthy();
    for (const [id, value] of [['columns-date', '1'], ['columns-description', '2'], ['columns-amount', '3']]) {
      await fireEvent.press(screen.getByTestId(id));
      await fireEvent.press(screen.getByTestId(`${id}-option-${value}`));
    }
    await fireEvent.press(screen.getByTestId('columns-apply'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/import/review'));
    expect(getSession().result?.rows.map((r) => [r.description, r.kind, r.amount])).toEqual([['Coffee', 'cost', 1250], ['Salary', 'income', 10000]]);
    expect(getSession().mapping).toMatchObject({ date: 1, description: 2, amount: 3 });
  });
});
