import { ocrImage, ocrPdfPages, OcrError } from '../index';
import { ocrNative } from '../native';

jest.mock('../native', () => ({
  ocrNative: { isSupported: jest.fn(), recognise: jest.fn(), renderPage: jest.fn() },
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
  it('renders each page, reads it, joins with a blank line and reports progress', async () => {
    n.renderPage.mockImplementation(async (_u, p) => (p < 2 ? `file:///p${p}.jpg` : null));
    n.recognise.mockImplementation(async (u) => [`line of ${u}`]);
    const progress = jest.fn();
    const lines = await ocrPdfPages('file:///a.pdf', 10, progress);
    expect(lines).toEqual(['line of file:///p0.jpg', '', 'line of file:///p1.jpg']);
    expect(progress).toHaveBeenCalledTimes(2);
  });
  it('stops at maxPages', async () => {
    n.renderPage.mockResolvedValue('file:///p.jpg');
    n.recognise.mockResolvedValue(['x']);
    await ocrPdfPages('u', 3);
    expect(n.renderPage).toHaveBeenCalledTimes(3);
  });
  it('maps a protected PDF to a password error', async () => {
    n.renderPage.mockRejectedValue(Object.assign(new Error('x'), { code: 'PASSWORD_PROTECTED' }));
    await expect(ocrPdfPages('u')).rejects.toMatchObject({ reason: 'password' });
  });
});
