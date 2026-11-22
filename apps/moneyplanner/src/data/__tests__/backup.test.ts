import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { createMemoryRepository } from '@/data/memory/memory-repository';
import { buildChequesCsv, buildDebtsCsv, buildCombinedCsv, buildRecurringCsv, buildTransactionsCsv, exportAllCsv, exportBackup, restoreBackupFromFile, csvField, filsToDecimal, parseBackup, serializeBackup } from '@/data/backup';
import { BACKUP_VERSION } from '@/data/repository';
import { DEFAULT_CATEGORIES } from '@/data/defaults';
import { card, chq, dovr, dpay, loan, ovr, plan, rec, txn } from '@/data/memory/repository-contract';

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
  const repo = createMemoryRepository({
    recurring: [rec()], overrides: [ovr()], transactions: [txn()],
    debts: [loan(), card(), plan()], debtPayments: [dpay()], debtOverrides: [dovr()], cheques: [chq()],
  });
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

describe('parseBackup debts and cheques', () => {
  let data: Awaited<ReturnType<typeof sample>>;
  beforeEach(async () => {
    data = await sample();
  });
  const text = (patch: object) => JSON.stringify({ ...data, ...patch });
  const bad = (patch: object) => expect(() => parseBackup(text(patch))).toThrow('damaged');
  /** The sample debts with the given ones swapped in by id (or added), so payments and plans keep valid references. */
  const dd = (...items: any[]) => {
    const base: any[] = [loan(), card(), plan()];
    for (const it of items) {
      const i = base.findIndex((x) => x.id === it?.id);
      if (i >= 0) base[i] = it;
      else base.push(it);
    }
    return { debts: base };
  };
  const ok = (patch: object) => expect(() => parseBackup(text(patch))).not.toThrow();

  it('round-trips version 2 with all new lists', () => {
    const parsed = parseBackup(serializeBackup(data));
    expect(parsed).toEqual(data);
    expect(parsed.debts).toHaveLength(3);
    expect(parsed.cheques).toHaveLength(1);
  });
  it('restores a version 1 file, with the new lists empty', () => {
    const v1: any = { ...data, version: 1 };
    delete v1.debts; delete v1.debtPayments; delete v1.debtOverrides; delete v1.cheques;
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed).toMatchObject({ debts: [], debtPayments: [], debtOverrides: [], cheques: [] });
    expect(parsed.recurring).toHaveLength(1);
  });
  it('requires the new lists in a version 2 file', () => {
    for (const k of ['debts', 'debtPayments', 'debtOverrides', 'cheques']) {
      const v2: any = { ...data };
      delete v2[k];
      expect(() => parseBackup(JSON.stringify(v2))).toThrow('damaged');
    }
  });
  it('rejects a future version with a clear message', () => {
    expect(() => parseBackup(text({ version: BACKUP_VERSION + 1 }))).toThrow('newer version of the app');
    expect(() => parseBackup(text({ version: 0 }))).toThrow('damaged');
  });
  it('drops unknown keys from debts', () => {
    const parsed = parseBackup(text({ debts: [{ ...loan(), evil: 1 }] }));
    expect(parsed.debts[0]).not.toHaveProperty('evil');
  });
  it('validates loans', () => {
    ok(dd(loan({ paymentDay: 1 }), loan({ id: 'x', paymentDay: 31, balance: 0, annualRatePct: 0 })));
    bad(dd(loan({ paymentDay: 0 })));
    bad(dd(loan({ paymentDay: 32 })));
    bad(dd(loan({ paymentDay: 1.5 })));
    bad(dd(loan({ balance: -1 })));
    bad(dd(loan({ balance: 1.5 })));
    bad(dd(loan({ monthlyPayment: -100 })));
    bad(dd(loan({ balanceDate: '2026-02-30' })));
    bad(dd(loan({ endDate: 'soon' })));
    bad(dd(loan({ annualRatePct: -1 })));
    bad(dd(loan({ annualRatePct: '5' as any })));
    bad(dd(loan({ createdAt: '2026-13-01' })));
  });
  it('validates cards', () => {
    ok(dd(card({ minPct: 0 }), card({ id: 'y', minPct: 100, plan: 'full', fixedAmount: null })));
    bad(dd(card({ minPct: 101 })));
    bad(dd(card({ minPct: -1 })));
    bad(dd(card({ statementDay: 0 })));
    bad(dd(card({ dueDay: 32 })));
    bad(dd(card({ limit: -5 })));
    bad(dd(card({ minFloor: 0.5 })));
    bad(dd(card({ plan: 'auto' as any })));
    bad(dd(card({ fixedAmount: -1 })));
    bad(dd(card({ monthlyRatePct: NaN })));
    bad(dd(card({ balanceDate: '' })));
  });
  it('validates plans', () => {
    ok(dd(plan({ cardId: null }), plan({ id: 'p2', cardId: 'd-card', payments: 1 })));
    bad(dd(plan({ payments: 0 })));
    bad(dd(plan({ payments: 2.5 })));
    bad(dd(plan({ total: -1 })));
    bad(dd(plan({ monthlyAmount: 1.5 })));
    bad(dd(plan({ firstPaymentDate: '2026-02-30' })));
    bad(dd(plan({ cardId: '' })));
  });
  it('validates ids, type and base fields', () => {
    bad(dd(loan({ id: '' })));
    bad(dd({ ...loan(), type: 'mortgage' }));
    bad(dd({ ...loan(), archived: 'no' }));
    bad(dd({ ...loan(), name: 5 }));
    bad(dd({ ...loan(), note: undefined }));
    bad({ debts: [loan(), loan(), card(), plan()] });
    bad({ debts: 'x' });
    bad({ debts: [null] });
  });
  it('requires plans to point at an existing card', () => {
    bad(dd(plan({ cardId: 'nope' })));
    bad(dd(loan(), plan({ cardId: 'd-loan' })));
  });
  it('validates payments', () => {
    ok({ debtPayments: [dpay({ kind: 'partial', amount: 0 })] });
    bad({ debtPayments: [dpay({ debtId: 'missing' })] });
    bad({ debtPayments: [dpay({ amount: -1 })] });
    bad({ debtPayments: [dpay({ amount: 1.5 })] });
    bad({ debtPayments: [dpay({ kind: 'bonus' as any })] });
    bad({ debtPayments: [dpay({ date: '2026-02-30' })] });
    bad({ debtPayments: [dpay({ id: '' })] });
    bad({ debtPayments: [dpay({ note: 1 as any })] });
    bad({ debtPayments: [dpay(), dpay()] });
  });
  it('validates debt overrides', () => {
    ok({ debtOverrides: [dovr({ skip: true, newDate: null, newAmount: null })] });
    bad({ debtOverrides: [dovr({ debtId: 'missing' })] });
    bad({ debtOverrides: [dovr({ originalDate: '2026-02-30' })] });
    bad({ debtOverrides: [dovr({ newDate: '2026-04-31' })] });
    bad({ debtOverrides: [dovr({ newDate: '2026-04-30', originalDate: '2026-04-30' })] });
    bad({ debtOverrides: [dovr({ newAmount: -1 })] });
    bad({ debtOverrides: [dovr({ skip: 1 as any })] });
    bad({ debtOverrides: [dovr(), dovr({ id: 'other' })] });
  });
  it('validates cheques', () => {
    ok({ cheques: [chq({ seriesId: 's', status: 'cleared', amount: 0 })] });
    bad({ cheques: [chq({ status: 'bounced' as any })] });
    bad({ cheques: [chq({ amount: -1 })] });
    bad({ cheques: [chq({ amount: 0.5 })] });
    bad({ cheques: [chq({ date: '2026-02-30' })] });
    bad({ cheques: [chq({ seriesId: '' })] });
    bad({ cheques: [chq({ id: '' })] });
    bad({ cheques: [chq({ payee: 3 as any })] });
    bad({ cheques: [chq(), chq()] });
  });
  it('restores into a repository', async () => {
    const target = createMemoryRepository();
    await target.init();
    await target.importAll(parseBackup(serializeBackup(data)));
    expect((await target.exportAll()).debts).toEqual(data.debts);
    expect(await target.listCheques()).toEqual(data.cheques);
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
    await expect(exportAllCsv(repo)).rejects.toThrow('cancelled');
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

describe('one combined CSV', () => {
  it('has a titled section per kind of data with a blank line between, and neutralises formulas', async () => {
    const repo = createMemoryRepository({ transactions: [txn({ description: '=HYPERLINK("x")' })], cheques: [chq({ payee: '+evil' })] });
    await repo.init();
    const csv = buildCombinedCsv(await repo.exportAll());
    const lines = csv.split('\r\n');
    const titles = ['One-time items', 'Recurring items', 'Debts', 'Debt payments', 'Cheques'];
    expect(lines.filter((l) => titles.includes(l))).toEqual(titles);
    expect(lines[lines.indexOf('Recurring items') - 1]).toBe(''); // blank line before each later section
    expect(lines[lines.indexOf('One-time items') + 1]).toBe('Date,Type,Description,Category,Amount,Note,Planned');
    expect(lines[lines.indexOf('Debt payments') + 1]).toBe('Date,Debt,Amount,Kind,Note');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("'+evil");
  });
  it('builds recurring rows', () => {
    const csv = buildRecurringCsv(
      [{ id: 'r', kind: 'cost', name: '@Rent', categoryId: 'housing', amount: 950000, schedule: { type: 'monthly', day: 'last', everyMonths: 3 }, startDate: '2026-01-31', endDate: null, count: 4, note: '' }],
      DEFAULT_CATEGORIES,
    );
    expect(csv.split('\r\n')).toEqual(['Name,Type,Category,Amount,Repeats,Starts,Ends,Number of payments,Note', "'@Rent,Cost,Housing,9500.00,Every 3 months on the last day,2026-01-31,,4,", '']);
  });
});

describe('debts and cheques CSV', () => {
  it('builds one row per debt with the columns of its type', () => {
    const csv = buildDebtsCsv([
      plan({ note: '=cmd' }),
      card({ archived: true }),
      loan({ name: 'Car, new', endDate: '2030-01-31' }),
    ]).split('\r\n');
    expect(csv).toEqual([
      'Name,Type,Status,Balance,Balance date,Monthly payment,Payment day,Limit,Yearly rate %,Monthly rate %,Total,First payment,Payments,End date,Note',
      '"Car, new",Loan,Active,40000.00,2026-02-01,1500.00,31,,4.99,,,,,2030-01-31,"Bank, ""main"""',
      "Phone,Instalment plan,Active,,,300.00,,,,,3600.00,2026-02-15,12,,'=cmd",
      'Visa,Credit card,Archived,5000.00,2026-02-01,,28,20000.00,,3.25,,,,,',
      '',
    ]);
  });
  it('has just the header when there are no debts or cheques', () => {
    expect(buildDebtsCsv([]).split('\r\n')).toHaveLength(2);
    expect(buildChequesCsv([])).toBe('Date,Payee,Amount,Purpose,Status,Note\r\n');
  });
  it('builds cheque rows sorted by date', () => {
    const csv = buildChequesCsv([
      chq({ id: 'b', date: '2026-05-01', payee: '-Evil', status: 'cleared' }),
      chq({ id: 'a', date: '2026-04-01', purpose: 'Rent, April', note: 'x' }),
    ]).split('\r\n');
    expect(csv).toEqual([
      'Date,Payee,Amount,Purpose,Status,Note',
      '2026-04-01,Landlord,5000.00,"Rent, April",Upcoming,x',
      "2026-05-01,'-Evil,5000.00,Rent,Cleared,",
      '',
    ]);
  });
});
