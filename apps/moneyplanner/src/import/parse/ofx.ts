import { parseDateParts } from './date';
import { normaliseDigits } from './normalize';
import type { ParsedRow, ParseResult } from './types';

const tag = (block: string, name: string): string | undefined => {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? decodeEntities(m[1].trim()) : undefined;
};

const decodeEntities = (s: string) =>
  s.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");

/** "20261121120000[+4:GST]" -> "2026-11-21". */
function ofxDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s.trim());
  if (!m) return null;
  const p = parseDateParts(`${m[1]}${m[2]}${m[3]}`);
  return p && p.year !== null ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Signed fils from "-1234.50" or "1234,5". Null when it is not a plain number. */
function ofxAmount(s: string | undefined): { fils: number; extraDecimals: boolean } | null {
  if (!s) return null;
  const t = s.trim().replace(/,(\d{1,2})$/, '.$1');
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return { fils: Math.round(n * 100), extraDecimals: /\.\d{3,}$/.test(t) && !/\.\d{2}0*$/.test(t) };
}

/** Parses OFX/QFX in SGML (no closing tags) or XML style. */
export function parseOfx(text: string): ParseResult {
  const result: ParseResult = { rows: [], source: 'ofx', problems: [] };
  const body = normaliseDigits(text.replace(/^﻿/, ''));
  const blocks = [...body.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTRS>|<\/STMTRS>|$)/gi)];
  if (!/<OFX>/i.test(body) && !blocks.length) {
    result.problems.push('This does not look like an OFX or QFX file.');
    return result;
  }
  const cur = tag(body, 'CURDEF');
  if (cur) result.currency = cur.toUpperCase();
  const acct = tag(body, 'ACCTID');
  if (acct) {
    const digits = acct.replace(/\D/g, '');
    if (digits.length >= 4) result.account = digits.slice(-4);
  }
  const from = ofxDate(tag(body, 'DTSTART'));
  const to = ofxDate(tag(body, 'DTEND'));
  if (from && to) result.period = { from, to };

  let skipped = 0;
  for (const b of blocks) {
    const block = b[1];
    const date = ofxDate(tag(block, 'DTPOSTED')) ?? ofxDate(tag(block, 'DTUSER'));
    const amt = ofxAmount(tag(block, 'TRNAMT'));
    if (!date || !amt || amt.fils === 0) {
      skipped++;
      continue;
    }
    const name = tag(block, 'NAME') ?? tag(block, 'PAYEE') ?? '';
    const memo = tag(block, 'MEMO') ?? '';
    const description = [name, memo && memo !== name ? memo : ''].filter(Boolean).join(' - ') || '(no description)';
    const warnings: string[] = [];
    let confidence = 1;
    if (description === '(no description)') {
      warnings.push('No description.');
      confidence = 0.7;
    }
    if (amt.extraDecimals) {
      warnings.push('The amount had more than two decimals and was rounded.');
      confidence = Math.min(confidence, 0.8);
    }
    const type = (tag(block, 'TRNTYPE') ?? '').toUpperCase();
    if ((type === 'DEBIT' && amt.fils > 0) || (type === 'CREDIT' && amt.fils < 0)) {
      warnings.push(`The file says ${type} but the amount sign says the opposite; the sign was used.`);
      confidence = Math.min(confidence, 0.6);
    }
    result.rows.push({
      date,
      description,
      amount: Math.abs(amt.fils),
      kind: amt.fils < 0 ? 'cost' : 'income',
      raw: block.replace(/\s+/g, ' ').trim(),
      confidence,
      warnings,
    } as ParsedRow);
  }
  if (skipped) result.problems.push(`${skipped} transaction${skipped === 1 ? '' : 's'} skipped because the date or amount could not be read.`);
  if (!result.rows.length && !skipped) result.problems.push('No transactions found in the file.');
  if (result.currency && result.currency !== 'AED') result.problems.push(`The file is in ${result.currency}. Amounts are not converted.`);
  if (!result.period && result.rows.length) {
    const d = result.rows.map((r) => r.date).sort();
    result.period = { from: d[0], to: d[d.length - 1] };
  }
  return result;
}
