// Thin adapter over expo-text-extractor and react-native-pdf-thumbnail (native only).
import { extractTextFromImage, isSupported } from 'expo-text-extractor';
import { File } from 'expo-file-system';
import PdfThumbnail from 'react-native-pdf-thumbnail';

/** Render width cap in pixels. The renderer never scales up (1 px per PDF point), so this only guards huge pages. */
const MAX_RENDER_WIDTH = 2400;

export const ocrNative = {
  isSupported: (): boolean => !!isSupported,
  recognise: (uri: string): Promise<string[]> => extractTextFromImage(uri),
  /** Renders a zero-based page to an image file. Returns null when the page does not exist. */
  /** Deletes a temporary image. Never throws. */
  deleteFile(uri: string): void {
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      /* best effort */
    }
  },
  async renderPage(uri: string, page: number): Promise<string | null> {
    try {
      const r = await PdfThumbnail.generate(uri, page, { quality: 95, maxWidth: MAX_RENDER_WIDTH });
      return r.uri;
    } catch (e) {
      if ((e as { code?: unknown } | null)?.code === 'INVALID_PAGE') return null;
      throw e;
    }
  },
};
export type OcrNative = typeof ocrNative;
