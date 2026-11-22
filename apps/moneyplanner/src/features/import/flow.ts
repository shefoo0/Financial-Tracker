// Reading a picked file, photo or text: calls the reader, and for CSV / Excel also keeps the table and the
// column layout (a remembered one for this bank, or a guess) so the review can save it and the column step can fix it.
import type { Repository } from '@/data/repository';
import { guessMappingFromTable, guessXlsxMapping, parseTable, readCsvTable, readXlsx } from '@/import/parse';
import type { CsvMapping, ParseResult } from '@/import/parse';
import { decodeText, readImport, type ImportInput, type ReadOptions } from '@/import/read';
import { readBytes } from '@/import/read/files';

import { toCsvMapping, usable } from './mapping';
import { setResult, type ImportTable } from './session';

/** What the screen does next. */
export type ReadStep =
  | { kind: 'review' }
  | { kind: 'columns' }
  | { kind: 'password'; wrongPassword: boolean }
  | { kind: 'message'; message: string };

const TABULAR = /\.(csv|tsv|xlsx|txt)$/i;
const TABULAR_MIME = /csv|spreadsheetml|comma-separated/i;

const isTabular = (input: ImportInput) => input.kind === 'file' && (TABULAR.test(input.name) || TABULAR_MIME.test(input.mimeType ?? ''));

/** The cells of a CSV or Excel file, plus the layout guessed for them. Null when the file can't be read as a table. */
async function loadTable(uri: string): Promise<{ table: ImportTable; guess: CsvMapping & { sheet?: number } } | null> {
  try {
    const bytes = await readBytes(uri);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const found = guessXlsxMapping(bytes);
      const sheets = readXlsx(bytes).sheets;
      const sheet = found?.sheet ?? Math.max(0, sheets.findIndex((s) => s.rows.length > 0));
      const rows = sheets[sheet]?.rows ?? [];
      if (!rows.length) return null;
      return { table: { rows, delimiter: ',', sheet }, guess: { ...(found?.mapping ?? guessMappingFromTable(rows, ',')), sheet } };
    }
    const { delimiter, rows } = readCsvTable(decodeText(bytes));
    if (!rows.length) return null;
    return { table: { rows, delimiter }, guess: guessMappingFromTable(rows, delimiter) };
  } catch {
    return null;
  }
}

export interface StartReadingArgs {
  repo: Repository;
  /** Free users never get their files read: this is checked here as well as on the screens. */
  isPro: boolean;
  input: ImportInput;
  password?: string;
  onProgress?: ReadOptions['onProgress'];
}

/** Reads one input and stores what the review needs in the session. Never throws. */
export async function startReading({ repo, isPro, input, password, onProgress }: StartReadingArgs): Promise<ReadStep> {
  if (!isPro) return { kind: 'message', message: 'Import is part of Money Planner Pro.' };
  const out = await readImport(input, { password, onProgress });
  if (out.status === 'needsPassword') return { kind: 'password', wrongPassword: !!out.wrongPassword };

  if (out.status === 'empty' && input.kind === 'file' && isTabular(input)) {
    // The guessed columns found nothing: let the user choose them.
    const loaded = await loadTable(input.uri);
    if (loaded) {
      setResult({ result: null, sourceName: input.name, fileKind: /xlsx$/i.test(input.name) ? 'xlsx' : 'csv', table: loaded.table, mapping: loaded.guess, message: out.message });
      return { kind: 'columns' };
    }
  }
  if (out.status !== 'ok') return { kind: 'message', message: out.message };

  let result: ParseResult = out.result;
  let table: ImportTable | null = null;
  let mapping: (CsvMapping & { sheet?: number }) | null = null;
  if (input.kind === 'file' && (out.fileKind === 'csv' || out.fileKind === 'xlsx')) {
    const loaded = await loadTable(input.uri);
    if (loaded) {
      table = loaded.table;
      mapping = loaded.guess;
      // The layout remembered for this bank's file wins over the guess.
      const saved = toCsvMapping((await repo.getImportTemplate(out.sourceName).catch(() => null))?.mapping);
      if (saved && usable(saved)) {
        const again = parseTable(loaded.table.rows, saved, ', ');
        if (again.rows.length > 0) {
          result = again;
          mapping = { ...saved, sheet: loaded.table.sheet };
        }
      }
    }
  }
  setResult({ result, sourceName: out.sourceName, fileKind: out.fileKind, table, mapping, message: null });
  return { kind: 'review' };
}
