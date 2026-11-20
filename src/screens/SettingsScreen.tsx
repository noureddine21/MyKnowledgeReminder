import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Card, Chip, ListRow, Screen, SectionHeader } from '../components';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useSettings } from '../hooks/useSettings';
import type { ThemeMode } from '../models';
import type { TabScreenProps } from '../navigation/types';
import { useAppTheme } from '../theme';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'system', label: 'System', icon: 'theme-light-dark' },
  { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'Dark', icon: 'weather-night' },
];

export function SettingsScreen({ navigation }: TabScreenProps<'Settings'>) {
  const { colors, spacing } = useAppTheme();
  const { settings, update } = useSettings();
  const handleError = useErrorHandler();
  const { state } = useNotificationPermission();

  return (
    <Screen>
      <AppText variant="h3" style={{ marginBottom: spacing.md }}>
        Appearance
      </AppText>
      <View style={styles.wrap}>
        {THEME_OPTIONS.map(option => (
          <Chip
            key={option.value}
            label={option.label}
            icon={option.icon}
            selected={settings.themeMode === option.value}
            onPress={() => update('themeMode', option.value).catch(e => handleError(e, 'settings:theme'))}
          />
        ))}
      </View>

      <SectionHeader title="Reminders & organization" />
      <Card style={{ paddingVertical: spacing.xs }}>
        <ListRow
          icon="bell-cog-outline"
          title="Reminder settings"
          subtitle={
            state && !state.granted
              ? 'Notifications are disabled'
              : `Smart schedule: ${settings.reviewIntervals.join(', ')} days · ${settings.defaultReminderTime}`
          }
          iconColor={state && !state.granted ? colors.danger : undefined}
          onPress={() => navigation.navigate('ReminderSettings')}
        />
        <ListRow
          icon="tag-multiple-outline"
          title="Categories"
          subtitle="Create, edit and delete categories"
          onPress={() => navigation.navigate('Categories')}
        />
      </Card>

      <SectionHeader title="About" />
      <Card style={{ paddingVertical: spacing.xs }}>
        <ListRow icon="information-outline" title="My Knowledge Reminder" value="v1.0.0" />
        <ListRow
          icon="shield-lock-outline"
          title="Private & offline"
          subtitle="All your information is stored only on this device (SQLite). No account, no cloud."
        />
      </Card>
      <AppText variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
        Uninstalling the app or clearing its data permanently deletes your saved information.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
