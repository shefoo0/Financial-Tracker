// Text normalisation shared by the parsers: Arabic-Indic digits and Arabic letter forms.

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits become 0-9; the Arabic decimal and thousands marks become "." and ",". */
export function normaliseDigits(s: string): string {
  return s
    .replace(ARABIC_DIGITS, (ch) => {
      const c = ch.charCodeAt(0);
      return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
    })
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

/**
 * Digits plus Arabic spelling variants: tatweel and diacritics are removed; alef forms, ya, ta marbuta,
 * waw/ya with hamza and Persian kaf/ya are unified. Latin text is left as it is.
 */
export function normaliseArabic(s: string): string {
  return normaliseDigits(s)
    .replace(/[ـً-ٰٟۖ-ۭ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/[ىیئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ک/g, 'ك');
}

export const hasArabic = (s: string): boolean => /[؀-ۿ]/.test(s);

