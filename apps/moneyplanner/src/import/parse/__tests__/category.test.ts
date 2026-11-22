import { DEFAULT_CATEGORIES } from '@/data/defaults';
import { suggestCategory } from '../category';

const s = (d: string, rules: { pattern: string; categoryId: string }[] = [], cats = DEFAULT_CATEGORIES) => suggestCategory(d, rules, cats);

describe('suggestCategory built-ins', () => {
  it.each([
    ['DEWA BILL PAYMENT', 'utilities'],
    ['SEWA', 'utilities'],
    ['ADDC 12345', 'utilities'],
    ['DU MOBILE POSTPAID', 'utilities'],
    ['Etisalat bill', 'utilities'],
    ['e& recharge', 'utilities'],
    ['ENOC STATION 7', 'transport'],
    ['ADNOC DIST', 'transport'],
    ['EPPCO', 'transport'],
    ['CAREEM RIDE', 'transport'],
    ['UBER TRIP', 'transport'],
    ['RTA PARKING', 'transport'],
    ['SALIK TOLL', 'transport'],
    ['CARREFOUR MOE', 'groceries'],
    ['Lulu Hypermarket', 'groceries'],
    ['SPINNEYS', 'groceries'],
    ['TALABAT DUBAI', 'dining'],
    ['Deliveroo', 'dining'],
    ['CAREEM FOOD', 'dining'],
    ['NETFLIX.COM', 'subscriptions'],
    ['SALARY ACME', 'salary'],
  ])('%s -> %s', (d, id) => expect(s(d)).toBe(id));

  it('uses whole words only', () => {
    expect(s('DUBAI MALL PARKING')).toBeNull();
    expect(s('MEDUSA')).toBeNull();
  });
  it('returns null when unsure or empty', () => {
    expect(s('RANDOM SHOP 123')).toBeNull();
    expect(s('')).toBeNull();
  });
  it('maps by name to renamed categories and skips archived ones', () => {
    const cats = DEFAULT_CATEGORIES.map((c) => (c.id === 'groceries' ? { ...c, name: 'Food shop' } : c));
    expect(s('LULU', [], cats)).toBe('groceries');
    const archived = DEFAULT_CATEGORIES.map((c) => (c.id === 'groceries' ? { ...c, archived: true } : c));
    expect(s('LULU', [], archived)).toBeNull();
    expect(s('DEWA', [], [])).toBeNull();
  });
  it('does not put an income keyword on a cost category', () => {
    expect(s('SALARY', [], DEFAULT_CATEGORIES.filter((c) => c.kind === 'cost'))).toBeNull();
  });
});

describe('suggestCategory user rules', () => {
  it('beat built-ins, case-insensitive, longest pattern first', () => {
    expect(s('Careem ride', [{ pattern: 'CAREEM', categoryId: 'other' }])).toBe('other');
    expect(s('careem food', [{ pattern: 'care', categoryId: 'health' }, { pattern: 'careem food', categoryId: 'shopping' }])).toBe('shopping');
  });
  it('ignore rules pointing at missing or archived categories', () => {
    expect(s('CAREEM', [{ pattern: 'careem', categoryId: 'gone' }])).toBe('transport');
  });
  it('ignore empty patterns', () => {
    expect(s('xyz', [{ pattern: ' ', categoryId: 'other' }])).toBeNull();
  });
});
