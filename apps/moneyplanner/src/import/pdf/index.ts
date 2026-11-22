import { pdfNative } from './native';

export interface PdfTextResult {
  text: string;
  pages: number;
  /** The PDF is locked and no password (or a wrong one) was given. */
  needsPassword: boolean;
  /** Little or no text per page: the PDF is probably a scan, so read it with OCR. */
  isScanned: boolean;
  /** Set when the PDF could not be read at all (plain English). */
  error?: string;
  /** The text reader is not available here (web, Expo Go). */
  unavailable?: boolean;
}

/** Fewer letters/digits than this per page counts as "no text layer". */
export const MIN_CHARS_PER_PAGE = 25;

function codeOf(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (typeof code === 'string') {
    if (code.includes('INCORRECT_PASSWORD') || code.includes('PASSWORD_REQUIRED')) return code;
  }
  if (/password/i.test(msg) && /(incorrect|wrong|required|protected|encrypted)/i.test(msg)) return 'PASSWORD_REQUIRED';
  return typeof code === 'string' ? code : 'UNKNOWN';
}

/** Reads the embedded text of a PDF. Never throws: problems come back as fields. */
export async function extractPdfText(uri: string, password?: string): Promise<PdfTextResult> {
  const base: PdfTextResult = { text: '', pages: 0, needsPassword: false, isScanned: false };
  let available = false;
  try {
    available = pdfNative.isAvailable();
  } catch {
    available = false;
  }
  if (!available) {
    return { ...base, unavailable: true, error: 'Reading PDFs needs the installed app (not available here).' };
  }
  try {
    const pw = password && password.length > 0 ? password : undefined;
    const text = await pdfNative.extractText(uri, pw);
    let pages = 1;
    try {
      pages = Math.max(1, await pdfNative.getPageCount(uri, pw));
    } catch {
      pages = Math.max(1, text.split('\f').length);
    }
    const chars = text.replace(/[^\p{L}\p{N}]/gu, '').length;
    return { ...base, text, pages, isScanned: chars < MIN_CHARS_PER_PAGE * pages };
  } catch (e) {
    const code = codeOf(e);
    if (code === 'PASSWORD_REQUIRED' || code === 'INCORRECT_PASSWORD') {
      return { ...base, needsPassword: true, error: code === 'INCORRECT_PASSWORD' ? 'That password did not open the PDF.' : undefined };
    }
    return { ...base, error: "This PDF could not be read. It may be damaged or not a real PDF." };
  }
}
