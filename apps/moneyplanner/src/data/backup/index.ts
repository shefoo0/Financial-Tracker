import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { BACKUP_FORMAT, BACKUP_VERSION, type BackupData, type Repository } from '@/data/repository';
import { defaultSettings } from '@/data/defaults';
import { isValidISODate } from '@/lib/dates';
import type { Category, OccurrenceOverride, RecurringItem, Settings, Transaction } from '@/types';

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
const isId = (v: unknown): v is string => isStr(v) && v.length > 0;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
/** A money value in fils: a safe integer. */
const isMoney = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isAmount = (v: unknown): v is number => isMoney(v) && v >= 0;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isDate = (v: unknown): v is string => isStr(v) && isValidISODate(v);
const isKind = (v: unknown) => v === 'income' || v === 'cost';
const nullOr = (v: unknown, check: (x: unknown) => boolean) => v === null || check(v);
const inRange = (v: unknown, min: number, max: number) => isInt(v) && v >= min && v <= max;

function isSchedule(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (v.type === 'monthly') {
    return (
      (v.day === 'last' || inRange(v.day, 1, 31)) &&
      (v.everyMonths === undefined || inRange(v.everyMonths, 1, 120))
    );
  }
  if (v.type === 'weekly') return inRange(v.everyWeeks, 1, 52);
  if (v.type === 'yearly') return inRange(v.month, 1, 12) && inRange(v.day, 1, 31);
  return false;
}

const isCategory = (v: unknown): v is Category =>
  isObj(v) && isId(v.id) && isStr(v.name) && isKind(v.kind) && isInt(v.sort) && isBool(v.archived);

const isRecurring = (v: unknown): v is RecurringItem =>
  isObj(v) &&
  isId(v.id) &&
  isKind(v.kind) &&
  isStr(v.name) &&
  nullOr(v.categoryId, isId) &&
  isAmount(v.amount) &&
  isSchedule(v.schedule) &&
  isDate(v.startDate) &&
  nullOr(v.endDate, isDate) &&
  nullOr(v.count, (c) => isInt(c) && (c as number) >= 1) &&
  isStr(v.note);

const isOverride = (v: unknown): v is OccurrenceOverride =>
  isObj(v) &&
  isId(v.id) &&
  isId(v.recurringId) &&
  isDate(v.originalDate) &&
  isBool(v.skip) &&
  nullOr(v.newDate, isDate) &&
  nullOr(v.newAmount, isAmount) &&
  isBool(v.paid) &&
  // Moving an occurrence to its own date is stored as "no move" (null), so it can't appear in a real backup.
  v.newDate !== v.originalDate;

const isTransaction = (v: unknown): v is Transaction =>
  isObj(v) &&
  isId(v.id) &&
  isKind(v.kind) &&
  isDate(v.date) &&
  isStr(v.description) &&
  nullOr(v.categoryId, isId) &&
  isAmount(v.amount) &&
  isStr(v.note) &&
  (v.source === 'manual' || v.source === 'import') &&
  nullOr(v.importId, isStr) &&
  isBool(v.planned);

/** Only these keys are read from a backup; anything else is ignored. */
function readSettings(v: unknown): Settings | null {
  if (!isObj(v)) return null;
  const base = defaultSettings();
  const { enabledModules: em, alertThresholds: at } = v;
  if (!isObj(em) || !Object.values(em).every(isBool)) return null;
  if (!isObj(at) || !Object.values(at).every(isInt)) return null;
  if (
    !isStr(v.currency) ||
    !nullOr(v.payday, (p) => inRange(p, 1, 31)) ||
    !isMoney(v.startingBalance) ||
    !isDate(v.startingBalanceDate) ||
    !isMoney(v.buffer) ||
    !isBool(v.onboarded) ||
    !isBool(v.lockEnabled)
  ) {
    return null;
  }
  const modules = { ...base.enabledModules };
  for (const k of Object.keys(modules) as (keyof typeof modules)[]) if (isBool(em[k])) modules[k] = em[k] as boolean;
  const thresholds = { ...base.alertThresholds };
  for (const k of Object.keys(thresholds) as (keyof typeof thresholds)[]) if (isInt(at[k])) thresholds[k] = at[k] as number;
  return {
    currency: v.currency,
    payday: v.payday as number | null,
    startingBalance: v.startingBalance,
    startingBalanceDate: v.startingBalanceDate,
    buffer: v.buffer,
    enabledModules: modules,
    alertThresholds: thresholds,
    onboarded: v.onboarded,
    // A backup from another phone must not lock the user out of this one.
    lockEnabled: false,
  };
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
  const settings = readSettings(raw.settings);
  if (
    !isStr(raw.exportedAt) ||
    !settings ||
    !listOk(raw.categories, isCategory) ||
    !listOk(raw.recurring, isRecurring) ||
    !listOk(raw.overrides, isOverride) ||
    !listOk(raw.transactions, isTransaction)
  ) {
    throw new Error(DAMAGED);
  }
  return { ...(raw as unknown as BackupData), settings };
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

/** Deletes a cache file, ignoring errors: financial data shouldn't linger, but cleanup must not fail the action. */
function removeQuietly(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // nothing more to do
  }
}

async function writeAndShare(fileName: string, text: string, mimeType: string, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  try {
    await file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
  } finally {
    removeQuietly(file);
  }
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
  const picked0 = new File(picked.assets[0].uri);
  let text: string;
  try {
    text = await picked0.text();
  } catch {
    throw new Error("Couldn't read that file. Try picking it again.");
  } finally {
    removeQuietly(picked0);
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
