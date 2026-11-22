import { strToU8, zipSync } from 'fflate';
import { fixtures } from '../../parse/fixtures-loader';
import { readImport } from '../index';
import { fileSize, readBytes } from '../files';
import { extractPdfText } from '../../pdf';
import { isOcrSupported, ocrImage, ocrPdfPages } from '../../ocr';

jest.mock('../../ocr/native', () => ({ ocrNative: {} }));
jest.mock('../../pdf/native', () => ({ pdfNative: {} }));
jest.mock('../files', () => ({ readBytes: jest.fn(), fileSize: jest.fn() }));
jest.mock('../../pdf', () => ({ extractPdfText: jest.fn() }));
jest.mock('../../ocr', () => ({
  ...jest.requireActual('../../ocr/index'),
  isOcrSupported: jest.fn(),
  ocrImage: jest.fn(),
  ocrPdfPages: jest.fn(),
}));

const bytes = readBytes as jest.Mock;
const pdf = extractPdfText as jest.Mock;
const supported = isOcrSupported as jest.Mock;
const ocrImg = ocrImage as jest.Mock;
const ocrPdf = ocrPdfPages as jest.Mock;

const CSV = fixtures('csv').CSV_DEBIT_CREDIT;
const OFX = fixtures('ofx').OFX_XML;
const STATEMENT = fixtures('txt').BANK_STATEMENT;
const SMS = fixtures('txt').SMS_ATM;
const file = (name: string, mimeType?: string) => ({ kind: 'file' as const, uri: `file:///${name}`, name, mimeType });

beforeEach(() => {
  jest.resetAllMocks();
  supported.mockReturnValue(true);
});

describe('readImport routing', () => {
  it('reads .csv by extension', async () => {
    bytes.mockResolvedValue(strToU8(CSV));
    const r = await readImport(file('stmt.csv'));
    expect(r).toMatchObject({ status: 'ok', fileKind: 'csv', sourceName: 'stmt.csv' });
    if (r.status === 'ok') expect(r.result.source).toBe('csv');
  });
  it('reads .ofx and sniffs it from content when the name has no extension', async () => {
    bytes.mockResolvedValue(strToU8(OFX));
    const r = await readImport(file('export.ofx'));
    expect(r).toMatchObject({ status: 'ok', fileKind: 'ofx' });
    const r2 = await readImport(file('download'));
    expect(r2).toMatchObject({ status: 'ok', fileKind: 'ofx' });
  });
  it('reads a .txt table as CSV and a .txt statement as text', async () => {
    bytes.mockResolvedValue(strToU8(CSV));
    expect(await readImport(file('a.txt', 'text/plain'))).toMatchObject({ status: 'ok', fileKind: 'csv' });
    bytes.mockResolvedValue(strToU8(STATEMENT));
    expect(await readImport(file('b.txt'))).toMatchObject({ status: 'ok', fileKind: 'text' });
  });
  it('decodes UTF-16 CSV exports', async () => {
    const u16 = new Uint8Array(2 + CSV.length * 2);
    u16[0] = 0xff;
    u16[1] = 0xfe;
    for (let i = 0; i < CSV.length; i++) {
      u16[2 + i * 2] = CSV.charCodeAt(i) & 0xff;
      u16[3 + i * 2] = CSV.charCodeAt(i) >> 8;
    }
    bytes.mockResolvedValue(u16);
    expect(await readImport(file('u.csv'))).toMatchObject({ status: 'ok', fileKind: 'csv' });
  });
  it('reports an unreadable xlsx as an error, not a throw', async () => {
    bytes.mockResolvedValue(zipSync({ 'hello.txt': strToU8('hi') }));
    const r = await readImport(file('x.xlsx'));
    expect(['empty', 'error']).toContain(r.status);
  });
  it('rejects binary junk as unsupported', async () => {
    bytes.mockResolvedValue(new Uint8Array([1, 2, 3, 0, 0, 9, 8, 7]));
    const r = await readImport(file('mystery.bin'));
    expect(r.status).toBe('unsupported');
  });
  it('maps an empty parse and read failures to friendly statuses', async () => {
    bytes.mockResolvedValue(strToU8('Date,Description,Debit,Credit\n'));
    expect((await readImport(file('e.csv'))).status).toBe('empty');
    bytes.mockRejectedValue(new Error('ENOENT /data/user/0/secret/path'));
    const r = await readImport(file('e.csv'));
    expect(r).toMatchObject({ status: 'error' });
    if (r.status === 'error') expect(r.message).not.toMatch(/ENOENT/);
  });
});

describe('shared text', () => {
  it('reads one SMS with parseSmsText', async () => {
    const r = await readImport({ kind: 'text', text: SMS });
    expect(r).toMatchObject({ status: 'ok', fileKind: 'text' });
    if (r.status === 'ok') expect(r.result.rows).toHaveLength(1);
  });
  it('reads a multi-line statement', async () => {
    const r = await readImport({ kind: 'text', text: STATEMENT });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.result.rows.length).toBeGreaterThan(1);
  });
  it('says empty for blank or unrelated text', async () => {
    expect((await readImport({ kind: 'text', text: '  ' })).status).toBe('empty');
    expect((await readImport({ kind: 'text', text: 'Hello, see you at lunch' })).status).toBe('empty');
  });
});

