import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { BACKUP_FORMAT, BACKUP_VERSION, type BackupData, type Repository } from '@/data/repository';
import { CHART_STYLE_NAMES } from '@/constants/theme';
import { defaultSettings } from '@/data/defaults';
import { isValidISODate } from '@/lib/dates';
import type {
  ChartStyle,
  Category,
  CategoryRuleRecord,
  Cheque,
  Debt,
  DebtOverride,
  DebtPayment,
  ImportRecord,
  ImportTemplate,
  OccurrenceOverride,
  RecurringItem,
  Settings,
  Transaction,
} from '@/types';

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
  isObj(v) && isId(v.id) && isStr(v.name) && isKind(v.kind) && isInt(v.sort) && isBool(v.archived) && (v.monthlyLimit === undefined || nullOr(v.monthlyLimit, isAmount));

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

const isRate = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000;

/** Checks one debt and returns it with only the known keys, or null. Cross-references are checked in parseBackup. */
function readDebt(v: unknown): Debt | null {
  if (!isObj(v) || !isId(v.id) || !isStr(v.name) || !isStr(v.note) || !isBool(v.archived) || !isDate(v.createdAt)) return null;
  const base = { id: v.id, name: v.name, note: v.note, archived: v.archived, createdAt: v.createdAt };
  if (v.type === 'loan') {
    if (
      !isAmount(v.balance) || !isDate(v.balanceDate) || !isAmount(v.monthlyPayment) || !inRange(v.paymentDay, 1, 31) ||
      !nullOr(v.annualRatePct, isRate) || !nullOr(v.endDate, isDate)
    ) {
      return null;
    }
    return {
      ...base, type: 'loan', balance: v.balance, balanceDate: v.balanceDate, monthlyPayment: v.monthlyPayment,
      paymentDay: v.paymentDay as number, annualRatePct: v.annualRatePct as number | null, endDate: v.endDate as string | null,
    };
  }
  if (v.type === 'card') {
    if (
      !isAmount(v.limit) || !isAmount(v.balance) || !isDate(v.balanceDate) || !inRange(v.statementDay, 1, 31) ||
      !inRange(v.dueDay, 1, 31) || typeof v.minPct !== 'number' || !(v.minPct >= 0 && v.minPct <= 100) ||
      !isAmount(v.minFloor) || !isRate(v.monthlyRatePct) || !(v.plan === 'full' || v.plan === 'minimum' || v.plan === 'fixed') ||
      !nullOr(v.fixedAmount, isAmount)
    ) {
      return null;
    }
    return {
      ...base, type: 'card', limit: v.limit, balance: v.balance, balanceDate: v.balanceDate,
      statementDay: v.statementDay as number, dueDay: v.dueDay as number, minPct: v.minPct, minFloor: v.minFloor,
      monthlyRatePct: v.monthlyRatePct as number, plan: v.plan, fixedAmount: v.fixedAmount as number | null,
    };
  }
  if (v.type === 'plan') {
    if (
      !isAmount(v.total) || !isAmount(v.monthlyAmount) || !isDate(v.firstPaymentDate) ||
      !(isInt(v.payments) && v.payments >= 1) || !nullOr(v.cardId, isId)
    ) {
      return null;
    }
    return {
      ...base, type: 'plan', total: v.total, monthlyAmount: v.monthlyAmount, firstPaymentDate: v.firstPaymentDate,
      payments: v.payments, cardId: v.cardId as string | null,
    };
  }
  return null;
}

const isDebtPayment = (v: unknown): v is DebtPayment =>
  isObj(v) &&
  isId(v.id) &&
  isId(v.debtId) &&
  isDate(v.date) &&
  isAmount(v.amount) &&
  (v.kind === 'regular' || v.kind === 'extra' || v.kind === 'partial') &&
  isStr(v.note);

const isDebtOverride = (v: unknown): v is DebtOverride =>
  isObj(v) &&
  isId(v.id) &&
  isId(v.debtId) &&
  isDate(v.originalDate) &&
  nullOr(v.newDate, isDate) &&
  nullOr(v.newAmount, isAmount) &&
  isBool(v.skip) &&
  v.newDate !== v.originalDate;

const isCheque = (v: unknown): v is Cheque =>
  isObj(v) &&
  isId(v.id) &&
  isStr(v.payee) &&
  isAmount(v.amount) &&
  isDate(v.date) &&
  isStr(v.purpose) &&
  (v.status === 'upcoming' || v.status === 'cleared' || v.status === 'cancelled') &&
  nullOr(v.seriesId, isId) &&
  isStr(v.note);

const isImportRecord = (v: unknown): v is ImportRecord =>
  isObj(v) && isId(v.id) && isStr(v.sourceName) && isStr(v.fileKind) && isStr(v.importedAt) && isInt(v.rowCount) && v.rowCount >= 0;

const isImportTemplate = (v: unknown): v is ImportTemplate =>
  isObj(v) && isId(v.sourceName) && isObj(v.mapping) && isStr(v.lastUsed);

