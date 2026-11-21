import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { createMemoryRepository } from '@/data/memory/memory-repository';
import { buildTransactionsCsv, exportBackup, exportTransactionsCsv, restoreBackupFromFile, csvField, filsToDecimal, parseBackup, serializeBackup } from '@/data/backup';
import { BACKUP_VERSION } from '@/data/repository';
import { DEFAULT_CATEGORIES } from '@/data/defaults';
import { ovr, rec, txn } from '@/data/memory/repository-contract';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map(String).join('/');
    }
    get exists() {
      return files.has(this.uri);
    }
    create() {
      files.set(this.uri, '');
    }
    async write(text: string) {
      await new Promise((r) => setTimeout(r, 5));
      files.set(this.uri, text);
    }
    async text() {
      return files.get(this.uri) ?? '';
    }
    delete() {
      files.delete(this.uri);
    }
  }
  return { File, Paths: { cache: 'cache' }, __files: files };
});

async function sample() {
  const repo = createMemoryRepository({ recurring: [rec()], overrides: [ovr()], transactions: [txn()] });
  await repo.init();
  return repo.exportAll();
}

describe('parseBackup', () => {
  it('round-trips serializeBackup', async () => {
    const data = await sample();
    expect(parseBackup(serializeBackup(data))).toEqual(data);
  });
  it('rejects text that is not JSON', () => {
    expect(() => parseBackup('hello')).toThrow("This file isn't a Money Planner backup");
    expect(() => parseBackup('')).toThrow("This file isn't a Money Planner backup");
  });
  it('rejects other JSON', () => {
    expect(() => parseBackup('[]')).toThrow("isn't a Money Planner backup");
    expect(() => parseBackup('{"format":"other"}')).toThrow("isn't a Money Planner backup");
  });
  it('rejects a newer version', async () => {
    const data = { ...(await sample()), version: BACKUP_VERSION + 1 };
    expect(() => parseBackup(JSON.stringify(data))).toThrow('newer version of the app');
  });
  it('rejects damaged data', async () => {
    const data = await sample();
    const bad = (patch: object) => JSON.stringify({ ...data, ...patch });
    expect(() => parseBackup(bad({ transactions: 'x' }))).toThrow('damaged');
    expect(() => parseBackup(bad({ settings: null }))).toThrow('damaged');
    expect(() => parseBackup(bad({ transactions: [{ ...txn(), amount: 12.5 }] }))).toThrow('damaged');
    expect(() => parseBackup(bad({ recurring: [{ ...rec(), schedule: { type: 'daily' } }] }))).toThrow('damaged');
    expect(() => parseBackup(bad({ version: 'one' }))).toThrow('damaged');
  });
});

describe('parseBackup validation', () => {
  let data: Awaited<ReturnType<typeof sample>>;
  beforeEach(async () => {
    data = await sample();
  });
  const text = (patch: object) => JSON.stringify({ ...data, ...patch });
  const bad = (patch: object) => expect(() => parseBackup(text(patch))).toThrow("This backup file looks damaged, so it can't be restored.");
  const ok = (patch: object) => expect(() => parseBackup(text(patch))).not.toThrow();

  it('checks every date', () => {
    for (const d of ['2026-02-30', '2026-13-01', '2026-1-1', 'tomorrow', '', 20260101, '1800-01-01', '2300-01-01']) {
      bad({ transactions: [txn({ date: d as any })] });
    }
    bad({ recurring: [rec({ startDate: '2026-02-30' })] });
    bad({ recurring: [rec({ endDate: '2026-00-10' })] });
    bad({ overrides: [ovr({ originalDate: '2026-02-30' })] });
    bad({ overrides: [ovr({ newDate: '2026-04-31' })] });
    bad({ settings: { ...data.settings, startingBalanceDate: '2026-02-30' } });
    ok({ transactions: [txn({ date: '2028-02-29' })] });
  });
  it('requires safe integer money, never negative amounts', () => {
    bad({ transactions: [txn({ amount: Number.MAX_SAFE_INTEGER + 2 })] });
    bad({ transactions: [txn({ amount: -1 })] });
    bad({ transactions: [txn({ amount: 1.5 })] });
    bad({ transactions: [txn({ amount: '5' as any })] });
    bad({ recurring: [rec({ amount: -100 })] });
    bad({ recurring: [rec({ amount: 1e300 })] });
    bad({ overrides: [ovr({ newAmount: -5 })] });
    bad({ settings: { ...data.settings, startingBalance: 2 ** 60 } });
    bad({ settings: { ...data.settings, buffer: 0.5 } });
    ok({ transactions: [txn({ amount: 0 })] });
    ok({ settings: { ...data.settings, startingBalance: -5000 } });
  });
  it('checks schedule ranges', () => {
    const sched = (schedule: any) => ({ recurring: [rec({ schedule })] });
    bad(sched({ type: 'monthly', day: 0 }));
    bad(sched({ type: 'monthly', day: 32 }));
    bad(sched({ type: 'monthly', day: 'first' }));
    bad(sched({ type: 'monthly', day: 5, everyMonths: 0 }));
    bad(sched({ type: 'monthly', day: 5, everyMonths: 121 }));
    bad(sched({ type: 'weekly', everyWeeks: 0 }));
    bad(sched({ type: 'weekly', everyWeeks: 53 }));
    bad(sched({ type: 'yearly', month: 0, day: 1 }));
    bad(sched({ type: 'yearly', month: 13, day: 1 }));
    bad(sched({ type: 'yearly', month: 5, day: 32 }));
    bad(sched({ type: 'yearly', month: 5, day: 0 }));
    ok(sched({ type: 'monthly', day: 31, everyMonths: 120 }));
    ok(sched({ type: 'monthly', day: 'last' }));
    ok(sched({ type: 'weekly', everyWeeks: 52 }));
    ok(sched({ type: 'yearly', month: 12, day: 31 }));
  });
  it('checks count, kinds, sources and ids', () => {
    bad({ recurring: [rec({ count: 0 })] });
    bad({ recurring: [rec({ count: -2 })] });
    ok({ recurring: [rec({ count: 1 })] });
    bad({ recurring: [rec({ kind: 'transfer' as any })] });
    bad({ transactions: [txn({ kind: 'x' as any })] });
    bad({ transactions: [txn({ source: 'bank' as any })] });
    bad({ categories: [{ ...data.categories[0], kind: 'x' }] });
    bad({ transactions: [txn({ id: '' })] });
    bad({ transactions: [txn({ id: 5 as any })] });
    bad({ recurring: [rec({ id: '' })] });
    bad({ categories: [{ ...data.categories[0], id: '' }] });
    bad({ overrides: [ovr({ id: '' })] });
    bad({ overrides: [ovr({ recurringId: '' })] });
    bad({ transactions: [txn({ categoryId: '' })] });
  });
  it('checks override fields are consistent', () => {
    bad({ overrides: [ovr({ originalDate: '2026-02-28', newDate: '2026-02-28' })] });
    bad({ overrides: [ovr({ skip: 'yes' as any })] });
    ok({ overrides: [ovr({ skip: true, newDate: null, newAmount: null, paid: false })] });
  });
  it('ignores unknown settings keys and fills in missing nested ones', () => {
    const parsed = parseBackup(
      text({ settings: { ...data.settings, evil: 1, enabledModules: { ...data.settings.enabledModules, hack: true }, alertThresholds: { cardUsagePct: 70, other: 3 } } }),
    );
    expect(parsed.settings).not.toHaveProperty('evil');
    expect(parsed.settings.enabledModules).not.toHaveProperty('hack');
    expect(parsed.settings.alertThresholds).toEqual({ debtCautionPct: 40, debtHighPct: 50, cardUsagePct: 70 });
  });
  it('forces lockEnabled off', () => {
    const parsed = parseBackup(text({ settings: { ...data.settings, lockEnabled: true } }));
    expect(parsed.settings.lockEnabled).toBe(false);
  });
  it('rejects a bad payday', () => {
    bad({ settings: { ...data.settings, payday: 40 } });
    ok({ settings: { ...data.settings, payday: null } });
  });
});

