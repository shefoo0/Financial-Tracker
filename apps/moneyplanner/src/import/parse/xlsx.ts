import { unzipSync } from 'fflate';
import { addDays } from '@/lib/dates';
import { guessMappingFromTable, parseTable } from './csv';
import { normaliseDigits } from './normalize';
import type { CsvMapping, ParseResult } from './types';

export interface XlsxSheet {
  name: string;
  /** Cells as text, columns in place (gaps are ''). Empty rows are dropped. */
  rows: string[][];
}

export interface XlsxRead {
  sheets: XlsxSheet[];
  /** Plain-English notes: a damaged file, sheets cut at the row limit. */
  problems: string[];
}

export const XLSX_MAX_ROWS = 20000;
const MAX_PART_BYTES = 80 * 1024 * 1024;
const MAX_COLUMNS = 200;

// ---- XML helpers (the few tags a workbook needs; no DOM in React Native) ----

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = decode(m[2] ?? m[3] ?? '');
  return out;
}

/** The text in all <t> elements of a fragment, skipping phonetic runs. Covers rich text (several <r><t>). */
function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of clean.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += m[1] ?? '';
  return decode(out);
}

const utf8 = (b: Uint8Array): string => {
  let s = '';
  try {
    s = new TextDecoder('utf-8').decode(b);
  } catch {
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  }
  return s.replace(/^﻿/, '');
};

/** "C5" -> 2 (0-based column). */
function colIndex(ref: string): number {
  const m = /^([A-Za-z]+)/.exec(ref);
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ---- Dates ----

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** Does a number format code show a date or time? ("dd/mm/yyyy", "[$-409]d-mmm-yy", not "0.00" or "General"). */
export function isDateFormatCode(code: string): boolean {
  const stripped = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').replace(/_./g, '');
  return /[dmyhs]/i.test(stripped.replace(/general/gi, '')) && !/^[#0?,.%\s]*$/.test(stripped);
}

function dateStyles(styles: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!styles) return out;
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    if (a.numFmtId) custom.set(Number(a.numFmtId), a.formatCode ?? '');
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles);
  if (!xfs) return out;
  let i = 0;
  for (const m of xfs[1].matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)) {
    const id = Number(attrs(m[1]).numFmtId ?? 0);
    if (custom.has(id) ? isDateFormatCode(custom.get(id) as string) : BUILTIN_DATE_FORMATS.has(id)) out.add(i);
    i++;
  }
  return out;
}

/** A plain number as text: the 15-digit noise Excel stores ("1234.5600000000001") is rounded away. */
function numberText(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(raw === '' ? NaN : n)) return raw;
  return /\.\d{3,}/.test(raw) || /e/i.test(raw) ? String(Math.round(n * 100) / 100) : raw;
}

// ---- Reading ----

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textOf(m[1] ?? ''));
}

function readSheet(xml: string, shared: string[], dates: Set<number>, date1904: boolean): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let truncated = false;
  let seen = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (++seen > XLSX_MAX_ROWS) {
      truncated = true;
      break;
    }
    const body = rm[2] ?? '';
    const cells: string[] = [];
    let next = 0;
    for (const cm of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attrs(cm[1]);
      let col = a.r ? colIndex(a.r) : next;
      if (col < 0) col = next;
      next = col + 1;
      if (col >= MAX_COLUMNS) continue;
      const inner = cm[2] ?? '';
      const v = /<v\b[^>]*?>([\s\S]*?)<\/v>/.exec(inner);
      let text = '';
      switch (a.t) {
        case 's':
          text = v ? (shared[Number(v[1])] ?? '') : '';
          break;
        case 'inlineStr':
          text = textOf(inner.replace(/^[\s\S]*?<is\b[^>]*>/, '').replace(/<\/is>[\s\S]*$/, ''));
          break;
        case 'str':
        case 'd':
          text = v ? decode(v[1]) : '';
          break;
        case 'b':
          text = v ? (v[1].trim() === '1' ? 'TRUE' : 'FALSE') : '';
          break;
        case 'e':
          text = '';
          break;
        default: {
          const raw = v ? decode(v[1]).trim() : '';
          const n = Number(raw);
          if (raw !== '' && Number.isFinite(n) && a.s !== undefined && dates.has(Number(a.s)) && n >= 1) {
            text = addDays(date1904 ? '1904-01-01' : '1899-12-30', Math.floor(n));
          } else text = numberText(raw);
        }
      }
      while (cells.length < col) cells.push('');
      cells[col] = normaliseDigits(text).trim();
    }
    if (cells.some((c) => c !== '')) rows.push(cells.map((c) => c ?? ''));
  }
  return { rows, truncated };
}

