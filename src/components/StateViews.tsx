import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';

export function LoadingView() {
  const { colors } = useAppTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors, spacing } = useAppTheme();
  return (
    <View style={[styles.center, { padding: spacing.xl }]}>
      <Icon name="alert-circle-outline" size={48} color={colors.danger} />
      <AppText variant="h3" style={[styles.text, { marginTop: spacing.md }]}>
        Something went wrong
      </AppText>
      <AppText tone="secondary" style={[styles.text, { marginTop: spacing.xs, marginBottom: spacing.lg }]}>
        {message}
      </AppText>
      {onRetry ? <Button title="Try again" icon="refresh" onPress={onRetry} /> : null}
    </View>
  );
}

interface EmptyProps {
  icon: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyProps) {
  const { colors, spacing, radius } = useAppTheme();
  return (
    <View style={[styles.center, { padding: spacing.xl }]}>
      <View
        style={{
          backgroundColor: colors.primarySoft,
          borderRadius: radius.pill,
          padding: spacing.lg,
          marginBottom: spacing.md,
        }}
      >
        <Icon name={icon} size={36} color={colors.primary} />
      </View>
      <AppText variant="h3" style={styles.text}>
        {title}
      </AppText>
      {message ? (
        <AppText tone="secondary" style={[styles.text, { marginTop: spacing.xs }]}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} style={{ marginTop: spacing.lg }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  text: { textAlign: 'center' },
});