describe('files and sharing', () => {
  const files: Map<string, string> = require('expo-file-system').__files;
  beforeEach(() => {
    files.clear();
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  });

  it('waits for the file to be written before opening the share sheet, then deletes it', async () => {
    let seen: string | undefined;
    (Sharing.shareAsync as jest.Mock).mockImplementation(async (uri: string) => {
      seen = files.get(uri);
    });
    const repo = createMemoryRepository({ transactions: [txn()] });
    await repo.init();
    await exportBackup(repo);
    expect(JSON.parse(seen as string).format).toBe('moneyplanner-backup');
    expect(files.size).toBe(0);
  });
  it('deletes the CSV even when sharing fails', async () => {
    (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error('cancelled'));
    const repo = createMemoryRepository({ transactions: [txn()] });
    await repo.init();
    await expect(exportTransactionsCsv(repo)).rejects.toThrow('cancelled');
    expect(files.size).toBe(0);
  });
  it('deletes the picked file after reading it, and restores with the lock off', async () => {
    const source = createMemoryRepository({ transactions: [txn()] });
    await source.init();
    await source.updateSettings({ lockEnabled: true });
    files.set('picked.json', serializeBackup(await source.exportAll()));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'picked.json' }] });
    const target = createMemoryRepository();
    await target.init();
    const result = await restoreBackupFromFile(target, async () => true);
    expect(result).toBe('restored');
    expect(files.has('picked.json')).toBe(false);
    expect(await target.listTransactions()).toHaveLength(1);
    expect((await target.getSettings()).lockEnabled).toBe(false);
  });
  it('deletes the picked file when it is damaged', async () => {
    files.set('picked.json', 'nope');
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'picked.json' }] });
    await expect(restoreBackupFromFile(createMemoryRepository(), async () => true)).rejects.toThrow("isn't a Money Planner backup");
    expect(files.has('picked.json')).toBe(false);
  });
});

describe('CSV', () => {
  it('formats fils as decimals', () => {
    expect(filsToDecimal(123450)).toBe('1234.50');
    expect(filsToDecimal(5)).toBe('0.05');
    expect(filsToDecimal(-250)).toBe('-2.50');
    expect(filsToDecimal(0)).toBe('0.00');
  });
  it('quotes fields', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });
  it('builds rows with category names, sorted by date', () => {
    const csv = buildTransactionsCsv(
      [
        txn({ id: 'b', date: '2026-03-06', kind: 'income', description: 'Pay, March', categoryId: 'salary', amount: 1000000, note: '', planned: true }),
        txn({ id: 'a', date: '2026-03-05', description: '=SUM(A1)', categoryId: null, note: 'with, "comma"' }),
      ],
      DEFAULT_CATEGORIES,
    );
    expect(csv.split('\r\n')).toEqual([
      'Date,Type,Description,Category,Amount,Note,Planned',
      `2026-03-05,Cost,'=SUM(A1),,45.50,"with, ""comma""",No`,
      '2026-03-06,Income,"Pay, March",Salary,10000.00,,Yes',
      '',
    ]);
  });
  it('has just the header when empty', () => {
    expect(buildTransactionsCsv([], [])).toBe('Date,Type,Description,Category,Amount,Note,Planned\r\n');
  });
});
