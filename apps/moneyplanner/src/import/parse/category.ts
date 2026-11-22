import type { Category } from '@/types';
import type { CategoryRule } from './types';

interface Builtin {
  /** Name patterns of the category to use, in order of preference. */
  to: RegExp[];
  kind: 'cost' | 'income';
  words: string[];
}

const BUILTIN: Builtin[] = [
  { to: [/utilit/i, /bills/i], kind: 'cost', words: ['dewa', 'sewa', 'addc', 'aadc', 'fewa', 'taqa', 'empower', 'sahel', 'etisalat', 'e&', 'du', 'virgin mobile', 'swyp', 'salik recharge'] },
  { to: [/transport/i, /car\b/i, /fuel/i], kind: 'cost', words: ['enoc', 'adnoc', 'eppco', 'emarat', 'petrol', 'careem', 'uber', 'rta', 'salik', 'nol', 'parkin', 'mawaqif', 'darb', 'taxi', 'metro'] },
  { to: [/grocer/i, /food/i], kind: 'cost', words: ['carrefour', 'lulu', 'spinneys', 'waitrose', 'union coop', 'choithrams', 'viva', 'al maya', 'nesto', 'supermarket', 'hypermarket', 'ripe', 'kibsons'] },
  { to: [/dining/i, /eating/i, /restaurant/i, /coffee/i], kind: 'cost', words: ['talabat', 'deliveroo', 'zomato', 'noon food', 'careem food', 'starbucks', 'tim hortons', 'costa', 'dunkin', 'mcdonald', 'kfc', 'burger king', 'subway', 'restaurant', 'cafe', 'coffee'] },
  { to: [/subscr/i], kind: 'cost', words: ['netflix', 'spotify', 'anghami', 'shahid', 'osn', 'youtube premium', 'apple.com/bill', 'icloud', 'google storage', 'disney', 'amazon prime', 'openai', 'chatgpt'] },
  { to: [/health/i], kind: 'cost', words: ['pharmacy', 'aster', 'life pharmacy', 'clinic', 'hospital', 'medical', 'dental', 'medcare', 'nmc'] },
  { to: [/insurance/i], kind: 'cost', words: ['insurance', 'takaful', 'orient insurance', 'sukoon', 'daman'] },
  { to: [/shopping/i], kind: 'cost', words: ['amazon', 'noon', 'namshi', 'ikea', 'ace hardware', 'sharaf dg', 'jumbo', 'h&m', 'zara', 'max fashion', 'centrepoint', 'shein'] },
  { to: [/housing/i, /rent/i], kind: 'cost', words: ['ejari', 'rent', 'landlord', 'tenancy', 'dubai land'] },
  { to: [/education/i], kind: 'cost', words: ['school', 'nursery', 'university', 'tuition', 'khda'] },
  { to: [/salary/i], kind: 'income', words: ['salary', 'wps', 'payroll', 'wages'] },
];

const isWord = (s: string, w: string): boolean => {
  const esc = w.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, 'i').test(s);
};

/**
 * Suggests a category id for a description, or null when unsure. The user's rules ("description
 * contains X") win, longest pattern first; then built-in UAE keywords, matched to a category by name.
 */
export function suggestCategory(description: string, rules: CategoryRule[], categories: Category[]): string | null {
  const text = description.toLowerCase();
  if (!text.trim()) return null;
  const live = categories.filter((c) => !c.archived);
  const byId = new Set(live.map((c) => c.id));

  const hit = rules
    .filter((r) => r.pattern.trim() && byId.has(r.categoryId) && text.includes(r.pattern.trim().toLowerCase()))
    .sort((a, b) => b.pattern.trim().length - a.pattern.trim().length)[0];
  if (hit) return hit.categoryId;

  let best: { len: number; id: string } | null = null;
  for (const b of BUILTIN) {
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
