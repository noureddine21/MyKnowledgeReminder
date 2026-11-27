import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Chip, CityPicker, ListRow, Screen, SectionHeader, TextField } from '../components';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useSettings } from '../hooks/useSettings';
import type { AppSettings, ThemeMode } from '../models';
import type { RootStackScreenProps } from '../navigation/types';
import { scheduleDailyItems } from '../services/dailyItemService';
import { applyLanguage } from '../i18n/apply';
import {
  canScheduleExactAlarms,
  canUseFullScreenIntent,
  isNativeAvailable,
  isXiaomiDevice,
  openFullScreenIntentSettings,
  openVendorSettings,
  scheduleNativeAlarm,
} from '../native/mkrNative';
import { TEST_ALARM_ID } from './AlarmScreen';
import { openBatteryOptimizationSettings, openExactAlarmSettings } from '../services/notificationService';
import { applyPlannerSettings } from '../services/planService';
import {
  DAILY_GOAL_OPTIONS,
  PLAN_BREAK_AFTER_OPTIONS,
  PLAN_BREAK_MINUTES_OPTIONS,
  PLAN_PRAYER_MINUTES_OPTIONS,
  WORK_NUDGE_EVERY_OPTIONS,
} from '../constants';
import {
  CUSTOM_NUDGE_PREFIX,
  MAX_CUSTOM_NUDGES,
  MAX_CUSTOM_NUDGE_LENGTH,
  WORK_NUDGES,
  customNudgeKey,
  workNudge,
} from '../services/workNudges';
import { formatDuration } from '../services/dayPlanner';
import { findPrayerCity, prayerBlocks } from '../services/prayerTimes';
import { useAppTheme } from '../theme';
import { applyTimeString, formatRelative, formatTime, toTimeString } from '../utils/date';
import { pickTime } from '../utils/pickers';

import { tr } from '../i18n';
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

const LANGUAGE_OPTIONS: { value: AppSettings['language']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
];

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'system', label: 'System', icon: 'theme-light-dark' },
  { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'Dark', icon: 'weather-night' },
];

