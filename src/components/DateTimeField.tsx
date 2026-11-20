import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../theme';
import { formatDate, formatDateTime, formatTime } from '../utils/date';
import { pickDate, pickDateTime, pickTime } from '../utils/pickers';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface Props {
  label: string;
  value: number;
  mode: 'date' | 'time' | 'datetime';
  onChange: (value: number) => void;
  minimumDate?: number;
  error?: string;
}

export function DateTimeField({ label, value, mode, onChange, minimumDate, error }: Props) {
  const { colors, radius, spacing } = useAppTheme();

  const open = async () => {
    const picked =
      mode === 'date'
        ? await pickDate(value, minimumDate)
        : mode === 'time'
          ? await pickTime(value)
          : await pickDateTime(value, minimumDate);
    if (picked !== null) {
      onChange(picked);
    }
  };

  const text = mode === 'date' ? formatDate(value) : mode === 'time' ? formatTime(value) : formatDateTime(value);
  const icon = mode === 'time' ? 'clock-outline' : 'calendar-month-outline';

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.xs }}>
        {label}
      </AppText>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${text}`}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Icon name={icon} size={20} color={colors.primary} />
        <AppText style={styles.text}>{text}</AppText>
        <Icon name="chevron-down" size={20} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 48 },
  text: { flex: 1, marginLeft: 10 },
});
