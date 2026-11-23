// "Save as PDF": a clean, light-theme page of the report, printed to a file and shared.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { Report, ReportRow } from '@/engine';
import { formatDate } from '@/lib/dates';
import { REPORT_PDF_CSS } from '@/constants/pdf-style';
import { formatMoney } from '@/lib/money';
import { pillText, rowChangeText, signedMoney } from './format';

export const APP_NAME = 'Money Planner';
export const DISCLAIMER = 'Facts from your own entries; not financial advice.';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (n: number | null) => (n == null ? 'n/a' : `${n}%`);

/** The report as a printable HTML page (always the light theme). */
export function reportHtml(r: Report): string {
  const m = (n: number) => esc(formatMoney(n, r.currency));
  const row = (label: string, value: string, note = '') =>
    `<tr><td>${esc(label)}${note ? `<div class="note">${esc(note)}</div>` : ''}</td><td class="num">${value}</td></tr>`;
  const table = (title: string, rows: string[]) => (rows.length ? `<h2>${esc(title)}</h2><table>${rows.join('')}</table>` : '');
  const prevLabel = r.summary.vsPrevious?.label ?? null;
  const rows = (list: ReportRow[]) => list.map((x) => row(x.name, m(x.amount), rowChangeText(x, prevLabel, r.currency) ?? ''));
  const vs = (c: NonNullable<Report['summary']['vsPrevious']>) =>
    `vs ${c.label}: income ${pillText(c.income)}, spending ${pillText(c.spending)}, saved ${pillText(c.saved)}`;
  const k = r.keyFigures;
  const f = r.cashFlow;
  const d = r.debts;

  const parts: string[] = [];
  parts.push(
    `<h1>${esc(r.title)}</h1><div class="sub">${esc(APP_NAME)} · ${esc(r.rangeText)}${r.isSample ? ' · SAMPLE (demo numbers)' : ''}</div>`,
    `<div class="hero"><div class="big">${m(r.summary.saved)}</div><div>saved · savings rate ${pct(r.summary.savingsRate)}</div></div>`,
    table('Summary', [
      row('Income', m(r.summary.income)),
      row('Spending', m(r.summary.spending)),
      row('Saved', m(r.summary.saved)),
      ...(r.summary.vsPrevious ? [row('Compared with the previous period', '', vs(r.summary.vsPrevious))] : []),
      ...(r.summary.vsLastYear ? [row('Compared with the same quarter last year', '', vs(r.summary.vsLastYear))] : []),
    ]),
    table('Income by source', rows(r.income)),
    table('Spending by category', rows(r.spending)),
    table('Cash flow', [
      row('Balance at the start', m(f.startBalance)),
      row('Recurring income', esc(signedMoney(f.recurringIncome, r.currency))),
      row('Recurring costs', esc(signedMoney(-f.recurringCosts, r.currency))),
      row('One-time items (net)', esc(signedMoney(f.oneTimeNet, r.currency))),
      row('Debt payments', esc(signedMoney(-f.debtPayments, r.currency))),
      row('Cheques', esc(signedMoney(-f.cheques, r.currency))),
      row('Balance at the end', m(f.endBalance)),
    ]),
  );
  if (d) {
    parts.push(
      table('Debts', [
        row('Owed at the start', m(d.owedStart)),
        row('Owed at the end', m(d.owedEnd)),
        row('Paid in the period', m(d.paid)),
        row('Estimated interest', d.interestEstimate == null ? 'no rate set' : m(d.interestEstimate)),
        row('Debt payments as % of income', pct(d.dtiPct), d.dtiPreviousPct == null ? '' : `Previous period: ${d.dtiPreviousPct}%`),
        row('Debt-free date', d.debtFreeNow ? esc(formatDate(d.debtFreeNow)) : 'not known', d.debtFreeThen && d.debtFreeThen !== d.debtFreeNow ? `At the end of the period: ${formatDate(d.debtFreeThen)}` : ''),
      ]),
    );
  }
  parts.push(
    table('Key figures', [
      row('Savings rate', pct(k.savingsRate)),
      row('Debt-to-income', pct(k.debtToIncomePct)),
      row('Spending as % of income', pct(k.spendingPct)),
      row('Biggest category', k.biggestCategory ? `${esc(k.biggestCategory.name)} ${m(k.biggestCategory.amount)}` : 'none'),
      row('Fixed costs (recurring, debts, cheques)', m(k.fixedCosts)),
      row('Flexible costs (one-time)', m(k.flexibleCosts)),
      row('Months of buffer', k.monthsOfBuffer == null ? 'n/a' : String(k.monthsOfBuffer)),
    ]),
  );
  if (r.highlights.length) parts.push(`<h2>Highlights</h2><ul>${r.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`);
  if (r.quarters) {
    parts.push(
      table('Quarters', r.quarters.map((q) => row(q.label, q.hasData ? m(q.saved) : 'no entries', q.hasData ? `Income ${formatMoney(q.income, r.currency)}, spending ${formatMoney(q.spending, r.currency)}` : ''))),
    );
    if (r.bestMonth && r.worstMonth) {
      parts.push(table('Best and worst month', [row(`Best: ${r.bestMonth.label}`, m(r.bestMonth.saved)), row(`Lowest: ${r.worstMonth.label}`, m(r.worstMonth.saved))]));
    }
  }
  parts.push(`<div class="foot">${esc(APP_NAME)} · generated ${esc(formatDate(r.generatedOn))}<br/>${esc(DISCLAIMER)}</div>`);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(r.title)}</title><style>
${REPORT_PDF_CSS}</style></head><body>${parts.join('')}</body></html>`;
}

/** Prints the report to a PDF file and opens the share sheet. Throws a readable Error when it can't. */
export async function saveReportPdf(r: Report): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: reportHtml(r) });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device. The PDF was created but can not be opened from here.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${APP_NAME} ${r.period.label}` });
}
