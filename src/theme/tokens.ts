export interface ColorPalette {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryContrast: string;
  primarySoft: string;
  /** Gold accent (highlights, the Add button, streaks). */
  accent: string;
  /** Darker gold, readable on light backgrounds. */
  accentStrong: string;
  accentSoft: string;
  /** Deep emerald used for hero headers. */
  hero: string;
  heroText: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
}

/** "Emerald & gold" — light. */
export const lightColors: ColorPalette = {
  background: '#F6F3EA',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEADB',
  text: '#12261F',
  textSecondary: '#4B5C55',
  textMuted: '#62716A',
  border: '#E4DCC6',
  primary: '#0B4A3A',
  primaryContrast: '#FFFFFF',
  primarySoft: '#E2EEE8',
  accent: '#E7C873',
  accentStrong: '#8C6510',
  accentSoft: '#FBF1D6',
  hero: '#0B4A3A',
  heroText: '#FFFFFF',
  success: '#0F7B4E',
  successSoft: '#DDF3E7',
  warning: '#9A5B00',
  warningSoft: '#FFF1DA',
  danger: '#B42318',
  dangerSoft: '#FDE4E1',
  overlay: 'rgba(18, 38, 31, 0.45)',
};

/** "Emerald & gold" — dark. */
export const darkColors: ColorPalette = {
  background: '#08130F',
  surface: '#10211B',
  surfaceAlt: '#172C25',
  text: '#EEF4F0',
  textSecondary: '#B8C8C0',
  textMuted: '#8FA59B',
  border: '#22392F',
  primary: '#43BE91',
  primaryContrast: '#05120D',
  primarySoft: '#123528',
  accent: '#E7C873',
  accentStrong: '#E7C873',
  accentSoft: '#33290F',
  hero: '#0D3A2E',
  heroText: '#FFFFFF',
  success: '#4ADE9A',
  successSoft: '#0B3524',
  warning: '#F2C46B',
  warningSoft: '#3A2A0C',
  danger: '#F68A7F',
  dangerSoft: '#46160F',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

/** Bundled fonts (android/app/src/main/assets/fonts). Android selects them by file name. */
export const fonts = {
  regular: 'PlusJakartaSans-Regular',
  medium: 'PlusJakartaSans-Medium',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extrabold: 'PlusJakartaSans-ExtraBold',
  arabic: 'Amiri-Regular',
  arabicBold: 'Amiri-Bold',
} as const;

/** True when the text is mostly Arabic script (used to switch to the Amiri font). */
export function isArabicText(text: string): boolean {
  const letters = text.replace(/[\s\d!-/:-@[-`{-~،؛؟٪-٭]/g, '');
  if (!letters) {
    return false;
  }
  const arabic = (letters.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  return arabic / letters.length > 0.5;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** Style for a text block whose content is Arabic (Amiri, right-to-left). */
export function arabicTextStyle(text: string) {
  return isArabicText(text)
    ? { fontFamily: fonts.arabic, fontSize: 22, lineHeight: 40, textAlign: 'right' as const, writingDirection: 'rtl' as const }
    : null;
}

export const typography = {
  title: { fontSize: 27, fontFamily: fonts.extrabold, lineHeight: 34 },
  h2: { fontSize: 20, fontFamily: fonts.bold, lineHeight: 27 },
  h3: { fontSize: 17, fontFamily: fonts.bold, lineHeight: 23 },
  body: { fontSize: 15, fontFamily: fonts.regular, lineHeight: 22 },
  bodyStrong: { fontSize: 15, fontFamily: fonts.semibold, lineHeight: 22 },
  small: { fontSize: 13, fontFamily: fonts.regular, lineHeight: 19 },
  caption: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 16 },
  /** Arabic verses, hadiths and Arabic notes. */
  arabic: { fontSize: 22, fontFamily: fonts.arabic, lineHeight: 40 },
};

export type TypographyVariant = keyof typeof typography;

export interface AppTheme {
  dark: boolean;
  colors: ColorPalette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

export function createTheme(dark: boolean): AppTheme {
  return { dark, colors: dark ? darkColors : lightColors, spacing, radius, typography };
}

/**
 * Soft elevation for cards and floating elements. In dark mode borders do the job
 * (shadows are invisible on dark backgrounds).
 */
export function shadow(dark: boolean, level: 1 | 2 | 3 = 1) {
  if (dark) {
    return {};
  }
  const config = { 1: [2, 6, 0.06, 2], 2: [4, 12, 0.1, 5], 3: [8, 20, 0.16, 10] }[level];
  return {
    shadowColor: '#0B4A3A',
    shadowOffset: { width: 0, height: config[0] },
    shadowRadius: config[1],
    shadowOpacity: config[2],
    elevation: config[3],
  };
}

/** Adds alpha to a #RRGGBB color. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${a}` : hex;
}
