import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorView,
  Icon,
  InformationCard,
  LoadingView,
  Screen,
  SectionHeader,
  StatCard,
} from '../components';
import { useFocusData } from '../hooks/useFocusData';
import type { TabScreenProps } from '../navigation/types';
import { formatDuration } from '../services/dayPlanner';
import { getTodayPlan } from '../services/planService';
import { getDashboard } from '../services/reviewService';
import { getStats } from '../services/statsService';
import { shadow, useAppTheme, withAlpha } from '../theme';
import { formatLongToday, formatRelative, formatTime } from '../utils/date';

import { tr, trn } from '../i18n';
function greeting(now: number): string {
  const hour = new Date(now).getHours();
  if (hour < 12) {
    return tr('Good morning');
  }
  if (hour < 18) {
    return tr('Good afternoon');
  }
  return tr('Good evening');
}

function QuickAction({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  const { spacing } = useAppTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.quick}>
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.quickIcon,
              { backgroundColor: withAlpha(color, pressed ? 0.25 : 0.13), borderColor: withAlpha(color, 0.25) },
            ]}
          >
            <Icon name={icon} size={24} color={color} />
          </View>
          <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.xs }}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

export function DashboardScreen({ navigation }: TabScreenProps<'Home'>) {
  const { colors, dark, radius, spacing } = useAppTheme();
  const loader = useCallback(async () => {
    const now = Date.now();
    const [dashboard, plan] = await Promise.all([getDashboard(now), getTodayPlan(now)]);
    return { now, plan, ...dashboard };
  }, []);
  const { data, loading, error, reload } = useFocusData(loader, 'dashboard');
  const statsLoader = useCallback(() => getStats(), []);
  const { data: stats } = useFocusData(statsLoader, 'dashboard:stats');

  if (!data) {
    return (
      <Screen edges={['top']} scroll={false}>
        {error ? <ErrorView message={error} onRetry={reload} /> : <LoadingView />}
      </Screen>
    );
  }

  const nextTask =
    data.plan?.tasks
      .filter(t => !t.isDone && t.startAt !== null && t.endAt !== null && t.endAt > data.now)
      .sort((a, b) => a.startAt! - b.startAt!)[0] ?? null;

  const openDetails = (informationId: number) =>
    navigation.navigate('InformationDetails', { informationId });

  return (
    <Screen edges={['top']} refreshing={loading} onRefresh={reload}>
      <View style={[styles.row, { marginBottom: spacing.lg }]}>
        <View style={styles.flex}>
          <AppText variant="caption" tone="muted">
            {formatLongToday(data.now).toUpperCase()}
          </AppText>
          <AppText variant="title">{tr('My Knowledge')}</AppText>
        </View>
        <Pressable
          onPress={() => navigation.navigate('Stats')}
          accessibilityRole="button"
          accessibilityLabel={tr('Review streak: {n} days. Open statistics', { n: stats?.currentStreak ?? 0 })}
          style={[styles.streak, { backgroundColor: withAlpha(colors.warning, 0.15), borderRadius: radius.pill, paddingHorizontal: spacing.md }]}
        >
          <AppText variant="bodyStrong">🔥 {stats?.currentStreak ?? 0}</AppText>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          accessibilityRole="button"
          accessibilityLabel={tr('Settings')}
          hitSlop={8}
          style={[styles.gear, { backgroundColor: colors.surface, marginLeft: spacing.sm }, shadow(dark, 1)]}
        >
          <Icon name="cog-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.lg }]}>
        <View style={[styles.bubble, styles.bubbleOne, { backgroundColor: withAlpha('#FFFFFF', 0.08) }]} />
        <View style={[styles.bubble, styles.bubbleTwo, { backgroundColor: withAlpha('#FFFFFF', 0.06) }]} />
        <AppText variant="small" color={withAlpha(colors.primaryContrast, 0.85)}>
          {greeting(data.now)} 👋
        </AppText>
        <AppText variant="h2" color={colors.primaryContrast} style={{ marginTop: spacing.xs }}>
          {data.dueToday.length > 0
            ? trn('{n} item to review today', '{n} items to review today', data.dueToday.length)
            : tr('You are up to date ✨')}
        </AppText>
        {data.plan ? (
          <>
            <AppText variant="small" color={withAlpha(colors.primaryContrast, 0.85)} style={{ marginTop: spacing.xs }}>
              {tr('{done}/{total} tasks done today', { done: data.plan.tasks.filter(t => t.isDone).length, total: data.plan.tasks.length })}</AppText>
            <View style={[styles.heroTrack, { backgroundColor: withAlpha('#FFFFFF', 0.2), marginTop: spacing.sm }]}>
              <View
                style={[
                  styles.heroFill,
                  {
                    width: `${(data.plan.tasks.filter(t => t.isDone).length / Math.max(1, data.plan.tasks.length)) * 100}%`,
                  },
                ]}
              />
            </View>
          </>
        ) : (
          <AppText variant="small" color={withAlpha(colors.primaryContrast, 0.85)} style={{ marginTop: spacing.xs }}>{tr('Your day is not planned yet.')}</AppText>
        )}
      </View>

      <View style={[styles.quickRow, { marginVertical: spacing.lg }]}>
        <QuickAction icon="plus" label={tr('Add')} color={colors.primary} onPress={() => navigation.navigate('AddInformation')} />
        <QuickAction icon="clipboard-text-clock-outline" label={tr('Plan')} color={colors.warning} onPress={() => navigation.navigate('Plan')} />
        <QuickAction icon="head-lightbulb-outline" label={tr('Quiz')} color={colors.success} onPress={() => navigation.navigate('Quiz')} />
        <QuickAction icon="chart-bar" label={tr('Stats')} color={colors.danger} onPress={() => navigation.navigate('Stats')} />
      </View>

      {nextTask ? (
        <Card onPress={() => navigation.navigate('Plan')} style={{ marginBottom: spacing.lg }}>
          <View style={styles.row}>
            <View style={[styles.timeBadge, { backgroundColor: withAlpha(colors.warning, 0.14), borderRadius: radius.md }]}>
              <AppText variant="bodyStrong" color={colors.warning}>
                {formatTime(nextTask.startAt!)}
              </AppText>
            </View>
            <View style={[styles.flex, { marginLeft: spacing.md }]}>
              <AppText variant="caption" tone="muted">
                {nextTask.startAt! <= data.now ? tr('NOW') : tr('NEXT TASK')}
              </AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {nextTask.important ? '⭐ ' : ''}
                {nextTask.title}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {formatDuration(nextTask.durationMin)}
              </AppText>
            </View>
            <Icon name="chevron-right" size={22} color={colors.textMuted} />
          </View>
        </Card>
      ) : null}

      {data.total === 0 ? (
        <Card>
          <EmptyState
            icon="lightbulb-on-outline"
            title={tr('Start building your knowledge')}
            message={tr('Save a Quran verse, a Hadith, a technical note or a French word, and get reminded to review it.')}
            actionLabel={tr('Add your first information')}
            onAction={() => navigation.navigate('AddInformation')}
          />
        </Card>
      ) : (
        <>
          <View style={[styles.row, { gap: spacing.md }]}>
            <StatCard
              label={tr('Saved')}
              value={data.total}
              icon="bookshelf"
              color={colors.primary}
              onPress={() => navigation.navigate('Library', undefined)}
            />
            <StatCard
              label={tr('To review')}
              value={data.dueToday.length}
              icon="calendar-check"
              color={data.dueToday.length > 0 ? colors.warning : colors.success}
              onPress={() => navigation.navigate('ReviewToday')}
            />
          </View>

          {data.dueToday.length > 0 ? (
            <Card style={{ marginTop: spacing.lg, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
              <View style={styles.row}>
                <Icon name="brain" size={28} color={colors.primary} />
                <View style={[styles.flex, { marginLeft: spacing.md }]}>
                  <AppText variant="bodyStrong">
                    {trn('{n} item to review today', '{n} items to review today', data.dueToday.length)}</AppText>
                  <AppText variant="small" tone="secondary">{tr('A few minutes of review keeps knowledge fresh.')}</AppText>
                </View>
              </View>
              <Button
                title={tr('Start the quiz')}
                icon="play"
                onPress={() => navigation.navigate('Quiz')}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}

          <SectionHeader title={tr('Upcoming reminders')} />
          {data.upcoming.length === 0 ? (
            <AppText tone="muted">{tr('No upcoming reminders.')}</AppText>
          ) : (
            <Card style={{ paddingVertical: spacing.sm }}>
              {data.upcoming.map(({ item, nextAt }, index) => (
                <View key={item.id}>
                  {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
                  <Card
                    onPress={() => openDetails(item.id)}
                    style={styles.upcomingRow}
                    accessibilityLabel={`${item.title}, ${formatRelative(nextAt, data.now)}`}
                  >
                    <View style={[styles.dot, { backgroundColor: item.category?.color ?? colors.textMuted }]} />
                    <AppText numberOfLines={1} style={styles.flex}>
                      {item.title}
                    </AppText>
                    <AppText variant="small" tone="muted" style={{ marginLeft: spacing.sm }}>
                      {formatRelative(nextAt, data.now)}
                    </AppText>
                  </Card>
                </View>
              ))}
            </Card>
          )}

          <SectionHeader
            title={tr('Recently added')}
            actionLabel={tr('See all')}
            onAction={() => navigation.navigate('Library', undefined)}
          />
          {data.recent.map(item => (
            <InformationCard key={item.id} item={item} now={data.now} onPress={() => openDetails(item.id)} />
          ))}

          <SectionHeader
            title={tr('Categories')}
            actionLabel={tr('Manage')}
            onAction={() => navigation.navigate('Categories')}
          />
          <View style={styles.wrap}>
            {data.categories.map(category => (
              <Chip
                key={category.id}
                label={`${category.name} · ${category.itemCount}`}
                icon={category.icon}
                color={category.color}
                onPress={() => navigation.navigate('Library', { categoryId: category.id })}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  separator: { height: StyleSheet.hairlineWidth },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  streak: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  gear: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  hero: { overflow: 'hidden' },
  bubble: { position: 'absolute', borderRadius: 999 },
  bubbleOne: { width: 180, height: 180, top: -70, right: -50 },
  bubbleTwo: { width: 120, height: 120, bottom: -60, right: 70 },
  heroTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  heroFill: { height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quick: { alignItems: 'center', flex: 1 },
  quickIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  timeBadge: { paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
});
