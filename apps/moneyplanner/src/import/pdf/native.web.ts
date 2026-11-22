// Web has no PDF text extraction: the adapter reports itself as unavailable.
import type { PdfNative } from './native';

const unavailable = async (): Promise<never> => {
  throw new Error('PDF reading is not available on the web.');
};

export const pdfNative: PdfNative = {
  isAvailable: () => false,
  extractText: unavailable,
  getPageCount: unavailable,
};
