import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, CategoryBadge, Icon, ItemImage, LoadingView, MasteryBadge, VoiceNotePlayer } from '../components';
import type { InformationItem } from '../models';
import type { RootStackScreenProps } from '../navigation/types';
import { listInformation } from '../services/informationService';
import { getDueToday, gradeReview, recordPractice, type QuizGrade } from '../services/reviewService';
import { buildSessionItems, formatCountdown } from '../services/reviewSession';
import { useAppTheme, withAlpha, arabicTextStyle } from '../theme';
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

/**
 * Flashcards: the question (or the title) first, then the answer.
 * Modes: today's reviews, practice (random), a collection (in order) and a timed session.
 */
export function QuizScreen({ route, navigation }: RootStackScreenProps<'Quiz'>) {
  const practice = route.params?.practice ?? false;
  const minutes = route.params?.minutes;
  const collectionId = route.params?.collectionId;
  const { colors, radius, spacing } = useAppTheme();
  const [items, setItems] = useState<InformationItem[] | null>(null);
  const [dueIds, setDueIds] = useState<Set<number>>(new Set());
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      if (collectionId !== undefined) {
        setItems(await listInformation({ collectionId, sort: 'createdAsc' }));
      } else if (minutes) {
        const due = (await getDueToday()).map(d => d.item);
        setDueIds(new Set(due.map(i => i.id)));
        setItems(buildSessionItems(due, await listInformation({ sort: 'createdDesc' })));
        setEndsAt(Date.now() + minutes * 60_000);
      } else if (practice) {
        const all = await listInformation({ sort: 'createdDesc' });
        setItems(shuffle(all).slice(0, PRACTICE_SIZE));
      } else {
        const due = (await getDueToday()).map(d => d.item);
        setDueIds(new Set(due.map(i => i.id)));
        setItems(due);
      }
    } catch (e) {
      logError('quiz:load', e);
      Alert.alert(tr('Could not start the quiz'), describeError(e));
      navigation.goBack();
    }
  }, [practice, minutes, collectionId, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({
      title: minutes
        ? tr('{n} min session', { n: minutes })
        : collectionId !== undefined
          ? tr('Review the collection')
          : practice
            ? tr('Practice')
            : tr('Quiz'),
    });
  }, [navigation, practice, minutes, collectionId]);

  // Countdown of the timed session.
  useEffect(() => {
    if (endsAt === null) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const timeUp = endsAt !== null && now >= endsAt;
  const current = items?.[index];
  const finished = items !== null && (index >= items.length || timeUp);

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
      // Items due today follow their schedule; the others only update the mastery.
      if (dueIds.has(current.id)) {
        await gradeReview(current.id, grade);
      } else {
        await recordPractice(current.id, Date.now(), grade);
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
        <AppText style={styles.emoji}>{timeUp ? '⏱️' : '🎉'}</AppText>
        <AppText variant="h2" style={[styles.textCenter, { marginTop: spacing.md }]}>
          {timeUp ? tr('Time is up!') : practice ? tr('Practice done!') : tr('Review done!')}
        </AppText>
        <AppText tone="secondary" style={[styles.textCenter, { marginTop: spacing.sm }]}>
          {trn('{n} item reviewed. Barak Allahu fik!', '{n} items reviewed. Barak Allahu fik!', total)}</AppText>
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
        <Button title={tr('Back')} onPress={() => navigation.goBack()} style={{ marginTop: spacing.xl, alignSelf: 'stretch' }} />
      </View>
    );
  }

  const progress = endsAt !== null && minutes
    ? 1 - Math.max(0, endsAt - now) / (minutes * 60_000)
    : (index + (revealed ? 0.5 : 0)) / items.length;
  const isDue = current ? dueIds.has(current.id) : false;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={styles.between}>
          <AppText variant="caption" tone="secondary">
            {endsAt !== null ? trn('{n} item done', '{n} items done', index) : `${index + 1} / ${items.length}`}
          </AppText>
          {endsAt !== null ? (
            <View style={styles.row}>
              <Icon name="timer-outline" size={16} color={colors.primary} />
              <AppText variant="bodyStrong" color={colors.primary} style={{ marginLeft: 4 }}>
                {formatCountdown(endsAt - now)}
              </AppText>
            </View>
          ) : current?.reminder && isDue ? (
            <AppText variant="caption" tone="muted">{tr('Due {when}', { when: formatRelative(current.reminder.scheduledAt, Date.now()) })}
            </AppText>
          ) : null}
        </View>
        <View style={[styles.track, { backgroundColor: withAlpha(colors.primary, 0.12), marginTop: spacing.xs }]}>
          <View style={[styles.fill, { backgroundColor: colors.primary, width: `${Math.max(4, Math.min(100, progress * 100))}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl },
          ]}
        >
          <View style={styles.between}>
            {current?.category ? <CategoryBadge category={current.category} /> : <View />}
            {current ? <MasteryBadge mastery={current.mastery} /> : null}
          </View>
          {current?.question ? (
            <>
              <AppText variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
                {current.title}
              </AppText>
              <AppText variant="h2" style={{ marginTop: spacing.xs }}>
                {current.question}
              </AppText>
            </>
          ) : (
            <AppText variant="h2" style={{ marginTop: spacing.md }}>
              {current?.title}
            </AppText>
          )}

          {revealed ? (
            <View style={{ marginTop: spacing.lg }}>
              <View style={[styles.divider, { backgroundColor: colors.border, marginBottom: spacing.lg }]} />
              <AppText style={[styles.content, arabicTextStyle(current?.content ?? '')]} selectable>
                {current?.content}
              </AppText>
              {current?.source ? (
                <AppText variant="small" tone="secondary" style={{ marginTop: spacing.md }}>
                  — {current.source}
                </AppText>
              ) : null}
              {current?.imagePath ? (
                <View style={{ marginTop: spacing.md }}>
                  <ItemImage uri={current.imagePath} />
                </View>
              ) : null}
              {current?.audioPath ? (
                <View style={{ marginTop: spacing.md }}>
                  <VoiceNotePlayer path={current.audioPath} compact />
                </View>
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
          <View style={styles.row}>
            {(
              [
                ['hard', tr('Hard'), isDue ? tr('Again tomorrow') : tr('Not yet'), colors.danger],
                ['good', tr('Good'), isDue ? tr('Next review') : tr('I knew it'), colors.primary],
                ['easy', tr('Easy'), isDue ? tr('Skip ahead') : tr('Too easy'), colors.success],
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
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  card: { borderWidth: 1, flexGrow: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  content: { fontSize: 17, lineHeight: 28 },
  hidden: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  grade: { flex: 1, alignItems: 'center' },
});
