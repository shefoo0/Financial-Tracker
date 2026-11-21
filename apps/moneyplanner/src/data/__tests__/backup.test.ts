import { createMemoryRepository } from '@/data/memory/memory-repository';
import { buildTransactionsCsv, csvField, filsToDecimal, parseBackup, serializeBackup } from '@/data/backup';
import { BACKUP_VERSION } from '@/data/repository';
import { DEFAULT_CATEGORIES } from '@/data/defaults';
import { ovr, rec, txn } from '@/data/memory/repository-contract';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: '' } }));

async function sample() {
  const repo = createMemoryRepository({ recurring: [rec()], overrides: [ovr()], transactions: [txn()] });
  await repo.init();
  return repo.exportAll();
}

describe('parseBackup', () => {
  it('round-trips serializeBackup', async () => {
    const data = await sample();
    expect(parseBackup(serializeBackup(data))).toEqual(data);
  });
  it('rejects text that is not JSON', () => {
    expect(() => parseBackup('hello')).toThrow("This file isn't a Money Planner backup");
    expect(() => parseBackup('')).toThrow("This file isn't a Money Planner backup");
  });
  it('rejects other JSON', () => {
    expect(() => parseBackup('[]')).toThrow("isn't a Money Planner backup");
    expect(() => parseBackup('{"format":"other"}')).toThrow("isn't a Money Planner backup");
  });
  it('rejects a newer version', async () => {
    const data = { ...(await sample()), version: BACKUP_VERSION + 1 };
    expect(() => parseBackup(JSON.stringify(data))).toThrow('newer version of the app');
  });
  it('rejects damaged data', async () => {
    const data = await sample();
    const bad = (patch: object) => JSON.stringify({ ...data, ...patch });
    expect(() => parseBackup(bad({ transactions: 'x' }))).toThrow('damaged');
    expect(() => parseBackup(bad({ settings: null }))).toThrow('damaged');
    expect(() => parseBackup(bad({ transactions: [{ ...txn(), amount: 12.5 }] }))).toThrow('damaged');
    expect(() => parseBackup(bad({ recurring: [{ ...rec(), schedule: { type: 'daily' } }] }))).toThrow('damaged');
    expect(() => parseBackup(bad({ version: 'one' }))).toThrow('damaged');
  });
});

describe('CSV', () => {
  it('formats fils as decimals', () => {
    expect(filsToDecimal(123450)).toBe('1234.50');
    expect(filsToDecimal(5)).toBe('0.05');
    expect(filsToDecimal(-250)).toBe('-2.50');
    expect(filsToDecimal(0)).toBe('0.00');
  });
  it('quotes fields', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });
  it('builds rows with category names, sorted by date', () => {
    const csv = buildTransactionsCsv(
      [
        txn({ id: 'b', date: '2026-03-06', kind: 'income', description: 'Pay, March', categoryId: 'salary', amount: 1000000, note: '', planned: true }),
        txn({ id: 'a', date: '2026-03-05', description: '=SUM(A1)', categoryId: null, note: 'with, "comma"' }),
      ],
      DEFAULT_CATEGORIES,
    );
    expect(csv.split('\r\n')).toEqual([
      'Date,Type,Description,Category,Amount,Note,Planned',
      `2026-03-05,Cost,'=SUM(A1),,45.50,"with, ""comma""",No`,
      '2026-03-06,Income,"Pay, March",Salary,10000.00,,Yes',
      '',
    ]);
  });
  it('has just the header when empty', () => {
    expect(buildTransactionsCsv([], [])).toBe('Date,Type,Description,Category,Amount,Note,Planned\r\n');
  });
});
