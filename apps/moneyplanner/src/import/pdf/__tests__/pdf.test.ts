import { extractPdfText } from '../index';
import { pdfNative } from '../native';

jest.mock('../native', () => ({
  pdfNative: { isAvailable: jest.fn(), extractText: jest.fn(), getPageCount: jest.fn() },
}));

const n = pdfNative as jest.Mocked<typeof pdfNative>;
const LONG = 'Statement of account 01 Nov 2026 POS CARREFOUR DUBAI 312.45 SALARY 18000.00 DEWA 1250.00';

beforeEach(() => {
  jest.resetAllMocks();
  n.isAvailable.mockReturnValue(true);
  n.getPageCount.mockResolvedValue(1);
});

describe('extractPdfText', () => {
  it('returns text and page count for a digital PDF', async () => {
    n.extractText.mockResolvedValue(LONG);
    const r = await extractPdfText('file:///a.pdf');
    expect(r).toMatchObject({ text: LONG, pages: 1, needsPassword: false, isScanned: false });
  });
  it('flags a PDF with almost no text per page as scanned', async () => {
    n.extractText.mockResolvedValue('  \n 1 \n');
    n.getPageCount.mockResolvedValue(3);
    const r = await extractPdfText('file:///a.pdf');
    expect(r.isScanned).toBe(true);
    expect(r.pages).toBe(3);
  });
  it('maps password errors to needsPassword and never throws', async () => {
    n.extractText.mockRejectedValue(Object.assign(new Error('x'), { code: 'PASSWORD_REQUIRED' }));
    expect(await extractPdfText('file:///a.pdf')).toMatchObject({ needsPassword: true, error: undefined });
    n.extractText.mockRejectedValue(Object.assign(new Error('x'), { code: 'INCORRECT_PASSWORD' }));
    const wrong = await extractPdfText('file:///a.pdf', 'nope');
    expect(wrong.needsPassword).toBe(true);
    expect(wrong.error).toMatch(/did not open/);
    expect(n.extractText).toHaveBeenLastCalledWith('file:///a.pdf', 'nope');
  });
  it('turns other native errors into a friendly message', async () => {
    n.extractText.mockRejectedValue(new Error('com.tom_roush.pdfbox NullPointerException at 0x0'));
    const r = await extractPdfText('file:///a.pdf');
    expect(r.needsPassword).toBe(false);
    expect(r.error).toMatch(/could not be read/);
    expect(r.error).not.toMatch(/pdfbox/);
  });
  it('reports unavailable when the native module is missing', async () => {
    n.isAvailable.mockReturnValue(false);
    const r = await extractPdfText('file:///a.pdf');
    expect(r.unavailable).toBe(true);
  });
});
