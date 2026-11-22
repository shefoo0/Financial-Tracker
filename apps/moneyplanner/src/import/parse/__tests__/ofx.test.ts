import { fixtures } from '../fixtures-loader';
import { parseOfx } from '../ofx';

const F = fixtures('ofx');

describe('parseOfx', () => {
  it('reads SGML', () => {
    const r = parseOfx(F.OFX_SGML);
    expect(r.source).toBe('ofx');
    expect(r.currency).toBe('AED');
    expect(r.account).toBe('0123');
    expect(r.period).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(r.rows.map((x) => [x.date, x.description, x.kind, x.amount])).toEqual([
      ['2026-11-05', 'CARREFOUR MOE - POS PURCHASE', 'cost', 31_245],
      ['2026-11-25', 'SALARY ACME', 'income', 1_800_000],
      ['2026-11-26', 'DEWA', 'cost', 125_050],
    ]);
    expect(r.problems).toEqual([]);
  });
  it('reads XML, entities, comma decimals, and reports bad rows', () => {
    const r = parseOfx(F.OFX_XML);
    expect(r.account).toBe('5678');
    expect(r.rows.map((x) => [x.description, x.kind, x.amount])).toEqual([
      ['H&M DUBAI MALL', 'cost', 4_500],
      ['REFUND', 'income', 3_050],
      ['(no description)', 'income', 2_000],
    ]);
    expect(r.rows[2].warnings.join(' ')).toMatch(/DEBIT but the amount sign/);
    expect(r.rows[2].confidence).toBeLessThan(0.7);
    expect(r.problems[0]).toMatch(/1 transaction skipped/);
  });
  it('rejects other text', () => {
    expect(parseOfx('hello').problems[0]).toMatch(/OFX/);
  });
  it('reports an OFX file with no transactions', () => {
    expect(parseOfx('<OFX><BANKTRANLIST></BANKTRANLIST></OFX>').problems[0]).toMatch(/No transactions/);
  });
});
