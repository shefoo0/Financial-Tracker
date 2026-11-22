import { strToU8, zipSync } from 'fflate';
import { readXlsx, parseXlsx, XLSX_MAX_ROWS } from '../xlsx';

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const cell = (r: string, v: string | number, t?: 's' | 'str' | 'b' | 'inlineStr', s?: number) =>
  t === 'inlineStr'
    ? `<c r="${r}" t="inlineStr"><is><t>${v}</t></is></c>`
    : `<c r="${r}"${t ? ` t="${t}"` : ''}${s !== undefined ? ` s="${s}"` : ''}><v>${v}</v></c>`;
const row = (n: number, ...cells: string[]) => `<row r="${n}">${cells.join('')}</row>`;
const sheet = (...rows: string[]) => `<?xml version="1.0"?><worksheet ${NS}><sheetData>${rows.join('')}</sheetData></worksheet>`;

interface Opts {
  sheets: { name: string; xml: string }[];
  shared?: string[];
  styles?: string;
  workbookPr?: string;
}

function build({ sheets, shared, styles, workbookPr }: Opts): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8(
      `<workbook ${NS}>${workbookPr ?? ''}<sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<Relationships>${sheets.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    ),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(s.xml)));
  if (shared) files['xl/sharedStrings.xml'] = strToU8(`<sst ${NS}>${shared.join('')}</sst>`);
  if (styles) files['xl/styles.xml'] = strToU8(styles);
  return zipSync(files);
}

// Style 0 general, 1 date (builtin 14), 2 custom date, 3 money.
const STYLES = `<styleSheet ${NS}><numFmts count="2"><numFmt numFmtId="164" formatCode="dd\\-mmm\\-yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00&quot; AED&quot;"/></numFmts>
<cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>`;

const SHARED = [
  '<si><t>Date</t></si>',
  '<si><t>Description</t></si>',
  '<si><r><t>CAREEM </t></r><r><rPr><b/></rPr><t>RIDE &amp; GO</t></r></si>',
  '<si><t>Debit</t></si>',
  '<si><t>Credit</t></si>',
  '<si><t>Balance</t></si>',
  '<si><t>SALARY ACME</t></si>',
  '<si><t xml:space="preserve">راتب شهر نوفمبر</t><rPh sb="0" eb="1"><t>ignored</t></rPh></si>',
];

// 46000 = 2025-12-09 in Excel's calendar.
const MAIN = sheet(
  row(1, cell('A1', 0, 's'), cell('B1', 1, 's'), cell('D1', 3, 's'), cell('E1', 4, 's'), cell('F1', 5, 's')),
  row(2, cell('A2', 46000, undefined, 1), cell('B2', 2, 's'), cell('D2', '45.5000000000001', undefined, 3), cell('F2', 954.5, undefined, 3)),
  row(3, cell('A3', 46001.5, undefined, 2), cell('B3', 6, 's'), cell('E3', 5000), cell('F3', 5954.5)),
  row(4, cell('A4', 46002, undefined, 1), cell('B4', 'Inline &lt;shop&gt;', 'inlineStr'), cell('D4', 100), cell('F4', 5854.5)),
);

describe('readXlsx', () => {
  const book = build({ sheets: [{ name: 'Statement', xml: MAIN }, { name: 'Notes', xml: sheet(row(1, cell('A1', 'hello', 'inlineStr'))) }], shared: SHARED, styles: STYLES });
  const r = readXlsx(book);

  it('reads sheet names in order', () => {
    expect(r.problems).toEqual([]);
    expect(r.sheets.map((s) => s.name)).toEqual(['Statement', 'Notes']);
    expect(r.sheets[1].rows).toEqual([['hello']]);
  });
  it('places cells by reference, keeping gaps', () => {
    expect(r.sheets[0].rows[0]).toEqual(['Date', 'Description', '', 'Debit', 'Credit', 'Balance']);
  });
  it('joins rich text runs, decodes entities and handles inline strings', () => {
    expect(r.sheets[0].rows[1][1]).toBe('CAREEM RIDE & GO');
    expect(r.sheets[0].rows[3][1]).toBe('Inline <shop>');
  });
  it('turns date-formatted numbers into ISO dates and cleans float noise', () => {
    expect(r.sheets[0].rows[1][0]).toBe('2025-12-09');
    expect(r.sheets[0].rows[2][0]).toBe('2025-12-10');
    expect(r.sheets[0].rows[1][3]).toBe('45.5');
    expect(r.sheets[0].rows[2][4]).toBe('5000');
  });
  it('reads strings, booleans and formulas cached values, skips phonetic text', () => {
    const x = build({
      sheets: [{ name: 'S', xml: sheet(row(1, cell('A1', 'abc', 'str'), cell('B1', 1, 'b'), '<c r="C1"><f>1+1</f><v>2</v></c>', cell('D1', 7, 's'))) }],
      shared: SHARED,
    });
    expect(readXlsx(x).sheets[0].rows).toEqual([['abc', 'TRUE', '2', 'راتب شهر نوفمبر']]);
  });
  it('uses the 1904 calendar when the workbook says so', () => {
    const x = build({ sheets: [{ name: 'S', xml: sheet(row(1, cell('A1', 100, undefined, 1))) }], styles: STYLES, workbookPr: '<workbookPr date1904="1"/>' });
    expect(readXlsx(x).sheets[0].rows[0][0]).toBe('1904-04-10');
  });
  it('converts Arabic-Indic digits', () => {
    const x = build({ sheets: [{ name: 'S', xml: sheet(row(1, cell('A1', '١٢٣٫٥٠', 'str'))) }] });
    expect(readXlsx(x).sheets[0].rows[0][0]).toBe('123.50');
  });
  it('stops after the row limit with a problem', () => {
    const rows = Array.from({ length: XLSX_MAX_ROWS + 5 }, (_, i) => row(i + 1, cell(`A${i + 1}`, i + 1)));
    const x = readXlsx(build({ sheets: [{ name: 'Big', xml: sheet(...rows) }] }));
    expect(x.sheets[0].rows).toHaveLength(XLSX_MAX_ROWS);
    expect(x.problems.join(' ')).toMatch(/more than 20,000 rows/);
  });
  it('never throws on malformed input', () => {
    for (const bad of [new Uint8Array(0), new Uint8Array([1, 2, 3, 4, 5]), strToU8('not a zip at all, just text')]) {
      const x = readXlsx(bad);
      expect(x.sheets).toEqual([]);
      expect(x.problems.length).toBeGreaterThan(0);
    }
    const truncated = book.slice(0, Math.floor(book.length / 2));
    expect(() => readXlsx(truncated)).not.toThrow();
    const notWorkbook = zipSync({ 'hello.txt': strToU8('hi') });
    expect(readXlsx(notWorkbook).problems[0]).toMatch(/does not look like/);
  });
});

describe('parseXlsx', () => {
  it('parses the first sheet that looks like transactions, with balances checked', () => {
    const book = build({
      sheets: [{ name: 'Cover', xml: sheet(row(1, cell('A1', 'Monthly report', 'inlineStr'))) }, { name: 'Statement', xml: MAIN }],
      shared: SHARED,
      styles: STYLES,
    });
    const r = parseXlsx(book);
    expect(r.source).toBe('csv');
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ date: '2025-12-09', description: 'CAREEM RIDE & GO', amount: 4550, kind: 'cost', balance: 95450 });
    expect(r.rows[1]).toMatchObject({ date: '2025-12-10', kind: 'income', amount: 500000 });
    expect(r.rows.every((x) => x.confidence >= 0.9)).toBe(true);
    expect(r.period).toEqual({ from: '2025-12-09', to: '2025-12-11' });
    expect(r.problems.join(' ')).toMatch(/Statement/);
  });
  it('reads serial dates left as plain numbers', () => {
    const x = build({
      sheets: [{ name: 'S', xml: sheet(row(1, cell('A1', 'Date', 'inlineStr'), cell('B1', 'Details', 'inlineStr'), cell('C1', 'Amount', 'inlineStr')), row(2, cell('A2', 46000), cell('B2', 'SHOP', 'inlineStr'), cell('C2', -12.5))) }],
    });
    const r = parseXlsx(x);
    expect(r.rows[0]).toMatchObject({ date: '2025-12-09', amount: 1250, kind: 'cost' });
  });
  it('reads Arabic headers and descriptions', () => {
    const x = build({
      sheets: [
        {
          name: 'S',
          xml: sheet(
            row(1, cell('A1', 'التاريخ', 'inlineStr'), cell('B1', 'الوصف', 'inlineStr'), cell('C1', 'مدين', 'inlineStr'), cell('D1', 'دائن', 'inlineStr')),
            row(2, cell('A2', '٠٣/١٢/٢٠٢٥', 'inlineStr'), cell('B2', 'كارفور', 'inlineStr'), cell('C2', '١٢٠٫٥٠', 'inlineStr')),
            row(3, cell('A3', '05/12/2025', 'inlineStr'), cell('B3', 'راتب', 'inlineStr'), cell('D3', '٥٠٠٠', 'inlineStr')),
          ),
        },
      ],
    });
    const r = parseXlsx(x);
    expect(r.rows.map((x) => [x.date, x.amount, x.kind])).toEqual([['2025-12-03', 12050, 'cost'], ['2025-12-05', 500000, 'income']]);
  });
  it('reports a problem when no sheet is a transaction table', () => {
    const r = parseXlsx(build({ sheets: [{ name: 'S', xml: sheet(row(1, cell('A1', 'x', 'inlineStr'))) }] }));
    expect(r.rows).toEqual([]);
    expect(r.problems[0]).toMatch(/No sheet/);
  });
  it('returns problems, not exceptions, for bad bytes', () => {
    const r = parseXlsx(new Uint8Array([80, 75, 3, 4, 0, 0]));
    expect(r.rows).toEqual([]);
    expect(r.problems.length).toBeGreaterThan(0);
  });
});
