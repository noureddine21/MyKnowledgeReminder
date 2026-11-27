import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  CategoryBadge,
  TagPill,
  EmptyState,
  ErrorView,
  Icon,
  ItemImage,
  ItemPickerModal,
  ListRow,
  LoadingView,
  MasteryBadge,
  Screen,
  SectionHeader,
  VoiceNotePlayer,
} from '../components';
import { FREQUENCY_LABELS } from '../constants';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useFocusData } from '../hooks/useFocusData';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useReviewActions } from '../hooks/useReviewActions';
import { useSettings } from '../hooks/useSettings';
import type { Reminder } from '../models';
import type { RootStackScreenProps } from '../navigation/types';
import { getCollection } from '../services/collectionService';
import {
  getInformation,
  getLinkedItems,
  getReviewHistory,
  linkInformation,
  setFavorite,
  unlinkInformation,
} from '../services/informationService';
import { getNextReminderAt, isDueToday } from '../services/reviewSchedule';
import { setReminderActive } from '../services/reviewService';
import { shareCard, isNativeAvailable } from '../native/mkrNative';
import { useAppTheme, arabicTextStyle } from '../theme';
import { formatDateTime, formatRelative } from '../utils/date';
import { formatRecurrence } from '../utils/recurrence';
import { ValidationError, describeError } from '../utils/errors';

import { tr } from '../i18n';
function reminderSummary(reminder: Reminder, intervals: number[]): string {
  if (reminder.frequency === 'spaced') {
    return tr('Smart schedule · review {step} of {total}', {
      step: Math.min(reminder.spacedStep + 1, intervals.length),
      total: intervals.length,
    });
  }
  return formatRecurrence(reminder.frequency, reminder.repeatInterval) || tr(FREQUENCY_LABELS[reminder.frequency]);
}

