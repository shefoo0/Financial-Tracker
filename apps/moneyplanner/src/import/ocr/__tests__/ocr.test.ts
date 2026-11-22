import { ocrImage, ocrPdfPages, OcrError } from '../index';
import { ocrNative } from '../native';

jest.mock('../native', () => ({
  ocrNative: { isSupported: jest.fn(), recognise: jest.fn(), renderPage: jest.fn(), deleteFile: jest.fn() },
}));

const n = ocrNative as jest.Mocked<typeof ocrNative>;

beforeEach(() => {
  jest.resetAllMocks();
  n.isSupported.mockReturnValue(true);
});

describe('ocrImage', () => {
  it('returns trimmed non-empty lines', async () => {
    n.recognise.mockResolvedValue([' a ', '', 'b']);
    expect(await ocrImage('file:///i.jpg')).toEqual(['a', 'b']);
  });
  it('throws a friendly error when unsupported or failing', async () => {
    n.isSupported.mockReturnValue(false);
    await expect(ocrImage('x')).rejects.toMatchObject({ reason: 'unsupported' });
    n.isSupported.mockReturnValue(true);
    n.recognise.mockRejectedValue(new Error('MLKit internal 13'));
    const e = await ocrImage('x').catch((x) => x);
    expect(e).toBeInstanceOf(OcrError);
    expect(e.message).not.toMatch(/MLKit/);
  });
});

describe('ocrPdfPages', () => {
  beforeEach(() => {
    n.deleteFile.mockImplementation(() => {});
  });
  it('renders each page, reads it, joins with a blank line, reports progress and deletes images', async () => {
    n.renderPage.mockImplementation(async (_u, p) => (p < 2 ? `file:///p${p}.jpg` : null));
    n.recognise.mockImplementation(async (u) => [`line of ${u}`]);
    const progress = jest.fn();
    const r = await ocrPdfPages('file:///a.pdf', { totalPages: 2, onProgress: progress });
    expect(r).toEqual({ lines: ['line of file:///p0.jpg', '', 'line of file:///p1.jpg'], pagesRead: 2, truncated: false });
    expect(progress).toHaveBeenLastCalledWith(2, 2);
    expect(n.deleteFile).toHaveBeenCalledTimes(2);
  });
  it('stops at maxPages, flags truncation and deletes the probe image too', async () => {
    n.renderPage.mockResolvedValue('file:///p.jpg');
    n.recognise.mockResolvedValue(['x']);
    const r = await ocrPdfPages('u', { maxPages: 3 });
    expect(r.pagesRead).toBe(3);
    expect(r.truncated).toBe(true);
    expect(n.deleteFile).toHaveBeenCalledTimes(4);
  });
  it('defaults to 20 pages', async () => {
    n.renderPage.mockResolvedValue('file:///p.jpg');
    n.recognise.mockResolvedValue(['x']);
    const r = await ocrPdfPages('u');
    expect(r.pagesRead).toBe(20);
    expect(r.truncated).toBe(true);
  });
  it('deletes the image even when reading fails', async () => {
    n.renderPage.mockResolvedValue('file:///p.jpg');
    n.recognise.mockRejectedValue(new Error('boom'));
    await expect(ocrPdfPages('u')).rejects.toMatchObject({ reason: 'failed' });
    expect(n.deleteFile).toHaveBeenCalledWith('file:///p.jpg');
  });
  it('maps a protected PDF to a password error', async () => {
    n.renderPage.mockRejectedValue(Object.assign(new Error('x'), { code: 'PASSWORD_PROTECTED' }));
    await expect(ocrPdfPages('u')).rejects.toMatchObject({ reason: 'password' });
  });
});
