import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { getDashboard } from '../services/reviewService';
import { useAppTheme } from '../theme';
import { formatLongToday, formatRelative } from '../utils/date';

export function DashboardScreen({ navigation }: TabScreenProps<'Home'>) {
  const { colors, spacing } = useAppTheme();
  const loader = useCallback(async () => {
    const now = Date.now();
    return { now, ...(await getDashboard(now)) };
  }, []);
  const { data, loading, error, reload } = useFocusData(loader, 'dashboard');

  if (!data) {
    return (
      <Screen edges={['top']} scroll={false}>
        {error ? <ErrorView message={error} onRetry={reload} /> : <LoadingView />}
      </Screen>
    );
  }

  const openDetails = (informationId: number) =>
    navigation.navigate('InformationDetails', { informationId });

  return (
    <Screen edges={['top']} refreshing={loading} onRefresh={reload}>
      <AppText variant="caption" tone="muted">
        {formatLongToday(data.now).toUpperCase()}
      </AppText>
      <AppText variant="title" style={{ marginBottom: spacing.lg }}>
        My Knowledge
      </AppText>

      {data.total === 0 ? (
        <Card>
          <EmptyState
            icon="lightbulb-on-outline"
            title="Start building your knowledge"
            message="Save a Quran verse, a Hadith, a technical note or a French word, and get reminded to review it."
            actionLabel="Add your first information"
            onAction={() => navigation.navigate('AddInformation')}
          />
        </Card>
      ) : (
        <>
          <View style={[styles.row, { gap: spacing.md }]}>
            <StatCard
              label="Saved"
              value={data.total}
              icon="bookshelf"
              color={colors.primary}
              onPress={() => navigation.navigate('Library', undefined)}
            />
            <StatCard
              label="To review"
              value={data.dueToday.length}
              icon="calendar-check"
              color={data.dueToday.length > 0 ? colors.warning : colors.success}
              onPress={() => navigation.navigate('ReviewToday')}
            />
          </View>
          <View style={[styles.row, { gap: spacing.md, marginTop: spacing.md }]}>
            <StatCard label="Active reminders" value={data.activeReminders} icon="bell-ring-outline" color="#0694A2" />
            <StatCard label="Reviewed today" value={data.reviewedToday} icon="check-decagram-outline" color={colors.success} />
          </View>

          {data.dueToday.length > 0 ? (
            <Card style={{ marginTop: spacing.lg, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
              <View style={styles.row}>
                <Icon name="brain" size={28} color={colors.primary} />
                <View style={[styles.flex, { marginLeft: spacing.md }]}>
                  <AppText variant="bodyStrong">
                    {data.dueToday.length} {data.dueToday.length === 1 ? 'item' : 'items'} to review today
                  </AppText>
                  <AppText variant="small" tone="secondary">
                    A few minutes of review keeps knowledge fresh.
                  </AppText>
                </View>
              </View>
              <Button
                title="Start review"
                icon="play"
                onPress={() => navigation.navigate('ReviewToday')}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}

          <SectionHeader title="Upcoming reminders" />
          {data.upcoming.length === 0 ? (
            <AppText tone="muted">No upcoming reminders.</AppText>
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
            title="Recently added"
            actionLabel="See all"
            onAction={() => navigation.navigate('Library', undefined)}
          />
          {data.recent.map(item => (
            <InformationCard key={item.id} item={item} now={data.now} onPress={() => openDetails(item.id)} />
          ))}

          <SectionHeader
            title="Categories"
            actionLabel="Manage"
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
});