export function SettingsScreen({ navigation }: RootStackScreenProps<'Settings'>) {
  const { colors, spacing } = useAppTheme();
  const { settings, update } = useSettings();
  const handleError = useErrorHandler();
  const { state, ensurePermission } = useNotificationPermission();
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [name, setName] = useState(settings.userName);
  const [fullScreenAllowed, setFullScreenAllowed] = useState(true);
  const [exactAllowed, setExactAllowed] = useState(true);
  useFocusEffect(
    useCallback(() => {
      canUseFullScreenIntent().then(setFullScreenAllowed);
      canScheduleExactAlarms().then(setExactAllowed);
    }, []),
  );

  const testAlarm = async () => {
    try {
      await ensurePermission();
      await scheduleNativeAlarm({
        id: TEST_ALARM_ID,
        at: Date.now() + 10_000,
        title: tr('Test alarm'),
        body: tr('If you see and hear this, alarms work on your phone.'),
      });
      Alert.alert(tr('Test alarm'), tr('It will ring in 10 seconds. You can lock the phone now.'));
    } catch (e) {
      handleError(e, 'settings:test-alarm');
    }
  };
  const [addingNudge, setAddingNudge] = useState(false);
  const [newNudge, setNewNudge] = useState('');

  /** Adds the user's own work-time reminder, already selected. */
  const addCustomNudge = async () => {
    const label = newNudge.trim();
    if (!label) {
      return;
    }
    const key = customNudgeKey(label);
    try {
      if (!settings.planWorkNudgeCustom.includes(key)) {
        await update('planWorkNudgeCustom', [...settings.planWorkNudgeCustom, key]);
      }
      if (!settings.planWorkNudges.includes(key)) {
        await updatePlanner('planWorkNudges', [...settings.planWorkNudges, key]);
      }
      setNewNudge('');
      setAddingNudge(false);
    } catch (e) {
      handleError(e, 'settings:nudge-add');
    }
  };

  const removeCustomNudge = (key: string, label: string) =>
    Alert.alert(tr('Delete this reminder?'), label, [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: tr('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await update('planWorkNudgeCustom', settings.planWorkNudgeCustom.filter(k => k !== key));
            await updatePlanner('planWorkNudges', settings.planWorkNudges.filter(k => k !== key));
          } catch (e) {
            handleError(e, 'settings:nudge-remove');
          }
        },
      },
    ]);

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

  const changeLanguage = async (language: AppSettings['language']) => {
    try {
      const { restartNeeded } = applyLanguage(language);
      await update('language', language);
      // Notification texts are written in the chosen language.
      await applyPlannerSettings();
      await scheduleDailyItems();
      if (restartNeeded) {
        Alert.alert(tr('Restart needed'), tr('Close and reopen the app to switch the layout direction.'));
      }
    } catch (e) {
      handleError(e, 'settings:language');
    }
  };

  /** Saves an "item of the day" setting and reschedules the next 7 days. */
  const updateDaily = async <K extends 'dailyItemEnabled' | 'dailyItemTime' | 'dailyItemSource'>(
    key: K,
    value: AppSettings[K],
  ) => {
    try {
      await update(key, value);
      if (value === true) {
        await ensurePermission();
      }
      await scheduleDailyItems();
    } catch (e) {
      handleError(e, `settings:${key}`);
    }
  };

  const editTime = async (
    key: 'planMorningTime' | 'planDayStart' | 'planDayEnd' | 'planWorkStart' | 'planWorkEnd',
  ) => {
    const picked = await pickTime(applyTimeString(Date.now(), settings[key]));
    if (picked !== null) {
      await updatePlanner(key, toTimeString(picked));
    }
  };

  return (
    <Screen>
      <AppText variant="h3" style={{ marginBottom: spacing.md }}>{tr('Profile')}</AppText>
      <TextField
        label={tr('Your first name')}
        value={name}
        onChangeText={setName}
        onEndEditing={() => update('userName', name.trim()).catch(e => handleError(e, 'settings:name'))}
        placeholder={tr('Shown in the greeting on Home')}
        maxLength={40}
        autoCapitalize="words"
      />
      <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
        {tr('Daily goal (reviews per day)')}
      </AppText>
      <View style={[styles.wrap, { marginBottom: spacing.lg }]}>
        {DAILY_GOAL_OPTIONS.map(goal => (
          <Chip
            key={goal}
            label={goal === 0 ? tr('Off') : String(goal)}
            icon={goal === settings.dailyGoal && goal > 0 ? 'target' : undefined}
            selected={settings.dailyGoal === goal}
            onPress={() => update('dailyGoal', goal).catch(e => handleError(e, 'settings:goal'))}
          />
        ))}
      </View>

      <AppText variant="h3" style={{ marginBottom: spacing.md }}>{tr('Language')}</AppText>
      <View style={[styles.wrap, { marginBottom: spacing.lg }]}>
        {LANGUAGE_OPTIONS.map(option => (
          <Chip
            key={option.value}
            label={option.value === 'system' ? tr(option.label) : option.label}
            icon={option.value === 'system' ? 'translate' : undefined}
            selected={settings.language === option.value}
            onPress={() => changeLanguage(option.value)}
          />
        ))}
      </View>

      <AppText variant="h3" style={{ marginBottom: spacing.md }}>{tr('Appearance')}</AppText>
      <View style={styles.wrap}>
        {THEME_OPTIONS.map(option => (
          <Chip
            key={option.value}
            label={tr(option.label)}
            icon={option.icon}
            selected={settings.themeMode === option.value}
            onPress={() => update('themeMode', option.value).catch(e => handleError(e, 'settings:theme'))}
          />
        ))}
      </View>

      <SectionHeader title={tr('Reminders & organization')} />
      <Card style={{ paddingVertical: spacing.xs }}>
        <ListRow
          icon="bell-cog-outline"
          title={tr('Notifications & permissions')}
          subtitle={
            state && !state.granted
              ? tr('Notifications are disabled')
              : tr('Default time {time} · battery · reschedule', { time: settings.defaultReminderTime })
          }
          iconColor={state && !state.granted ? colors.danger : undefined}
          onPress={() => navigation.navigate('ReminderSettings')}
        />
        <ListRow
          icon="cloud-upload-outline"
          title={tr('Backup & restore')}
          subtitle={
            settings.lastBackupAt
              ? tr('Last backup: {when}', { when: formatRelative(settings.lastBackupAt, Date.now()) })
              : tr('No backup yet — save one to never lose your data')
          }
          iconColor={settings.lastBackupAt ? undefined : colors.warning}
          onPress={() => navigation.navigate('Backup')}
        />
        <ListRow
          icon="tag-multiple-outline"
          title={tr('Categories')}
          subtitle={tr('Create, edit and delete categories')}
          onPress={() => navigation.navigate('Categories')}
        />
      </Card>

      <SectionHeader title={tr('Day planner')} />
      <Card style={{ paddingVertical: spacing.xs }}>
        <ListRow
          icon="weather-sunset-up"
          title={tr('Morning reminder')}
          subtitle={tr('Asks you to write today\'s to-do list')}
          switchValue={settings.planMorningReminder}
          onSwitchChange={value => updatePlanner('planMorningReminder', value)}
        />
        <ListRow
          icon="alarm"
          title={tr('Reminder time')}
          value={settings.planMorningTime}
          onPress={() => editTime('planMorningTime')}
          disabled={!settings.planMorningReminder}
        />
        <ListRow
          icon="clock-start"
          title={tr('Day starts')}
          value={settings.planDayStart}
          onPress={() => editTime('planDayStart')}
        />
        <ListRow icon="clock-end" title={tr('Day ends')} value={settings.planDayEnd} onPress={() => editTime('planDayEnd')} />
        <ListRow
          icon="bell-ring-outline"
          title={tr('Notify at each task')}
          subtitle={tr('A notification when a planned task starts')}
          switchValue={settings.planTaskNotifications}
          onSwitchChange={value => updatePlanner('planTaskNotifications', value)}
        />
      </Card>

      <Card style={{ paddingVertical: spacing.xs, marginTop: spacing.md }}>
        <ListRow
          icon="repeat"
          title={tr('Routines')}
          subtitle={tr('Tasks added to your plan automatically (sport, Quran…)')}
          onPress={() => navigation.navigate('Routines')}
        />
      </Card>

      <SectionHeader title={tr('Work schedule')} />
      <Card>
        <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>{tr('Work days — the planner never puts tasks during your work hours')}</AppText>
        <View style={styles.wrap}>
          {WEEK_DAYS.map(day => {
            const selected = settings.planWorkDays.includes(day.value);
            return (
              <Chip
                key={day.value}
                label={tr(day.label)}
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
        <ListRow icon="briefcase-outline" title={tr('Work starts')} value={settings.planWorkStart} onPress={() => editTime('planWorkStart')} />
        <ListRow icon="briefcase-check-outline" title={tr('Work ends')} value={settings.planWorkEnd} onPress={() => editTime('planWorkEnd')} />
        <AppText variant="bodyStrong" style={{ marginTop: spacing.md }}>{tr('During work')}</AppText>
        <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
          {tr('Small reminders while you work, one at a time')}
        </AppText>
        <View style={styles.wrap}>
          {[...WORK_NUDGES, ...settings.planWorkNudgeCustom.map(key => workNudge(key)!).filter(Boolean)].map(nudge => {
            const selected = settings.planWorkNudges.includes(nudge.key);
            const custom = nudge.key.startsWith(CUSTOM_NUDGE_PREFIX);
            return (
              <Chip
                key={nudge.key}
                label={`${nudge.emoji} ${tr(nudge.label)}`}
                selected={selected}
                onPress={() =>
                  updatePlanner(
                    'planWorkNudges',
                    selected
                      ? settings.planWorkNudges.filter(k => k !== nudge.key)
                      : [...settings.planWorkNudges, nudge.key],
                  )
                }
                onLongPress={custom ? () => removeCustomNudge(nudge.key, nudge.label) : undefined}
              />
            );
          })}
          {settings.planWorkNudgeCustom.length < MAX_CUSTOM_NUDGES ? (
            <Chip label={tr('Other')} icon="plus" selected={addingNudge} onPress={() => setAddingNudge(v => !v)} />
          ) : null}
        </View>
        {addingNudge ? (
          <View style={[styles.row, { marginTop: spacing.xs }]}>
            <View style={styles.flex}>
              <TextField
                label={tr('Your reminder')}
                value={newNudge}
                onChangeText={setNewNudge}
                placeholder={tr('e.g. Check my posture, Make a coffee')}
                maxLength={MAX_CUSTOM_NUDGE_LENGTH}
                onSubmitEditing={addCustomNudge}
                returnKeyType="done"
                autoFocus
              />
            </View>
            <Button title={tr('Add')} icon="plus" compact onPress={addCustomNudge} style={{ marginLeft: spacing.sm, marginTop: spacing.xs }} />
          </View>
        ) : null}
        {settings.planWorkNudgeCustom.length > 0 ? (
          <AppText variant="caption" tone="muted">{tr('Long-press one of your reminders to delete it.')}</AppText>
        ) : null}
        {settings.planWorkNudges.length > 0 ? (
          <>
            <AppText variant="caption" tone="secondary" style={{ marginVertical: spacing.sm }}>{tr('Every')}</AppText>
            <View style={styles.wrap}>
              {WORK_NUDGE_EVERY_OPTIONS.map(minutes => (
                <Chip
                  key={minutes}
                  label={formatDuration(minutes)}
                  selected={settings.planWorkNudgeEveryMin === minutes}
                  onPress={() => updatePlanner('planWorkNudgeEveryMin', minutes)}
                />
              ))}
            </View>
          </>
        ) : null}
      </Card>

      <SectionHeader title={tr('Prayer times')} />
      <Card>
        <ListRow
          icon="mosque"
          title={tr('Don\'t plan tasks during prayers')}
          subtitle={tr('Times are calculated on the phone for your city')}
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
          title={tr('City')}
          value={prayerCity ? prayerCity.name : tr('Choose')}
          onPress={() => setCityPickerOpen(true)}
        />
        <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.sm, marginBottom: spacing.sm }}>{tr('Time kept free from each prayer (Jumu\'ah: 1 h)')}</AppText>
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
              <View key={tr(prayer.name)} style={styles.prayer}>
                <AppText variant="caption" tone="secondary">
                  {tr(prayer.name)}
                </AppText>
                <AppText variant="bodyStrong">{formatTime(prayer.start)}</AppText>
              </View>
            ))}
          </View>
        ) : null}
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>{tr('Only used to organize your day — your prayer app keeps handling the adhan.')}</AppText>
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

      <SectionHeader title={tr('Breaks')} />
      <Card>
        <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>{tr('Break length')}</AppText>
        <View style={styles.wrap}>
          {PLAN_BREAK_MINUTES_OPTIONS.map(minutes => (
            <Chip
              key={minutes}
              label={minutes === 0 ? tr('No break') : `${minutes} min`}
              selected={settings.planBreakMinutes === minutes}
              onPress={() => updatePlanner('planBreakMinutes', minutes)}
            />
          ))}
        </View>
        <AppText variant="caption" tone="secondary" style={{ marginVertical: spacing.sm }}>{tr('After every')}</AppText>
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
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>{tr('Tasks are also separated by 5 minutes.')}</AppText>
      </Card>

      <SectionHeader title={tr('Alarms')} />
      <Card>
        <ListRow
          icon="alarm"
          title={tr('Alarm for new items')}
          subtitle={tr('Pre-selects the alarm mode when you add information')}
          switchValue={settings.alarmByDefault}
          onSwitchChange={value => update('alarmByDefault', value).catch(e => handleError(e, 'settings:alarm'))}
        />
        <ListRow
          icon="clipboard-text-clock-outline"
          title={tr('Alarm for day-plan tasks')}
          subtitle={tr('Tasks ring as alarms (write ⏰ in a line for a single task)')}
          switchValue={settings.planAlarmByDefault}
          onSwitchChange={value => update('planAlarmByDefault', value).catch(e => handleError(e, 'settings:plan-alarm'))}
        />
        <ListRow
          icon={fullScreenAllowed ? 'cellphone-lock' : 'alert-circle-outline'}
          iconColor={fullScreenAllowed ? undefined : colors.danger}
          title={tr('Full screen on the lock screen')}
          subtitle={fullScreenAllowed ? tr('Allowed') : tr('Not allowed — tap to allow it')}
          onPress={() => openFullScreenIntentSettings().catch(e => handleError(e, 'settings:fullscreen'))}
        />
        <ListRow
          icon={exactAllowed ? 'clock-check-outline' : 'alert-circle-outline'}
          iconColor={exactAllowed ? undefined : colors.danger}
          title={tr('Exact alarms')}
          subtitle={exactAllowed ? tr('Allowed') : tr('Not allowed — tap to allow it')}
          onPress={() => openExactAlarmSettings()}
        />
        {isXiaomiDevice() ? (
          <>
            <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
              {tr('Xiaomi / Redmi / POCO: allow these 3 settings, otherwise MIUI blocks alarms')}
            </AppText>
            <ListRow
              icon="rocket-launch-outline"
              title={tr('1. Autostart')}
              subtitle={tr('Turn ON for My Knowledge Reminder')}
              onPress={() => openVendorSettings('autostart').catch(e => handleError(e, 'settings:autostart'))}
            />
            <ListRow
              icon="cellphone-lock"
              title={tr('2. Lock screen & pop-ups')}
              subtitle={tr('"Show on lock screen" and "Display pop-up windows while running in the background"')}
              onPress={() => openVendorSettings('permissions').catch(e => handleError(e, 'settings:miui'))}
            />
            <ListRow
              icon="battery-heart-outline"
              title={tr('3. Battery: no restrictions')}
              subtitle={tr('Battery saver → No restrictions')}
              onPress={() => openBatteryOptimizationSettings()}
            />
          </>
        ) : null}
        {isNativeAvailable() ? (
          <ListRow
            icon="bell-ring-outline"
            iconColor={colors.accentStrong}
            title={tr('Test the alarm')}
            subtitle={tr('Rings in 10 seconds')}
            onPress={testAlarm}
          />
        ) : null}
      </Card>

      <SectionHeader title={tr('Item of the day')} />
      <Card>
        <ListRow
          icon="book-open-variant"
          title={tr('Morning inspiration')}
          subtitle={tr('One item of your library every morning')}
          switchValue={settings.dailyItemEnabled}
          onSwitchChange={value => updateDaily('dailyItemEnabled', value)}
        />
        <ListRow
          icon="clock-outline"
          title={tr('Time')}
          value={settings.dailyItemTime}
          disabled={!settings.dailyItemEnabled}
          onPress={async () => {
            const picked = await pickTime(applyTimeString(Date.now(), settings.dailyItemTime));
            if (picked !== null) {
              await updateDaily('dailyItemTime', toTimeString(picked));
            }
          }}
        />
        <View style={[styles.wrap, { marginTop: spacing.sm }]}>
          <Chip
            label={tr('All my items')}
            icon="bookshelf"
            selected={settings.dailyItemSource === 'all'}
            onPress={() => updateDaily('dailyItemSource', 'all')}
          />
          <Chip
            label={tr('Quran & Hadith')}
            icon="book-open-page-variant"
            selected={settings.dailyItemSource === 'faith'}
            onPress={() => updateDaily('dailyItemSource', 'faith')}
          />
        </View>
      </Card>

      <SectionHeader title={tr('About')} />
      <Card style={{ paddingVertical: spacing.xs }}>
        <ListRow icon="information-outline" title={tr('My Knowledge Reminder')} value={tr('v1.0.0')} />
        <ListRow
          icon="shield-lock-outline"
          title={tr('Private & offline')}
          subtitle={tr('All your information is stored only on this device (SQLite). No account, no cloud.')}
        />
      </Card>
      <AppText variant="caption" tone="muted" style={{ marginTop: spacing.md }}>{tr('Uninstalling the app or clearing its data permanently deletes your saved information.')}</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
  prayers: { flexDirection: 'row', justifyContent: 'space-between' },
  prayer: { alignItems: 'center' },
});
