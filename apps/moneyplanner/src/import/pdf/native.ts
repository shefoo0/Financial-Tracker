// Thin adapter over expo-pdf-text-extract so Jest and web never load the native module.
import { extractText, getPageCount, isAvailable } from 'expo-pdf-text-extract';

export const pdfNative = {
  isAvailable: (): boolean => isAvailable(),
  extractText: (uri: string, password?: string): Promise<string> => extractText(uri, password),
  getPageCount: (uri: string, password?: string): Promise<number> => getPageCount(uri, password),
};
export type PdfNative = typeof pdfNative;