const isCategoryRule = (v: unknown): v is CategoryRuleRecord =>
  isObj(v) && isId(v.id) && isId(v.pattern) && isId(v.categoryId) && isStr(v.createdAt);

const hasUniqueIds = (list: { id: string }[]) => new Set(list.map((x) => x.id)).size === list.length;

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
  const bills = { ...base.billReminders };
  const br = v.billReminders;
  if (isObj(br)) {
    if (isBool(br.on)) bills.on = br.on;
    if (isInt(br.leadDays) && br.leadDays >= 0 && br.leadDays <= 3) bills.leadDays = br.leadDays;
    if (Array.isArray(br.muted) && br.muted.every(isStr)) bills.muted = [...br.muted];
  }
  return {
    currency: v.currency,
    payday: v.payday as number | null,
    startingBalance: v.startingBalance,
    startingBalanceDate: v.startingBalanceDate,
    buffer: v.buffer,
    enabledModules: modules,
    alertThresholds: thresholds,
    billReminders: bills,
    onboarded: v.onboarded,
    // A backup from another phone must not lock the user out of this one.
    lockEnabled: false,
    chartStyle: isStr(v.chartStyle) && (CHART_STYLE_NAMES as readonly string[]).includes(v.chartStyle) ? (v.chartStyle as ChartStyle) : 'plain',
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
  // Version 1 backups have no debts or cheques: the missing lists are empty.
  const optional = (v: unknown) => (v === undefined && raw.version === 1 ? [] : v);
  const rawDebts = optional(raw.debts);
  const debtPayments = optional(raw.debtPayments);
  const debtOverrides = optional(raw.debtOverrides);
  const cheques = optional(raw.cheques);
  if (
    !Array.isArray(rawDebts) ||
    !listOk(debtPayments, isDebtPayment) ||
    !listOk(debtOverrides, isDebtOverride) ||
    !listOk(cheques, isCheque)
  ) {
    throw new Error(DAMAGED);
  }
  // Statement import lists (added after backup version 2 first shipped): a file without them restores with them empty.
  const imports = raw.imports ?? [];
  const importTemplates = raw.importTemplates ?? [];
  const categoryRules = raw.categoryRules ?? [];
  if (
    !listOk(imports, isImportRecord) ||
    !listOk(importTemplates, isImportTemplate) ||
    !listOk(categoryRules, isCategoryRule) ||
    !hasUniqueIds(imports as ImportRecord[]) ||
    !hasUniqueIds(categoryRules as CategoryRuleRecord[]) ||
    new Set((importTemplates as ImportTemplate[]).map((t) => t.sourceName)).size !== (importTemplates as ImportTemplate[]).length ||
    new Set((categoryRules as CategoryRuleRecord[]).map((r) => r.pattern.toLowerCase())).size !== (categoryRules as CategoryRuleRecord[]).length
  ) {
    throw new Error(DAMAGED);
  }
  const debts: Debt[] = [];
  for (const d of rawDebts) {
    const debt = readDebt(d);
    if (!debt) throw new Error(DAMAGED);
    debts.push(debt);
  }
  const typeById = new Map(debts.map((d) => [d.id, d.type]));
  const overrideKeys = new Set((debtOverrides as DebtOverride[]).map((o) => `${o.debtId}|${o.originalDate}`));
  if (
    !hasUniqueIds(debts) ||
    !hasUniqueIds(debtPayments as DebtPayment[]) ||
    !hasUniqueIds(debtOverrides as DebtOverride[]) ||
    !hasUniqueIds(cheques as Cheque[]) ||
    overrideKeys.size !== (debtOverrides as DebtOverride[]).length ||
    (debtPayments as DebtPayment[]).some((p) => !typeById.has(p.debtId)) ||
    (debtOverrides as DebtOverride[]).some((o) => !typeById.has(o.debtId)) ||
    debts.some((d) => d.type === 'plan' && d.cardId !== null && typeById.get(d.cardId) !== 'card')
  ) {
    throw new Error(DAMAGED);
  }
  return {
    ...(raw as unknown as BackupData),
    version: BACKUP_VERSION,
    settings,
    // Older backups have no monthlyLimit: it is null.
    categories: (raw.categories as Category[]).map((c) => ({ ...c, monthlyLimit: c.monthlyLimit ?? null })),
    debts,
    debtPayments: debtPayments as DebtPayment[],
    debtOverrides: debtOverrides as DebtOverride[],
    cheques: cheques as Cheque[],
    imports: imports as ImportRecord[],
    importTemplates: importTemplates as ImportTemplate[],
    categoryRules: categoryRules as CategoryRuleRecord[],
  };
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

const csvRows = (rows: string[][]) => rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
const byDateThenId = <T extends { date: string; id: string }>(list: T[]) => [...list].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));

function describeRepeat(item: RecurringItem): string {
  const s = item.schedule;
  if (s.type === 'weekly') return s.everyWeeks === 1 ? 'Every week' : `Every ${s.everyWeeks} weeks`;
  if (s.type === 'yearly') return `Every year on ${s.day}/${s.month}`;
  const day = s.day === 'last' ? 'the last day' : `day ${s.day}`;
  return !s.everyMonths || s.everyMonths === 1 ? `Every month on ${day}` : `Every ${s.everyMonths} months on ${day}`;
}

