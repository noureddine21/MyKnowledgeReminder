import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../theme';
import { AppText } from './AppText';

interface Props {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: Props) {
  const { colors, spacing } = useAppTheme();
  return (
    <View style={[styles.row, { marginTop: spacing.xl, marginBottom: spacing.md }]}>
      <AppText variant="h3">{title}</AppText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <AppText variant="small" color={colors.primary} style={styles.action}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  action: { fontWeight: '600' },
});