/** Reads the sheets of an .xlsx file as text tables. Never throws: a damaged file gives no sheets and a problem. */
export function readXlsx(bytes: Uint8Array): XlsxRead {
  const out: XlsxRead = { sheets: [], problems: [] };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX_PART_BYTES && /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/i.test(f.name) });
  } catch {
    out.problems.push('This file could not be opened as an Excel (.xlsx) workbook. It may be damaged or in the older .xls format; save it as .xlsx or CSV.');
    return out;
  }
  const text = (name: string) => (files[name] ? utf8(files[name]) : undefined);
  try {
    const workbook = text('xl/workbook.xml');
    const rels = text('xl/_rels/workbook.xml.rels');
    if (!workbook && !Object.keys(files).some((n) => n.startsWith('xl/worksheets/'))) {
      out.problems.push('This does not look like an Excel (.xlsx) workbook.');
      return out;
    }
    const shared = sharedStrings(text('xl/sharedStrings.xml'));
    const dates = dateStyles(text('xl/styles.xml'));
    const date1904 = /<workbookPr\b[^>]*\bdate1904\s*=\s*["'](1|true)["']/i.test(workbook ?? '');

    const targets = new Map<string, string>();
    for (const m of (rels ?? '').matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
      const a = attrs(m[1]);
      if (a.Id && a.Target) {
        const t = a.Target.replace(/^\/+/, '');
        targets.set(a.Id, t.startsWith('xl/') ? t : `xl/${t}`);
      }
    }
    const listed: { name: string; path: string }[] = [];
    for (const m of (workbook ?? '').matchAll(/<sheet\b([^>]*?)\/?>/g)) {
      const a = attrs(m[1]);
      const path = targets.get(a['r:id'] ?? a.id ?? '');
      if (path && files[path]) listed.push({ name: a.name || `Sheet ${listed.length + 1}`, path });
    }
    if (!listed.length) {
      Object.keys(files)
        .filter((n) => /^xl\/worksheets\/[^/]+\.xml$/i.test(n))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .forEach((path, i) => listed.push({ name: `Sheet ${i + 1}`, path }));
    }
    for (const s of listed) {
      const { rows, truncated } = readSheet(text(s.path) ?? '', shared, dates, date1904);
      if (truncated) out.problems.push(`Sheet "${s.name}" has more than ${XLSX_MAX_ROWS.toLocaleString('en-US')} rows; only the first ${XLSX_MAX_ROWS.toLocaleString('en-US')} were read.`);
      out.sheets.push({ name: s.name, rows });
    }
    if (!out.sheets.length) out.problems.push('The workbook has no sheets.');
  } catch {
    out.problems.push('The workbook could not be read. It may be damaged.');
    out.sheets = [];
  }
  return out;
}

const usable = (m: CsvMapping) => m.date !== null && (m.amount !== null || m.debit !== null || m.credit !== null);

/** The mapping guessed for each sheet that looks like a transaction table (first one is what parseXlsx reads). */
export function guessXlsxMapping(bytes: Uint8Array): { sheet: number; name: string; mapping: CsvMapping } | null {
  const { sheets } = readXlsx(bytes);
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].rows.length < 2) continue;
    const mapping = guessMappingFromTable(sheets[i].rows, ',');
    if (usable(mapping) && parseTable(sheets[i].rows, mapping, ', ').rows.length) return { sheet: i, name: sheets[i].name, mapping };
  }
  return null;
}

/**
 * Parses an .xlsx statement: the first sheet that looks like a transaction table (or `sheet`, when
 * given) goes through the CSV mapping pipeline. Never throws.
 */
export function parseXlsx(bytes: Uint8Array, mapping?: CsvMapping, sheet?: number): ParseResult {
  const empty: ParseResult = { rows: [], source: 'csv', problems: [] };
  let read: XlsxRead;
  try {
    read = readXlsx(bytes);
  } catch {
    return { ...empty, problems: ['This file could not be read as an Excel workbook.'] };
  }
  if (!read.sheets.length) return { ...empty, problems: read.problems.length ? read.problems : ['The workbook has no sheets.'] };

  let chosen: { name: string; rows: string[][]; map: CsvMapping } | null = null;
  if (sheet !== undefined && read.sheets[sheet]) {
    const s = read.sheets[sheet];
    chosen = { name: s.name, rows: s.rows, map: mapping ?? guessMappingFromTable(s.rows, ',') };
  } else if (mapping) {
    const s = read.sheets.find((x) => x.rows.length) ?? read.sheets[0];
    chosen = { name: s.name, rows: s.rows, map: mapping };
  } else {
    for (const s of read.sheets) {
      if (s.rows.length < 2) continue;
      const map = guessMappingFromTable(s.rows, ',');
      if (usable(map) && parseTable(s.rows, map, ', ').rows.length) {
        chosen = { name: s.name, rows: s.rows, map };
        break;
      }
    }
  }
  if (!chosen) {
    return { ...empty, problems: [...read.problems, 'No sheet in this workbook looks like a list of transactions (it needs a date column and an amount, or debit and credit, column).'] };
  }
  let result: ParseResult;
  try {
    result = parseTable(chosen.rows, chosen.map, ', ');
  } catch {
    return { ...empty, problems: [...read.problems, 'The sheet could not be read.'] };
  }
  result.problems = [...read.problems, ...result.problems];
  if (read.sheets.length > 1) result.problems.push(`Read the sheet "${chosen.name}".`);
  return result;
}
