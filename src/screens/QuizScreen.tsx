import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, CategoryBadge, Icon, LoadingView } from '../components';
import type { InformationItem } from '../models';
import type { RootStackScreenProps } from '../navigation/types';
import { listInformation } from '../services/informationService';
import { getDueToday, gradeReview, recordPractice, type QuizGrade } from '../services/reviewService';
import { useAppTheme, withAlpha } from '../theme';
import { formatRelative } from '../utils/date';
import { describeError, logError } from '../utils/errors';

import { tr, trn } from '../i18n';
const PRACTICE_SIZE = 10;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface Answer {
  grade: QuizGrade;
}

export function QuizScreen({ route, navigation }: RootStackScreenProps<'Quiz'>) {
  const practice = route.params?.practice ?? false;
  const { colors, radius, spacing } = useAppTheme();
  const [items, setItems] = useState<InformationItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);

  const load = useCallback(async () => {
    try {
      if (practice) {
        const all = await listInformation({ sort: 'createdDesc' });
        setItems(shuffle(all).slice(0, PRACTICE_SIZE));
      } else {
        setItems((await getDueToday()).map(d => d.item));
      }
    } catch (e) {
      logError('quiz:load', e);
      Alert.alert(tr('Could not start the quiz'), describeError(e));
      navigation.goBack();
    }
  }, [practice, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({ title: practice ? tr('Practice') : tr('Quiz') });
  }, [navigation, practice]);

  const current = items?.[index];
  const finished = items !== null && index >= items.length;

  const stats = useMemo(
    () => ({
      hard: answers.filter(a => a.grade === 'hard').length,
      good: answers.filter(a => a.grade === 'good').length,
      easy: answers.filter(a => a.grade === 'easy').length,
    }),
    [answers],
  );

  const answer = async (grade: QuizGrade) => {
    if (!current) {
      return;
    }
    setBusy(true);
    try {
      if (practice) {
        await recordPractice(current.id);
      } else {
        await gradeReview(current.id, grade);
      }
      setAnswers(prev => [...prev, { grade }]);
      setRevealed(false);
      setIndex(i => i + 1);
    } catch (e) {
      logError('quiz:answer', e);
      Alert.alert(tr('Could not save your answer'), describeError(e));
    } finally {
      setBusy(false);
    }
  };

  if (items === null) {
    return <LoadingView />;
  }

  if (items.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <View style={[styles.bigIcon, { backgroundColor: withAlpha(colors.success, 0.15) }]}>
          <Icon name="check-all" size={40} color={colors.success} />
        </View>
        <AppText variant="h2" style={[styles.textCenter, { marginTop: spacing.lg }]}>{tr('Nothing to review now')}</AppText>
        <AppText tone="secondary" style={[styles.textCenter, { marginTop: spacing.sm }]}>{tr('You\'re up to date. Want to practice with random items from your library?')}</AppText>
        <Button
          title={tr('Practice with 10 items')}
          icon="cards-outline"
          onPress={() => navigation.replace('Quiz', { practice: true })}
          style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}
        />
      </View>
    );
  }

  if (finished) {
    const total = answers.length;
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <AppText style={styles.emoji}>🎉</AppText>
        <AppText variant="h2" style={[styles.textCenter, { marginTop: spacing.md }]}>
          {practice ? tr('Practice done!') : tr('Review done!')}
        </AppText>
        <AppText tone="secondary" style={[styles.textCenter, { marginTop: spacing.sm }]}>
          {trn('{n} item reviewed. Barak Allahu fik!', '{n} items reviewed. Barak Allahu fik!', total)}</AppText>
        {!practice ? (
          <View style={[styles.statsRow, { marginTop: spacing.xl }]}>
            {(
              [
                [tr('Hard'), stats.hard, colors.danger],
                [tr('Good'), stats.good, colors.primary],
                [tr('Easy'), stats.easy, colors.success],
              ] as const
            ).map(([label, value, color]) => (
              <View
                key={label}
                style={[styles.stat, { backgroundColor: withAlpha(color, 0.12), borderRadius: radius.md, padding: spacing.md }]}
              >
                <AppText variant="h2" color={color}>
                  {value}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {label}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        <Button title={tr('Back')} onPress={() => navigation.goBack()} style={{ marginTop: spacing.xl, alignSelf: 'stretch' }} />
      </View>
    );
  }

  const progress = (index + (revealed ? 0.5 : 0)) / items.length;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={styles.between}>
          <AppText variant="caption" tone="secondary">
            {index + 1} / {items.length}
          </AppText>
          {current?.reminder && !practice ? (
            <AppText variant="caption" tone="muted">{tr('Due {when}', { when: formatRelative(current.reminder.scheduledAt, Date.now()) })}
            </AppText>
          ) : null}
        </View>
        <View style={[styles.track, { backgroundColor: withAlpha(colors.primary, 0.12), marginTop: spacing.xs }]}>
          <View style={[styles.fill, { backgroundColor: colors.primary, width: `${Math.max(4, progress * 100)}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl },
          ]}
        >
          {current?.category ? <CategoryBadge category={current.category} /> : null}
          <AppText variant="h2" style={{ marginTop: spacing.md }}>
            {current?.title}
          </AppText>

          {revealed ? (
            <View style={{ marginTop: spacing.lg }}>
              <View style={[styles.divider, { backgroundColor: colors.border, marginBottom: spacing.lg }]} />
              <AppText style={styles.content} selectable>
                {current?.content}
              </AppText>
              {current?.source ? (
                <AppText variant="small" tone="secondary" style={{ marginTop: spacing.md }}>
                  — {current.source}
                </AppText>
              ) : null}
            </View>
          ) : (
            <Pressable
              onPress={() => setRevealed(true)}
              style={[
                styles.hidden,
                { borderColor: withAlpha(colors.primary, 0.4), borderRadius: radius.md, marginTop: spacing.xl, padding: spacing.xl },
              ]}
              accessibilityRole="button"
            >
              <Icon name="head-lightbulb-outline" size={32} color={colors.primary} />
              <AppText tone="secondary" style={[styles.textCenter, { marginTop: spacing.sm }]}>{tr('Try to remember it first…')}{'\n'}{tr('then tap to reveal')}</AppText>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <View style={{ padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
        {revealed ? (
          practice ? (
            <Button title={tr('Next')} icon="arrow-right" loading={busy} onPress={() => answer('good')} />
          ) : (
            <View style={styles.row}>
              {(
                [
                  ['hard', tr('Hard'), tr('Again tomorrow'), colors.danger],
                  ['good', tr('Good'), tr('Next review'), colors.primary],
                  ['easy', tr('Easy'), tr('Skip ahead'), colors.success],
                ] as const
              ).map(([grade, label, hint, color], i) => (
                <Pressable
                  key={grade}
                  disabled={busy}
                  onPress={() => answer(grade)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}: ${hint}`}
                  style={({ pressed }) => [
                    styles.grade,
                    {
                      backgroundColor: withAlpha(color, pressed ? 0.25 : 0.12),
                      borderRadius: radius.md,
                      marginLeft: i === 0 ? 0 : spacing.sm,
                      paddingVertical: spacing.md,
                      opacity: busy ? 0.6 : 1,
                    },
                  ]}
                >
                  <AppText variant="bodyStrong" color={color}>
                    {label}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {hint}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )
        ) : (
          <Button title={tr('Show answer')} icon="eye-outline" onPress={() => setRevealed(true)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  textCenter: { textAlign: 'center' },
  bigIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 56, lineHeight: 68 },
  statsRow: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between' },
  stat: { flex: 1, alignItems: 'center', marginHorizontal: 4 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  card: { borderWidth: 1, flexGrow: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  content: { fontSize: 17, lineHeight: 28 },
  hidden: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center' },
  row: { flexDirection: 'row' },
  grade: { flex: 1, alignItems: 'center' },
});
