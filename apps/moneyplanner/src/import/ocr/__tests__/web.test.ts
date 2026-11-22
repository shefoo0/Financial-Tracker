import { ocrNative } from '../native.web';
import { pdfNative } from '../../pdf/native.web';

describe('web adapters', () => {
  it('report OCR and PDF as unavailable without throwing on load', async () => {
    expect(ocrNative.isSupported()).toBe(false);
    expect(await ocrNative.recognise('x')).toEqual([]);
    expect(await ocrNative.renderPage('x', 0)).toBeNull();
    expect(pdfNative.isAvailable()).toBe(false);
    await expect(pdfNative.extractText('x')).rejects.toThrow();
  });
});
