import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Card, Chip, CityPicker, ListRow, Screen, SectionHeader } from '../components';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useSettings } from '../hooks/useSettings';
import type { AppSettings, ThemeMode } from '../models';
import type { TabScreenProps } from '../navigation/types';
import { applyPlannerSettings } from '../services/planService';
import { PLAN_BREAK_AFTER_OPTIONS, PLAN_BREAK_MINUTES_OPTIONS, PLAN_PRAYER_MINUTES_OPTIONS } from '../constants';
import { formatDuration } from '../services/dayPlanner';
import { findPrayerCity, prayerBlocks } from '../services/prayerTimes';
import { useAppTheme } from '../theme';
import { applyTimeString, formatRelative, formatTime, toTimeString } from '../utils/date';
import { pickTime } from '../utils/pickers';

/** Monday first; values are JS weekdays (0 = Sunday). */
const WEEK_DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'system', label: 'System', icon: 'theme-light-dark' },
  { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'Dark', icon: 'weather-night' },
];

export function SettingsScreen({ navigation }: TabScreenProps<'Settings'>) {
  const { colors, spacing } = useAppTheme();
  const { settings, update } = useSettings();
  const handleError = useErrorHandler();
  const { state, ensurePermission } = useNotificationPermission();
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const prayerCity = findPrayerCity(settings.planPrayerCity);
  const todayPrayers = prayerCity ? prayerBlocks(prayerCity, Date.now(), settings.planPrayerMinutes) : [];

  /** Saves a planner setting, then reschedules the planner notifications. */
  const updatePlanner = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    try {
      await update(key, value);
      if (value === true) {
        await ensurePermission();
      }
      await applyPlannerSettings();
    } catch (e) {
      handleError(e, `settings:${String(key)}`);
    }
  };

  const editTime = async (
    key: 'planMorningTime' | 'planDayStart' | 'planDayEnd' | 'planWorkStart' | 'planWorkEnd' | 'planLunchStart' | 'planLunchEnd',
  ) => {
    const picked = await pickTime(applyTimeString(Date.now(), settings[key]));
    if (picked !== null) {
      await updatePlanner(key, toTimeString(picked));
    }
  };

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
          icon="cloud-upload-outline"
          title="Backup & restore"
          subtitle={
            settings.lastBackupAt
              ? `Last backup: ${formatRelative(settings.lastBackupAt, Date.now())}`
              : 'No backup yet — save one to never lose your data'
          }
          iconColor={settings.lastBackupAt ? undefined : colors.warning}
          onPress={() => navigation.navigate('Backup')}
        />
        <ListRow
          icon="tag-multiple-outline"
          title="Categories"
          subtitle="Create, edit and delete categories"
          onPress={() => navigation.navigate('Categories')}
        />
      </Card>

      <SectionHeader title="Day planner" />
      <Card style={{ paddingVertical: spacing.xs }}>
        <ListRow
          icon="weather-sunset-up"
          title="Morning reminder"
          subtitle="Asks you to write today's to-do list"
          switchValue={settings.planMorningReminder}
          onSwitchChange={value => updatePlanner('planMorningReminder', value)}
        />
        <ListRow
          icon="alarm"
          title="Reminder time"
          value={settings.planMorningTime}
          onPress={() => editTime('planMorningTime')}
          disabled={!settings.planMorningReminder}
        />
        <ListRow
          icon="clock-start"
          title="Day starts"
          value={settings.planDayStart}
          onPress={() => editTime('planDayStart')}
        />
        <ListRow icon="clock-end" title="Day ends" value={settings.planDayEnd} onPress={() => editTime('planDayEnd')} />
        <ListRow
          icon="food-fork-drink"
          title="Keep lunch free"
          subtitle={`${settings.planLunchStart}–${settings.planLunchEnd}`}
          switchValue={settings.planLunchBreak}
          onSwitchChange={value => updatePlanner('planLunchBreak', value)}
        />
        <ListRow
          icon="clock-outline"
          title="Lunch starts"
          value={settings.planLunchStart}
          onPress={() => editTime('planLunchStart')}
          disabled={!settings.planLunchBreak}
        />
        <ListRow
          icon="clock-outline"
          title="Lunch ends"
          value={settings.planLunchEnd}
          onPress={() => editTime('planLunchEnd')}
          disabled={!settings.planLunchBreak}
        />
        <ListRow
          icon="bell-ring-outline"
          title="Notify at each task"
          subtitle="A notification when a planned task starts"
          switchValue={settings.planTaskNotifications}
          onSwitchChange={value => updatePlanner('planTaskNotifications', value)}
        />
      </Card>

      <SectionHeader title="Work schedule" />
      <Card>
        <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
          Work days — the planner never puts tasks during your work hours
        </AppText>
        <View style={styles.wrap}>
          {WEEK_DAYS.map(day => {
            const selected = settings.planWorkDays.includes(day.value);
            return (
              <Chip
                key={day.value}
                label={day.label}
                selected={selected}
                onPress={() =>
                  updatePlanner(
                    'planWorkDays',
                    selected
                      ? settings.planWorkDays.filter(d => d !== day.value)
                      : [...settings.planWorkDays, day.value].sort(),
                  )
                }
              />
            );
          })}
        </View>
        <ListRow icon="briefcase-outline" title="Work starts" value={settings.planWorkStart} onPress={() => editTime('planWorkStart')} />
        <ListRow icon="briefcase-check-outline" title="Work ends" value={settings.planWorkEnd} onPress={() => editTime('planWorkEnd')} />
      </Card>

      <SectionHeader title="Prayer times" />
      <Card>
        <ListRow
          icon="mosque"
          title="Don't plan tasks during prayers"
          subtitle="Times are calculated on the phone for your city"
          switchValue={settings.planAvoidPrayers}
          onSwitchChange={value => {
            updatePlanner('planAvoidPrayers', value);
            if (value && !settings.planPrayerCity) {
              setCityPickerOpen(true);
            }
          }}
        />
        <ListRow
          icon="map-marker-outline"
          title="City"
          value={prayerCity ? prayerCity.name : 'Choose'}
          onPress={() => setCityPickerOpen(true)}
        />
        <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.sm, marginBottom: spacing.sm }}>
          Time kept free from each prayer (Jumu'ah: 1 h)
        </AppText>
        <View style={styles.wrap}>
          {PLAN_PRAYER_MINUTES_OPTIONS.map(minutes => (
            <Chip
              key={minutes}
              label={`${minutes} min`}
              selected={settings.planPrayerMinutes === minutes}
              onPress={() => updatePlanner('planPrayerMinutes', minutes)}
            />
          ))}
        </View>
        {todayPrayers.length > 0 ? (
          <View style={[styles.prayers, { marginTop: spacing.sm }]}>
            {todayPrayers.map(prayer => (
              <View key={prayer.name} style={styles.prayer}>
                <AppText variant="caption" tone="secondary">
                  {prayer.name}
                </AppText>
                <AppText variant="bodyStrong">{formatTime(prayer.start)}</AppText>
              </View>
            ))}
          </View>
        ) : null}
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
          Only used to organize your day — your prayer app keeps handling the adhan.
        </AppText>
      </Card>
      <CityPicker
        visible={cityPickerOpen}
        selectedId={settings.planPrayerCity}
        onClose={() => setCityPickerOpen(false)}
        onSelect={city => {
          setCityPickerOpen(false);
          updatePlanner('planPrayerCity', city.id);
        }}
      />

      <SectionHeader title="Breaks" />
      <Card>
        <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
          Break length
        </AppText>
        <View style={styles.wrap}>
          {PLAN_BREAK_MINUTES_OPTIONS.map(minutes => (
            <Chip
              key={minutes}
              label={minutes === 0 ? 'No break' : `${minutes} min`}
              selected={settings.planBreakMinutes === minutes}
              onPress={() => updatePlanner('planBreakMinutes', minutes)}
            />
          ))}
        </View>
        <AppText variant="caption" tone="secondary" style={{ marginVertical: spacing.sm }}>
          After every
        </AppText>
        <View style={styles.wrap}>
          {PLAN_BREAK_AFTER_OPTIONS.map(minutes => (
            <Chip
              key={minutes}
              label={formatDuration(minutes)}
              selected={settings.planBreakAfterMinutes === minutes}
              onPress={() => updatePlanner('planBreakAfterMinutes', minutes)}
            />
          ))}
        </View>
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
          Tasks are also separated by 5 minutes.
        </AppText>
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
  prayers: { flexDirection: 'row', justifyContent: 'space-between' },
  prayer: { alignItems: 'center' },
});
