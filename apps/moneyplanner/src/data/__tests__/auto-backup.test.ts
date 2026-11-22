import { createMemoryRepository } from '@/data/memory/memory-repository';
import {
  backupBeforeChange,
  isReminderDue,
  listAutoBackups,
  readBackupMeta,
  removeProfileBackups,
  restoreAutoBackup,
  runAutoBackup,
  saveDeletedProfileCopy,
  snoozeBackupReminder,
  updateBackupMeta,
} from '@/data/backup/auto';
import { rec, txn } from '@/data/memory/repository-contract';
import { defaultSettings } from '@/data/defaults';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const join = (parts: any[]) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/').replace(/\/+/g, '/');
  const state = { failMove: false, failWrite: false, moves: [] as string[] };
  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').pop()!;
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return (files.get(this.uri) ?? '').length;
    }
    create() {
      files.set(this.uri, '');
    }
    async write(text: string) {
      if (state.failWrite) throw new Error('disk full');
      files.set(this.uri, text);
    }
    async text() {
      if (!files.has(this.uri)) throw new Error('missing');
      return files.get(this.uri)!;
    }
    textSync() {
      return files.get(this.uri) ?? '';
    }
    move(dest: File) {
      if (state.failMove) throw new Error('move failed');
      state.moves.push(`${this.uri}->${dest.uri}`);
      files.set(dest.uri, files.get(this.uri)!);
      files.delete(this.uri);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = join(parts);
    }
    get exists() {
      return dirs.has(this.uri);
    }
    create() {
      dirs.add(this.uri);
    }
    list() {
      return [...files.keys()].filter((k) => k.startsWith(this.uri + '/') && !k.slice(this.uri.length + 1).includes('/')).map((k) => new File(k));
    }
    delete() {
      dirs.delete(this.uri);
      for (const k of [...files.keys()]) if (k.startsWith(this.uri + '/')) files.delete(k);
    }
  }
  return { File, Directory, Paths: { document: new Directory('file:///doc'), cache: 'cache' }, __files: files, __state: state };
}, { virtual: false });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsMock = require('expo-file-system') as { __files: Map<string, string>; __state: { failMove: boolean; failWrite: boolean; moves: string[] } };

const settings = { ...defaultSettings(), onboarded: true, lockEnabled: true };
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 12);

async function repoWithData() {
  const repo = createMemoryRepository({ settings, recurring: [rec()], transactions: [txn()] });
  await repo.init();
  await repo.updateSettings({ lockEnabled: true });
  return repo;
}
const names = (id = 'p1') => listAutoBackups(id).map((i) => i.uri.split('/').pop());

