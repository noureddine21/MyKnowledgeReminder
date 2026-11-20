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
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
}

export const lightColors: ColorPalette = {
  background: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F6',
  text: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  primary: '#4F46E5',
  primaryContrast: '#FFFFFF',
  primarySoft: '#EEF2FF',
  success: '#047857',
  successSoft: '#D1FAE5',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  overlay: 'rgba(17, 24, 39, 0.45)',
};

export const darkColors: ColorPalette = {
  background: '#0B0F19',
  surface: '#151B2B',
  surfaceAlt: '#1E2638',
  text: '#F3F4F6',
  textSecondary: '#C5CAD3',
  textMuted: '#9CA3AF',
  border: '#273046',
  primary: '#818CF8',
  primaryContrast: '#0B0F19',
  primarySoft: '#25235A',
  success: '#34D399',
  successSoft: '#063F31',
  warning: '#FBBF24',
  warningSoft: '#3F2A06',
  danger: '#F87171',
  dangerSoft: '#4A1212',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

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
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 26, fontWeight: '700' as const, lineHeight: 32 },
  h2: { fontSize: 20, fontWeight: '700' as const, lineHeight: 26 },
  h3: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
  small: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
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

/** Adds alpha to a #RRGGBB color. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${a}` : hex;
}
