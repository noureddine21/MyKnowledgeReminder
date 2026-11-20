import React, { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useAppTheme } from '../theme';
import { AppText } from './AppText';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
}

export const TextField = forwardRef<TextInput, Props>(function TextFieldInner(
  { label, error, required, hint, multiline, style, ...rest },
  ref,
) {
  const { colors, radius, spacing, typography } = useAppTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.xs }}>
        {label}
        {required ? <AppText variant="caption" color={colors.danger}> *</AppText> : null}
      </AppText>
      <TextInput
        ref={ref}
        {...rest}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          typography.body,
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            minHeight: multiline ? 140 : 48,
          },
          style,
        ]}
      />
      {error ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  input: { borderWidth: 1, paddingVertical: 10 },
});
