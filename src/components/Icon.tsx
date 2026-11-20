import React, { type ComponentProps } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons/static';

export type IconName = ComponentProps<typeof MaterialDesignIcons>['name'];

interface Props {
  name: IconName | string;
  size?: number;
  color: string;
  accessibilityLabel?: string;
}

/** Thin wrapper so icon library changes stay in one place. */
export function Icon({ name, size = 22, color, accessibilityLabel }: Props) {
  return (
    <MaterialDesignIcons
      name={name as IconName}
      size={size}
      color={color}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
