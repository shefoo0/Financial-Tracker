import { DEFAULT_CATEGORIES } from '@/data/defaults';
import { suggestCategory } from '../category';
import { normaliseArabic, normaliseDigits } from '../normalize';
import { applySimilar, learnRule, matchRules, merchantKey, sameMerchant } from '../rules';
import { parseAmountToken } from '../amount';
import { parseDateParts } from '../date';
import { parseCsv } from '../csv';
import { parseStatementText, parseSmsText } from '../text';

const s = (d: string, rules: { pattern: string; categoryId: string }[] = []) => suggestCategory(d, rules, DEFAULT_CATEGORIES);

describe('normalisation', () => {
  it('maps Arabic-Indic and Persian digits and separators', () => {
    expect(normaliseDigits('٠١٢٣٤٥٦٧٨٩ ۰۱۲')).toBe('0123456789 012');
    expect(normaliseDigits('١٬٢٣٤٫٥٠')).toBe('1,234.50');
  });
  it('strips tatweel and diacritics and unifies letter forms', () => {
    expect(normaliseArabic('كـــارفــور')).toBe('كارفور');
    expect(normaliseArabic('رَاتِب')).toBe('راتب');
    expect(normaliseArabic('إيجار أدنوك آل')).toBe('ايجار ادنوك ال');
    expect(normaliseArabic('مدرسة')).toBe('مدرسه');
    expect(normaliseArabic('على')).toBe('علي');
    expect(normaliseArabic('Careem 12')).toBe('Careem 12');
  });
});

describe('Arabic categories', () => {
  it.each([
    ['كارفور المركز', 'groceries'],
    ['لولو هايبرماركت', 'groceries'],
    ['سبينيس', 'groceries'],
    ['اتصالات فاتورة', 'utilities'],
    ['دو', 'utilities'],
    ['هيئة كهرباء ومياه دبي', 'utilities'],
    ['ديوا', 'utilities'],
    ['سيوا', 'utilities'],
    ['أدنوك', 'transport'],
    ['اينوك', 'transport'],
    ['سالك', 'transport'],
    ['كريم', 'transport'],
    ['أوبر', 'transport'],
    ['طلبات', 'dining'],
    ['راتب نوفمبر', 'salary'],
    ['رَاتِب', 'salary'],
    ['إيجار شهري', 'housing'],
    ['ايجار', 'housing'],
    ['صيدلية', 'health'],
    ['رسوم دراسية', 'education'],
    ['بسالك', 'transport'],
    ['تابي', 'loans-cards'],
    ['TABBY PAYMENT', 'loans-cards'],
    ['Tamara', 'loans-cards'],
  ])('%s -> %s', (d, id) => expect(s(d)).toBe(id));

  it('does not match inside a longer Arabic word', () => {
    expect(s('دولار')).toBeNull();
    expect(s('كريمه شركة')).toBeNull();
  });
});

describe('more UAE merchants', () => {
  it.each([
    ['WAITROSE JBR', 'groceries'],
    ['CHOITHRAMS', 'groceries'],
    ['INSTASHOP', 'groceries'],
    ['AMAZON.AE ORDER', 'shopping'],
    ['NOON.COM', 'shopping'],
    ['NAMSHI', 'shopping'],
    ['NOON FOOD', 'dining'],
    ['NOL CARD TOPUP', 'transport'],
    ['DARB', 'transport'],
    ['EMPOWER COOLING', 'utilities'],
    ['FEWA', 'utilities'],
    ['AADC', 'utilities'],
    ['VIRGIN MOBILE', 'utilities'],
    ['EMARAT PETROL', 'transport'],
    ['FLYDUBAI', 'entertainment'],
    ['AIR ARABIA', 'entertainment'],
    ['EMIRATES AIRLINE', 'entertainment'],
    ['VOX CINEMAS MOE', 'entertainment'],
    ['ASTER PHARMACY', 'health'],
    ['BOOTS', 'health'],
    ['SCHOOL FEES TERM 2', 'education'],
  ])('%s -> %s', (d, id) => expect(s(d)).toBe(id));
  it('never forces a match', () => {
    expect(s('EMIRATES NBD TRANSFER')).toBeNull();
    expect(s('DUBAI MALL PARKING')).toBeNull();
  });
});

