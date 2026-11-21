import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { BACKUP_FORMAT, BACKUP_VERSION, type BackupData, type Repository } from '@/data/repository';
import type { Category, OccurrenceOverride, RecurringItem, Transaction } from '@/types';

const NOT_A_BACKUP = "This file isn't a Money Planner backup.";
const DAMAGED = "This backup file looks damaged, so it can't be restored.";

// ---- Pure parts (no native modules) ----

/** Turns a backup into the text written to a .json file. */
export function serializeBackup(data: BackupData): string {
  return JSON.stringify(data, null, 2);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isDate = (v: unknown): v is string => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isKind = (v: unknown) => v === 'income' || v === 'cost';
const nullOr = (v: unknown, check: (x: unknown) => boolean) => v === null || check(v);

function isSchedule(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (v.type === 'monthly') {
    return (
      (v.day === 'last' || isInt(v.day)) && (v.everyMonths === undefined || isInt(v.everyMonths))
    );
  }
  if (v.type === 'weekly') return isInt(v.everyWeeks);
  if (v.type === 'yearly') return isInt(v.month) && isInt(v.day);
  return false;
}

const isCategory = (v: unknown): v is Category =>
  isObj(v) && isStr(v.id) && isStr(v.name) && isKind(v.kind) && isInt(v.sort) && isBool(v.archived);

const isRecurring = (v: unknown): v is RecurringItem =>
  isObj(v) &&
  isStr(v.id) &&
  isKind(v.kind) &&
  isStr(v.name) &&
  nullOr(v.categoryId, isStr) &&
  isInt(v.amount) &&
  isSchedule(v.schedule) &&
  isDate(v.startDate) &&
  nullOr(v.endDate, isDate) &&
  nullOr(v.count, isInt) &&
  isStr(v.note);

const isOverride = (v: unknown): v is OccurrenceOverride =>
  isObj(v) &&
  isStr(v.id) &&
  isStr(v.recurringId) &&
  isDate(v.originalDate) &&
  isBool(v.skip) &&
  nullOr(v.newDate, isDate) &&
  nullOr(v.newAmount, isInt) &&
  isBool(v.paid);

const isTransaction = (v: unknown): v is Transaction =>
  isObj(v) &&
  isStr(v.id) &&
  isKind(v.kind) &&
  isDate(v.date) &&
  isStr(v.description) &&
  nullOr(v.categoryId, isStr) &&
  isInt(v.amount) &&
  isStr(v.note) &&
  (v.source === 'manual' || v.source === 'import') &&
  nullOr(v.importId, isStr) &&
  isBool(v.planned);

function isSettings(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.currency) &&
    nullOr(v.payday, isInt) &&
    isInt(v.startingBalance) &&
    isDate(v.startingBalanceDate) &&
    isInt(v.buffer) &&
    isObj(v.enabledModules) &&
    Object.values(v.enabledModules).every(isBool) &&
    isObj(v.alertThresholds) &&
    Object.values(v.alertThresholds).every(isInt) &&
    isBool(v.onboarded) &&
    isBool(v.lockEnabled)
  );
}

/** Reads backup file text. Throws an Error with a user-friendly message if it isn't a valid backup. */
export function parseBackup(text: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw new Error(NOT_A_BACKUP);
  if (!isInt(raw.version) || raw.version < 1) throw new Error(DAMAGED);
  if (raw.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app. Update the app and try again.');
  const listOk = (v: unknown, check: (x: unknown) => boolean) => Array.isArray(v) && v.every(check);
  if (
    !isStr(raw.exportedAt) ||
    !isSettings(raw.settings) ||
    !listOk(raw.categories, isCategory) ||
    !listOk(raw.recurring, isRecurring) ||
    !listOk(raw.overrides, isOverride) ||
    !listOk(raw.transactions, isTransaction)
  ) {
    throw new Error(DAMAGED);
  }
  return raw as unknown as BackupData;
}

/** One CSV field, quoted when it holds a comma, quote or line break. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Free text for a spreadsheet: a leading = + - @ would be run as a formula, so prefix it with an apostrophe. */
const safeText = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** Integer fils to '1234.50'. */
export function filsToDecimal(fils: number): string {
  const sign = fils < 0 ? '-' : '';
  const abs = Math.abs(Math.round(fils));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Builds the CSV text for the one-time items. Rows are sorted by date. */
export function buildTransactionsCsv(transactions: Transaction[], categories: Category[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const rows = [['Date', 'Type', 'Description', 'Category', 'Amount', 'Note', 'Planned']];
  const sorted = [...transactions].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
  for (const t of sorted) {
    rows.push([
      t.date,
      t.kind === 'income' ? 'Income' : 'Cost',
      safeText(t.description),
      safeText(t.categoryId ? (names.get(t.categoryId) ?? '') : ''),
      filsToDecimal(t.amount),
      safeText(t.note),
      t.planned ? 'Yes' : 'No',
    ]);
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

const dateStamp = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---- Files and sharing ----

async function writeAndShare(fileName: string, text: string, mimeType: string, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}

/** Writes a backup file and opens the share sheet so the user can save it (Files, Drive, email...). */
export async function exportBackup(repo: Repository): Promise<void> {
  const data = await repo.exportAll();
  await writeAndShare(`money-planner-backup-${dateStamp()}.json`, serializeBackup(data), 'application/json', 'Save your Money Planner backup');
}

/** Lets the user pick a backup file and, after `confirm()` resolves true, replaces all data with it. */
export async function restoreBackupFromFile(
  repo: Repository,
  confirm: (summary: { exportedAt: string; recurring: number; transactions: number }) => Promise<boolean>,
): Promise<'restored' | 'cancelled'> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]) return 'cancelled';
  let text: string;
  try {
    text = await new File(picked.assets[0].uri).text();
  } catch {
    throw new Error("Couldn't read that file. Try picking it again.");
  }
  const data = parseBackup(text);
  const ok = await confirm({
    exportedAt: data.exportedAt,
    recurring: data.recurring.length,
    transactions: data.transactions.length,
  });
  if (!ok) return 'cancelled';
  await repo.importAll(data);
  return 'restored';
}

/** Writes all one-time items as a CSV file and opens the share sheet. */
export async function exportTransactionsCsv(repo: Repository): Promise<void> {
  const [transactions, categories] = await Promise.all([repo.listTransactions(), repo.listCategories()]);
  await writeAndShare(`money-planner-transactions-${dateStamp()}.csv`, buildTransactionsCsv(transactions, categories), 'text/csv', 'Save your Money Planner transactions');
}
