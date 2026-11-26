import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Card, ErrorView, Icon, LoadingView, Screen, SectionHeader } from '../components';
import { useFocusData } from '../hooks/useFocusData';
import { getStats } from '../services/statsService';
import { useAppTheme, withAlpha } from '../theme';
import { isSameDay } from '../utils/date';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function streakMessage(current: number, reviewedToday: boolean): string {
  if (current === 0) {
    return 'Review one item today to start a streak.';
  }
  if (!reviewedToday) {
    return 'Review today to keep your streak alive!';
  }
  if (current >= 30) {
    return 'Incredible consistency. Keep going!';
  }
  if (current >= 7) {
    return 'A full week and more — masha Allah!';
  }
  return 'Great, you reviewed today. See you tomorrow!';
}

function Tile({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md }]}>
      <View style={[styles.tileIcon, { backgroundColor: withAlpha(color, 0.14) }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <AppText variant="h2" style={{ marginTop: spacing.sm }}>
        {value}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

export function StatsScreen() {
  const { colors, radius, spacing } = useAppTheme();
  const loader = useCallback(() => getStats(), []);
  const { data: stats, loading, error, reload } = useFocusData(loader, 'stats:load');

  if (!stats) {
    return error ? <ErrorView message={error} onRetry={reload} /> : <LoadingView />;
  }

  const now = Date.now();
  const maxDay = Math.max(1, ...stats.lastWeek.map(d => d.count));
  const maxCategory = Math.max(1, ...stats.byCategory.map(c => c.count));
  const completion = stats.planner.planned > 0 ? stats.planner.done / stats.planner.planned : 0;

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={[styles.hero, { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg }]}>
        <View style={styles.row}>
          <AppText style={styles.fire}>🔥</AppText>
          <View style={[styles.flex, { marginLeft: spacing.md }]}>
            <AppText variant="title" color={colors.primaryContrast}>
              {stats.currentStreak} {stats.currentStreak === 1 ? 'day' : 'days'}
            </AppText>
            <AppText color={withAlpha(colors.primaryContrast, 0.85)}>Review streak</AppText>
          </View>
          <View style={[styles.best, { backgroundColor: withAlpha(colors.primaryContrast, 0.18), borderRadius: radius.md }]}>
            <AppText variant="caption" color={colors.primaryContrast}>
              Best
            </AppText>
            <AppText variant="bodyStrong" color={colors.primaryContrast}>
              {stats.bestStreak}
            </AppText>
          </View>
        </View>
        <AppText variant="small" color={withAlpha(colors.primaryContrast, 0.9)} style={{ marginTop: spacing.md }}>
          {streakMessage(stats.currentStreak, stats.reviewedToday)}
        </AppText>
      </View>

      <SectionHeader title="Last 7 days" />
      <Card>
        <View style={styles.chart}>
          {stats.lastWeek.map(d => {
            const today = isSameDay(d.day, now);
            return (
              <View key={d.day} style={styles.barCol}>
                <AppText variant="caption" tone="secondary">
                  {d.count > 0 ? d.count : ''}
                </AppText>
                <View style={[styles.barTrack, { backgroundColor: withAlpha(colors.primary, 0.08), borderRadius: radius.sm }]}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${d.count === 0 ? 0 : Math.max(8, (d.count / maxDay) * 100)}%`,
                        backgroundColor: today ? colors.primary : withAlpha(colors.primary, 0.55),
                        borderRadius: radius.sm,
                      },
                    ]}
                  />
                </View>
                <AppText variant="caption" tone={today ? 'default' : 'muted'}>
                  {today ? 'Today' : WEEKDAY[new Date(d.day).getDay()]}
                </AppText>
              </View>
            );
          })}
        </View>
      </Card>

      <View style={[styles.tiles, { marginTop: spacing.lg }]}>
        <Tile icon="calendar-week" value={String(stats.reviewsThisWeek)} label="Reviews this week" color={colors.primary} />
        <View style={{ width: spacing.md }} />
        <Tile icon="check-decagram-outline" value={String(stats.totalReviews)} label="Reviews in total" color={colors.success} />
      </View>
      <View style={[styles.tiles, { marginTop: spacing.md }]}>
        <Tile icon="bookshelf" value={String(stats.totalItems)} label="Items saved" color={colors.warning} />
        <View style={{ width: spacing.md }} />
        <Tile
          icon="clipboard-check-outline"
          value={stats.planner.planned > 0 ? `${Math.round(completion * 100)}%` : '—'}
          label="Tasks done (7 days)"
          color={colors.danger}
        />
      </View>

      {stats.planner.planned > 0 ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={styles.row}>
            <AppText variant="bodyStrong" style={styles.flex}>
              Day planner
            </AppText>
            <AppText variant="small" tone="secondary">
              {stats.planner.done}/{stats.planner.planned} tasks · {stats.planner.daysPlanned}{' '}
              {stats.planner.daysPlanned === 1 ? 'day' : 'days'}
            </AppText>
          </View>
          <View style={[styles.track, { backgroundColor: withAlpha(colors.success, 0.15), marginTop: spacing.sm }]}>
            <View style={[styles.fill, { width: `${completion * 100}%`, backgroundColor: colors.success }]} />
          </View>
        </Card>
      ) : null}

      {stats.byCategory.length > 0 ? (
        <>
          <SectionHeader title="Your library" />
          <Card>
            {stats.byCategory.map(c => (
              <View key={c.name} style={{ marginBottom: spacing.md }}>
                <View style={styles.row}>
                  <View style={[styles.dot, { backgroundColor: c.color }]} />
                  <AppText variant="small" style={[styles.flex, { marginLeft: spacing.sm }]}>
                    {c.name}
                  </AppText>
                  <AppText variant="small" tone="secondary">
                    {c.count}
                  </AppText>
                </View>
                <View style={[styles.track, { backgroundColor: withAlpha(c.color, 0.15), marginTop: spacing.xs }]}>
                  <View style={[styles.fill, { width: `${(c.count / maxCategory) * 100}%`, backgroundColor: c.color }]} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  hero: {},
  fire: { fontSize: 44, lineHeight: 54 },
  best: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  chart: { flexDirection: 'row', justifyContent: 'space-between', height: 160 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barTrack: { width: 22, flex: 1, justifyContent: 'flex-end', marginVertical: 4, overflow: 'hidden' },
  bar: { width: '100%' },
  tiles: { flexDirection: 'row' },
  tile: { flex: 1, borderWidth: 1 },
  tileIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
