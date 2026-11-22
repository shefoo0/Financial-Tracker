// Test helper: reads the plain-text fixtures in __tests__/fixtures. F.CSV_DEBIT_CREDIT with
// fixtures('csv') reads fixtures/csv-debit-credit.csv. Not imported by app code.
declare function require(name: string): any;
declare const __dirname: string;

export const fixtures = (ext: string): Record<string, string> => {
  const fs = require('fs');
  const path = require('path');
  return new Proxy({} as Record<string, string>, {
    get: (_t, name: string) =>
      fs.readFileSync(path.join(__dirname, '__tests__', 'fixtures', `${name.toLowerCase().replace(/_/g, '-')}.${ext}`), 'utf8'),
  });
};