describe('PDF', () => {
  const textPdf = { text: STATEMENT, pages: 1, needsPassword: false, isScanned: false };
  it('parses a digital PDF without OCR', async () => {
    pdf.mockResolvedValue(textPdf);
    const r = await readImport(file('s.pdf', 'application/pdf'));
    expect(r).toMatchObject({ status: 'ok', fileKind: 'pdf' });
    expect(ocrPdf).not.toHaveBeenCalled();
    expect(bytes).not.toHaveBeenCalled();
  });
  it('asks for a password, then reads with it', async () => {
    pdf.mockResolvedValueOnce({ text: '', pages: 0, needsPassword: true, isScanned: false });
    expect(await readImport(file('s.pdf'))).toEqual({ status: 'needsPassword', wrongPassword: false });
    pdf.mockResolvedValueOnce({ text: '', pages: 0, needsPassword: true, isScanned: false, error: 'That password did not open the PDF.' });
    expect(await readImport(file('s.pdf'), { password: 'bad' })).toEqual({ status: 'needsPassword', wrongPassword: true });
    pdf.mockResolvedValueOnce(textPdf);
    expect((await readImport(file('s.pdf'), { password: '1234' })).status).toBe('ok');
    expect(pdf).toHaveBeenLastCalledWith('file:///s.pdf', '1234');
  });
  it('falls back to OCR for scanned PDFs and parses the OCR lines', async () => {
    pdf.mockResolvedValue({ text: '', pages: 2, needsPassword: false, isScanned: true });
    ocrPdf.mockResolvedValue({ lines: STATEMENT.split('\n'), pagesRead: 2, truncated: false });
    const onProgress = jest.fn();
    const r = await readImport(file('scan.pdf'), { onProgress });
    expect(r).toMatchObject({ status: 'ok', fileKind: 'pdf' });
    expect(ocrPdf).toHaveBeenCalledWith('file:///scan.pdf', { totalPages: 2, onProgress: expect.any(Function) });
  });
  it('explains when a scanned PDF cannot be read here', async () => {
    pdf.mockResolvedValue({ text: '', pages: 1, needsPassword: false, isScanned: true });
    supported.mockReturnValue(false);
    const r = await readImport(file('scan.pdf'));
    expect(r.status).toBe('unsupported');
  });
  it('is unsupported on web (no PDF reader, no OCR)', async () => {
    pdf.mockResolvedValue({ text: '', pages: 0, needsPassword: false, isScanned: false, unavailable: true, error: 'x' });
    supported.mockReturnValue(false);
    const r = await readImport(file('s.pdf'));
    expect(r.status).toBe('unsupported');
  });
  it('maps a damaged PDF to an error', async () => {
    pdf.mockResolvedValue({ text: '', pages: 0, needsPassword: false, isScanned: false, error: 'This PDF could not be read.' });
    expect(await readImport(file('s.pdf'))).toEqual({ status: 'error', message: 'This PDF could not be read.' });
  });
});

describe('images', () => {
  it('runs OCR then the statement parser', async () => {
    ocrImg.mockResolvedValue(STATEMENT.split('\n'));
    const r = await readImport(file('shot.png', 'image/png'));
    expect(r).toMatchObject({ status: 'ok', fileKind: 'image' });
  });
  it('detects an image by magic bytes when the name has no extension', async () => {
    bytes.mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
    ocrImg.mockResolvedValue(STATEMENT.split('\n'));
    expect(await readImport(file('IMG_0001'))).toMatchObject({ status: 'ok', fileKind: 'image' });
  });
  it('maps no text, unsupported and OCR failure', async () => {
    ocrImg.mockResolvedValue([]);
    expect((await readImport(file('a.jpg'))).status).toBe('empty');
    ocrImg.mockRejectedValue(new Error('The picture could not be read.'));
    expect(await readImport(file('a.jpg'))).toMatchObject({ status: 'error' });
    supported.mockReturnValue(false);
    expect((await readImport(file('a.jpg'))).status).toBe('unsupported');
  });
});

describe('limits and multiple messages', () => {
  it('refuses files over 25 MB before reading them', async () => {
    (fileSize as jest.Mock).mockResolvedValue(26 * 1024 * 1024);
    const r = await readImport(file('big.csv'));
    expect(r).toMatchObject({ status: 'error' });
    if (r.status === 'error') expect(r.message).toMatch(/25 MB/);
    expect(bytes).not.toHaveBeenCalled();
  });
  it('adds a problem line when a scanned PDF was cut at 20 pages', async () => {
    pdf.mockResolvedValue({ text: '', pages: 30, needsPassword: false, isScanned: true });
    ocrPdf.mockResolvedValue({ lines: STATEMENT.split('\n'), pagesRead: 20, truncated: true });
    const r = await readImport(file('scan.pdf'));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.result.problems).toContain('Only the first 20 pages were read — import the rest as a second file.');
  });
  it('keeps every pasted SMS, split by blank lines', async () => {
    const two = `${SMS}\n\nPurchase of AED 45.50 at CARREFOUR on 03 Dec 2026 with card ending 4321.`;
    const r = await readImport({ kind: 'text', text: two });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.result.rows).toHaveLength(2);
  });
  it('splits messages that follow each other on separate lines', async () => {
    const text = `${SMS}\nPurchase of AED 45.50 at CARREFOUR on 03 Dec 2026 with card ending 4321.`;
    const r = await readImport({ kind: 'text', text });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.result.rows).toHaveLength(2);
  });
  it('warns when one block holds several amounts but reads as one message', async () => {
    const text = 'Spent AED 10.00 at A, AED 20.00 at B, AED 30.00 at C on 02 Dec 2026 card ending 4321.';
    const r = await readImport({ kind: 'text', text });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.result.rows[0].warnings.join(' ')).toMatch(/several amounts/);
  });
});
