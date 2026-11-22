// Automatic local backups. Once a day the open profile's data is written to
// the app's document folder (backups/<profileId>/auto-YYYY-MM-DD.json), in the
// same format as a manual backup file. The newest 7 are kept. A safety copy is
// also written right before a restore (kept 7 days). Deleting a profile keeps
// its last copy in the shared folder backups/deleted/ for 7 days (listed in the
// open profile's Automatic backups, "Restore into this profile").
// Nothing here throws to the caller except restoreAutoBackup and
// backupBeforeChange, which must stop the action if the data can't be checked
// or saved first.
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

import { exportBackup, parseBackup, serializeBackup } from '@/data/backup';
import type { Repository } from '@/data/repository';

export const KEEP_DAILY = 7;
export const KEEP_SAFETY_DAYS = 7;
export const REMINDER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AutoBackupStatus =
  | { status: 'written'; uri: string }
  | { status: 'skipped'; reason: 'already-today' | 'not-set-up' }
  | { status: 'failed'; message: string };

export type BackupKind = 'daily' | 'before-restore' | 'before-delete' | 'deleted-profile';

export interface AutoBackupInfo {
  /** 'YYYY-MM-DD' for a daily copy, an ISO timestamp for a safety copy. */
  date: string;
  size: number;
  uri: string;
  kind: BackupKind;
  /** Only for 'deleted-profile': the name the deleted profile had. */
  profileName?: string;
}

/** Small facts kept next to the copies, so no database setting is needed. */
export interface BackupMeta {
  /** ISO time of the last automatic copy. */
  lastAutoAt: string | null;
  /** ISO time the user last saved a backup file with the share sheet. */
  lastManualAt: string | null;
  /** ISO time the reminder first had a chance to show (starts the 30 days for new users). */
  firstSeenAt: string | null;
  /** ISO time until which "Later" hides the reminder. */
  snoozedUntil: string | null;
}

const EMPTY_META: BackupMeta = { lastAutoAt: null, lastManualAt: null, firstSeenAt: null, snoozedUntil: null };
const META_NAME = 'meta.json';
const DAILY_RE = /^auto-(\d{4})-(\d{2})-(\d{2})\.json$/;
const SAFETY_RE = /^(before-restore|before-delete)-(\d+)\.json$/;
const DELETED_RE = /^deleted-(\d+)-(.*)\.json$/;

const pad = (n: number) => String(n).padStart(2, '0');
export const localDateStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const folder = (profileId: string) => new Directory(Paths.document, 'backups', profileId);
/** Shared by all profiles, so a deleted profile's copy survives removeProfileBackups. Not a valid profile id. */
const deletedFolder = () => new Directory(Paths.document, 'backups', 'deleted');

function ensureFolder(profileId: string): Directory {
  const dir = folder(profileId);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Writes text to a temp file, then moves it into place: a crash never leaves half a backup under the real name. */
async function writeAtomic(dir: Directory, name: string, text: string): Promise<File> {
  const tmp = new File(dir, `.tmp-${name}`);
  if (tmp.exists) tmp.delete();
  tmp.create();
  try {
    await tmp.write(text);
    const target = new File(dir, name);
    tmp.move(target, { overwrite: true });
    return target;
  } catch (e) {
    try {
      if (tmp.exists) tmp.delete();
    } catch {
      // ignore
    }
    throw e;
  }
}

// ---- Meta (one queue, so two updates can't overwrite each other) ----

let metaQueue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
/** Calls `fn` after any backup or reminder change (so Settings and Home refresh). Returns an unsubscribe. */
export function onBackupChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const notify = () => listeners.forEach((fn) => fn());

function readMetaSync(profileId: string): BackupMeta {
  try {
    const file = new File(folder(profileId), META_NAME);
    if (!file.exists) return { ...EMPTY_META };
    const raw = JSON.parse(file.textSync()) as Partial<BackupMeta>;
    const str = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
    return { lastAutoAt: str(raw.lastAutoAt), lastManualAt: str(raw.lastManualAt), firstSeenAt: str(raw.firstSeenAt), snoozedUntil: str(raw.snoozedUntil) };
  } catch {
    return { ...EMPTY_META };
  }
}

export async function readBackupMeta(profileId: string): Promise<BackupMeta> {
  await metaQueue.catch(() => undefined);
  return readMetaSync(profileId);
}

/** Changes the meta file. Never throws. */
export function updateBackupMeta(profileId: string, patch: Partial<BackupMeta>): Promise<void> {
  const next = metaQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        const dir = ensureFolder(profileId);
        await writeAtomic(dir, META_NAME, JSON.stringify({ ...readMetaSync(profileId), ...patch }));
      } catch (e) {
        console.warn('Could not save backup info', e);
      }
      notify();
    });
  metaQueue = next;
  return next;
}

