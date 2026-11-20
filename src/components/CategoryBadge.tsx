import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Category } from '../models';
import { useAppTheme, withAlpha } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export function CategoryBadge({ category }: { category: Category | null }) {
  const { colors, radius } = useAppTheme();
  const color = category?.color ?? colors.textMuted;
  return (
    <View
      style={[styles.badge, { backgroundColor: withAlpha(color, 0.15), borderRadius: radius.pill }]}
    >
      <Icon name={category?.icon ?? 'tag-outline'} size={13} color={color} />
      <AppText variant="caption" color={color} style={styles.label} numberOfLines={1}>
        {category?.name ?? 'Uncategorized'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  label: { marginLeft: 4, fontWeight: '600' },
});
