import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { InformationItem } from '../models';
import { getNextReminderAt } from '../services/reviewSchedule';
import { useAppTheme } from '../theme';
import { formatDate, formatRelative } from '../utils/date';
import { AppText } from './AppText';
import { Card } from './Card';
import { CategoryBadge } from './CategoryBadge';
import { Icon } from './Icon';

import { tr } from '../i18n';
interface Props {
  item: InformationItem;
  now: number;
  onPress: () => void;
  /** Overrides the default reminder line (e.g. "Due today"). */
  footer?: React.ReactNode;
}

export function InformationCard({ item, now, onPress, footer }: Props) {
  const { colors, spacing } = useAppTheme();
  const nextAt = item.reminder ? getNextReminderAt(item.reminder, now) : null;

  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md }} accessibilityLabel={item.title}>
      <View style={styles.header}>
        <CategoryBadge category={item.category} />
        <AppText variant="caption" tone="muted">
          {formatDate(item.createdAt)}
        </AppText>
      </View>
      <AppText variant="h3" numberOfLines={2} style={{ marginTop: spacing.sm }}>
        {item.title}
      </AppText>
      <AppText tone="secondary" numberOfLines={2} style={{ marginTop: spacing.xs }}>
        {item.content}
      </AppText>
      {item.tags && item.tags.length > 0 ? (
        <AppText variant="caption" color={colors.accentStrong} numberOfLines={1} style={{ marginTop: spacing.xs }}>
          {item.tags.map(tag => `#${tag.name}`).join('  ')}
        </AppText>
      ) : null}
      {footer ?? (
        <View style={[styles.footer, { marginTop: spacing.sm }]}>
          <Icon
            name={nextAt !== null ? 'bell-ring-outline' : 'bell-off-outline'}
            size={15}
            color={nextAt !== null ? colors.primary : colors.textMuted}
          />
          <AppText variant="caption" tone="muted" style={styles.footerText}>
            {nextAt !== null ? tr('Next review: {when}', { when: formatRelative(nextAt, now) }) : tr('No active reminder')}
          </AppText>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center' },
  footerText: { marginLeft: 6 },
});
