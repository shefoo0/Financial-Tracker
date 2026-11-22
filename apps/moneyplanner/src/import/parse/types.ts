// Shapes shared by all statement parsers. Pure TypeScript: no React, no native modules.
import type { Fils, ISODate } from '@/types';

export interface ParsedRow {
  date: ISODate;
  description: string;
  /** Always positive; the direction is in `kind`. */
  amount: Fils;
  kind: 'income' | 'cost';
  /** Running balance after this row, when the statement shows one (negative when overdrawn). */
  balance?: Fils;
  /** The original line (or cells) the row came from, for the review screen. */
  raw: string;
  /** 0-1. Below about 0.7 the row should be shown as "check this". */
  confidence: number;
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  source: 'csv' | 'ofx' | 'text';
  /** Last 4 digits of the account or card, when the statement shows them. */
  account?: string;
  currency?: string;
  period?: { from: ISODate; to: ISODate };
  /** Things that went wrong for the whole file or for skipped lines, in plain English. */
  problems: string[];
}

export interface CategoryRule {
  /** Matched as a case-insensitive "description contains" text. */
  pattern: string;
  categoryId: string;
}

export type DateOrder = 'dmy' | 'mdy';

/** Where each field sits in a CSV file (0-based columns). Serialisable, so it can be remembered per statement source. */
export interface CsvMapping {
  delimiter: string;
  /** Index of the header row among the non-empty rows, or -1 when the file has no header. */
  headerRow: number;
  date: number | null;
  description: number | null;
  debit: number | null;
  credit: number | null;
  /** One signed amount column (used when there is no debit/credit pair). */
  amount: number | null;
  balance: number | null;
  /** A column holding Cr/Dr (or Credit/Debit) per row. */
  direction: number | null;
  dateOrder: DateOrder;
}

export type DedupedRow = ParsedRow & { duplicateOf?: string };

export interface ParseOptions {
  /** "Today" for inferring years and for SMS without a date. Defaults to the device date. */
  today?: ISODate;
}
