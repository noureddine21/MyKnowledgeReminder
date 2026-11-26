import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './components';
import { getDatabase } from './database/connection';
import { SettingsProvider, useSettings } from './hooks/useSettings';
import type { AppSettings } from './models';
import { RootNavigator } from './navigation/RootNavigator';
import { consumeInitialNotification, subscribeToForegroundNotifications } from './services/notificationEvents';
import { ensureChannel } from './services/notificationService';
import { applyPlannerSettings } from './services/planService';
import { resyncAllNotifications } from './services/reminderSync';
import { subscribeToSharedContent } from './services/shareIntake';
import { getSettings } from './services/settingsService';
import { ThemeProvider, useAppTheme } from './theme';
import { describeError, logError } from './utils/errors';

type BootState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; settings: AppSettings };

function ThemedApp() {
  const { settings } = useSettings();
  return (
    <ThemeProvider mode={settings.themeMode}>
      <StatusBarForTheme />
      <RootNavigator />
    </ThemeProvider>
  );
}

function StatusBarForTheme() {
  const { dark, colors } = useAppTheme();
  return <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />;
}

/** Background startup work that must not block the UI. */
async function runStartupTasks(): Promise<void> {
  try {
    await ensureChannel();
  } catch (error) {
    logError('startup:channel', error);
  }
  try {
    // Re-creates triggers lost after an app update, data restore or revoked alarm access.
    await resyncAllNotifications();
  } catch (error) {
    logError('startup:resync', error);
  }
  try {
    // Morning "plan your day" reminder + today's task notifications.
    await applyPlannerSettings();
  } catch (error) {
    logError('startup:planner', error);
  }
}

export default function App() {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });

  const start = useCallback(async () => {
    setBoot({ status: 'loading' });
    try {
      await getDatabase();
      const settings = await getSettings();
      setBoot({ status: 'ready', settings });
      runStartupTasks();
    } catch (error) {
      logError('startup', error);
      setBoot({ status: 'error', message: describeError(error) });
    }
  }, []);

  useEffect(() => {
    start();
    // A notification tap that launched the app from a killed state.
    consumeInitialNotification();
    const unsubscribeNotifications = subscribeToForegroundNotifications();
    // Text/links shared from other apps (Instagram, YouTube...) open a pre-filled Add form.
    const unsubscribeShares = subscribeToSharedContent();
    return () => {
      unsubscribeNotifications();
      unsubscribeShares();
    };
  }, [start]);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        {boot.status === 'ready' ? (
          <SettingsProvider initialSettings={boot.settings}>
            <ThemedApp />
          </SettingsProvider>
        ) : (
          <View style={styles.splash}>
            {boot.status === 'loading' ? (
              <ActivityIndicator size="large" color="#4F46E5" />
            ) : (
              <>
                <Text style={styles.title}>Could not start</Text>
                <Text style={styles.message}>{boot.message}</Text>
                <Pressable style={styles.button} onPress={start} accessibilityRole="button">
                  <Text style={styles.buttonText}>Try again</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F5F6FA' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  message: { fontSize: 15, color: '#4B5563', textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: '#4F46E5', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
});
