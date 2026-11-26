import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  DateTimeField,
  ListRow,
  Screen,
  SectionHeader,
  TextField,
} from '../components';
import { DEFAULT_REVIEW_INTERVALS } from '../constants';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useSettings } from '../hooks/useSettings';
import {
  openBatteryOptimizationSettings,
  openExactAlarmSettings,
  openNotificationSettings,
} from '../services/notificationService';
import { resyncAllNotifications } from '../services/reminderSync';
import { useAppTheme } from '../theme';
import { applyTimeString, toTimeString } from '../utils/date';
import { parseIntervals, validateReviewIntervals } from '../utils/validation';

import { tr } from '../i18n';
export function ReminderSettingsScreen() {
  const { colors, spacing } = useAppTheme();
  const { settings, update } = useSettings();
  const handleError = useErrorHandler();
  const { state, ensurePermission, refresh } = useNotificationPermission();
  const [intervalsText, setIntervalsText] = useState(settings.reviewIntervals.join(', '));
  const [intervalsError, setIntervalsError] = useState<string | undefined>();
  const [resyncing, setResyncing] = useState(false);

  const saveIntervals = async (text: string) => {
    const parsed = parseIntervals(text);
    const error = parsed ? validateReviewIntervals(parsed) : 'Use numbers separated by commas, e.g. 1, 3, 7, 30.';
    if (error || !parsed) {
      setIntervalsError(error ?? undefined);
      return;
    }
    try {
      await update('reviewIntervals', parsed);
      setIntervalsText(parsed.join(', '));
      setIntervalsError(undefined);
      Alert.alert(tr('Saved'), tr('New items and the next steps of existing smart schedules will use these intervals.'));
    } catch (e) {
      handleError(e, 'settings:intervals');
    }
  };

  const resync = async () => {
    setResyncing(true);
    try {
      await resyncAllNotifications();
      await refresh();
      Alert.alert(tr('Done'), tr('All active reminders were scheduled again.'));
    } catch (e) {
      handleError(e, 'settings:resync');
    } finally {
      setResyncing(false);
    }
  };

  const exactLabel =
    state?.exactAlarms === 'enabled' ? 'Allowed' : state?.exactAlarms === 'disabled' ? 'Not allowed' : 'Not needed';

  return (
    <Screen keyboard>
      <AppText variant="h3" style={{ marginBottom: spacing.md }}>{tr('Permissions')}</AppText>
      <Card style={{ paddingVertical: spacing.xs }}>
        <ListRow
          icon={state?.granted ? 'bell-check-outline' : 'bell-alert-outline'}
          iconColor={state?.granted ? colors.success : colors.danger}
          title={tr('Notifications')}
          subtitle={state?.granted ? tr('Reminders can be displayed') : tr('Required to receive reminders')}
          value={state ? (state.granted ? tr('Allowed') : tr('Off')) : '…'}
          onPress={state?.granted ? openNotificationSettings : () => ensurePermission()}
        />
        <ListRow
          icon="alarm"
          iconColor={state?.exactAlarms === 'disabled' ? colors.warning : colors.success}
          title={tr('Exact alarms')}
          subtitle={
            state?.exactAlarms === tr('disabled')
              ? tr('Without it, Android may deliver reminders several minutes late')
              : tr('Reminders are scheduled at the exact time')
          }
          value={exactLabel}
          onPress={state?.exactAlarms === 'unsupported' ? undefined : openExactAlarmSettings}
        />
        <ListRow
          icon="battery-heart-variant"
          iconColor={state?.batteryOptimized ? colors.warning : colors.success}
          title={tr('Battery optimization')}
          subtitle={
            state?.batteryOptimized
              ? tr('May delay or block reminders. Tap to exclude this app.')
              : tr('Not restricted')
          }
          value={state?.batteryOptimized ? tr('On') : tr('Off')}
          onPress={openBatteryOptimizationSettings}
        />
      </Card>
      <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>{tr('Android may still delay notifications in battery saver, Doze mode or on some manufacturers\' devices. Open the app regularly to see everything due in "Review Today".')}</AppText>

      <SectionHeader title={tr('Smart review schedule')} />
      <Card>
        <ListRow
          icon="brain"
          title={tr('Use smart schedule by default')}
          subtitle={tr('Pre-select it when adding information. You can always choose another frequency.')}
          switchValue={settings.useSmartScheduleByDefault}
          onSwitchChange={value =>
            update('useSmartScheduleByDefault', value).catch(e => handleError(e, 'settings:smart'))
          }
        />
        <View style={{ marginTop: spacing.md }}>
          <TextField
            label={tr('Review intervals (days after creation)')}
            value={intervalsText}
            onChangeText={text => {
              setIntervalsText(text);
              setIntervalsError(undefined);
            }}
            keyboardType="numbers-and-punctuation"
            placeholder="1, 3, 7, 30"
            error={intervalsError}
            hint={tr('Example: 1, 3, 7, 30 → reviews 1, 3, 7 and 30 days after creation.')}
          />
          <View style={[styles.row, { gap: spacing.sm }]}>
            <Button title={tr('Save intervals')} icon="content-save-outline" onPress={() => saveIntervals(intervalsText)} style={styles.flex} compact />
            <Button
              title={tr('Reset')}
              variant="ghost"
              icon="restore"
              onPress={() => saveIntervals(DEFAULT_REVIEW_INTERVALS.join(', '))}
              compact
            />
          </View>
        </View>
      </Card>

      <SectionHeader title={tr('Defaults')} />
      <DateTimeField
        label={tr('Default reminder time')}
        mode="time"
        value={applyTimeString(Date.now(), settings.defaultReminderTime)}
        onChange={value =>
          update('defaultReminderTime', toTimeString(value)).catch(e => handleError(e, 'settings:time'))
        }
      />

      <SectionHeader title={tr('Maintenance')} />
      <Button title={tr('Reschedule all reminders')} icon="bell-cog-outline" variant="secondary" onPress={resync} loading={resyncing} />
      <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>{tr('Use this if reminders stopped after changing system settings. Reminders are also restored automatically when the app starts and after the device restarts.')}</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