describe('merchantKey and learnRule', () => {
  it('extracts the merchant from a noisy description', () => {
    expect(merchantKey('POS 1234XXXX5678 CAREEM HALA 21/11 DUBAI AE')).toBe('CAREEM HALA');
    expect(learnRule('POS 1234XXXX5678 CAREEM HALA 21/11 DUBAI AE', 'transport')).toEqual({ pattern: 'CAREEM HALA', categoryId: 'transport' });
  });
  it.each([
    ['PURCHASE CARREFOUR CITY CENTRE #123 ABU DHABI AE 12:30', 'CARREFOUR CITY'],
    ['CARD 4111 1111 1111 1111 LULU HYPERMARKET BRANCH 12 SHARJAH', 'LULU HYPERMARKET'],
    ['POS-ECOM NETFLIX.COM REF 8837461 AE', 'NETFLIX.COM'],
    ['SALIK TOLL GATE 05 NOV 2026 DUBAI', 'SALIK TOLL'],
    ['AL MAYA SUPERMARKET JLT DUBAI UAE', 'AL MAYA SUPERMARKET'],
    ['POS ٤٥٦٧XXXX١٢٣٤ كارفور دبي', 'كارفور'],
    ['7-ELEVEN STORE 456 AL AIN', '7-ELEVEN'],
  ])('%s', (d, key) => expect(merchantKey(d)).toBe(key));
  it('falls back to the plain text when nothing is left', () => {
    expect(learnRule('1234 5678', 'other').pattern).toBe('1234 5678');
    expect(merchantKey('')).toBe('');
  });
});

describe('matchRules', () => {
  const rules = [
    { pattern: 'CAREEM', categoryId: 'transport' },
    { pattern: 'careem food', categoryId: 'dining' },
    { pattern: '', categoryId: 'other' },
  ];
  it('picks the longest matching pattern, case-insensitively', () => {
    expect(matchRules('POS CAREEM FOOD 21/11 DUBAI', rules)?.categoryId).toBe('dining');
    expect(matchRules('Careem ride', rules)?.categoryId).toBe('transport');
  });
  it('returns null when nothing fits', () => {
    expect(matchRules('LULU', rules)).toBeNull();
    expect(matchRules('', rules)).toBeNull();
  });
  it('matches learned Arabic rules across spelling variants', () => {
    const r = [learnRule('POS كارفور دبي', 'shopping')];
    expect(matchRules('كـارفور المركز', r)?.categoryId).toBe('shopping');
  });
  it('wins over built-ins in suggestCategory', () => {
    expect(s('POS CAREEM HALA 21/11 DUBAI', [learnRule('CAREEM HALA 3/4', 'other')])).toBe('other');
    expect(s('كارفور', [{ pattern: 'كارفور', categoryId: 'shopping' }])).toBe('shopping');
  });
});

describe('applySimilar', () => {
  const rows = [
    { description: 'POS 1111XXXX2222 CAREEM HALA 21/11 DUBAI AE' },
    { description: 'CAREEM HALA 22/11 ABU DHABI' },
    { description: 'LULU HYPERMARKET DUBAI' },
    { description: 'CAREEM' },
    { description: 'CAREEM RIDE 5/11' },
  ];
  it('returns the other rows with the same merchant and the change', () => {
    expect(applySimilar(rows, 0, { categoryId: 'transport' })).toEqual([
      { index: 1, change: { categoryId: 'transport' } },
      { index: 3, change: { categoryId: 'transport' } },
    ]);
    expect(sameMerchant('LULU DUBAI', 'LULU')).toBe(true);
    expect(applySimilar(rows, 9, 1)).toEqual([]);
  });
});

describe('Arabic digits in the parsers', () => {
  it('amounts and dates', () => {
    expect(parseAmountToken('١٬٢٣٤٫٥٠')?.fils).toBe(123450);
    expect(parseDateParts('٢١/١١/٢٠٢٦')).toEqual({ day: 21, month: 11, year: 2026 });
  });
  it('CSV', () => {
    const r = parseCsv('Date,Description,Amount\n٢١/١١/٢٠٢٦,كارفور,-١٢٣٫٤٥\n');
    expect(r.rows[0]).toMatchObject({ date: '2026-11-21', amount: 12345, kind: 'cost' });
  });
  it('statement text and SMS', () => {
    const t = parseStatementText('٢١/١١/٢٠٢٦ كارفور المركز ١٢٣٫٤٥ Dr ٥٬٠٠٠٫٠٠ Cr', { today: '2026-11-30' });
    expect(t.rows[0]).toMatchObject({ date: '2026-11-21', description: 'كارفور المركز', amount: 12345, kind: 'cost' });
    const sms = parseSmsText('Purchase of AED ٤٥٫٠٠ at LULU on 21/11/2026', { today: '2026-11-30' });
    expect(sms.rows[0]?.amount).toBe(4500);
  });
});

describe('rules match whole words', () => {
  it('short keys do not match inside longer words', () => {
    const rules = [{ pattern: 'DU', categoryId: 'utilities' }, { pattern: 'RTA', categoryId: 'transport' }, { pattern: 'NOL', categoryId: 'transport' }];
    expect(matchRules('DUBAI MALL', rules)).toBeNull();
    expect(matchRules('STARTA CAFE', rules)).toBeNull();
    expect(matchRules('NOLAN SHOP', rules)).toBeNull();
    expect(matchRules('POS DU MOBILE 21/11', rules)?.pattern).toBe('DU');
    expect(matchRules('RTA-PARKING', rules)?.pattern).toBe('RTA');
  });
});
