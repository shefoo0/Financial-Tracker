// Shared contract suite: run against every Repository implementation.
import { DEFAULT_CATEGORIES } from '@/data/defaults';
import { BACKUP_FORMAT, BACKUP_VERSION, type Repository } from '@/data/repository';
import type { CategoryRuleRecord, Cheque, ImportRecord, ImportTemplate, CreditCard, DebtOverride, DebtPayment, InstalmentPlan, Loan, OccurrenceOverride, RecurringItem, Transaction } from '@/types';

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

export const loan = (o: Partial<Loan> = {}): Loan => ({
  id: 'd-loan', type: 'loan', name: 'Car loan', note: 'Bank, "main"', archived: false, createdAt: '2026-01-02',
  balance: 4000000, balanceDate: '2026-02-01', monthlyPayment: 150000, paymentDay: 31, annualRatePct: 4.99, endDate: null, ...o,
});
export const card = (o: Partial<CreditCard> = {}): CreditCard => ({
  id: 'd-card', type: 'card', name: 'Visa', note: '', archived: false, createdAt: '2026-01-03',
  limit: 2000000, balance: 500000, balanceDate: '2026-02-01', statementDay: 10, dueDay: 28, minPct: 5, minFloor: 10000,
  monthlyRatePct: 3.25, plan: 'fixed', fixedAmount: 100000, ...o,
});
export const plan = (o: Partial<InstalmentPlan> = {}): InstalmentPlan => ({
  id: 'd-plan', type: 'plan', name: 'Phone', note: '', archived: false, createdAt: '2026-01-04',
  total: 360000, monthlyAmount: 30000, firstPaymentDate: '2026-02-15', payments: 12, cardId: 'd-card', ...o,
});
export const dpay = (o: Partial<DebtPayment> = {}): DebtPayment => ({
  id: 'p1', debtId: 'd-loan', date: '2026-03-01', amount: 150000, kind: 'regular', note: '', ...o,
});
export const dovr = (o: Partial<DebtOverride> = {}): DebtOverride => ({
  id: 'do1', debtId: 'd-loan', originalDate: '2026-04-30', newDate: '2026-05-02', newAmount: 120000, skip: false, ...o,
});
export const chq = (o: Partial<Cheque> = {}): Cheque => ({
  id: 'c1', payee: 'Landlord', amount: 500000, date: '2026-04-01', purpose: 'Rent', status: 'upcoming', seriesId: null, note: '', ...o,
});

