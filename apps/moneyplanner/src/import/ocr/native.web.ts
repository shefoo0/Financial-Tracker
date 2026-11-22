// Web has no on-device OCR or PDF rendering.
import type { OcrNative } from './native';

export const ocrNative: OcrNative = {
  isSupported: () => false,
  recognise: async () => [],
  renderPage: async () => null,
};
