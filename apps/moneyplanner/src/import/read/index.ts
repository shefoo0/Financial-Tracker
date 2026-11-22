import { parseCsv, parseOfx, parseSmsText, parseStatementText, parseXlsx } from '../parse';
import type { ParseResult } from '../parse';
import { isOcrSupported, ocrImage, ocrPdfPages, OcrError } from '../ocr';
import { extractPdfText } from '../pdf';
import { readBytes } from './files';

export type FileKind = 'csv' | 'xlsx' | 'ofx' | 'pdf' | 'image' | 'text';

export type ImportInput =
  | { kind: 'file'; uri: string; name: string; mimeType?: string | null }
  | { kind: 'text'; text: string };

export interface ReadOptions {
  password?: string;
  /** Called while slow steps run (scanned PDFs and photos). */
  onProgress?: (info: { step: 'reading' | 'ocr'; done?: number; total?: number }) => void;
}

export type ReadOutcome =
  | { status: 'ok'; result: ParseResult; sourceName: string; fileKind: FileKind }
  | { status: 'needsPassword'; wrongPassword?: boolean }
  | { status: 'unsupported' | 'empty' | 'error'; message: string };

export const PASSWORD_MESSAGE =
  "This PDF is protected. Enter its password (often your date of birth or card digits — check your bank's email).";
const EMPTY_MESSAGE = 'No transactions were found. Check that this is a statement, or try a different export (CSV is the most reliable).';
const MAX_OCR_PAGES = 10;

const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i;

function kindFromName(name: string, mime?: string | null): FileKind | null {
  const n = name.toLowerCase();
  const m = (mime ?? '').toLowerCase();
  if (/\.xlsx$/.test(n) || m.includes('spreadsheetml')) return 'xlsx';
  if (/\.(ofx|qfx)$/.test(n) || m.includes('ofx')) return 'ofx';
  if (/\.pdf$/.test(n) || m === 'application/pdf') return 'pdf';
  if (IMAGE_EXT.test(n) || m.startsWith('image/')) return 'image';
  if (/\.(csv|tsv)$/.test(n) || m === 'text/csv' || m === 'text/comma-separated-values') return 'csv';
  if (/\.txt$/.test(n) || m === 'text/plain') return 'text';
  return null;
}

function kindFromBytes(b: Uint8Array): FileKind | null {
  const ascii = (from: number, len: number) => String.fromCharCode(...Array.from(b.subarray(from, from + len)));
  if (ascii(0, 5) === '%PDF-') return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4b) return 'xlsx';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image';
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return 'image';
  if (ascii(4, 4) === 'ftyp') return 'image';
  return null;
}

/** Bytes -> text, handling UTF-8 and UTF-16 byte-order marks (some bank exports are UTF-16). */
export function decodeText(b: Uint8Array): string {
  let enc = 'utf-8';
  let start = 0;
  if (b[0] === 0xff && b[1] === 0xfe) {
    enc = 'utf-16le';
    start = 2;
  } else if (b[0] === 0xfe && b[1] === 0xff) {
    enc = 'utf-16be';
    start = 2;
  } else if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) start = 3;
  const view = b.subarray(start);
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder(enc).decode(view);
    } catch {
      /* fall through */
    }
  }
  let s = '';
  for (let i = 0; i < view.length; i += 8192) s += String.fromCharCode(...Array.from(view.subarray(i, i + 8192)));
  try {
    return decodeURIComponent(escape(s));
  } catch {
    return s;
  }
}

function nonEmptyLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function looksLikeOfx(text: string): boolean {
  return /^\s*(OFXHEADER|<\?xml|<OFX)/i.test(text) && /<OFX>|OFXHEADER/i.test(text);
}

/** True when most of the first lines share the same count (>= 2) of one delimiter. */
function looksDelimited(text: string): boolean {
  const lines = nonEmptyLines(text).slice(0, 12);
  if (lines.length < 2) return false;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const common = counts.filter((c) => c === counts[0]).length;
    if (counts[0] >= 2 && common >= Math.ceil(lines.length * 0.6)) return true;
  }
  return false;
}

function better(a: ParseResult, b: ParseResult): ParseResult {
  return b.rows.length > a.rows.length ? b : a;
}

/** Parses text that is a table export or a statement copied as text. */
function parseTextual(text: string): ParseResult {
  if (looksLikeOfx(text)) return parseOfx(text);
  if (looksDelimited(text)) {
    const csv = parseCsv(text);
    if (csv.rows.length > 0) return csv;
    return better(csv, parseStatementText(text));
  }
  const st = parseStatementText(text);
  return st.rows.length > 0 ? st : better(st, parseCsv(text));
}

function done(result: ParseResult, sourceName: string, fileKind: FileKind): ReadOutcome {
  if (result.rows.length === 0) {
    return { status: 'empty', message: result.problems[0] ? `${EMPTY_MESSAGE} (${result.problems[0]})` : EMPTY_MESSAGE };
  }
  return { status: 'ok', result, sourceName, fileKind };
}

