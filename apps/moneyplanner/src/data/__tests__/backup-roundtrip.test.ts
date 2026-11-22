// A version 1 backup (made by milestone 1) restores into a milestone 2 repository,
// and the next export is a version 2 file that restores again with debts and cheques intact.
import { createMemoryRepository } from '@/data/memory/memory-repository';
import { card, chq, dovr, dpay, loan, plan, rec, ovr, txn } from '@/data/memory/repository-contract';
import { parseBackup, serializeBackup } from '@/data/backup';
import { BACKUP_FORMAT, BACKUP_VERSION } from '@/data/repository';
import { DEFAULT_CATEGORIES } from '@/data/defaults';

/** What milestone 1 wrote: version 1, no debts, payments, schedule changes or cheques. */
const v1File = () =>
  JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: '2026-03-01T10:00:00.000Z',
    settings: { currency: 'AED', payday: 25, startingBalance: 650000, startingBalanceDate: '2026-01-01', buffer: 200000, enabledModules: { debts: false, cheques: false, alerts: false, import: true }, alertThresholds: { debtCautionPct: 35, debtHighPct: 55, cardUsagePct: 75 }, onboarded: true, lockEnabled: true },
    categories: DEFAULT_CATEGORIES,
    recurring: [rec()],
    overrides: [ovr()],
    transactions: [txn()],
  });

describe('v1 backup, then a v2 export', () => {
  it('restores v1 with the new lists empty, keeps its settings and data, and never restores the lock', async () => {
    const parsed = parseBackup(v1File());
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(parsed).toMatchObject({ debts: [], debtPayments: [], debtOverrides: [], cheques: [] });
    expect(parsed.settings.alertThresholds).toEqual({ debtCautionPct: 35, debtHighPct: 55, cardUsagePct: 75 });
    expect(parsed.settings.lockEnabled).toBe(false); // a PIN never travels in a backup
    expect(parsed.settings.enabledModules).toMatchObject({ import: true, alerts: false });
    expect(parsed.recurring).toEqual([rec()]);
    expect(parsed.transactions).toEqual([txn()]);
  });

  it('a v1 restore replaces debts and cheques already in the app (they are not in the file)', async () => {
    const repo = createMemoryRepository({ debts: [loan()], debtPayments: [dpay()], debtOverrides: [dovr()], cheques: [chq()] });
    await repo.init();
    await repo.importAll(parseBackup(v1File()));
    expect(await repo.listDebts()).toEqual([]);
    expect(await repo.listCheques()).toEqual([]);
    expect((await repo.exportAll()).debtPayments).toEqual([]);
    expect(await repo.listRecurring()).toHaveLength(1);
  });

  it('restore v1 -> add debts and cheques -> export v2 -> restore elsewhere gives the same data', async () => {
    const a = createMemoryRepository();
    await a.init();
    await a.importAll(parseBackup(v1File()));
    await a.upsertDebt(loan());
    await a.upsertDebt(card());
    await a.upsertDebt(plan());
    await a.upsertDebtPayment(dpay());
    await a.upsertDebtOverride(dovr());
    await a.upsertCheques([chq({ id: 'c1', seriesId: 'S' }), chq({ id: 'c2', seriesId: 'S', date: '2026-07-01', status: 'cleared' }), chq({ id: 'c3', status: 'cancelled', note: 'void' })]);

    const file = serializeBackup(await a.exportAll());
    expect(JSON.parse(file).version).toBe(2);

    const b = createMemoryRepository();
    await b.init();
    await b.importAll(parseBackup(file));
    const [ea, eb] = [await a.exportAll(), await b.exportAll()];
    // exportedAt is the only field that may differ.
    expect({ ...eb, exportedAt: '' }).toEqual({ ...ea, exportedAt: '' });
    expect(eb.debts).toHaveLength(3);
    expect(eb.cheques.map((c) => c.status).sort()).toEqual(['cancelled', 'cleared', 'upcoming']);
    expect(eb.recurring).toEqual([rec()]);
  });
});