export const imp = (o: Partial<ImportRecord> = {}): ImportRecord => ({
  id: 'i1', sourceName: 'ENBD-march.csv', fileKind: 'csv', importedAt: '2026-04-01T08:00:00.000Z', rowCount: 12, ...o,
});
export const tpl = (o: Partial<ImportTemplate> = {}): ImportTemplate => ({
  sourceName: 'ENBD-march.csv', mapping: { delimiter: ',', headerRow: 0, date: 0, description: 1, debit: null, credit: null, amount: 2, balance: null, direction: null, dateOrder: 'dmy' },
  lastUsed: '2026-04-01T08:00:00.000Z', ...o,
});
export const crule = (o: Partial<CategoryRuleRecord> = {}): CategoryRuleRecord => ({
  id: 'cr1', pattern: 'CAREEM', categoryId: 'transport', createdAt: '2026-04-01T08:00:00.000Z', ...o,
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

    it('applies overlapping updateSettings calls one after the other without losing any', async () => {
      await Promise.all([
        repo.updateSettings({ buffer: 111 }),
        repo.updateSettings({ payday: 7 }),
        repo.updateSettings({ startingBalance: 222 }),
        repo.updateSettings({ currency: 'USD' }),
      ]);
      expect(await repo.getSettings()).toMatchObject({ buffer: 111, payday: 7, startingBalance: 222, currency: 'USD' });
    });

    it('keeps every write when many overlap (double taps)', async () => {
      const writes: Promise<unknown>[] = [];
      for (let i = 0; i < 10; i++) {
        writes.push(repo.upsertTransaction(txn({ id: `t${i}`, date: '2026-04-01' })));
        writes.push(repo.upsertRecurring(rec({ id: `r${i}` })));
        writes.push(repo.upsertOverride(ovr({ id: `o${i}`, recurringId: `r${i}` })));
      }
      writes.push(repo.updateSettings({ onboarded: true }));
      writes.push(repo.deleteRecurring('r0'));
      writes.push(repo.upsertCategory({ id: 'pets', name: 'Pets', kind: 'cost', sort: 99, archived: false }));
      await Promise.all(writes);
      expect(await repo.listTransactions()).toHaveLength(10);
      expect((await repo.listRecurring()).map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9']);
      expect(await repo.listOverrides()).toHaveLength(9);
      expect((await repo.getSettings()).onboarded).toBe(true);
      expect((await repo.listCategories()).some((c) => c.id === 'pets')).toBe(true);
    });

    it('keeps creation order when an item or override is edited', async () => {
      await repo.upsertRecurring(rec({ id: 'a' }));
      await repo.upsertRecurring(rec({ id: 'b' }));
      await repo.upsertRecurring(rec({ id: 'c' }));
      await repo.upsertRecurring(rec({ id: 'a', name: 'Edited' }));
      const list = await repo.listRecurring();
      expect(list.map((r) => r.id)).toEqual(['a', 'b', 'c']);
      expect(list[0].name).toBe('Edited');
      await repo.upsertOverride(ovr({ id: 'o1', recurringId: 'a', originalDate: '2026-02-01' }));
      await repo.upsertOverride(ovr({ id: 'o2', recurringId: 'a', originalDate: '2026-03-01' }));
      await repo.upsertOverride(ovr({ id: 'o1', recurringId: 'a', originalDate: '2026-02-01', paid: false }));
      const os = await repo.listOverrides();
      expect(os.map((o) => o.id)).toEqual(['o1', 'o2']);
      expect(os[0].paid).toBe(false);
    });

    it('fills in missing nested settings with defaults', async () => {
      const data = await repo.exportAll();
      const partial = { ...data, settings: { ...data.settings, enabledModules: { cheques: true }, alertThresholds: { cardUsagePct: 70 } } } as any;
      await repo.importAll(partial);
      const s = await repo.getSettings();
      expect(s.enabledModules).toEqual({ debts: true, cheques: true, alerts: true, import: true });
      expect(s.alertThresholds).toEqual({ debtCautionPct: 40, debtHighPct: 50, cardUsagePct: 70 });
      const s2 = await repo.updateSettings({ alertThresholds: { cardUsagePct: 60 } as any });
      expect(s2.alertThresholds.debtHighPct).toBe(50);
    });

    it('stores, clears and exports a monthly category limit', async () => {
      expect((await repo.listCategories()).every((c) => c.monthlyLimit === null)).toBe(true);
      const groceries = (await repo.listCategories()).find((c) => c.id === 'groceries')!;
      await repo.upsertCategory({ ...groceries, monthlyLimit: 150000 });
      expect((await repo.listCategories()).find((c) => c.id === 'groceries')!.monthlyLimit).toBe(150000);
      expect((await repo.exportAll()).categories.find((c) => c.id === 'groceries')!.monthlyLimit).toBe(150000);
      await repo.upsertCategory({ ...groceries, monthlyLimit: null });
      expect((await repo.listCategories()).find((c) => c.id === 'groceries')!.monthlyLimit).toBeNull();
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

    it('importAll keeps this phone\'s lockEnabled, whatever the backup says', async () => {
      const backup = await repo.exportAll();
      await repo.updateSettings({ lockEnabled: true });
      await repo.importAll({ ...backup, settings: { ...backup.settings, lockEnabled: false } });
      expect((await repo.getSettings()).lockEnabled).toBe(true);
      await repo.updateSettings({ lockEnabled: false });
      await repo.importAll({ ...backup, settings: { ...backup.settings, lockEnabled: true } });
      expect((await repo.getSettings()).lockEnabled).toBe(false);
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

    describe('debts and cheques', () => {
      it('starts empty', async () => {
        expect(await repo.listDebts()).toEqual([]);
        expect(await repo.listDebtPayments()).toEqual([]);
        expect(await repo.listDebtOverrides()).toEqual([]);
        expect(await repo.listCheques()).toEqual([]);
      });

      it('round-trips each debt type, keeps creation order on edit, and deletes', async () => {
        await repo.upsertDebt(loan());
        await repo.upsertDebt(card());
        await repo.upsertDebt(plan({ cardId: null, note: 'n' }));
        await repo.upsertDebt(loan({ name: 'Car loan 2', annualRatePct: null, endDate: '2030-01-31', archived: true }));
        const list = await repo.listDebts();
        expect(list.map((d) => d.id)).toEqual(['d-loan', 'd-card', 'd-plan']);
        expect(list[0]).toEqual(loan({ name: 'Car loan 2', annualRatePct: null, endDate: '2030-01-31', archived: true }));
        expect(list[1]).toEqual(card());
        expect(list[2]).toEqual(plan({ cardId: null, note: 'n' }));
        await repo.deleteDebt('d-card');
        expect((await repo.listDebts()).map((d) => d.id)).toEqual(['d-loan', 'd-plan']);
      });

      it('lists payments by date then id, optionally for one debt', async () => {
        await repo.upsertDebt(loan());
        await repo.upsertDebt(plan());
        await repo.upsertDebtPayment(dpay({ id: 'b', date: '2026-03-01' }));
        await repo.upsertDebtPayment(dpay({ id: 'a', date: '2026-03-01', kind: 'extra', note: 'bonus' }));
        await repo.upsertDebtPayment(dpay({ id: 'c', date: '2026-02-01', kind: 'partial' }));
        await repo.upsertDebtPayment(dpay({ id: 'e', debtId: 'd-plan', date: '2026-02-15' }));
        expect((await repo.listDebtPayments()).map((p) => p.id)).toEqual(['c', 'e', 'a', 'b']);
        expect((await repo.listDebtPayments('d-loan')).map((p) => p.id)).toEqual(['c', 'a', 'b']);
        expect((await repo.listDebtPayments('d-plan')).map((p) => p.id)).toEqual(['e']);
        await repo.upsertDebtPayment(dpay({ id: 'a', date: '2026-01-01', amount: 5 }));
        expect((await repo.listDebtPayments('d-loan'))[0]).toEqual(dpay({ id: 'a', date: '2026-01-01', amount: 5, kind: 'regular' }));
        await repo.deleteDebtPayment('a');
        expect((await repo.listDebtPayments()).map((p) => p.id)).toEqual(['c', 'e', 'b']);
      });

      it('keeps one debt override per (debtId, originalDate)', async () => {
        await repo.upsertDebtOverride(dovr());
        await repo.upsertDebtOverride(dovr({ id: 'do-other', newDate: null, newAmount: null, skip: true }));
        expect(await repo.listDebtOverrides()).toEqual([dovr({ id: 'do-other', newDate: null, newAmount: null, skip: true })]);
        await repo.upsertDebtOverride(dovr({ id: 'do-other', originalDate: '2026-05-31', skip: false }));
        await repo.upsertDebtOverride(dovr({ id: 'do3', debtId: 'd-plan' }));
        await repo.upsertDebtOverride(dovr({ id: 'do-other', originalDate: '2026-05-31', skip: false, newAmount: 7 }));
        expect((await repo.listDebtOverrides()).map((o) => o.id)).toEqual(['do-other', 'do3']);
        expect((await repo.listDebtOverrides('d-loan')).map((o) => o.newAmount)).toEqual([7]);
        await repo.deleteDebtOverride('do-other');
        expect((await repo.listDebtOverrides()).map((o) => o.id)).toEqual(['do3']);
      });

      it('deleteDebt removes its payments and overrides and unlinks plans, leaving the rest', async () => {
        await repo.upsertDebt(loan());
        await repo.upsertDebt(card());
        await repo.upsertDebt(plan());
        await repo.upsertDebt(plan({ id: 'plan2', cardId: 'd-loan' }));
        await repo.upsertDebtPayment(dpay({ id: 'p1', debtId: 'd-card' }));
        await repo.upsertDebtPayment(dpay({ id: 'p2', debtId: 'd-loan' }));
        await repo.upsertDebtOverride(dovr({ id: 'o1', debtId: 'd-card' }));
        await repo.upsertDebtOverride(dovr({ id: 'o2', debtId: 'd-loan' }));
        await repo.deleteDebt('d-card');
        const debts = await repo.listDebts();
        expect(debts.map((d) => d.id)).toEqual(['d-loan', 'd-plan', 'plan2']);
        expect(debts.find((d) => d.id === 'd-plan')).toEqual(plan({ cardId: null }));
        expect(debts.find((d) => d.id === 'plan2')).toEqual(plan({ id: 'plan2', cardId: 'd-loan' }));
        expect((await repo.listDebtPayments()).map((p) => p.id)).toEqual(['p2']);
        expect((await repo.listDebtOverrides()).map((o) => o.id)).toEqual(['o2']);
      });

      it('lists cheques by date then id, saves a batch together, and deletes', async () => {
        await repo.upsertCheques([
          chq({ id: 'b', date: '2026-05-01', seriesId: 's1' }),
          chq({ id: 'a', date: '2026-05-01', seriesId: 's1', status: 'cleared', note: 'x' }),
          chq({ id: 'z', date: '2026-04-01' }),
        ]);
        expect((await repo.listCheques()).map((c) => c.id)).toEqual(['z', 'a', 'b']);
        await repo.upsertCheques([chq({ id: 'b', date: '2026-03-01', seriesId: 's1', status: 'cancelled' })]);
        const list = await repo.listCheques();
        expect(list.map((c) => c.id)).toEqual(['b', 'z', 'a']);
        expect(list[0]).toEqual(chq({ id: 'b', date: '2026-03-01', seriesId: 's1', status: 'cancelled' }));
        await repo.deleteCheque('z');
        expect((await repo.listCheques()).map((c) => c.id)).toEqual(['b', 'a']);
        await repo.upsertCheques([]);
        expect(await repo.listCheques()).toHaveLength(2);
      });

      it('exports, replaces and deletes the new lists with everything else', async () => {
        await repo.upsertDebt(loan());
        await repo.upsertDebt(plan());
        await repo.upsertDebtPayment(dpay());
        await repo.upsertDebtOverride(dovr());
        await repo.upsertCheques([chq()]);
        const backup = await repo.exportAll();
        expect(backup.debts).toHaveLength(2);
        expect(backup.debtPayments).toHaveLength(1);
        expect(backup.debtOverrides).toHaveLength(1);
        expect(backup.cheques).toHaveLength(1);

        await repo.importAll({ ...backup, debts: [card()], debtPayments: [], debtOverrides: [], cheques: [chq({ id: 'new' })] });
        expect((await repo.listDebts()).map((d) => d.id)).toEqual(['d-card']);
        expect(await repo.listDebtPayments()).toEqual([]);
        expect(await repo.listDebtOverrides()).toEqual([]);
        expect((await repo.listCheques()).map((c) => c.id)).toEqual(['new']);

        // A version 1 backup has none of the new lists: they come back empty.
        const v1: any = { ...backup, version: 1 };
        delete v1.debts; delete v1.debtPayments; delete v1.debtOverrides; delete v1.cheques;
        await repo.importAll(v1);
        expect(await repo.listDebts()).toEqual([]);
        expect(await repo.listCheques()).toEqual([]);

        await repo.importAll(backup);
        expect(await repo.listDebtPayments()).toHaveLength(1);
        await repo.deleteAll();
        expect(await repo.listDebts()).toEqual([]);
        expect(await repo.listDebtPayments()).toEqual([]);
        expect(await repo.listDebtOverrides()).toEqual([]);
        expect(await repo.listCheques()).toEqual([]);
      });

      it('keeps every write when debt writes overlap', async () => {
        const writes: Promise<unknown>[] = [];
        for (let i = 0; i < 8; i++) {
          writes.push(repo.upsertDebt(loan({ id: `l${i}` })));
          writes.push(repo.upsertDebtPayment(dpay({ id: `p${i}`, debtId: `l${i}` })));
          writes.push(repo.upsertDebtOverride(dovr({ id: `o${i}`, debtId: `l${i}` })));
          writes.push(repo.upsertCheques([chq({ id: `c${i}` })]));
        }
        writes.push(repo.deleteDebt('l0'));
        await Promise.all(writes);
        expect(await repo.listDebts()).toHaveLength(7);
        expect(await repo.listDebtPayments()).toHaveLength(7);
        expect(await repo.listDebtOverrides()).toHaveLength(7);
        expect(await repo.listCheques()).toHaveLength(8);
      });

      it('does not share state with callers', async () => {
        const d = loan();
        await repo.upsertDebt(d);
        d.name = 'mutated';
        const got = await repo.listDebts();
        expect(got[0].name).toBe('Car loan');
        got[0].name = 'again';
        expect((await repo.listDebts())[0].name).toBe('Car loan');
      });

      it('saves imported transactions together with their import record', async () => {
        await repo.upsertTransactions([txn({ id: 'a', source: 'import', importId: 'i1' }), txn({ id: 'b', source: 'import', importId: 'i1', date: '2026-03-06' })]);
        await repo.addImport(imp());
        const all = await repo.listTransactions();
        expect(all.map((t) => [t.id, t.source, t.importId])).toEqual([['a', 'import', 'i1'], ['b', 'import', 'i1']]);
        expect(await repo.listImports()).toEqual([imp()]);
        await repo.upsertTransactions([txn({ id: 'a', description: 'Changed', source: 'import', importId: 'i1' })]);
        expect((await repo.listTransactions()).find((t) => t.id === 'a')!.description).toBe('Changed');
        await repo.addImport(imp({ id: 'i0', importedAt: '2026-03-01T00:00:00.000Z' }));
        expect((await repo.listImports()).map((i) => i.id)).toEqual(['i0', 'i1']);
      });

      it('saves an import batch in one go, and repeating it with the same ids changes nothing', async () => {
        const batch = { transactions: [txn({ id: 'a', source: 'import' as const, importId: 'i1' }), txn({ id: 'b', source: 'import' as const, importId: 'i1' })], importRecord: imp(), template: tpl() };
        await repo.saveImportBatch(batch);
        await repo.saveImportBatch(batch);
        expect(await repo.listTransactions()).toHaveLength(2);
        expect(await repo.listImports()).toEqual([imp()]);
        expect(await repo.getImportTemplate('ENBD-march.csv')).toEqual(tpl());
        await repo.saveImportBatch({ transactions: [], importRecord: imp({ id: 'i2', importedAt: '2026-05-01T00:00:00.000Z' }) });
        expect((await repo.listImports()).map((i) => i.id)).toEqual(['i1', 'i2']);
      });

      it('saves nothing of an import batch when one row is invalid', async () => {
        const bad: any = txn({ id: 'z' });
        bad.amount = undefined; // NOT NULL in SQLite; the memory repository has no such rule
        try {
          await repo.saveImportBatch({ transactions: [txn({ id: 'a' }), bad], importRecord: imp() });
        } catch {
          expect(await repo.listTransactions()).toEqual([]);
          expect(await repo.listImports()).toEqual([]);
        }
      });

      it('keeps one template per source name', async () => {
        expect(await repo.getImportTemplate('ENBD-march.csv')).toBeNull();
        await repo.saveImportTemplate(tpl());
        await repo.saveImportTemplate(tpl({ lastUsed: '2026-05-01T00:00:00.000Z', mapping: { ...tpl().mapping, amount: 3 } }));
        const got = await repo.getImportTemplate('ENBD-march.csv');
        expect(got?.mapping.amount).toBe(3);
        expect(got?.lastUsed).toBe('2026-05-01T00:00:00.000Z');
        expect(await repo.getImportTemplate('other.csv')).toBeNull();
      });

      it('keeps one category rule per pattern (ignoring case) and deletes by id', async () => {
        await repo.upsertCategoryRule(crule());
        await repo.upsertCategoryRule(crule({ id: 'cr2', pattern: 'Careem', categoryId: 'dining', createdAt: '2026-04-02T00:00:00.000Z' }));
        await repo.upsertCategoryRule(crule({ id: 'cr3', pattern: 'NOON', categoryId: 'shopping', createdAt: '2026-04-03T00:00:00.000Z' }));
        const rules = await repo.listCategoryRules();
        expect(rules.map((r) => [r.id, r.pattern, r.categoryId])).toEqual([['cr2', 'Careem', 'dining'], ['cr3', 'NOON', 'shopping']]);
        await repo.deleteCategoryRule('cr2');
        expect((await repo.listCategoryRules()).map((r) => r.id)).toEqual(['cr3']);
      });

      it('reads a stored chart style that no longer exists (violet) as plain', async () => {
        await repo.updateSettings({ chartStyle: 'violet' as never });
        expect((await repo.getSettings()).chartStyle).toBe('plain');
        await repo.updateSettings({ chartStyle: 'ocean' });
        expect((await repo.getSettings()).chartStyle).toBe('ocean');
      });

      it('keeps one balance snapshot per date, sorted, and backs them up (older files restore with none)', async () => {
        expect(await repo.listBalanceSnapshots()).toEqual([]);
        await repo.upsertBalanceSnapshot({ date: '2026-05-10', balance: 900000 });
        await repo.upsertBalanceSnapshot({ date: '2026-04-01', balance: 500000 });
        await repo.upsertBalanceSnapshot({ date: '2026-05-10', balance: 950000 });
        expect(await repo.listBalanceSnapshots()).toEqual([
          { date: '2026-04-01', balance: 500000 },
          { date: '2026-05-10', balance: 950000 },
        ]);
        const backup = await repo.exportAll();
        expect(backup.balanceSnapshots).toHaveLength(2);
        await repo.deleteAll();
        expect(await repo.listBalanceSnapshots()).toEqual([]);
        await repo.importAll(backup);
        expect(await repo.listBalanceSnapshots()).toHaveLength(2);
        const old: any = { ...backup };
        delete old.balanceSnapshots;
        await repo.importAll(old);
        expect(await repo.listBalanceSnapshots()).toEqual([]);
      });

      it('backs up and restores the import lists; an older file restores with them empty; delete-all clears them', async () => {
        await repo.addImport(imp());
        await repo.saveImportTemplate(tpl());
        await repo.upsertCategoryRule(crule());
        const backup = await repo.exportAll();
        expect(backup.imports).toEqual([imp()]);
        expect(backup.importTemplates).toEqual([tpl()]);
        expect(backup.categoryRules).toEqual([crule()]);
        await repo.deleteAll();
        expect(await repo.listImports()).toEqual([]);
        expect(await repo.listCategoryRules()).toEqual([]);
        await repo.importAll(backup);
        expect(await repo.listImports()).toEqual([imp()]);
        expect(await repo.getImportTemplate('ENBD-march.csv')).toEqual(tpl());
        expect(await repo.listCategoryRules()).toEqual([crule()]);
        const old: any = { ...backup };
        delete old.imports; delete old.importTemplates; delete old.categoryRules;
        await repo.importAll(old);
        expect(await repo.listImports()).toEqual([]);
        expect(await repo.listCategoryRules()).toEqual([]);
        expect(await repo.getImportTemplate('ENBD-march.csv')).toBeNull();
      });
    });
  });
}