// ---- Listing and rotation ----

function sortKey(i: AutoBackupInfo): number {
  if (i.kind === 'daily') {
    const [y, m, d] = i.date.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return Date.parse(i.date);
}

function fileName(entry: File) {
  return entry.name ?? entry.uri.split('/').pop() ?? '';
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Copies of deleted profiles that are still within their 7 days, newest first. */
function listDeletedCopies(now: Date = new Date()): AutoBackupInfo[] {
  try {
    const dir = deletedFolder();
    if (!dir.exists) return [];
    const out: AutoBackupInfo[] = [];
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      const m = DELETED_RE.exec(fileName(entry));
      if (!m || now.getTime() - Number(m[1]) > KEEP_SAFETY_DAYS * DAY_MS) continue;
      out.push({ date: new Date(Number(m[1])).toISOString(), size: entry.size ?? 0, uri: entry.uri, kind: 'deleted-profile', profileName: safeDecode(m[2]) });
    }
    return out;
  } catch {
    return [];
  }
}

/** Automatic and safety copies of a profile plus the copies of deleted profiles, newest first. Returns [] if there are none or the folder can't be read. */
export function listAutoBackups(profileId: string, now: Date = new Date()): AutoBackupInfo[] {
  const out: AutoBackupInfo[] = listDeletedCopies(now);
  try {
    const dir = folder(profileId);
    if (!dir.exists) return out.sort((a, b) => sortKey(b) - sortKey(a));
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      const name = fileName(entry);
      const daily = DAILY_RE.exec(name);
      const safety = SAFETY_RE.exec(name);
      if (daily) out.push({ date: `${daily[1]}-${daily[2]}-${daily[3]}`, size: entry.size ?? 0, uri: entry.uri, kind: 'daily' });
      else if (safety) out.push({ date: new Date(Number(safety[2])).toISOString(), size: entry.size ?? 0, uri: entry.uri, kind: safety[1] as BackupKind });
    }
    return out.sort((a, b) => sortKey(b) - sortKey(a));
  } catch {
    return [];
  }
}

function rotate(profileId: string, now: Date) {
  const all = listAutoBackups(profileId, now).filter((i) => i.kind !== 'deleted-profile');
  const drop = [
    ...all.filter((i) => i.kind === 'daily').slice(KEEP_DAILY),
    ...all.filter((i) => i.kind !== 'daily' && now.getTime() - Date.parse(i.date) > KEEP_SAFETY_DAYS * DAY_MS),
  ];
  // Old copies of deleted profiles go too.
  try {
    const dir = deletedFolder();
    if (dir.exists) {
      for (const entry of dir.list()) {
        const m = entry instanceof File ? DELETED_RE.exec(fileName(entry)) : null;
        if (entry instanceof File && m && now.getTime() - Number(m[1]) > KEEP_SAFETY_DAYS * DAY_MS) entry.delete();
      }
    }
  } catch {
    // a leftover copy is harmless
  }
  for (const i of drop) {
    try {
      new File(i.uri).delete();
    } catch {
      // a leftover copy is harmless
    }
  }
}

// ---- Writing ----

const running = new Map<string, Promise<AutoBackupStatus>>();

async function doAutoBackup(repo: Repository, profileId: string, now: Date): Promise<AutoBackupStatus> {
  const dir = ensureFolder(profileId);
  const name = `auto-${localDateStamp(now)}.json`;
  if (new File(dir, name).exists) return { status: 'skipped', reason: 'already-today' };
  const data = await repo.exportAll();
  // A profile that is still in the setup wizard (or was just emptied) has nothing worth keeping, and must not push real copies out.
  if (!data.settings.onboarded) return { status: 'skipped', reason: 'not-set-up' };
  const file = await writeAtomic(dir, name, serializeBackup(data));
  await updateBackupMeta(profileId, { lastAutoAt: now.toISOString() });
  rotate(profileId, now);
  return { status: 'written', uri: file.uri };
}

/** Writes today's automatic copy unless there already is one. Never throws. */
export function runAutoBackup(repo: Repository, profileId: string, now: Date = new Date()): Promise<AutoBackupStatus> {
  const existing = running.get(profileId);
  if (existing) return existing;
  const p = doAutoBackup(repo, profileId, now)
    .catch((e): AutoBackupStatus => {
      console.warn('Automatic backup failed', e);
      return { status: 'failed', message: e instanceof Error ? e.message : String(e) };
    })
    .finally(() => {
      running.delete(profileId);
    });
  running.set(profileId, p);
  return p;
}

/**
 * Saves a safety copy of the current data before something replaces or deletes it.
 * Throws (so the caller stops) if it can't be saved: the user keeps their data.
 */
