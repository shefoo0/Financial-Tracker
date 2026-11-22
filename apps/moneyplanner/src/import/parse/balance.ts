import type { ParsedRow } from './types';

/** Warnings that a matching running balance proves wrong, so they are removed when the balance agrees. */
const PROVEN = [
  'The file does not say whether',
  'Both a debit and a credit',
  'Direction guessed',
  'The statement line does not say',
];

/** Warnings that mean the direction was only a guess. */
const ASSUMED = ['The file does not say whether', 'The statement line does not say', 'Direction guessed'];

export const BALANCE_MISMATCH = 'The running balance does not match this amount; check it.';
export const BALANCE_DIRECTION = 'The running balance says this was the opposite direction (money in vs out); check it.';

const signed = (r: ParsedRow) => (r.kind === 'income' ? r.amount : -r.amount);

export interface BalanceCheck {
  /** Rows (by index) whose balance delta agrees with the amount. */
  agreed: number;
  /** Rows whose delta disagrees. */
  disagreed: number;
  /** Rows that had a previous balance to compare with. */
  checked: number;
  order: 'oldest-first' | 'newest-first' | null;
}

/**
 * Cross-checks each row against the running balance. The row before it in time (or the opening balance)
 * plus the row's signed amount must give the row's balance. The order of the file (oldest or newest
 * first) is the one with more agreeing rows. Agreeing rows get confidence >= 0.9 and lose warnings the
 * balance disproves; rows that were only assumed to be spending are flipped to income when the
 * balance proves it; others that disagree are flagged. Mutates the rows.
 */
export function checkBalances(rows: ParsedRow[], opening?: number): BalanceCheck {
  const refOf = (i: number, order: 'oldest-first' | 'newest-first'): number | undefined => {
    const j = order === 'oldest-first' ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) return opening;
    return rows[j].balance;
  };
  const test = (order: 'oldest-first' | 'newest-first') => {
    let agreed = 0;
    let checked = 0;
    rows.forEach((r, i) => {
      const ref = refOf(i, order);
      if (r.balance === undefined || ref === undefined) return;
      checked++;
      // Either direction counts here: the order of the file is judged by the amounts, not by guessed directions.
      if (r.balance - ref === signed(r) || Math.abs(r.balance - ref) === r.amount) agreed++;
    });
    return { agreed, checked };
  };
  const a = test('oldest-first');
  const b = test('newest-first');
  const order = b.agreed > a.agreed ? 'newest-first' : 'oldest-first';
  const best = order === 'newest-first' ? b : a;
  const out: BalanceCheck = { agreed: 0, disagreed: 0, checked: best.checked, order: best.agreed > 0 ? order : null };
  if (best.agreed === 0) return out;

  rows.forEach((r, i) => {
    const ref = refOf(i, order);
    if (r.balance === undefined || ref === undefined) return;
    const delta = r.balance - ref;
    if (delta === signed(r)) {
      out.agreed++;
      r.warnings = r.warnings.filter((w) => !PROVEN.some((p) => w.startsWith(p)));
      if (!r.warnings.some((w) => /\b(date|year)\b|corrected from a scan/i.test(w))) r.confidence = Math.max(r.confidence, 0.9);
    } else if (Math.abs(delta) === r.amount && delta !== 0) {
      const lowDirection = r.warnings.some((w) => ASSUMED.some((p) => w.startsWith(p)));
      if (lowDirection) {
        r.kind = delta > 0 ? 'income' : 'cost';
        r.warnings = r.warnings.filter((w) => !PROVEN.some((p) => w.startsWith(p)));
        r.confidence = Math.max(r.confidence, 0.9);
        out.agreed++;
      } else {
        out.disagreed++;
        r.warnings.push(BALANCE_DIRECTION);
        r.confidence = Math.min(r.confidence, 0.6);
      }
    } else {
      out.disagreed++;
      r.warnings.push(BALANCE_MISMATCH);
      r.confidence = Math.min(r.confidence, 0.6);
    }
  });
  return out;
}
