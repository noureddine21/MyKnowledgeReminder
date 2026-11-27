import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
} from '../components';
import { useFocusData } from '../hooks/useFocusData';
import { useSettings } from '../hooks/useSettings';
import { tr, trn } from '../i18n';
import type { TabScreenProps } from '../navigation/types';
import { pickItemOfTheDay } from '../services/dailyItemService';
import { formatDuration } from '../services/dayPlanner';
import { listInformation } from '../services/informationService';
import { getTodayPlan } from '../services/planService';
import { getDashboard } from '../services/reviewService';
import { getStats } from '../services/statsService';
import { arabicTextStyle, fonts, shadow, useAppTheme, withAlpha } from '../theme';
import { formatLongToday, formatRelative, formatTime } from '../utils/date';
import { HIJRI_MONTHS, toHijri } from '../utils/hijri';

/** Gold geometric ornament (8-pointed star in a circle) drawn with plain views. */
function Ornament({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={styles.ornament}>
      <View style={[styles.ornCircleBig, { borderColor: color }]} />
      <View style={[styles.ornSquare, { borderColor: color }]} />
      <View style={[styles.ornSquare, styles.rotated, { borderColor: color }]} />
      <View style={[styles.ornCircleSmall, { borderColor: color }]} />
    </View>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  const { colors, dark, spacing } = useAppTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.quick}>
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.quickIcon,
              { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
              shadow(dark, 1),
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
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();

  const loader = useCallback(async () => {
    const now = Date.now();
    const [dashboard, plan, items] = await Promise.all([getDashboard(now), getTodayPlan(now), listInformation({})]);
    return { now, plan, items, ...dashboard };
  }, []);
  const { data, loading, error, reload } = useFocusData(loader, 'dashboard');
  const statsLoader = useCallback(() => getStats(), []);
  const { data: stats } = useFocusData(statsLoader, 'dashboard:stats');

  // Light status bar icons over the emerald header while this screen is visible.
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle('light-content');
      return () => StatusBar.setBarStyle(dark ? 'light-content' : 'dark-content');
    }, [dark]),
  );

  if (!data) {
    return (
      <Screen edges={['top']} scroll={false}>
        {error ? <ErrorView message={error} onRetry={reload} /> : <LoadingView />}
      </Screen>
    );
  }

  const hijri = toHijri(data.now);
  const goal = settings.dailyGoal;
  const goalProgress = goal > 0 ? Math.min(1, data.reviewedToday / goal) : 0;
  const goalReached = goal > 0 && data.reviewedToday >= goal;
  const itemOfTheDay = pickItemOfTheDay(data.items, data.now);
  const tasks = data.plan?.tasks ?? [];
  const done = tasks.filter(t => t.isDone).length;
  const upcomingTasks = tasks
    .filter(t => !t.isDone && t.startAt !== null && t.endAt !== null && t.endAt > data.now)
    .sort((a, b) => a.startAt! - b.startAt!)
    .slice(0, 3);
  const openDetails = (informationId: number) => navigation.navigate('InformationDetails', { informationId });

  return (
    <Screen edges={[]} refreshing={loading} onRefresh={reload} contentStyle={{ paddingTop: 0 }}>
      {/* Emerald header */}
      <View
        style={[
          styles.hero,
          {
            backgroundColor: colors.hero,
            marginHorizontal: -spacing.lg,
            paddingTop: insets.top + spacing.lg,
            paddingHorizontal: spacing.lg + 4,
          },
        ]}
      >
        <Ornament color={withAlpha(colors.accent, 0.22)} />
        <View style={styles.row}>
          <AppText variant="small" color={withAlpha(colors.heroText, 0.8)} style={styles.flex} numberOfLines={1}>
            {formatLongToday(data.now)} · {hijri.day} {tr(HIJRI_MONTHS[hijri.month - 1])}
          </AppText>
          <Pressable
            onPress={() => navigation.navigate('Stats')}
            accessibilityRole="button"
            accessibilityLabel={tr('Review streak: {n} days. Open statistics', { n: stats?.currentStreak ?? 0 })}
            style={[styles.pill, { borderColor: withAlpha(colors.accent, 0.5), borderRadius: radius.pill }]}
          >
            <Icon name="fire" size={16} color={colors.accent} />
            <AppText variant="bodyStrong" color={colors.accent} style={{ marginLeft: 4 }}>
              {stats?.currentStreak ?? 0}
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
            accessibilityLabel={tr('Settings')}
            hitSlop={8}
            style={[styles.headerButton, { borderColor: withAlpha(colors.accent, 0.45), marginLeft: spacing.sm }]}
          >
            <Icon name="cog-outline" size={20} color={colors.accent} />
          </Pressable>
        </View>
        <AppText style={[styles.salam, { color: colors.accent }]}>السلام عليكم</AppText>
        <AppText variant="title" color={colors.heroText}>
          {settings.userName.trim() || tr('My Knowledge')}
        </AppText>
      </View>

      {/* Review card overlapping the header */}
      <View
        style={[
          styles.reviewCard,
          { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg },
          shadow(dark, 2),
        ]}
      >
        <View style={styles.row}>
          <View style={[styles.reviewIcon, { backgroundColor: colors.accentSoft }]}>
            <Icon name={goalReached ? 'check-decagram' : 'book-open-variant'} size={26} color={colors.accentStrong} />
          </View>
          <View style={[styles.flex, { marginLeft: spacing.md }]}>
            <AppText variant="caption" tone="secondary">
              {tr("TODAY'S REVIEW")}
            </AppText>
            <AppText variant="h2">
              {data.dueToday.length > 0
                ? trn('{n} item waiting', '{n} items waiting', data.dueToday.length)
                : tr('You are up to date ✨')}
            </AppText>
          </View>
        </View>

        {goal > 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <View style={styles.between}>
              <AppText variant="small" tone="secondary">
                {tr('Daily goal')}
              </AppText>
              <AppText variant="small" color={goalReached ? colors.success : colors.text} style={{ fontFamily: fonts.bold }}>
                {goalReached ? tr('Goal reached! 🎉') : tr('{done}/{goal} reviews', { done: data.reviewedToday, goal })}
              </AppText>
            </View>
            <View style={[styles.track, { backgroundColor: colors.primarySoft, marginTop: spacing.xs }]}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.max(goalProgress * 100, goalProgress > 0 ? 6 : 0)}%`, backgroundColor: goalReached ? colors.success : colors.accent },
                ]}
              />
            </View>
          </View>
        ) : null}

        <Button
          title={data.dueToday.length > 0 ? tr('Start the quiz') : tr('Practice anyway')}
          icon="head-lightbulb-outline"
          onPress={() => navigation.navigate('Quiz', data.dueToday.length > 0 ? undefined : { practice: true })}
          style={{ marginTop: spacing.md }}
        />
      </View>

      {/* Quick actions */}
      <View style={[styles.quickRow, { marginTop: spacing.lg }]}>
        <QuickAction icon="plus" label={tr('Add')} color={colors.primary} onPress={() => navigation.navigate('AddInformation')} />
        <QuickAction icon="clipboard-text-clock-outline" label={tr('Plan')} color={colors.accentStrong} onPress={() => navigation.navigate('Plan')} />
        <QuickAction icon="bookshelf" label={tr('Library')} color={colors.primary} onPress={() => navigation.navigate('Library', undefined)} />
        <QuickAction icon="chart-bar" label={tr('Stats')} color={colors.accentStrong} onPress={() => navigation.navigate('Stats')} />
      </View>

      {/* Item of the day */}
      {itemOfTheDay ? (
        <Pressable
          onPress={() => openDetails(itemOfTheDay.id)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.dayItem,
            {
              backgroundColor: dark ? colors.surface : '#FFFDF6',
              borderColor: withAlpha(colors.accent, 0.6),
              borderRadius: radius.lg,
              padding: spacing.lg,
              marginTop: spacing.lg,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <AppText variant="caption" color={colors.accentStrong} style={styles.kicker}>
            {tr('ITEM OF THE DAY')}
          </AppText>
          <AppText
            numberOfLines={4}
            style={[{ marginTop: spacing.xs }, arabicTextStyle(itemOfTheDay.content) ?? styles.dayItemText]}
          >
            {itemOfTheDay.content}
          </AppText>
          <AppText variant="small" tone="secondary" style={{ marginTop: spacing.xs }} numberOfLines={1}>
            {itemOfTheDay.title}
            {itemOfTheDay.source ? ` — ${itemOfTheDay.source}` : ''}
          </AppText>
        </Pressable>
      ) : null}

      {/* My day */}
      <View style={[styles.between, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>
        <AppText variant="h3">{tr('My day')}</AppText>
        {tasks.length > 0 ? (
          <AppText variant="small" tone="secondary">
            {tr('{done} of {total} done', { done, total: tasks.length })}
          </AppText>
        ) : null}
      </View>
      {upcomingTasks.length > 0 ? (
        upcomingTasks.map(task => {
          const now = task.startAt! <= data.now;
          return (
            <Card key={task.id} onPress={() => navigation.navigate('Plan')} style={{ marginBottom: spacing.sm, paddingVertical: spacing.md }}>
              <View style={styles.row}>
                <AppText variant="bodyStrong" color={now ? colors.accentStrong : colors.primary} style={styles.taskTime}>
                  {formatTime(task.startAt!)}
                </AppText>
                <AppText variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                  {task.important ? '⭐ ' : ''}
                  {task.title}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {now ? tr('NOW') : formatDuration(task.durationMin)}
                </AppText>
              </View>
            </Card>
          );
        })
      ) : (
        <Card onPress={() => navigation.navigate('Plan')}>
          <View style={styles.row}>
            <Icon name="clipboard-text-clock-outline" size={24} color={colors.primary} />
            <AppText style={[styles.flex, { marginLeft: spacing.md }]}>
              {tasks.length > 0 ? tr('No more tasks planned today') : tr('Your day is not planned yet.')}
            </AppText>
            <Icon name="chevron-right" size={22} color={colors.textMuted} />
          </View>
        </Card>
      )}

      {data.total === 0 ? (
        <Card style={{ marginTop: spacing.lg }}>
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
          <SectionHeader title={tr('Upcoming reminders')} />
          {data.upcoming.length === 0 ? (
            <AppText tone="muted">{tr('No upcoming reminders.')}</AppText>
          ) : (
            <Card style={{ paddingVertical: spacing.sm }}>
              {data.upcoming.map(({ item, nextAt }, index) => (
                <Pressable
                  key={item.id}
                  onPress={() => openDetails(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, ${formatRelative(nextAt, data.now)}`}
                  style={[styles.upcomingRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                >
                  <View style={[styles.dot, { backgroundColor: item.category?.color ?? colors.textMuted }]} />
                  <AppText numberOfLines={1} style={styles.flex}>
                    {item.title}
                  </AppText>
                  <AppText variant="small" tone="muted" style={{ marginLeft: spacing.sm }}>
                    {formatRelative(nextAt, data.now)}
                  </AppText>
                </Pressable>
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

          <SectionHeader title={tr('Categories')} actionLabel={tr('Manage')} onAction={() => navigation.navigate('Categories')} />
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
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  hero: { paddingBottom: 72, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  ornament: { position: 'absolute', right: -70, top: -60, width: 260, height: 260 },
  ornCircleBig: { position: 'absolute', left: 16, top: 16, width: 228, height: 228, borderRadius: 114, borderWidth: 1.5 },
  ornSquare: { position: 'absolute', left: 57, top: 57, width: 146, height: 146, borderWidth: 1.5 },
  rotated: { transform: [{ rotate: '45deg' }] },
  ornCircleSmall: { position: 'absolute', left: 83, top: 83, width: 94, height: 94, borderRadius: 47, borderWidth: 1.5 },
  pill: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 10, height: 34 },
  headerButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  salam: { fontFamily: fonts.arabic, fontSize: 26, lineHeight: 46, marginTop: 14 },
  reviewCard: { marginTop: -48 },
  reviewIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quick: { alignItems: 'center', flex: 1 },
  quickIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayItem: { borderWidth: 1 },
  kicker: { letterSpacing: 1.2, fontFamily: fonts.extrabold },
  dayItemText: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  taskTime: { width: 58 },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
});
