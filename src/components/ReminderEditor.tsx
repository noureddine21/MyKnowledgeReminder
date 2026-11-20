import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FREQUENCY_LABELS } from '../constants';
import { REMINDER_FREQUENCIES, type ReminderFrequency, type ReminderInput } from '../models';
import { spacedReviewDates } from '../services/reviewSchedule';
import { useAppTheme } from '../theme';
import { formatDate, formatTime } from '../utils/date';
import { AppText } from './AppText';
import { Card } from './Card';
import { Chip } from './Chip';
import { DateTimeField } from './DateTimeField';
import { Icon } from './Icon';
import { ListRow } from './ListRow';

interface Props {
  value: ReminderInput;
  onChange: (value: ReminderInput) => void;
  /** Creation date: base of the smart schedule. */
  createdAt: number;
  intervals: number[];
  now: number;
  error?: string;
}

const FREQUENCY_ICONS: Record<ReminderFrequency, string> = {
  spaced: 'brain',
  once: 'calendar-clock',
  daily: 'repeat',
  weekly: 'calendar-week',
  monthly: 'calendar-month',
};

function describeRepeat(value: ReminderInput): string {
  const time = formatTime(value.scheduledAt);
  const start = formatDate(value.scheduledAt);
  switch (value.frequency) {
    case 'daily':
      return `Every day at ${time}, starting ${start}.`;
    case 'weekly':
      return `Every week on the same weekday at ${time}, starting ${start}.`;
    case 'monthly':
      return `Every month on the same day at ${time}, starting ${start}.`;
    default:
      return `Once, on ${start} at ${time}.`;
  }
}

export function ReminderEditor({ value, onChange, createdAt, intervals, now, error }: Props) {
  const { colors, spacing } = useAppTheme();
  const set = (patch: Partial<ReminderInput>) => onChange({ ...value, ...patch });

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <ListRow
        icon={value.enabled ? 'bell-ring-outline' : 'bell-off-outline'}
        title="Remind me to review"
        subtitle={value.enabled ? 'A notification will remind you' : 'No reminder for this item'}
        switchValue={value.enabled}
        onSwitchChange={enabled => set({ enabled })}
      />

      {value.enabled ? (
        <View style={{ marginTop: spacing.sm }}>
          <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
            Frequency
          </AppText>
          <View style={styles.chips}>
            {REMINDER_FREQUENCIES.map(f => (
              <Chip
                key={f}
                label={FREQUENCY_LABELS[f]}
                icon={FREQUENCY_ICONS[f]}
                selected={value.frequency === f}
                onPress={() => set({ frequency: f })}
              />
            ))}
          </View>

          {value.frequency === 'spaced' ? (
            <>
              <DateTimeField
                label="Reminder time"
                mode="time"
                value={value.scheduledAt}
                onChange={scheduledAt => set({ scheduledAt })}
              />
              <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
                Review dates (days after creation: {intervals.join(', ')})
              </AppText>
              {spacedReviewDates(createdAt, intervals, value.scheduledAt).map((date, index) => {
                const past = date <= now;
                return (
                  <View key={index} style={[styles.dateRow, { marginBottom: spacing.xs }]}>
                    <Icon
                      name={past ? 'checkbox-blank-circle-outline' : 'circle-medium'}
                      size={16}
                      color={past ? colors.textMuted : colors.primary}
                    />
                    <AppText
                      variant="small"
                      tone={past ? 'muted' : 'default'}
                      style={[styles.dateText, past && styles.past]}
                    >
                      Review {index + 1}: {formatDate(date)} at {formatTime(date)}
                    </AppText>
                  </View>
                );
              })}
              <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
                Past dates are skipped. Customize intervals in Settings → Reminder settings.
              </AppText>
            </>
          ) : (
            <>
              <DateTimeField
                label={value.frequency === 'once' ? 'Reminder date & time' : 'First reminder'}
                mode="datetime"
                value={value.scheduledAt}
                minimumDate={now}
                onChange={scheduledAt => set({ scheduledAt })}
                error={error}
              />
              <AppText variant="caption" tone="muted">
                {describeRepeat(value)}
              </AppText>
            </>
          )}
          {error && value.frequency === 'spaced' ? (
            <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
              {error}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateText: { marginLeft: 6 },
  past: { textDecorationLine: 'line-through' },
});
