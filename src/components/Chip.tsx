import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useAppTheme, withAlpha } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface Props {
  label: string;
  selected?: boolean;
  color?: string;
  icon?: string;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function Chip({ label, selected = false, color, icon, onPress, onLongPress }: Props) {
  const { colors, radius, spacing } = useAppTheme();
  const accent = color ?? colors.primary;
  const bg = selected ? withAlpha(accent, 0.18) : colors.surface;
  const border = selected ? accent : colors.border;
  const fg = selected ? (color ? colors.text : colors.primary) : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: bg,
          borderColor: border,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          marginRight: spacing.sm,
          marginBottom: spacing.sm,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={color ?? fg} /> : null}
      <AppText variant="small" color={fg} style={[icon ? styles.label : null, selected && styles.selected]}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 36 },
  label: { marginLeft: 6 },
  selected: { fontWeight: '600' },
});
