// Alerts state facts, never advice: scan every alert the engine can produce, across many situations.
import { planNotifications } from '@/features/alerts/plan';
import type { AlertKind, AppAlert, Transaction } from '@/types';

import { buildAlerts } from '../index';
import { card, cheque, income, input, loan, plan, settings } from '../test-fixtures';

// Node's fs, without node type definitions (the project has none): tests run from the app folder.
const readSource = (file: string): string => jest.requireActual<{ readFileSync: (p: string, e: string) => string }>('fs').readFileSync(`${(globalThis as unknown as { process: { cwd(): string } }).process.cwd()}/${file}`, 'utf8');

const TODAY = '2026-01-10';
const tx = (date: string, amount: number): Transaction => ({
  id: `t-${date}-${amount}`, kind: 'cost', date, description: 'x', categoryId: null, amount, note: '', source: 'manual', importId: null, planned: true,
});

// Advice words in any case, with or without an apostrophe ("shouldn't"), as whole words.
const ADVICE = /\b(should|shouldn['’]?t|must|need to|needs to|ought|consider|try to|avoid|recommend\w*|advise\w*|you['’]?d better|make sure|don['’]?t)\b/i;

/** A spread of situations so every alert kind shows up with different numbers and names. */
function scenarios() {
  const out: ReturnType<typeof input>[] = [];
  for (const balance of [-500000, 0, 20000, 1000000]) {
    for (const buffer of [0, 300000, 99999999]) {
      for (const pct of [10, 45, 60]) {
        // income 100,000 fils/month so the debt payments are pct% of it
        const pay = Math.round((100000 * pct) / 100);
        for (const [name, extras] of [['Car loan', true], ['Visa "Gold" & Co.', true], ['Ünïcode ☕', true], ['', true], ['Only loan', false]] as const) {
          out.push(
            input({
              settings: settings({ startingBalance: balance, startingBalanceDate: '2026-01-01', buffer }),
              recurring: [income(100000)],
              // Without the extras the debt payments are exactly pct% of income (so the caution level is reachable).
              debts: [
                loan({ name, balance: pay * 2, monthlyPayment: pay }),
                ...(extras
                  ? [card({ name: name || 'Card', balance: 900000, plan: 'minimum', dueDay: 28 }), plan({ name: name || 'Plan', firstPaymentDate: '2026-01-20', payments: 2, total: 80000, monthlyAmount: 40000 })]
                  : []),
              ],
              cheques: [cheque({ id: 'Q', payee: name || 'Landlord', amount: 99999999, date: '2026-01-20' }), cheque({ id: 'Q2', payee: 'Next', amount: 5000, date: '2026-02-01' })],
              transactions: [tx('2026-01-20', 5000000)],
            }),
          );
        }
      }
    }
  }
  return out;
}

describe('alert wording', () => {
  const all: AppAlert[] = scenarios().flatMap((i) => buildAlerts(i, TODAY));

  it('the scenarios produce every kind of alert, in several severities', () => {
    const kinds = new Set<AlertKind>(all.map((a) => a.kind));
    for (const k of ['shortfall-zero', 'shortfall-buffer', 'debt-ratio-caution', 'debt-ratio-high', 'card-near-limit', 'cheque-uncovered', 'card-minimum-interest', 'debt-ends'] as AlertKind[]) {
      expect([k, kinds.has(k)]).toEqual([k, true]);
    }
    expect(new Set(all.map((a) => a.severity)).size).toBeGreaterThanOrEqual(2);
    expect(all.length).toBeGreaterThan(100);
  });

  it('no title or message contains advice, in any scenario', () => {
    for (const a of all) {
      expect(`${a.title}\n${a.message}`).not.toMatch(ADVICE);
      expect(a.message.trim().length).toBeGreaterThan(0);
      expect(a.title.trim().length).toBeGreaterThan(0);
    }
  });

  it('notification text built from them (unlocked and locked) is advice-free too', () => {
    const now = new Date(2026, 0, 10, 8, 0);
    for (const i of scenarios().slice(0, 40)) {
      for (const locked of [false, true]) {
        for (const n of planNotifications(buildAlerts(i, TODAY), locked, now)) expect(`${n.title} ${n.body}`).not.toMatch(ADVICE);
      }
    }
  });

  it('the wording source files contain no advice either (catches branches the scenarios miss)', () => {
    for (const file of ['src/engine/alerts/index.ts', 'src/features/alerts/plan.ts', 'src/features/alerts/AlertsCard.tsx', 'src/features/alerts/AlertsSettings.tsx']) {
      const text = readSource(file);
      // Only string literals and JSX text matter; comments may say "never advice".
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const literals = code.match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*\1|>[^<>{}\n]+</g) ?? [];
      for (const lit of literals) expect({ file, lit }).not.toEqual({ file, lit: expect.stringMatching(/\b(should|shouldn['’]?t)\b/i) });
    }
  });
});
