import type { Category } from '@/types';
import { hasArabic, normaliseArabic } from './normalize';
import { matchRules } from './rules';
import type { CategoryRule } from './types';

interface Builtin {
  /** Name patterns of the category to use, in order of preference. */
  to: RegExp[];
  kind: 'cost' | 'income';
  words: string[];
}

const BUILTIN: Builtin[] = [
  {
    to: [/utilit/i, /bills/i],
    kind: 'cost',
    words: [
      'dewa', 'sewa', 'addc', 'aadc', 'fewa', 'taqa', 'empower', 'sahel', 'etisalat', 'e&', 'du', 'virgin mobile', 'swyp', 'salik recharge',
      'etihad we', 'etihadwe', 'district cooling', 'tabreed', 'internet bill', 'mobile bill',
      'اتصالات', 'دو', 'هيئة كهرباء ومياه دبي', 'ديوا', 'سيوا', 'هيئة الشارقة للكهرباء', 'ابوظبي للتوزيع', 'الاتحاد للماء والكهرباء', 'امباور',
      'فيرجن موبايل', 'تبريد', 'كهرباء', 'كهرباء ومياه',
    ],
  },
  {
    to: [/transport/i, /car\b/i, /fuel/i],
    kind: 'cost',
    words: [
      'enoc', 'adnoc', 'eppco', 'emarat', 'petrol', 'careem', 'uber', 'rta', 'salik', 'nol', 'parkin', 'mawaqif', 'darb', 'taxi', 'metro',
      'nol card', 'dubai taxi', 'bolt', 'yango', 'tesla charging', 'ev charging', 'car wash', 'service station', 'fuel',
      'ادنوك', 'اينوك', 'ايبكو', 'امارات للوقود', 'سالك', 'كريم', 'اوبر', 'مواقف', 'درب', 'نول', 'تاكسي', 'مترو', 'بنزين', 'وقود', 'هيئة الطرق والمواصلات',
    ],
  },
  {
    to: [/grocer/i, /food/i],
    kind: 'cost',
    words: [
      'carrefour', 'lulu', 'spinneys', 'waitrose', 'union coop', 'choithrams', 'viva', 'al maya', 'nesto', 'supermarket', 'hypermarket', 'ripe', 'kibsons',
      'instashop', 'talabat mart', 'noon minutes', 'carrefour now', 'grandiose', 'west zone', 'baqala', 'grocery', 'groceries', 'organic foods',
      'كارفور', 'لولو', 'سبينيس', 'ويتروز', 'الاتحاد التعاونية', 'جمعية', 'ثويترامز', 'النيستو', 'نستو', 'سوبرماركت', 'هايبرماركت', 'بقالة', 'انستاشوب', 'مواد غذائية',
    ],
  },
  {
    to: [/dining/i, /eating/i, /restaurant/i, /coffee/i],
    kind: 'cost',
    words: [
      'talabat', 'keeta', 'deliveroo', 'zomato', 'noon food', 'careem food', 'starbucks', 'tim hortons', 'costa', 'dunkin', 'mcdonald', 'kfc', 'burger king', 'subway', 'restaurant', 'cafe', 'coffee',
      'pizza hut', 'dominos', 'papa johns', 'shake shack', 'five guys', 'hardees', 'baskin robbins', 'krispy kreme', 'bakery', 'shawarma', 'grill', 'kitchen',
      'طلبات', 'ديليفرو', 'ستاربكس', 'كوستا', 'ماكدونالدز', 'مطعم', 'مقهى', 'كافيه', 'قهوة', 'مخبز', 'شاورما', 'مشويات',
    ],
  },
  {
    to: [/subscr/i],
    kind: 'cost',
    words: [
      'netflix', 'spotify', 'anghami', 'shahid', 'osn', 'youtube premium', 'apple.com/bill', 'icloud', 'google storage', 'disney', 'amazon prime', 'openai', 'chatgpt',
      'apple music', 'google one', 'microsoft 365', 'adobe', 'linkedin premium', 'prime video', 'starzplay', 'playstation', 'xbox',
      'نتفلكس', 'سبوتيفاي', 'انغامي', 'شاهد', 'اشتراك',
    ],
  },
  {
    to: [/health/i],
    kind: 'cost',
    words: [
      'pharmacy', 'aster', 'life pharmacy', 'clinic', 'hospital', 'medical', 'dental', 'medcare', 'nmc',
      'boots', 'mediclinic', 'burjeel', 'king\'s college hospital', 'american hospital', 'saudi german hospital', 'optical', 'optics', 'physio', 'laboratory', 'diagnostic', 'gym', 'fitness', 'fitness first', 'gold\'s gym', 'zero gravity', 'cleveland clinic',
      'صيدلية', 'استر', 'لايف فارمسي', 'مستشفى', 'عيادة', 'مركز طبي', 'طبي', 'اسنان', 'مختبر', 'نادي رياضي', 'نادي لياقة',
    ],
  },
  { to: [/insurance/i], kind: 'cost', words: ['insurance', 'takaful', 'orient insurance', 'sukoon', 'daman', 'تامين', 'تكافل', 'ضمان', 'سكون'] },
  {
    to: [/shopping/i],
    kind: 'cost',
    words: [
      'amazon', 'noon', 'namshi', 'ikea', 'ace hardware', 'sharaf dg', 'jumbo', 'h&m', 'zara', 'max fashion', 'centrepoint', 'shein',
      'amazon.ae', 'noon.com', 'carrefour online', 'home centre', 'danube', 'ounass', 'sivvi', 'six pm', 'aliexpress', 'temu',
      'امازون', 'نون', 'نمشي', 'ايكيا', 'شرف دي جي', 'زارا', 'شي ان',
    ],
  },
  { to: [/housing/i, /rent/i], kind: 'cost', words: ['ejari', 'rent', 'landlord', 'tenancy', 'dubai land', 'maintenance fee', 'service charge', 'ايجار', 'اجار', 'ايجاري', 'مالك العقار', 'رسوم الخدمات'] },
  {
    to: [/education/i],
    kind: 'cost',
    words: ['school', 'nursery', 'university', 'tuition', 'khda', 'school fees', 'gems education', 'academy', 'college', 'مدرسة', 'حضانة', 'جامعة', 'رسوم دراسية', 'الرسوم الدراسية', 'كلية', 'هيئة المعرفة والتنمية البشرية'],
  },
  {
    to: [/entertain/i, /travel/i],
    kind: 'cost',
    words: [
      'vox cinemas', 'vox', 'reel cinemas', 'reel', 'novo cinemas', 'cinema', 'platinum list', 'dubai parks', 'ski dubai', 'global village', 'img worlds',
      'emirates airline', 'emirates airlines', 'emirates.com', 'emirates skywards', 'etihad airways', 'etihad.com', 'flydubai', 'air arabia', 'airarabia', 'wizz air', 'qatar airways', 'saudia', 'booking.com', 'airbnb', 'expedia', 'skyscanner', 'hotel', 'resort',
      'فوكس سينما', 'ريل سينما', 'سينما', 'طيران الامارات', 'الاتحاد للطيران', 'فلاي دبي', 'العربية للطيران', 'فندق', 'منتجع',
    ],
  },
  {
    to: [/loan/i, /credit card/i, /debt/i, /card/i],
    kind: 'cost',
    words: [
      'tabby', 'tamara', 'postpay', 'spotii', 'loan', 'emi', 'instalment', 'installment', 'credit card payment',
      'تابي', 'تمارا', 'قرض', 'قسط', 'اقساط', 'بطاقة ائتمان',
    ],
  },
  { to: [/salary/i], kind: 'income', words: ['salary', 'wps', 'payroll', 'wages', 'راتب', 'رواتب', 'اجور', 'مرتب'] },
];

