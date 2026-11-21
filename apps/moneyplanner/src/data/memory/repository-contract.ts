// Shared contract suite: run against every Repository implementation.
import { DEFAULT_CATEGORIES } from '@/data/defaults';
import { BACKUP_FORMAT, BACKUP_VERSION, type Repository } from '@/data/repository';
import type { OccurrenceOverride, RecurringItem, Transaction } from '@/types';

export const rec = (o: Partial<RecurringItem> = {}): RecurringItem => ({
  id: 'r1', kind: 'cost', name: 'Rent', categoryId: 'housing', amount: 500000,
  schedule: { type: 'monthly', day: 'last' }, startDate: '2026-01-01', endDate: null, count: null, note: '', ...o,
});
export const ovr = (o: Partial<OccurrenceOverride> = {}): OccurrenceOverride => ({
  id: 'o1', recurringId: 'r1', originalDate: '2026-02-28', skip: false, newDate: '2026-03-02', newAmount: 123, paid: true, ...o,
});
export const txn = (o: Partial<Transaction> = {}): Transaction => ({
  id: 't1', kind: 'cost', date: '2026-03-05', description: 'Lunch', categoryId: 'dining', amount: 4550,
  note: 'with, "comma"', source: 'manual', importId: null, planned: false, ...o,
});

