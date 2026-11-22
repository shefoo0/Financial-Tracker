import { Text } from 'react-native';

import { defaultSettings } from '@/data/defaults';
import type { Repository } from '@/data/repository';
import { cheque, loan } from '@/engine/test-fixtures';
import { buildUpcoming } from '@/features/dashboard/upcoming';
import { markPaid } from '@/features/payday/markPaid';
import { addDays, today } from '@/lib/dates';
import type { PlanInput } from '@/types';

import { recurring, renderWithRepo, transaction } from '../../../../test-support/render';

const settings = { ...defaultSettings(), onboarded: true, startingBalance: 650000, startingBalanceDate: addDays(today(), -60) };

async function planInput(repo: Repository): Promise<PlanInput> {
  const b = await repo.exportAll();
  return { settings: b.settings, categories: b.categories, recurring: b.recurring, overrides: b.overrides, transactions: b.transactions, debts: b.debts, debtPayments: b.debtPayments, debtOverrides: b.debtOverrides, cheques: b.cheques };
}

const soon = () => addDays(today(), 2);
let n = 0;
const ids = () => `id-${++n}`;

async function setup() {
  const t = today();
  const { repo } = await renderWithRepo(<Text>x</Text>, {
    settings,
    recurring: [recurring({ id: 'rent', name: 'Rent', kind: 'cost', amount: 300000, schedule: { type: 'weekly', everyWeeks: 1 } })],
    transactions: [transaction({ id: 'gift', description: 'Gift', kind: 'cost', amount: 10000, date: soon(), planned: true })],
    cheques: [cheque({ id: 'Q1', payee: 'Landlord', date: soon() })],
    debts: [loan({ id: 'L1', name: 'Car loan', balance: 100000000, balanceDate: addDays(t, -60), paymentDay: Number(soon().slice(8)) })],
  });
  return repo;
}

const titles = async (repo: Repository) => buildUpcoming(await planInput(repo), today(), 20).map((u) => u.title);

describe('markPaid', () => {
  it('recurring: sets paid on the occurrence, and undo removes the override', async () => {
    const repo = await setup();
    const input = await planInput(repo);
    const row = buildUpcoming(input, today(), 20).find((u) => u.markPaid.kind === 'recurring')!;
    const undo = await markPaid(repo, input, row.markPaid, today(), ids);
    const ovs = await repo.listOverrides('rent');
    expect(ovs).toHaveLength(1);
    expect(ovs[0]).toMatchObject({ paid: true, skip: false, newDate: null, newAmount: null });
    await undo!();
    expect(await repo.listOverrides('rent')).toHaveLength(0);
  });

  it('recurring: undo restores an existing override exactly', async () => {
    const repo = await setup();
    const first = buildUpcoming(await planInput(repo), today(), 20).find((u) => u.markPaid.kind === 'recurring')!;
    if (first.markPaid.kind !== 'recurring') throw new Error();
    const before = { id: 'o1', recurringId: 'rent', originalDate: first.markPaid.originalDate, skip: false, newDate: null, newAmount: 250000, paid: false };
    await repo.upsertOverride(before);
    const input = await planInput(repo);
    const row = buildUpcoming(input, today(), 20).find((u) => u.markPaid.kind === 'recurring')!;
    const undo = await markPaid(repo, input, row.markPaid, today(), ids);
    expect((await repo.listOverrides('rent'))[0]).toMatchObject({ id: 'o1', paid: true, newAmount: 250000 });
    await undo!();
    expect(await repo.listOverrides('rent')).toEqual([before]);
  });

  it('debt payment: logs a regular payment of the scheduled amount, undo deletes it', async () => {
    const repo = await setup();
    const input = await planInput(repo);
    const row = buildUpcoming(input, today(), 20).find((u) => u.markPaid.kind === 'debt')!;
    expect(row.markPaid).toMatchObject({ kind: 'debt', debtId: 'L1', amount: 30000 });
    const undo = await markPaid(repo, input, row.markPaid, today(), ids);
    const pays = await repo.listDebtPayments('L1');
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ kind: 'regular', amount: 30000, date: soon() });
    // This month's payment is gone from Coming up (the next month's takes its place).
    expect(buildUpcoming(await planInput(repo), today(), 20).some((u) => u.key === row.key)).toBe(false);
    await undo!();
    expect(await repo.listDebtPayments('L1')).toHaveLength(0);
  });

  it('debt payment: a date that has passed is logged today', async () => {
    const repo = await setup();
    await markPaid(repo, await planInput(repo), { kind: 'debt', debtId: 'L1', date: addDays(today(), -3), amount: 5000 }, today(), ids);
    expect((await repo.listDebtPayments('L1'))[0].date).toBe(today());
  });

  it('cheque: clears it, undo makes it upcoming again', async () => {
    const repo = await setup();
    const input = await planInput(repo);
    const undo = await markPaid(repo, input, { kind: 'cheque', chequeId: 'Q1' }, today(), ids);
    expect((await repo.listCheques())[0].status).toBe('cleared');
    expect(await titles(repo)).not.toContain('Cheque to Landlord');
    await undo!();
    expect((await repo.listCheques())[0]).toEqual(input.cheques[0]);
  });

  it('planned item: sets planned false, undo sets it back', async () => {
    const repo = await setup();
    const input = await planInput(repo);
    const undo = await markPaid(repo, input, { kind: 'planned', transactionId: 'gift' }, today(), ids);
    expect((await repo.listTransactions())[0].planned).toBe(false);
    expect(await titles(repo)).not.toContain('Gift');
    await undo!();
    expect((await repo.listTransactions())[0]).toEqual(input.transactions[0]);
  });

  it('returns null when the item is gone', async () => {
    const repo = await setup();
    expect(await markPaid(repo, await planInput(repo), { kind: 'cheque', chequeId: 'nope' }, today(), ids)).toBeNull();
  });
});