export function InformationDetailsScreen({ route, navigation }: RootStackScreenProps<'InformationDetails'>) {
  const { informationId } = route.params;
  const { colors, spacing } = useAppTheme();
  const { settings } = useSettings();
  const handleError = useErrorHandler();
  const { ensurePermission } = useNotificationPermission();
  const [pickerOpen, setPickerOpen] = useState(false);

  const loader = useCallback(async () => {
    const [item, history, linked] = await Promise.all([
      getInformation(informationId),
      getReviewHistory(informationId),
      getLinkedItems(informationId),
    ]);
    const collection = item?.collectionId ? await getCollection(item.collectionId) : null;
    return { item, history, linked, collection, now: Date.now() };
  }, [informationId]);
  const { data, error, reload } = useFocusData(loader, 'details');
  const { busyId, markAsReviewed, scheduleAnother, edit, remove } = useReviewActions(reload);

  const item = data?.item ?? null;
  const toggleFavorite = useCallback(async () => {
    if (!item) {
      return;
    }
    try {
      await setFavorite(item.id, !item.isFavorite);
      reload();
    } catch (e) {
      handleError(e, 'details:favorite');
    }
  }, [item, reload, handleError]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: item
        ? () => (
            <Pressable
              onPress={toggleFavorite}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={item.isFavorite ? tr('Remove from favorites') : tr('Add to favorites')}
            >
              <Icon name={item.isFavorite ? 'star' : 'star-outline'} size={26} color={colors.accent} />
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, item, toggleFavorite, colors.accent]);

  if (!data) {
    return error ? <ErrorView message={error} onRetry={reload} /> : <LoadingView />;
  }
  const { history, linked, collection, now } = data;
  if (!item) {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="file-remove-outline"
          title={tr('Information not found')}
          message={tr('It may have been deleted.')}
          actionLabel={tr('Go back')}
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  const reminder = item.reminder;
  const nextAt = reminder ? getNextReminderAt(reminder, now) : null;
  const due = reminder ? isDueToday(reminder, now) : false;
  const busy = busyId === item.id;

  const toggleReminder = async (active: boolean) => {
    try {
      if (active) {
        await ensurePermission();
      }
      const warning = await setReminderActive(item.id, active);
      if (warning) {
        Alert.alert(tr('Reminder not scheduled'), warning);
      }
      reload();
    } catch (e) {
      if (e instanceof ValidationError) {
        Alert.alert(tr('Reminder date passed'), e.userMessage, [
          { text: tr('Cancel'), style: 'cancel' },
          { text: tr('Choose a date'), onPress: () => scheduleAnother(item) },
        ]);
      } else {
        handleError(e, 'details:toggle');
      }
    }
  };

  const share = async () => {
    try {
      await shareCard({
        title: item.title,
        content: item.content,
        source: item.source,
        footer: 'My Knowledge Reminder',
        chooserTitle: tr('Share as image'),
      });
    } catch (e) {
      Alert.alert(tr('Could not share'), describeError(e));
    }
  };

  const link = async (otherId: number) => {
    setPickerOpen(false);
    try {
      await linkInformation(item.id, otherId);
      reload();
    } catch (e) {
      handleError(e, 'details:link');
    }
  };

  const unlink = (otherId: number, title: string) =>
    Alert.alert(tr('Remove this link?'), title, [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: tr('Remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await unlinkInformation(item.id, otherId);
            reload();
          } catch (e) {
            handleError(e, 'details:unlink');
          }
        },
      },
    ]);

  return (
    <Screen>
      <View style={styles.between}>
        <CategoryBadge category={item.category} />
        <MasteryBadge mastery={item.mastery} />
      </View>
      <AppText variant="title" selectable style={{ marginTop: spacing.sm }}>
        {item.isFavorite ? '⭐ ' : ''}
        {item.title}
      </AppText>
      {collection ? (
        <Pressable
          onPress={() => navigation.navigate('Collection', { collectionId: collection.id })}
          accessibilityRole="button"
          style={[styles.row, { marginTop: spacing.xs }]}
        >
          <Icon name="bookmark-multiple-outline" size={16} color={collection.color} />
          <AppText variant="small" color={collection.color} style={styles.rowText}>
            {collection.name}
            {item.collectionPosition ? ` · #${item.collectionPosition}` : ''}
          </AppText>
        </Pressable>
      ) : null}
      {item.tags && item.tags.length > 0 ? (
        <View style={[styles.tagRow, { marginTop: spacing.sm }]}>
          {item.tags.map(tag => (
            <TagPill key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </View>
      ) : null}
      {item.source ? (
        <View style={[styles.row, { marginTop: spacing.xs }]}>
          <Icon name="link-variant" size={16} color={colors.textMuted} />
          <AppText tone="secondary" selectable style={styles.rowText}>
            {item.source}
          </AppText>
        </View>
      ) : null}

      {item.question ? (
        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Icon name="help-circle-outline" size={18} color={colors.accentStrong} />
          <AppText variant="bodyStrong" color={colors.accentStrong} selectable style={styles.rowText}>
            {item.question}
          </AppText>
        </View>
      ) : null}

      <Card style={{ marginTop: spacing.lg }}>
        <AppText selectable style={[styles.content, arabicTextStyle(item.content)]}>
          {item.content}
        </AppText>
      </Card>

      {item.imagePath ? (
        <View style={{ marginTop: spacing.md }}>
          <ItemImage uri={item.imagePath} onPress={() => navigation.navigate('Reading', { ids: [item.id], title: item.title })} />
        </View>
      ) : null}
      {item.audioPath ? (
        <View style={{ marginTop: spacing.md }}>
          <VoiceNotePlayer path={item.audioPath} />
        </View>
      ) : null}

      <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>{tr('Created ')}{formatDateTime(item.createdAt)}
        {item.updatedAt !== item.createdAt ? tr(' · Updated {date}', { date: formatDateTime(item.updatedAt) }) : ''}
      </AppText>

      <View style={[styles.actions, { marginTop: spacing.lg, gap: spacing.sm }]}>
        <Button
          title={due ? tr('Mark as reviewed') : tr('Mark reviewed')}
          icon="check"
          onPress={() => markAsReviewed(item)}
          loading={busy}
          style={styles.flex}
        />
        <Button
          title={tr('Review later')}
          icon="calendar-clock"
          variant="secondary"
          onPress={() => scheduleAnother(item)}
          disabled={busy}
          style={styles.flex}
        />
      </View>
      <View style={[styles.actions, { marginTop: spacing.sm, gap: spacing.sm }]}>
        <Button
          title={tr('Reading mode')}
          icon="book-open-outline"
          variant="ghost"
          compact
          onPress={() => navigation.navigate('Reading', { ids: [item.id, ...linked.map(l => l.id)], title: item.title })}
          style={styles.flex}
        />
        {isNativeAvailable() ? (
          <Button title={tr('Share as image')} icon="image-outline" variant="ghost" compact onPress={share} style={styles.flex} />
        ) : null}
      </View>

      <SectionHeader title={tr('See also')} />
      <Card style={{ paddingVertical: spacing.xs }}>
        {linked.map(other => (
          <ListRow
            key={other.id}
            icon="link-variant"
            title={other.title}
            subtitle={other.category?.name}
            onPress={() => navigation.push('InformationDetails', { informationId: other.id })}
            onLongPress={() => unlink(other.id, other.title)}
          />
        ))}
        <ListRow icon="link-plus" title={tr('Link another information')} iconColor={colors.primary} onPress={() => setPickerOpen(true)} />
      </Card>
      {linked.length > 0 ? (
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>{tr('Long-press a link to remove it.')}</AppText>
      ) : null}

      <SectionHeader title={tr('Reminder')} />
      <Card style={{ paddingVertical: spacing.xs }}>
        {reminder ? (
          <>
            <ListRow
              icon={reminder.isActive ? 'bell-ring-outline' : 'bell-off-outline'}
              title={reminderSummary(reminder, settings.reviewIntervals)}
              subtitle={
                reminder.isActive && nextAt !== null
                  ? `${due ? tr('Due now · ') : ''}${tr('Next: {when}', { when: formatRelative(nextAt, now) })}`
                  : tr('Reminder is off')
              }
              switchValue={reminder.isActive}
              onSwitchChange={toggleReminder}
            />
            {reminder.lastReviewedAt ? (
              <AppText variant="caption" tone="muted" style={{ paddingBottom: spacing.sm }}>{tr('Last reviewed ')}{formatRelative(reminder.lastReviewedAt, now)}
              </AppText>
            ) : null}
          </>
        ) : (
          <ListRow
            icon="bell-plus-outline"
            title={tr('No reminder')}
            subtitle={tr('Tap to schedule a review')}
            onPress={() => scheduleAnother(item)}
          />
        )}
      </Card>

      <SectionHeader title={tr('Review history')} />
      {history.length === 0 ? (
        <AppText tone="muted">{tr('Not reviewed yet.')}</AppText>
      ) : (
        <Card style={{ paddingVertical: spacing.sm }}>
          {history.map(entry => (
            <View key={entry.id} style={[styles.row, { paddingVertical: spacing.xs }]}>
              <Icon
                name={entry.status === 'reviewed' ? 'check-circle-outline' : 'calendar-refresh-outline'}
                size={18}
                color={entry.status === 'reviewed' ? colors.success : colors.warning}
              />
              <AppText variant="small" style={styles.rowText}>
                {entry.status === 'reviewed' ? tr('Reviewed') : tr('Rescheduled')} · {formatDateTime(entry.reviewedAt)}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      <View style={[styles.actions, { marginTop: spacing.xl, gap: spacing.sm }]}>
        <Button title={tr('Edit')} icon="pencil-outline" variant="ghost" onPress={() => edit(item)} style={styles.flex} />
        <Button
          title={tr('Delete')}
          icon="delete-outline"
          variant="danger"
          onPress={() => remove(item, () => navigation.goBack())}
          disabled={busy}
          style={styles.flex}
        />
      </View>

      <ItemPickerModal
        visible={pickerOpen}
        title={tr('Link another information')}
        excludeIds={[item.id, ...linked.map(l => l.id)]}
        onClose={() => setPickerOpen(false)}
        onPick={other => link(other.id)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tagRow: { flexDirection: 'row', flexWrap: 'wrap' },
  flex: { flex: 1 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowText: { marginLeft: 6, flex: 1 },
  content: { fontSize: 17, lineHeight: 27 },
  actions: { flexDirection: 'row' },
});
