import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme, withAlpha } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface Props {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  onPress?: () => void;
}

export function StatCard({ label, value, icon, color, onPress }: Props) {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.lg,
          padding: spacing.md,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[styles.iconWrap, { backgroundColor: withAlpha(color, 0.15), borderRadius: radius.md }]}
      >
        <Icon name={icon} size={20} color={color} />
      </View>
      <AppText variant="h2" style={{ marginTop: spacing.sm }}>
        {value}
      </AppText>
      <AppText variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: StyleSheet.hairlineWidth },
  iconWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
