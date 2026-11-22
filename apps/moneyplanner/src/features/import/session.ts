// What the import screens share while one import is in progress: the shared item that opened the flow,
// the parsed rows, and (for CSV / Excel) the table and column layout. Lives in memory only.
import { useSyncExternalStore } from 'react';

import type { CsvMapping, ParseResult } from '@/import/parse';
import type { ImportInput } from '@/import/read';

export interface ImportTable {
  rows: string[][];
  delimiter: string;
  /** Excel: which sheet the rows are from. */
  sheet?: number;
}

export interface ImportSession {
  /** A file or text shared into the app, waiting to be read (Pro) or dropped (free). */
  incoming: ImportInput | null;
  result: ParseResult | null;
  sourceName: string;
  fileKind: string;
  /** The cells of a CSV / Excel file, for the column step. */
  table: ImportTable | null;
  /** The layout the rows were read with; saved as the source's template when the import is done. */
  mapping: (CsvMapping & { sheet?: number }) | null;
  /** Why the column step is shown. */
  message: string | null;
  /** Changes with every new result, so the review screen starts fresh. */
  token: number;
}

const EMPTY: ImportSession = { incoming: null, result: null, sourceName: '', fileKind: '', table: null, mapping: null, message: null, token: 0 };

let state: ImportSession = EMPTY;
const listeners = new Set<() => void>();

export const getSession = () => state;

export function setSession(patch: Partial<ImportSession>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Stores a new result and bumps the token, so the review screen starts fresh. */
export function setResult(patch: Partial<ImportSession>): void {
  setSession({ ...patch, token: state.token + 1 });
}

/** Forgets the current import (and any shared item). */
export function resetSession(): void {
  state = { ...EMPTY, token: state.token };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useSession(): ImportSession {
  return useSyncExternalStore(subscribe, getSession, getSession);
}
