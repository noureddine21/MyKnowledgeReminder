import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemeMode } from '../models';
import { createTheme, type AppTheme } from './tokens';

const ThemeContext = createContext<AppTheme>(createTheme(false));

export function ThemeProvider({ mode, children }: { mode: ThemeMode; children: React.ReactNode }) {
  const system = useColorScheme();
  const dark = mode === 'system' ? system === 'dark' : mode === 'dark';
  const theme = useMemo(() => createTheme(dark), [dark]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): AppTheme {
  return useContext(ThemeContext);
}
