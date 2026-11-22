import { ocrNative } from './native';

export class OcrError extends Error {
  constructor(
    public reason: 'unsupported' | 'failed' | 'password',
    message: string,
  ) {
    super(message);
    this.name = 'OcrError';
  }
}

export function isOcrSupported(): boolean {
  try {
    return ocrNative.isSupported();
  } catch {
    return false;
  }
}

function cleanLines(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter((l) => l.length > 0);
}

/** Reads the text lines of a photo or screenshot. Throws OcrError with a friendly message. */
export async function ocrImage(uri: string): Promise<string[]> {
  if (!isOcrSupported()) {
    throw new OcrError('unsupported', 'Reading text from pictures is not available on this device.');
  }
  try {
    return cleanLines(await ocrNative.recognise(uri));
  } catch {
    throw new OcrError('failed', 'The picture could not be read. Try a sharper, well-lit photo or a screenshot.');
  }
}

export const PAGE_BREAK = '';

/** Renders up to maxPages pages of a PDF and reads each. Returns all lines, pages separated by an empty line. */
export async function ocrPdfPages(
  uri: string,
  maxPages = 10,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  if (!isOcrSupported()) {
    throw new OcrError('unsupported', 'Reading scanned PDFs is not available on this device.');
  }
  const out: string[] = [];
  let done = 0;
  for (let page = 0; page < maxPages; page++) {
    let img: string | null;
    try {
      img = await ocrNative.renderPage(uri, page);
    } catch (e) {
      if (page > 0) break;
      const code = (e as { code?: unknown } | null)?.code;
      if (code === 'PASSWORD_PROTECTED') {
        throw new OcrError('password', 'This scanned PDF is protected, so its pages cannot be read. Save an unprotected copy or take screenshots instead.');
      }
      throw new OcrError('failed', 'The PDF pages could not be read.');
    }
    if (img === null) break;
    let lines: string[];
    try {
      lines = cleanLines(await ocrNative.recognise(img));
    } catch {
      throw new OcrError('failed', 'The PDF pages could not be read.');
    }
    if (out.length > 0) out.push(PAGE_BREAK);
    out.push(...lines);
    done++;
    onProgress?.(done, maxPages);
  }
  return out;
}
