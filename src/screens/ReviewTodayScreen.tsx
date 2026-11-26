import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  CategoryBadge,
  EmptyState,
  ErrorView,
  Icon,
  LoadingView,
} from '../components';
import { useFocusData } from '../hooks/useFocusData';
import { useReviewActions } from '../hooks/useReviewActions';
import type { TabScreenProps } from '../navigation/types';
import { getDueToday, type DueItem } from '../services/reviewService';
import { useAppTheme } from '../theme';
import { formatLongToday, formatRelative } from '../utils/date';

import { tr, trn } from '../i18n';
export function ReviewTodayScreen({ navigation }: TabScreenProps<'ReviewToday'>) {
  const { colors, spacing } = useAppTheme();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const loader = useCallback(async () => {
    const now = Date.now();
    return { now, items: await getDueToday(now) };
  }, []);
  const { data, loading, error, reload } = useFocusData(loader, 'reviewToday');
  const { busyId, markAsReviewed, scheduleAnother, edit, remove } = useReviewActions(reload);

  const toggle = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  if (!data) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        {error ? <ErrorView message={error} onRetry={reload} /> : <LoadingView />}
      </View>
    );
  }

  const renderItem = ({ item: due }: { item: DueItem }) => {
    const { item } = due;
    const isOpen = expanded.has(item.id);
    const busy = busyId === item.id;
    return (
      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.header}>
          <CategoryBadge category={item.category} />
          <View
            style={[
              styles.dueBadge,
              { backgroundColor: due.overdue ? colors.dangerSoft : colors.warningSoft },
            ]}
          >
            <AppText variant="caption" color={due.overdue ? colors.danger : colors.warning}>
              {due.overdue ? tr('Overdue · {when}', { when: formatRelative(due.dueAt, data.now) }) : formatRelative(due.dueAt, data.now)}
            </AppText>
          </View>
        </View>

        <Pressable
          onPress={() => navigation.navigate('InformationDetails', { informationId: item.id })}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.title}`}
        >
          <AppText variant="h3" style={{ marginTop: spacing.sm }}>
            {item.title}
          </AppText>
        </Pressable>
        <AppText selectable numberOfLines={isOpen ? undefined : 3} style={{ marginTop: spacing.xs }}>
          {item.content}
        </AppText>
        {item.source && isOpen ? (
          <AppText variant="small" tone="muted" style={{ marginTop: spacing.xs }}>{tr('Source: ')}{item.source}
          </AppText>
        ) : null}
        <Pressable onPress={() => toggle(item.id)} hitSlop={8} accessibilityRole="button">
          <AppText variant="small" color={colors.primary} style={[styles.bold, { marginTop: spacing.xs }]}>
            {isOpen ? 'Show less' : 'Show full information'}
          </AppText>
        </Pressable>

        <View style={[styles.row, { marginTop: spacing.md, gap: spacing.sm }]}>
          <Button title={tr('Reviewed')} icon="check" onPress={() => markAsReviewed(item)} loading={busy} style={styles.flex} compact />
          <Button
            title={tr('Later')}
            icon="calendar-clock"
            variant="secondary"
            onPress={() => scheduleAnother(item)}
            disabled={busy}
            style={styles.flex}
            compact
          />
          <IconButton icon="pencil-outline" label={tr('Edit')} color={colors.textSecondary} onPress={() => edit(item)} />
          <IconButton icon="delete-outline" label={tr('Delete')} color={colors.danger} onPress={() => remove(item)} />
        </View>
      </Card>
    );
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      data={data.items}
      keyExtractor={d => String(d.item.id)}
      refreshing={loading}
      onRefresh={reload}
      ListHeaderComponent={
        data.items.length > 0 ? (
          <View style={{ marginBottom: spacing.md }}>
            <AppText variant="caption" tone="muted">
              {formatLongToday(data.now).toUpperCase()}
            </AppText>
            <AppText variant="h2">
              {trn('{n} item to review', '{n} items to review', data.items.length)}</AppText>
            <Button
              title={tr('Start the quiz')}
              icon="head-lightbulb-outline"
              onPress={() => navigation.navigate('Quiz')}
              style={{ marginTop: spacing.md }}
            />
            <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>{tr('Try to remember each item before seeing it — the best way to memorize.')}</AppText>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          icon="check-decagram-outline"
          title={tr('All caught up!')}
          message={tr('Nothing to review today. Items appear here on their reminder date.')}
          actionLabel={tr('Practice anyway')}
          onAction={() => navigation.navigate('Quiz', { practice: true })}
        />
      }
      renderItem={renderItem}
    />
  );
}

function IconButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}) {
  const { colors, radius } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        { borderColor: colors.border, borderRadius: radius.md, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={icon} size={20} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dueBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bold: { fontWeight: '600' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
