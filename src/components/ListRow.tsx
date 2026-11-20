import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useAppTheme } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface Props {
  icon?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  /** Renders a switch instead of a chevron. */
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  disabled?: boolean;
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  switchValue,
  onSwitchChange,
  disabled,
}: Props) {
  const { colors, spacing } = useAppTheme();
  const hasSwitch = switchValue !== undefined;

  return (
    <Pressable
      onPress={hasSwitch ? () => onSwitchChange?.(!switchValue) : onPress}
      disabled={disabled || (!onPress && !hasSwitch)}
      accessibilityRole={hasSwitch ? 'switch' : 'button'}
      accessibilityState={hasSwitch ? { checked: switchValue, disabled } : { disabled }}
      android_ripple={{ color: colors.surfaceAlt }}
      style={[styles.row, { paddingVertical: spacing.md, opacity: disabled ? 0.5 : 1 }]}
    >
      {icon ? (
        <View style={{ marginRight: spacing.md }}>
          <Icon name={icon} size={22} color={iconColor ?? colors.primary} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="small" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="small" tone="secondary" style={{ marginLeft: spacing.sm }}>
          {value}
        </AppText>
      ) : null}
      {hasSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          disabled={disabled}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.surface}
        />
      ) : onPress ? (
        <Icon name="chevron-right" size={22} color={colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  texts: { flex: 1 },
});