async function readPdf(uri: string, name: string, opts: ReadOptions): Promise<ReadOutcome> {
  opts.onProgress?.({ step: 'reading' });
  const pdf = await extractPdfText(uri, opts.password);
  if (pdf.needsPassword) return { status: 'needsPassword', wrongPassword: !!pdf.error };
  if (pdf.unavailable && !isOcrSupported()) {
    return { status: 'unsupported', message: 'Reading PDFs is not available here. Open Money Planner on your phone, or import a CSV, Excel or OFX file instead.' };
  }
  if (pdf.error && !pdf.unavailable) return { status: 'error', message: pdf.error };
  let text = pdf.text;
  if (pdf.unavailable || pdf.isScanned) {
    // Scanned (or no text reader): render pages and read them as pictures.
    if (!isOcrSupported()) {
      return { status: 'unsupported', message: 'This PDF looks scanned and reading scanned pages is not available on this device. Try a PDF downloaded from your bank app, or a CSV export.' };
    }
    if (opts.password) {
      return { status: 'error', message: 'This protected PDF has no readable text (it looks scanned). Save an unprotected copy, or screenshot its pages and import the screenshots.' };
    }
    try {
      const lines = await ocrPdfPages(uri, MAX_OCR_PAGES, (d, t) => opts.onProgress?.({ step: 'ocr', done: d, total: t }));
      text = lines.join('\n');
    } catch (e) {
      return { status: 'error', message: e instanceof OcrError ? e.message : 'The PDF pages could not be read.' };
    }
  }
  if (!text.trim()) return { status: 'empty', message: EMPTY_MESSAGE };
  return done(parseStatementText(text), name, 'pdf');
}

async function readImage(uri: string, name: string, opts: ReadOptions): Promise<ReadOutcome> {
  if (!isOcrSupported()) {
    return { status: 'unsupported', message: 'Reading text from pictures is not available here. Use the installed app on your phone, or import a CSV, Excel or OFX file.' };
  }
  opts.onProgress?.({ step: 'ocr', done: 0, total: 1 });
  try {
    const lines = await ocrImage(uri);
    if (lines.length === 0) return { status: 'empty', message: 'No text was found in the picture. Try a sharper photo or a screenshot.' };
    opts.onProgress?.({ step: 'ocr', done: 1, total: 1 });
    return done(parseStatementText(lines.join('\n')), name, 'image');
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'The picture could not be read.' };
  }
}

/** Turns a picked file, photo or shared text into parsed transactions. Never throws. */
export async function readImport(input: ImportInput, opts: ReadOptions = {}): Promise<ReadOutcome> {
  try {
    if (input.kind === 'text') {
      const text = input.text;
      if (!text.trim()) return { status: 'empty', message: 'There is no text to read.' };
      const name = 'Shared text';
      if (looksLikeOfx(text)) return done(parseOfx(text), name, 'ofx');
      const sms = parseSmsText(text);
      if (sms.rows.length > 0 && nonEmptyLines(text).length < 3) return done(sms, name, 'text');
      if (nonEmptyLines(text).length >= 2) {
        const full = parseTextual(text);
        return done(full.rows.length > 0 || sms.rows.length === 0 ? better(sms, full) : sms, name, 'text');
      }
      return done(sms, name, 'text');
    }

    let kind = kindFromName(input.name, input.mimeType);
    let bytes: Uint8Array | null = null;
    if (kind === null || kind === 'text') {
      bytes = await readBytes(input.uri);
      const sniffed = kindFromBytes(bytes);
      if (sniffed) kind = sniffed;
      else if (kind === null) kind = 'text';
    }
    switch (kind) {
      case 'pdf':
        return await readPdf(input.uri, input.name, opts);
      case 'image':
        return await readImage(input.uri, input.name, opts);
      case 'xlsx': {
        bytes ??= await readBytes(input.uri);
        return done(parseXlsx(bytes), input.name, 'xlsx');
      }
      case 'ofx': {
        bytes ??= await readBytes(input.uri);
        return done(parseOfx(decodeText(bytes)), input.name, 'ofx');
      }
      case 'csv': {
        bytes ??= await readBytes(input.uri);
        return done(parseCsv(decodeText(bytes)), input.name, 'csv');
      }
      default: {
        const text = decodeText(bytes ?? (await readBytes(input.uri)));
        if (!text.trim()) return { status: 'empty', message: 'This file is empty.' };
        if (/[\u0000-\u0008]/.test(text.slice(0, 2000))) {
          return { status: 'unsupported', message: 'This file type is not supported. Use a PDF, CSV, Excel (.xlsx), OFX or a picture of your statement.' };
        }
        const r = parseTextual(text);
        return done(r, input.name, r.source === 'ofx' ? 'ofx' : r.source === 'csv' ? 'csv' : 'text');
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/zip|unzip|invalid|corrupt/i.test(msg)) {
      return { status: 'error', message: 'This file could not be opened. It may be damaged or in an unexpected format.' };
    }
    return { status: 'error', message: 'This file could not be read. Try again, or use a different export.' };
  }
}
