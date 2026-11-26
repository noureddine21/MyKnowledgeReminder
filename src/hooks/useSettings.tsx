import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AppSettings } from '../models';
import { getSettings, updateSetting } from '../services/settingsService';

interface SettingsContextValue {
  settings: AppSettings;
  /** Persists a setting in SQLite and updates the in-memory copy. */
  update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void>;
  /** Re-reads every setting from SQLite (e.g. after restoring a backup). */
  reload(): Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  initialSettings,
  children,
}: {
  initialSettings: AppSettings;
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<AppSettings>(initialSettings);

  const update = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      await updateSetting(key, value);
      setSettings(prev => ({ ...prev, [key]: value }));
    },
    [],
  );

  const reload = useCallback(async () => {
    setSettings(await getSettings());
  }, []);

  const value = useMemo(() => ({ settings, update, reload }), [settings, update, reload]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used inside SettingsProvider');
  }
  return ctx;
}
