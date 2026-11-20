import React from 'react';
import { Text, type TextProps } from 'react-native';
import { useAppTheme, type TypographyVariant } from '../theme';

interface Props extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  tone?: 'default' | 'secondary' | 'muted';
}

export function AppText({ variant = 'body', color, tone = 'default', style, ...rest }: Props) {
  const theme = useAppTheme();
  const toneColor =
    tone === 'secondary'
      ? theme.colors.textSecondary
      : tone === 'muted'
        ? theme.colors.textMuted
        : theme.colors.text;
  return (
    <Text
      {...rest}
      style={[theme.typography[variant], { color: color ?? toneColor }, style]}
    />
  );
}
