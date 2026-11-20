import React, { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  CategoryBadge,
  EmptyState,
  ErrorView,
  Icon,
  ListRow,
  LoadingView,
  Screen,
  SectionHeader,
} from '../components';
import { FREQUENCY_LABELS } from '../constants';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useFocusData } from '../hooks/useFocusData';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useReviewActions } from '../hooks/useReviewActions';
import { useSettings } from '../hooks/useSettings';
import type { Reminder } from '../models';
import type { RootStackScreenProps } from '../navigation/types';
import { getInformation, getReviewHistory } from '../services/informationService';
import { getNextReminderAt, isDueToday } from '../services/reviewSchedule';
import { setReminderActive } from '../services/reviewService';
import { useAppTheme } from '../theme';
import { formatDateTime, formatRelative } from '../utils/date';
import { ValidationError } from '../utils/errors';

function reminderSummary(reminder: Reminder, intervals: number[]): string {
  if (reminder.frequency === 'spaced') {
    return `Smart schedule · review ${Math.min(reminder.spacedStep + 1, intervals.length)} of ${intervals.length}`;
  }
  return FREQUENCY_LABELS[reminder.frequency];
}

export function InformationDetailsScreen({ route, navigation }: RootStackScreenProps<'InformationDetails'>) {
  const { informationId } = route.params;
  const { colors, spacing } = useAppTheme();
  const { settings } = useSettings();
  const handleError = useErrorHandler();
  const { ensurePermission } = useNotificationPermission();

  const loader = useCallback(async () => {
    const [item, history] = await Promise.all([
      getInformation(informationId),
      getReviewHistory(informationId),
    ]);
    return { item, history, now: Date.now() };
  }, [informationId]);
  const { data, error, reload } = useFocusData(loader, 'details');
  const { busyId, markAsReviewed, scheduleAnother, edit, remove } = useReviewActions(reload);

  if (!data) {
    return error ? <ErrorView message={error} onRetry={reload} /> : <LoadingView />;
  }
  const { item, history, now } = data;
  if (!item) {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="file-remove-outline"
          title="Information not found"
          message="It may have been deleted."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  const reminder = item.reminder;
  const nextAt = reminder ? getNextReminderAt(reminder, now) : null;
  const due = reminder ? isDueToday(reminder, now) : false;
  const busy = busyId === item.id;

  const toggleReminder = async (active: boolean) => {
    try {
      if (active) {
        await ensurePermission();
      }
      const warning = await setReminderActive(item.id, active);
      if (warning) {
        Alert.alert('Reminder not scheduled', warning);
      }
      reload();
    } catch (e) {
      if (e instanceof ValidationError) {
        Alert.alert('Reminder date passed', e.userMessage, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Choose a date', onPress: () => scheduleAnother(item) },
        ]);
      } else {
        handleError(e, 'details:toggle');
      }
    }
  };

  return (
    <Screen>
      <CategoryBadge category={item.category} />
      <AppText variant="title" selectable style={{ marginTop: spacing.sm }}>
        {item.title}
      </AppText>
      {item.source ? (
        <View style={[styles.row, { marginTop: spacing.xs }]}>
          <Icon name="link-variant" size={16} color={colors.textMuted} />
          <AppText tone="secondary" selectable style={styles.rowText}>
            {item.source}
          </AppText>
        </View>
      ) : null}

      <Card style={{ marginTop: spacing.lg }}>
        <AppText selectable style={styles.content}>
          {item.content}
        </AppText>
      </Card>

      <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
        Created {formatDateTime(item.createdAt)}
        {item.updatedAt !== item.createdAt ? ` · Updated ${formatDateTime(item.updatedAt)}` : ''}
      </AppText>

      <View style={[styles.actions, { marginTop: spacing.lg, gap: spacing.sm }]}>
        <Button
          title={due ? 'Mark as reviewed' : 'Mark reviewed'}
          icon="check"
          onPress={() => markAsReviewed(item)}
          loading={busy}
          style={styles.flex}
        />
        <Button
          title="Review later"
          icon="calendar-clock"
          variant="secondary"
          onPress={() => scheduleAnother(item)}
          disabled={busy}
          style={styles.flex}
        />
      </View>

      <SectionHeader title="Reminder" />
      <Card style={{ paddingVertical: spacing.xs }}>
        {reminder ? (
          <>
            <ListRow
              icon={reminder.isActive ? 'bell-ring-outline' : 'bell-off-outline'}
              title={reminderSummary(reminder, settings.reviewIntervals)}
              subtitle={
                reminder.isActive && nextAt !== null
                  ? `${due ? 'Due now · ' : ''}Next: ${formatRelative(nextAt, now)}`
                  : 'Reminder is off'
              }
              switchValue={reminder.isActive}
              onSwitchChange={toggleReminder}
            />
            {reminder.lastReviewedAt ? (
              <AppText variant="caption" tone="muted" style={{ paddingBottom: spacing.sm }}>
                Last reviewed {formatRelative(reminder.lastReviewedAt, now)}
              </AppText>
            ) : null}
          </>
        ) : (
          <ListRow
            icon="bell-plus-outline"
            title="No reminder"
            subtitle="Tap to schedule a review"
            onPress={() => scheduleAnother(item)}
          />
        )}
      </Card>

      <SectionHeader title="Review history" />
      {history.length === 0 ? (
        <AppText tone="muted">Not reviewed yet.</AppText>
      ) : (
        <Card style={{ paddingVertical: spacing.sm }}>
          {history.map(entry => (
            <View key={entry.id} style={[styles.row, { paddingVertical: spacing.xs }]}>
              <Icon
                name={entry.status === 'reviewed' ? 'check-circle-outline' : 'calendar-refresh-outline'}
                size={18}
                color={entry.status === 'reviewed' ? colors.success : colors.warning}
              />
              <AppText variant="small" style={styles.rowText}>
                {entry.status === 'reviewed' ? 'Reviewed' : 'Rescheduled'} · {formatDateTime(entry.reviewedAt)}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      <View style={[styles.actions, { marginTop: spacing.xl, gap: spacing.sm }]}>
        <Button title="Edit" icon="pencil-outline" variant="ghost" onPress={() => edit(item)} style={styles.flex} />
        <Button
          title="Delete"
          icon="delete-outline"
          variant="danger"
          onPress={() => remove(item, () => navigation.goBack())}
          disabled={busy}
          style={styles.flex}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowText: { marginLeft: 6, flex: 1 },
  content: { fontSize: 17, lineHeight: 27 },
  actions: { flexDirection: 'row' },
});