beforeEach(() => {
  fsMock.__files.clear();
  fsMock.__state.failMove = false;
  fsMock.__state.failWrite = false;
  fsMock.__state.moves = [];
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('automatic backups', () => {
  it('writes a manual-format backup to backups/<profile>/auto-DATE.json', async () => {
    const repo = await repoWithData();
    const r = await runAutoBackup(repo, 'p1', at(2026, 11, 20));
    expect(r.status).toBe('written');
    const file = [...fsMock.__files.keys()].find((k) => k.endsWith('auto-2026-11-20.json'))!;
    expect(file).toContain('/backups/p1/');
    const written = JSON.parse(fsMock.__files.get(file)!);
    const now = await repo.exportAll();
    expect(written).toMatchObject({ format: now.format, version: now.version, transactions: now.transactions, recurring: now.recurring });
  });

  it('writes through a temp file that is moved into place', async () => {
    await runAutoBackup(await repoWithData(), 'p1', at(2026, 11, 20));
    expect(fsMock.__state.moves.some((m) => m.includes('.tmp-auto-2026-11-20.json->') && m.endsWith('/auto-2026-11-20.json'))).toBe(true);
    expect([...fsMock.__files.keys()].some((k) => k.includes('.tmp-auto'))).toBe(false);
  });

  it('a failed write leaves no half file and does not throw', async () => {
    fsMock.__state.failWrite = true;
    const r = await runAutoBackup(await repoWithData(), 'p1', at(2026, 11, 20));
    expect(r).toEqual({ status: 'failed', message: 'disk full' });
    expect(names()).toEqual([]);
    expect([...fsMock.__files.keys()].some((k) => k.includes('.tmp-'))).toBe(false);
  });

  it('writes at most once a day', async () => {
    const repo = await repoWithData();
    expect((await runAutoBackup(repo, 'p1', at(2026, 11, 20, 8))).status).toBe('written');
    expect(await runAutoBackup(repo, 'p1', at(2026, 11, 20, 18))).toEqual({ status: 'skipped', reason: 'already-today' });
    expect((await runAutoBackup(repo, 'p1', at(2026, 11, 21))).status).toBe('written');
    expect(names()).toEqual(['auto-2026-11-21.json', 'auto-2026-11-20.json']);
  });

  it('does not back up a profile that is not set up (an empty copy must not push real ones out)', async () => {
    const repo = createMemoryRepository({ settings: { ...settings, onboarded: false } });
    await repo.init();
    expect(await runAutoBackup(repo, 'p1', at(2026, 11, 20))).toEqual({ status: 'skipped', reason: 'not-set-up' });
    expect(names()).toEqual([]);
  });

  it('keeps the newest 7 and lists newest first', async () => {
    const repo = await repoWithData();
    for (let d = 1; d <= 10; d++) await runAutoBackup(repo, 'p1', at(2026, 11, d));
    expect(names()).toEqual([4, 5, 6, 7, 8, 9, 10].reverse().map((d) => `auto-2026-11-${String(d).padStart(2, '0')}.json`));
    expect(listAutoBackups('p1')[0]).toMatchObject({ date: '2026-11-10', kind: 'daily' });
    expect(listAutoBackups('p1')[0].size).toBeGreaterThan(0);
  });

  it('keeps each profile separate and removes a deleted profile folder', async () => {
    const repo = await repoWithData();
    await runAutoBackup(repo, 'p1', at(2026, 11, 20));
    await runAutoBackup(repo, 'p2', at(2026, 11, 20));
    await removeProfileBackups('p1');
    expect(names('p1')).toEqual([]);
    expect(names('p2')).toHaveLength(1);
  });
});

describe('restore and safety copies', () => {
  it('restores a copy, keeps this phone\'s lock setting, and saves a safety copy first', async () => {
    const repo = await repoWithData();
    await runAutoBackup(repo, 'p1', at(2026, 11, 20));
    const copy = listAutoBackups('p1')[0];
    await repo.upsertTransaction(txn({ id: 'extra' }));
    const before = await repo.exportAll();
    await restoreAutoBackup(repo, copy.uri, 'p1', at(2026, 11, 21));
    const safety = listAutoBackups('p1').find((i) => i.kind === 'before-restore')!;
    expect(safety).toBeTruthy();
    expect(JSON.parse(fsMock.__files.get(safety.uri)!).transactions).toHaveLength(before.transactions.length);
    expect((await repo.getSettings()).lockEnabled).toBe(true);
    expect((await repo.exportAll()).transactions.map((t) => t.id)).not.toContain('extra');
  });

  it('a bad file changes nothing and makes no safety copy', async () => {
    const repo = await repoWithData();
    await runAutoBackup(repo, 'p1', at(2026, 11, 20));
    const copy = listAutoBackups('p1')[0];
    fsMock.__files.set(copy.uri, '{"format":"something else"}');
    const before = await repo.exportAll();
    await expect(restoreAutoBackup(repo, copy.uri, 'p1')).rejects.toThrow(/isn't a Money Planner backup/);
    expect((await repo.exportAll()).transactions).toEqual(before.transactions);
    expect(listAutoBackups('p1').some((i) => i.kind !== 'daily')).toBe(false);
  });

  it('refuses files outside the profile backup folder', async () => {
    await expect(restoreAutoBackup(await repoWithData(), 'file:///elsewhere/x.json', 'p1')).rejects.toThrow(/automatic backups/);
  });

  it('stops the restore if the safety copy cannot be saved', async () => {
    const repo = await repoWithData();
    await runAutoBackup(repo, 'p1', at(2026, 11, 20));
    const copy = listAutoBackups('p1')[0];
    const importAll = jest.spyOn(repo, 'importAll');
    fsMock.__state.failWrite = true;
    await expect(restoreAutoBackup(repo, copy.uri, 'p1')).rejects.toThrow(/safety copy/);
    expect(importAll).not.toHaveBeenCalled();
  });

  it('writes a before-delete safety copy and drops safety copies older than 7 days', async () => {
    const repo = await repoWithData();
    await backupBeforeChange(repo, 'p1', 'before-delete', at(2026, 11, 1));
    expect(listAutoBackups('p1').map((i) => i.kind)).toEqual(['before-delete']);
    await backupBeforeChange(repo, 'p1', 'before-restore', at(2026, 11, 9));
    expect(listAutoBackups('p1').map((i) => i.kind)).toEqual(['before-restore']);
  });
});

describe('copies of deleted profiles', () => {
  it('survives removing the profile folder, is listed for other profiles with its name, and expires after 7 days', async () => {
    const repo = await repoWithData();
    await saveDeletedProfileCopy(repo, 'Layla & Co', at(2026, 11, 20));
    await runAutoBackup(repo, 'p1', at(2026, 11, 20));
    await removeProfileBackups('p1');
    const listed = listAutoBackups('p2', at(2026, 11, 22));
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ kind: 'deleted-profile', profileName: 'Layla & Co' });
    expect(listAutoBackups('p2', at(2026, 11, 27))).toHaveLength(1);
    expect(listAutoBackups('p2', at(2026, 11, 27, 10))).toHaveLength(0);
  });

  it('restores into another profile, and stops when the copy cannot be saved', async () => {
    const source = await repoWithData();
    await saveDeletedProfileCopy(source, 'Layla', at(2026, 11, 21));
    const copy = listAutoBackups('p2', at(2026, 11, 22))[0];
    const target = createMemoryRepository({ settings });
    await target.init();
    await restoreAutoBackup(target, copy.uri, 'p2', at(2026, 11, 22));
    expect((await target.exportAll()).transactions).toHaveLength(1);
    fsMock.__state.failWrite = true;
    await expect(saveDeletedProfileCopy(source, 'X')).rejects.toThrow(/nothing was deleted/);
  });

  it('old copies are dropped when the next copy is written', async () => {
    const repo = await repoWithData();
    await saveDeletedProfileCopy(repo, 'Old', at(2026, 11, 1));
    await saveDeletedProfileCopy(repo, 'New', at(2026, 11, 20));
    expect(listAutoBackups('p2', at(2026, 11, 20)).map((i) => i.profileName)).toEqual(['New']);
    expect([...fsMock.__files.keys()].filter((k) => k.includes('/deleted-'))).toHaveLength(1);
  });
});

describe('backup reminder', () => {
  const iso = (d: Date) => d.toISOString();
  it('is due 30 days after the last saved file or first use, and "Later" snoozes 30 days', async () => {
    const start = at(2026, 10, 1);
    const meta = { lastAutoAt: null, lastManualAt: null, firstSeenAt: iso(start), snoozedUntil: null };
    expect(isReminderDue(meta, at(2026, 10, 20))).toBe(false);
    expect(isReminderDue(meta, at(2026, 11, 1))).toBe(true);
    expect(isReminderDue({ ...meta, lastManualAt: iso(at(2026, 10, 25)) }, at(2026, 11, 5))).toBe(false);
    expect(isReminderDue({ ...meta, firstSeenAt: null }, at(2026, 11, 5))).toBe(false);
    await snoozeBackupReminder('p1', at(2026, 11, 1));
    const snoozed = await readBackupMeta('p1');
    expect(isReminderDue({ ...meta, snoozedUntil: snoozed.snoozedUntil }, at(2026, 11, 20))).toBe(false);
    expect(isReminderDue({ ...meta, snoozedUntil: snoozed.snoozedUntil }, at(2026, 12, 2))).toBe(true);
  });

  it('keeps meta across updates and never shows it as a backup copy', async () => {
    await updateBackupMeta('p1', { lastManualAt: '2026-11-01T10:00:00.000Z' });
    await updateBackupMeta('p1', { firstSeenAt: '2026-10-01T10:00:00.000Z' });
    expect(await readBackupMeta('p1')).toMatchObject({ lastManualAt: '2026-11-01T10:00:00.000Z', firstSeenAt: '2026-10-01T10:00:00.000Z' });
    expect(names()).toEqual([]);
  });
});