/** Builds the CSV text for recurring items (income and costs that repeat). */
export function buildRecurringCsv(items: RecurringItem[], categories: Category[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const rows = [['Name', 'Type', 'Category', 'Amount', 'Repeats', 'Starts', 'Ends', 'Number of payments', 'Note']];
  const sorted = [...items].sort((a, b) => (a.startDate === b.startDate ? (a.id < b.id ? -1 : 1) : a.startDate < b.startDate ? -1 : 1));
  for (const r of sorted) {
    rows.push([
      safeText(r.name),
      r.kind === 'income' ? 'Income' : 'Cost',
      safeText(r.categoryId ? (names.get(r.categoryId) ?? '') : ''),
      filsToDecimal(r.amount),
      describeRepeat(r),
      r.startDate,
      r.endDate ?? '',
      r.count === null ? '' : String(r.count),
      safeText(r.note),
    ]);
  }
  return csvRows(rows);
}

/** Builds the CSV text for logged debt payments. Rows are sorted by date. */
export function buildPaymentsCsv(payments: DebtPayment[], debts: Debt[]): string {
  const names = new Map(debts.map((d) => [d.id, d.name]));
  const kind = { regular: 'Regular', extra: 'Extra', partial: 'Partial' } as const;
  const rows = [['Date', 'Debt', 'Amount', 'Kind', 'Note']];
  for (const p of byDateThenId(payments)) rows.push([p.date, safeText(names.get(p.debtId) ?? ''), filsToDecimal(p.amount), kind[p.kind], safeText(p.note)]);
  return csvRows(rows);
}

/**
 * One CSV with a section per kind of data: a title line, a header line and the rows, with a blank
 * line between sections. Built from the same safe builders as above, so formulas are neutralised.
 */
export function buildCombinedCsv(data: Pick<BackupData, 'transactions' | 'recurring' | 'categories' | 'debts' | 'debtPayments' | 'cheques'>): string {
  const sections: [string, string][] = [
    ['One-time items', buildTransactionsCsv(data.transactions, data.categories)],
    ['Recurring items', buildRecurringCsv(data.recurring, data.categories)],
    ['Debts', buildDebtsCsv(data.debts)],
    ['Debt payments', buildPaymentsCsv(data.debtPayments, data.debts)],
    ['Cheques', buildChequesCsv(data.cheques)],
  ];
  return sections.map(([title, csv]) => `${title}\r\n${csv}`).join('\r\n');
}

/** Builds the CSV text for debts: one row per debt, with the columns that apply to its type filled in. */
export function buildDebtsCsv(debts: Debt[]): string {
  const rows = [
    ['Name', 'Type', 'Status', 'Balance', 'Balance date', 'Monthly payment', 'Payment day', 'Limit', 'Yearly rate %', 'Monthly rate %', 'Total', 'First payment', 'Payments', 'End date', 'Note'],
  ];
  const sorted = [...debts].sort((a, b) => Number(a.archived) - Number(b.archived) || (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
  for (const d of sorted) {
    const row = Array<string>(15).fill('');
    row[0] = safeText(d.name);
    row[2] = d.archived ? 'Archived' : 'Active';
    row[14] = safeText(d.note);
    if (d.type === 'loan') {
      Object.assign(row, { 1: 'Loan', 3: filsToDecimal(d.balance), 4: d.balanceDate, 5: filsToDecimal(d.monthlyPayment), 6: String(d.paymentDay), 8: d.annualRatePct === null ? '' : String(d.annualRatePct), 13: d.endDate ?? '' });
    } else if (d.type === 'card') {
      Object.assign(row, { 1: 'Credit card', 3: filsToDecimal(d.balance), 4: d.balanceDate, 6: String(d.dueDay), 7: filsToDecimal(d.limit), 9: String(d.monthlyRatePct) });
    } else {
      Object.assign(row, { 1: 'Instalment plan', 5: filsToDecimal(d.monthlyAmount), 10: filsToDecimal(d.total), 11: d.firstPaymentDate, 12: String(d.payments) });
    }
    rows.push(row);
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Builds the CSV text for cheques. Rows are sorted by date. */
export function buildChequesCsv(cheques: Cheque[]): string {
  const rows = [['Date', 'Payee', 'Amount', 'Purpose', 'Status', 'Note']];
  const status = { upcoming: 'Upcoming', cleared: 'Cleared', cancelled: 'Cancelled' } as const;
  const sorted = [...cheques].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
  for (const c of sorted) rows.push([c.date, safeText(c.payee), filsToDecimal(c.amount), safeText(c.purpose), status[c.status], safeText(c.note)]);
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

/** Writes everything as one CSV file (a section per kind of data) and opens the share sheet. */
export async function exportAllCsv(repo: Repository): Promise<void> {
  const data = await repo.exportAll();
  await writeAndShare(`money-planner-${dateStamp()}.csv`, buildCombinedCsv(data), 'text/csv', 'Save your Money Planner data as a spreadsheet');
}