export async function backupBeforeChange(repo: Repository, profileId: string, kind: 'before-restore' | 'before-delete', now: Date = new Date()): Promise<string | null> {
  // The web preview has no file storage and keeps nothing between visits: no copy to make.
  if (Platform.OS === 'web') return null;
  try {
    const dir = ensureFolder(profileId);
    const data = await repo.exportAll();
    const file = await writeAtomic(dir, `${kind}-${now.getTime()}.json`, serializeBackup(data));
    rotate(profileId, now);
    notify();
    return file.uri;
  } catch (e) {
    console.warn('Could not save a safety copy', e);
    throw new Error("Couldn't save a safety copy of your current data first, so nothing was changed. Free up some space on this phone and try again.");
  }
}

/**
 * Restores one of the copies. The file is checked first (a bad file changes nothing), a safety copy
 * of the current data is saved, then everything is replaced. The lock setting of this phone is kept.
 */
export async function restoreAutoBackup(repo: Repository, uri: string, profileId: string, now: Date = new Date()): Promise<void> {
  const prefixes = [folder(profileId), deletedFolder()].map((d) => d.uri.replace(/\/?$/, '/'));
  if (!prefixes.some((p) => uri.startsWith(p))) throw new Error("That copy isn't one of this profile's automatic backups.");
  let text: string;
  try {
    text = await new File(uri).text();
  } catch {
    throw new Error("Couldn't read that copy. It may have been removed.");
  }
  const data = parseBackup(text);
  await backupBeforeChange(repo, profileId, 'before-restore', now);
  await repo.importAll(data);
  notify();
}

/**
 * Saves a copy of a profile's data that survives its deletion (backups/deleted/<ts>-<name>), kept 7 days.
 * Throws (so the caller stops) if it can't be saved: the data is not deleted without a copy.
 */
export async function saveDeletedProfileCopy(repo: Repository, profileName: string, now: Date = new Date()): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const dir = deletedFolder();
    dir.create({ intermediates: true, idempotent: true });
    const data = await repo.exportAll();
    const file = await writeAtomic(dir, `deleted-${now.getTime()}-${encodeURIComponent(profileName)}.json`, serializeBackup(data));
    rotate('deleted', now);
    notify();
    return file.uri;
  } catch (e) {
    console.warn('Could not save a safety copy', e);
    throw new Error("Couldn't save a safety copy of this profile first, so nothing was deleted. Free up some space on this phone and try again.");
  }
}

/** Removes all copies of a profile. Call when the profile is deleted. Never throws. */
export async function removeProfileBackups(profileId: string): Promise<void> {
  await metaQueue.catch(() => undefined);
  try {
    const dir = folder(profileId);
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('Could not remove backups', e);
  }
}

// ---- Manual backup file and the monthly reminder ----

/** Opens the share sheet with a backup file and, once it closes, remembers the time for the reminder. */
export async function exportBackupAndRecord(repo: Repository, profileId: string, now: () => Date = () => new Date()): Promise<void> {
  await exportBackup(repo);
  await updateBackupMeta(profileId, { lastManualAt: now().toISOString(), snoozedUntil: null });
}

/** "Later": hides the reminder for 30 days. */
export const snoozeBackupReminder = (profileId: string, now: Date = new Date()) =>
  updateBackupMeta(profileId, { snoozedUntil: new Date(now.getTime() + REMINDER_DAYS * DAY_MS).toISOString() });

/** True when no backup file was saved for 30 days (counted from first use if never) and the reminder isn't snoozed. */
export function isReminderDue(meta: BackupMeta, now: Date): boolean {
  if (meta.snoozedUntil && Date.parse(meta.snoozedUntil) > now.getTime()) return false;
  const since = [meta.lastManualAt, meta.firstSeenAt].filter((v): v is string => !!v).map((v) => Date.parse(v));
  if (since.length === 0) return false;
  return now.getTime() - Math.max(...since) >= REMINDER_DAYS * DAY_MS;
}

/** Starts the 30 days for a profile that has never been seen by the reminder. Never throws. */
export async function ensureReminderStarted(profileId: string, now: Date = new Date()): Promise<BackupMeta> {
  const meta = await readBackupMeta(profileId);
  if (meta.firstSeenAt || meta.lastManualAt) return meta;
  await updateBackupMeta(profileId, { firstSeenAt: now.toISOString() });
  return readBackupMeta(profileId);
}

/** "Today 09:12", "Yesterday 18:40" or "14 Mar 09:12". */
export function formatBackupTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = localDateStamp(d);
  if (day === localDateStamp(now)) return `Today ${time}`;
  if (day === localDateStamp(new Date(now.getTime() - DAY_MS))) return `Yesterday ${time}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`} ${time}`;
}
