// Wording and tones for the report screens and the PDF.
import type { Delta, ReportRow } from '@/engine';
import { formatMoney } from '@/lib/money';
import type { Fils } from '@/types';
import type { Tone } from '@/components/ui';

export type Direction = 'up' | 'down' | 'flat' | 'new';

export function directionOf(d: { change: Fils | null; pct: number | null }): Direction {
  if (!d.change) return 'flat';
  if (d.pct == null) return d.change > 0 ? 'new' : 'down';
  return d.change > 0 ? 'up' : 'down';
}

const trim = (n: number) => String(Math.round(Math.abs(n) * 10) / 10);

/** '▲ 12%', '▼ 3.5%', '▲ new' (earlier figure was 0) or '0%'. */
export function pillText(d: { change: Fils | null; pct: number | null }): string {
  const dir = directionOf(d);
  if (dir === 'flat') return '0%';
  if (dir === 'new') return '▲ new';
  return `${dir === 'up' ? '▲' : '▼'} ${trim(d.pct as number)}%`;
}

/** The same for a screen reader: 'up 12 percent'. */
export function spokenDelta(d: { change: Fils | null; pct: number | null }): string {
  const dir = directionOf(d);
  if (dir === 'flat') return 'unchanged';
  if (dir === 'new') return 'up from nothing';
  return `${dir} ${trim(d.pct as number)} percent`;
}

/** Green when the move is good (income and saved up, spending down), red when not. */
export function deltaTone(d: { change: Fils | null; pct: number | null }, goodWhenUp: boolean): Tone {
  const dir = directionOf(d);
  if (dir === 'flat') return 'secondary';
  const up = dir === 'up' || dir === 'new';
  return up === goodWhenUp ? 'positive' : 'negative';
}

/** '+AED 840' or '-AED 120' (a change, with its sign). */
export function signedMoney(change: Fils, currency: string): string {
  return `${change > 0 ? '+' : change < 0 ? '-' : ''}${formatMoney(Math.abs(change), currency)}`;
}

/** 'vs Q2: +AED 840 (▲ 32%)' for a row, or null when there is nothing to compare with. */
export function rowChangeText(row: ReportRow, label: string | null, currency: string): string | null {
  if (row.change == null || !label) return null;
  if (row.change === 0) return `Same as ${label}`;
  return `vs ${label}: ${signedMoney(row.change, currency)} (${pillText(row)})`;
}

export type { Delta };
