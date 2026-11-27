/**
 * Minimal i18n: the English text is the key. `tr('Organize my day')` returns the
 * French/Arabic translation when one exists, else the English text.
 * Variables use {name}: tr('{n} items to review', { n: 3 }).
 */
import { ar } from './ar';
import { fr } from './fr';

export type Language = 'en' | 'fr' | 'ar';
export type LanguageSetting = 'system' | Language;

/** English only needs the keys that are not plain English text. */
const en: Record<string, string> = {
  Mon_short: 'M',
  Tue_short: 'T',
  Wed_short: 'W',
  Thu_short: 'T',
  Fri_short: 'F',
  Sat_short: 'S',
  Sun_short: 'S',
};

const DICTIONARIES: Record<Language, Record<string, string>> = { en, fr, ar };

let current: Language = 'en';

export function setLanguage(language: Language): void {
  current = language;
}

export function isRTL(language: Language = current): boolean {
  return language === 'ar';
}

/** Device language when the setting is "system" (French/Arabic supported, English otherwise). */
export function resolveLanguage(setting: LanguageSetting, deviceLocale?: string): Language {
  if (setting !== 'system') {
    return setting;
  }
  let locale = deviceLocale;
  if (!locale) {
    try {
      locale = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      locale = 'en';
    }
  }
  const code = locale.slice(0, 2).toLowerCase();
  return code === 'fr' || code === 'ar' ? code : 'en';
}

export function tr(text: string, vars?: Record<string, string | number>): string {
  const translated = DICTIONARIES[current][text] ?? text;
  if (!vars) {
    return translated;
  }
  return translated.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/** Singular/plural helper: trn('{n} item', '{n} items', n). */
export function trn(one: string, other: string, n: number, vars: Record<string, string | number> = {}): string {
  return tr(n === 1 ? one : other, { n, ...vars });
}