// Words are stored in their normalised form, like the descriptions they are matched against.
const NORMALISED = BUILTIN.map((b) => ({ ...b, words: b.words.map((w) => normaliseArabic(w).toLowerCase()) }));

const isWord = (s: string, w: string): boolean => {
  const esc = w.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  if (hasArabic(w)) {
    // Arabic attaches small prefixes to words (و "and", ب "with", ل "for", ال "the").
    const prefix = w.length > 3 ? '(?:[\u0648\u0628\u0644\u0641]?(?:\u0627\u0644)?)' : '';
    return new RegExp(`(?<![\\u0600-\\u06FFa-z0-9])${prefix}${esc}(?![\\u0600-\\u06FFa-z0-9])`).test(s);
  }
  return new RegExp(`(?<![a-z0-9\\u0600-\\u06FF])${esc}(?![a-z0-9\\u0600-\\u06FF])`, 'i').test(s);
};

/**
 * Suggests a category id for a description, or null when unsure. The user's rules ("description
 * contains X") win, longest pattern first; then built-in UAE keywords (English and Arabic), matched
 * to a category by name. Arabic spelling variants and Arabic-Indic digits are normalised first.
 */
export function suggestCategory(description: string, rules: CategoryRule[], categories: Category[]): string | null {
  const text = normaliseArabic(description).toLowerCase();
  if (!text.trim()) return null;
  const live = categories.filter((c) => !c.archived);
  const byId = new Set(live.map((c) => c.id));

  const hit = matchRules(description, rules.filter((r) => byId.has(r.categoryId)));
  if (hit) return hit.categoryId;

  let best: { len: number; id: string } | null = null;
  for (const b of NORMALISED) {
    for (const w of b.words) {
      if (!isWord(text, w)) continue;
      if (best && w.length <= best.len) continue;
      const cat = pick(live, b);
      if (cat) best = { len: w.length, id: cat.id };
    }
  }
  return best ? best.id : null;
}

function pick(categories: Category[], b: Builtin): Category | undefined {
  const pool = categories.filter((c) => c.kind === b.kind);
  for (const re of b.to) {
    const found = pool.find((c) => re.test(c.name));
    if (found) return found;
  }
  return undefined;
}
