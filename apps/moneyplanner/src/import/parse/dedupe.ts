import { diffDays } from '@/lib/dates';
import type { Transaction } from '@/types';
import type { DedupedRow, ParsedRow } from './types';

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ&]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !/^\d+$/.test(t));

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '').replace(/^nodescription$/, '');

/** 0-1 similarity of two descriptions: word overlap, or 1 when one contains the other. */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const ja = ta.join(' ');
  const jb = tb.join(' ');
  if (ja.includes(jb) || jb.includes(ja)) return 1;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let both = 0;
  for (const t of sa) {
    if (sb.has(t) || [...sb].some((u) => u.length >= 4 && t.length >= 4 && (u.startsWith(t) || t.startsWith(u)))) both++;
  }
  return both / (sa.size + sb.size - both);
}

/**
 * Marks rows that are probably already saved: same kind and amount, date within a day, similar
 * description. Each saved item can match only one row, so two real identical purchases are not both flagged.
 * Returns the rows in the same order, with `duplicateOf` set to the saved transaction's id.
 */
export function dedupe(rows: ParsedRow[], existing: Transaction[]): DedupedRow[] {
  const taken = new Set<string>();
  return rows.map((row) => {
    let best: { id: string; score: number } | null = null;
    for (const t of existing) {
      if (taken.has(t.id) || t.kind !== row.kind || t.amount !== row.amount) continue;
      const gap = Math.abs(diffDays(t.date, row.date));
      if (gap > 1) continue;
      let sim = descriptionSimilarity(t.description, row.description);
      if (!tokens(t.description).length || !tokens(row.description).length) {
        // Nothing comparable (numbers only, one letter, empty): same day and the same text, or nothing.
        sim = gap === 0 && plain(t.description) === plain(row.description) ? 1 : 0;
      }
      if (sim < 0.5) continue;
      const score = sim * 10 - gap;
      if (!best || score > best.score) best = { id: t.id, score };
    }
    if (!best) return { ...row };
    taken.add(best.id);
    return { ...row, duplicateOf: best.id };
  });
}
