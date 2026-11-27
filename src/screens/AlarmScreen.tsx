import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Icon, LoadingView } from '../components';
import { tr } from '../i18n';
import type { InformationItem, PlanTask } from '../models';
import { setShowWhenLocked } from '../native/mkrNative';
import type { RootStackScreenProps } from '../navigation/types';
import { formatDuration } from '../services/dayPlanner';
import { getInformation } from '../services/informationService';
import { handleNotificationAction } from '../services/notificationEvents';
import { NOTIFICATION_ACTIONS, dismissDisplayedNotification, notificationIdFor } from '../services/notificationService';
import { getPlanTask, setPlanTaskDone, snoozePlanTask } from '../services/planService';
import { arabicTextStyle, fonts, useAppTheme, withAlpha } from '../theme';
import { formatTime } from '../utils/date';
import { describeError, logError } from '../utils/errors';

type Loaded = { kind: 'item'; item: InformationItem } | { kind: 'task'; task: PlanTask } | { kind: 'missing' };

/**
 * Full-screen alarm (also over the lock screen): big time, the item or task,
 * and large buttons. The alarm keeps ringing until one of them is pressed.
 */
export function AlarmScreen({ route, navigation }: RootStackScreenProps<'Alarm'>) {
  const { informationId, planTaskId, notificationId } = route.params;
  const { colors, radius, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (planTaskId) {
          const task = await getPlanTask(planTaskId);
          !cancelled && setLoaded(task ? { kind: 'task', task } : { kind: 'missing' });
        } else if (informationId) {
          const item = await getInformation(informationId);
          !cancelled && setLoaded(item ? { kind: 'item', item } : { kind: 'missing' });
        } else {
          setLoaded({ kind: 'missing' });
        }
      } catch (e) {
        logError('alarm:load', e);
        !cancelled && setLoaded({ kind: 'missing' });
      }
    })();
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [informationId, planTaskId]);

  // Visible over the lock screen only while this screen is shown.
  useFocusEffect(
    useCallback(() => {
      setShowWhenLocked(true);
      StatusBar.setBarStyle('light-content');
      return () => {
        setShowWhenLocked(false);
      };
    }, []),
  );

  const close = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    }
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      close();
    } catch (e) {
      logError('alarm:action', e);
      Alert.alert(tr('Could not update the reminder'), describeError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return <LoadingView />;
  }

  const itemActions =
    loaded.kind === 'item'
      ? [
          {
            key: 'reviewed',
            label: tr('✓ Reviewed'),
            primary: true,
            onPress: () => run(() => handleNotificationAction(NOTIFICATION_ACTIONS.reviewed, loaded.item.id, notificationId)),
          },
          {
            key: 'snooze10',
            label: tr('Snooze 10 min'),
            onPress: () => run(() => handleNotificationAction(NOTIFICATION_ACTIONS.snoozeShort, loaded.item.id, notificationId)),
          },
          {
            key: 'snooze60',
            label: tr('Snooze 1 h'),
            onPress: () => run(() => handleNotificationAction(NOTIFICATION_ACTIONS.snoozeLong, loaded.item.id, notificationId)),
          },
        ]
      : loaded.kind === 'task'
        ? [
            {
              key: 'done',
              label: tr('✓ Done'),
              primary: true,
              onPress: () => run(() => setPlanTaskDone(loaded.task.id, true)),
            },
            {
              key: 'snooze10',
              label: tr('Snooze 10 min'),
              onPress: () => run(() => snoozePlanTask(loaded.task.id, 10)),
            },
            {
              key: 'snooze60',
              label: tr('Snooze 1 h'),
              onPress: () => run(() => snoozePlanTask(loaded.task.id, 60)),
            },
          ]
        : [
            {
              key: 'close',
              label: tr('Close'),
              primary: true,
              onPress: () =>
                run(async () => {
                  if (notificationId) {
                    await dismissDisplayedNotification(notificationId);
                  } else if (informationId) {
                    await dismissDisplayedNotification(notificationIdFor(informationId));
                  }
                }),
            },
          ];

  const title = loaded.kind === 'item' ? loaded.item.title : loaded.kind === 'task' ? loaded.task.title : tr('Information not found');
  const kicker = loaded.kind === 'task' ? tr('TIME FOR') : tr('TIME TO REVIEW');

  return (
    <View style={[styles.flex, { backgroundColor: colors.hero, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <View pointerEvents="none" style={styles.ornament}>
        <View style={[styles.ornCircle, { borderColor: withAlpha(colors.accent, 0.18) }]} />
        <View style={[styles.ornSquare, { borderColor: withAlpha(colors.accent, 0.18) }]} />
        <View style={[styles.ornSquare, styles.rotated, { borderColor: withAlpha(colors.accent, 0.18) }]} />
      </View>

      <View style={styles.center}>
        <View style={[styles.bell, { backgroundColor: withAlpha(colors.accent, 0.16), borderColor: withAlpha(colors.accent, 0.5) }]}>
          <Icon name="alarm" size={34} color={colors.accent} />
        </View>
        <AppText style={[styles.clock, { color: colors.heroText }]}>{formatTime(now)}</AppText>
        <AppText variant="caption" color={colors.accent} style={styles.kicker}>
          {kicker}
        </AppText>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}>
        <AppText variant="title" color={colors.heroText} style={styles.textCenter}>
          {title}
        </AppText>
        {loaded.kind === 'task' ? (
          <AppText color={withAlpha(colors.heroText, 0.8)} style={[styles.textCenter, { marginTop: spacing.sm }]}>
            {loaded.task.startAt !== null ? `${formatTime(loaded.task.startAt)} · ` : ''}
            {formatDuration(loaded.task.durationMin)}
          </AppText>
        ) : null}
        {loaded.kind === 'item' ? (
          <View style={[styles.card, { backgroundColor: withAlpha('#FFFFFF', 0.08), borderColor: withAlpha(colors.accent, 0.3), borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg }]}>
            <AppText
              color={colors.heroText}
              style={[styles.content, arabicTextStyle(loaded.item.content)]}
              numberOfLines={12}
            >
              {loaded.item.content}
            </AppText>
            {loaded.item.source ? (
              <AppText variant="small" color={withAlpha(colors.heroText, 0.7)} style={{ marginTop: spacing.sm }}>
                — {loaded.item.source}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
        {itemActions.map(action => (
          <Pressable
            key={action.key}
            onPress={action.onPress}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.action,
              {
                borderRadius: radius.lg,
                marginBottom: spacing.sm,
                backgroundColor: action.primary ? colors.accent : withAlpha('#FFFFFF', pressed ? 0.18 : 0.1),
                borderColor: action.primary ? colors.accent : withAlpha(colors.accent, 0.35),
                opacity: busy ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <AppText style={[styles.actionText, { color: action.primary ? colors.hero : colors.heroText }]}>
              {action.label}
            </AppText>
          </Pressable>
        ))}
        {loaded.kind === 'item' ? (
          <Pressable
            onPress={() => navigation.replace('InformationDetails', { informationId: loaded.item.id })}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.link}
          >
            <AppText variant="small" color={withAlpha(colors.heroText, 0.75)}>
              {tr('Open details')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center' },
  textCenter: { textAlign: 'center' },
  ornament: { position: 'absolute', right: -90, top: -40, width: 320, height: 320 },
  ornCircle: { position: 'absolute', left: 0, top: 0, width: 320, height: 320, borderRadius: 160, borderWidth: 1.5 },
  ornSquare: { position: 'absolute', left: 60, top: 60, width: 200, height: 200, borderWidth: 1.5 },
  rotated: { transform: [{ rotate: '45deg' }] },
  bell: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  clock: { fontFamily: fonts.extrabold, fontSize: 64, lineHeight: 76, marginTop: 12 },
  kicker: { letterSpacing: 2, fontFamily: fonts.extrabold },
  card: { borderWidth: 1 },
  content: { fontSize: 17, lineHeight: 27 },
  action: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  actionText: { fontFamily: fonts.bold, fontSize: 17 },
  link: { alignSelf: 'center', paddingVertical: 8 },
});
