import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { FREQUENCY_LABELS, MAX_REPEAT_INTERVAL } from '../constants';
import { REMINDER_FREQUENCIES, type ReminderFrequency, type ReminderInput } from '../models';
import { isRepeating, spacedReviewDates } from '../services/reviewSchedule';
import { useAppTheme } from '../theme';
import { formatDate, formatTime } from '../utils/date';
import { formatRecurrence, repeatUnit } from '../utils/recurrence';
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
  /** Error for the "every N" field. */
  intervalError?: string;
}

const FREQUENCY_ICONS: Record<ReminderFrequency, string> = {
  spaced: 'brain',
  once: 'calendar-clock',
  hourly: 'clock-outline',
  daily: 'repeat',
  weekly: 'calendar-week',
  monthly: 'calendar-month',
};

function describeRepeat(value: ReminderInput): string {
  const time = formatTime(value.scheduledAt);
  const start = formatDate(value.scheduledAt);
  const every = formatRecurrence(value.frequency, value.repeatInterval || 1);
  switch (value.frequency) {
    case 'hourly':
      return `${every}, starting ${start} at ${time}.`;
    case 'daily':
      return `${every} at ${time}, starting ${start}.`;
    case 'weekly':
      return `${every} on the same weekday at ${time}, starting ${start}.`;
    case 'monthly':
      return `${every} on the same day at ${time}, starting ${start}.`;
    default:
      return `Once, on ${start} at ${time}.`;
  }
}

export function ReminderEditor({ value, onChange, createdAt, intervals, now, error, intervalError }: Props) {
  const { colors, radius, spacing, typography } = useAppTheme();
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
              {isRepeating(value.frequency) ? (
                <View style={{ marginBottom: spacing.md }}>
                  <View style={styles.everyRow}>
                    <AppText>Every</AppText>
                    <TextInput
                      value={value.repeatInterval ? String(value.repeatInterval) : ''}
                      onChangeText={text => {
                        const digits = text.replace(/[^0-9]/g, '').slice(0, String(MAX_REPEAT_INTERVAL).length);
                        set({ repeatInterval: digits ? Number(digits) : 0 });
                      }}
                      keyboardType="number-pad"
                      accessibilityLabel={`Repeat every how many ${repeatUnit(value.frequency, 2)}`}
                      placeholder="1"
                      placeholderTextColor={colors.textMuted}
                      style={[
                        typography.body,
                        styles.everyInput,
                        {
                          color: colors.text,
                          backgroundColor: colors.surface,
                          borderColor: intervalError ? colors.danger : colors.border,
                          borderRadius: radius.md,
                          marginHorizontal: spacing.sm,
                        },
                      ]}
                    />
                    <AppText>{repeatUnit(value.frequency, value.repeatInterval || 2)}</AppText>
                  </View>
                  {intervalError ? (
                    <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
                      {intervalError}
                    </AppText>
                  ) : null}
                </View>
              ) : null}
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
  everyRow: { flexDirection: 'row', alignItems: 'center' },
  everyInput: { borderWidth: 1, minWidth: 64, minHeight: 44, paddingVertical: 8, textAlign: 'center' },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateText: { marginLeft: 6 },
  past: { textDecorationLine: 'line-through' },
});