export function runRepositoryContract(name: string, make: () => Promise<Repository>) {
  describe(`Repository contract: ${name}`, () => {
    let repo: Repository;
    beforeEach(async () => {
      repo = await make();
      await repo.init();
    });

    it('has defaults after init, and init twice is safe', async () => {
      await repo.init();
      const s = await repo.getSettings();
      expect(s.currency).toBe('AED');
      expect(s.onboarded).toBe(false);
      expect(s.enabledModules.debts).toBe(true);
      expect(await repo.listCategories()).toEqual(DEFAULT_CATEGORIES);
      expect(await repo.listRecurring()).toEqual([]);
      expect(await repo.listTransactions()).toEqual([]);
    });

    it('merges settings patches', async () => {
      const s = await repo.updateSettings({ onboarded: true, startingBalance: 123456, payday: 25 });
      expect(s.onboarded).toBe(true);
      expect(s.currency).toBe('AED');
      await repo.updateSettings({ buffer: 5000 });
      const again = await repo.getSettings();
      expect(again).toMatchObject({ onboarded: true, startingBalance: 123456, payday: 25, buffer: 5000 });
      await repo.updateSettings({ payday: null, enabledModules: { ...again.enabledModules, cheques: true } });
      const last = await repo.getSettings();
      expect(last.payday).toBeNull();
      expect(last.enabledModules.cheques).toBe(true);
    });

    it('upserts categories and keeps them sorted', async () => {
      await repo.upsertCategory({ id: 'pets', name: 'Pets', kind: 'cost', sort: 99, archived: false });
      await repo.upsertCategory({ id: 'salary', name: 'Pay', kind: 'income', sort: 0, archived: false });
      const cats = await repo.listCategories();
      expect(cats).toHaveLength(DEFAULT_CATEGORIES.length + 1);
      expect(cats.find((c) => c.id === 'salary')?.name).toBe('Pay');
      expect(cats[cats.length - 1].id).toBe('pets');
    });

    it('removeCategory deletes an unused category', async () => {
      await repo.removeCategory('education');
      expect((await repo.listCategories()).some((c) => c.id === 'education')).toBe(false);
    });

    it('removeCategory archives a category used by a recurring item or a transaction', async () => {
      await repo.upsertRecurring(rec({ categoryId: 'housing' }));
      await repo.upsertTransaction(txn({ categoryId: 'dining' }));
      await repo.removeCategory('housing');
      await repo.removeCategory('dining');
      const cats = await repo.listCategories();
      expect(cats.find((c) => c.id === 'housing')?.archived).toBe(true);
      expect(cats.find((c) => c.id === 'dining')?.archived).toBe(true);
    });

    it('upserts and deletes recurring items (including nulls and schedules)', async () => {
      await repo.upsertRecurring(rec());
      await repo.upsertRecurring(rec({ id: 'r2', categoryId: null, endDate: '2026-12-31', count: 6, schedule: { type: 'weekly', everyWeeks: 2 } }));
      await repo.upsertRecurring(rec({ name: 'Rent 2' }));
      const list = await repo.listRecurring();
      expect(list).toHaveLength(2);
      expect(list.find((r) => r.id === 'r1')).toEqual(rec({ name: 'Rent 2' }));
      expect(list.find((r) => r.id === 'r2')).toEqual(
        rec({ id: 'r2', categoryId: null, endDate: '2026-12-31', count: 6, schedule: { type: 'weekly', everyWeeks: 2 } }),
      );
    });

    it('deleteRecurring also deletes its overrides only', async () => {
      await repo.upsertRecurring(rec());
      await repo.upsertRecurring(rec({ id: 'r2' }));
      await repo.upsertOverride(ovr());
      await repo.upsertOverride(ovr({ id: 'o2', recurringId: 'r2' }));
      await repo.deleteRecurring('r1');
      expect((await repo.listRecurring()).map((r) => r.id)).toEqual(['r2']);
      expect((await repo.listOverrides()).map((o) => o.id)).toEqual(['o2']);
    });

    it('keeps one override per (recurringId, originalDate)', async () => {
      await repo.upsertOverride(ovr());
      await repo.upsertOverride(ovr({ id: 'o-other', newAmount: 999, skip: true, newDate: null, paid: false }));
      const all = await repo.listOverrides();
      expect(all).toEqual([ovr({ id: 'o-other', newAmount: 999, skip: true, newDate: null, paid: false })]);
      await repo.upsertOverride(ovr({ id: 'o-other', originalDate: '2026-03-31' }));
      await repo.upsertOverride(ovr({ id: 'o3', recurringId: 'r2' }));
      expect(await repo.listOverrides()).toHaveLength(2); // o-other (moved date) and o3
      expect((await repo.listOverrides('r1')).map((o) => o.id)).toEqual(['o-other']);
      expect((await repo.listOverrides('r2')).map((o) => o.id)).toEqual(['o3']);
    });

    it('deletes an override', async () => {
      await repo.upsertOverride(ovr());
      await repo.deleteOverride('o1');
      expect(await repo.listOverrides()).toEqual([]);
    });

    it('lists transactions by date then id, with an inclusive range', async () => {
      await repo.upsertTransaction(txn({ id: 'b', date: '2026-03-05' }));
      await repo.upsertTransaction(txn({ id: 'a', date: '2026-03-05' }));
      await repo.upsertTransaction(txn({ id: 'c', date: '2026-03-01' }));
      await repo.upsertTransaction(txn({ id: 'd', date: '2026-04-01', planned: true, categoryId: null, importId: 'imp', source: 'import' }));
      expect((await repo.listTransactions()).map((t) => t.id)).toEqual(['c', 'a', 'b', 'd']);
      expect((await repo.listTransactions({ from: '2026-03-05', to: '2026-03-05' })).map((t) => t.id)).toEqual(['a', 'b']);
      expect((await repo.listTransactions({ from: '2026-03-02' })).map((t) => t.id)).toEqual(['a', 'b', 'd']);
      expect((await repo.listTransactions({ to: '2026-03-01' })).map((t) => t.id)).toEqual(['c']);
      expect((await repo.listTransactions()).find((t) => t.id === 'd')).toEqual(
        txn({ id: 'd', date: '2026-04-01', planned: true, categoryId: null, importId: 'imp', source: 'import' }),
      );
      await repo.deleteTransaction('a');
      expect((await repo.listTransactions()).map((t) => t.id)).toEqual(['c', 'b', 'd']);
    });

    it('exportAll then importAll round-trips', async () => {
      await repo.updateSettings({ onboarded: true, startingBalance: 99900 });
      await repo.upsertRecurring(rec());
      await repo.upsertOverride(ovr());
      await repo.upsertTransaction(txn());
      const backup = await repo.exportAll();
      expect(backup.format).toBe(BACKUP_FORMAT);
      expect(backup.version).toBe(BACKUP_VERSION);
      expect(Number.isNaN(Date.parse(backup.exportedAt))).toBe(false);

      await repo.deleteAll();
      await repo.importAll(JSON.parse(JSON.stringify(backup)));
      const again = await repo.exportAll();
      expect({ ...again, exportedAt: '' }).toEqual({ ...backup, exportedAt: '' });
    });

    it('importAll replaces everything', async () => {
      await repo.upsertRecurring(rec({ id: 'old' }));
      await repo.upsertTransaction(txn({ id: 'old' }));
      await repo.upsertOverride(ovr({ id: 'old', recurringId: 'old' }));
      const other = await (async () => {
        const r2 = await make();
        await r2.init();
        await r2.updateSettings({ currency: 'USD' });
        await r2.upsertCategory({ id: 'x', name: 'X', kind: 'cost', sort: 1, archived: false });
        await r2.upsertTransaction(txn({ id: 'new', categoryId: 'x' }));
        return r2.exportAll();
      })();
      await repo.importAll(other);
      expect((await repo.getSettings()).currency).toBe('USD');
      expect((await repo.listRecurring())).toEqual([]);
      expect((await repo.listOverrides())).toEqual([]);
      expect((await repo.listTransactions()).map((t) => t.id)).toEqual(['new']);
      expect((await repo.listCategories()).some((c) => c.id === 'x')).toBe(true);
    });

    it('deleteAll resets to defaults', async () => {
      await repo.updateSettings({ onboarded: true, currency: 'USD' });
      await repo.upsertRecurring(rec());
      await repo.upsertOverride(ovr());
      await repo.upsertTransaction(txn());
      await repo.upsertCategory({ id: 'x', name: 'X', kind: 'cost', sort: 1, archived: false });
      await repo.deleteAll();
      expect((await repo.getSettings()).onboarded).toBe(false);
      expect((await repo.getSettings()).currency).toBe('AED');
      expect(await repo.listCategories()).toEqual(DEFAULT_CATEGORIES);
      expect(await repo.listRecurring()).toEqual([]);
      expect(await repo.listOverrides()).toEqual([]);
      expect(await repo.listTransactions()).toEqual([]);
    });

    it('does not share state with callers', async () => {
      const item = rec();
      await repo.upsertRecurring(item);
      item.name = 'mutated';
      (item.schedule as { day: number | 'last' }).day = 1;
      const got = await repo.listRecurring();
      expect(got[0].name).toBe('Rent');
      got[0].name = 'mutated again';
      expect((await repo.listRecurring())[0].name).toBe('Rent');
      const s = await repo.getSettings();
      s.enabledModules.cheques = true;
      expect((await repo.getSettings()).enabledModules.cheques).toBe(false);
    });
  });
}
