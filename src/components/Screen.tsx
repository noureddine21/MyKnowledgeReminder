import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens with a header usually need none. */
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  keyboard?: boolean;
}

export function Screen({
  children,
  scroll = true,
  edges = [],
  contentStyle,
  refreshing,
  onRefresh,
  keyboard = false,
}: Props) {
  const { colors, spacing } = useAppTheme();
  const padding = { padding: spacing.lg, paddingBottom: spacing.xxl };

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: colors.background }]}>
      {keyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
