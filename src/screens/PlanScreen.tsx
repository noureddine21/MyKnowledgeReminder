import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  ErrorView,
  Icon,
  LoadingView,
  Screen,
  SectionHeader,
  TextField,
} from '../components';
import { useFocusData } from '../hooks/useFocusData';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useSettings } from '../hooks/useSettings';
import type { DayPlan, PlanTask } from '../models';
import { formatDuration, lunchWindow, LUNCH_END, LUNCH_START } from '../services/dayPlanner';
import {
  MAX_PLAN_INPUT_LENGTH,
  getTodayPlan,
  organizeToday,
  replanRemaining,
  setPlanTaskDone,
} from '../services/planService';
import { useAppTheme } from '../theme';
import { formatLongToday, formatTime } from '../utils/date';
import { ValidationError, describeError, logError } from '../utils/errors';

const EXAMPLE = 'Sport 1h\n!Finish the report 2h\nMeeting @14:00 1h\nCall Ahmed 15m\nRead Quran 20m';

type TimelineItem = { kind: 'task'; task: PlanTask } | { kind: 'lunch'; start: number; end: number };

function buildTimeline(plan: DayPlan, lunch: boolean, now: number): TimelineItem[] {
  const items: TimelineItem[] = plan.tasks
    .filter(t => t.startAt !== null)
    .map(task => ({ kind: 'task' as const, task }));
  if (lunch) {
    const { start, end } = lunchWindow(now);
    items.push({ kind: 'lunch', start, end });
  }
  const startOf = (i: TimelineItem) => (i.kind === 'task' ? i.task.startAt! : i.start);
  return items.sort((a, b) => startOf(a) - startOf(b));
}

function SyntaxHelp() {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <View style={[styles.help, { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md }]}>
      <Icon name="lightbulb-on-outline" size={18} color={colors.primary} />
      <View style={[styles.flex, { marginLeft: spacing.sm }]}>
        <AppText variant="small">One task per line. Optional:</AppText>
        <AppText variant="small">• duration: 1h, 1h30, 45m (default 30 min)</AppText>
        <AppText variant="small">• fixed time: @14:00 or "à 14h"</AppText>
        <AppText variant="small">• important first: start with !</AppText>
      </View>
    </View>
  );
}

export function PlanScreen() {
  const { colors, radius, spacing } = useAppTheme();
  const { settings } = useSettings();
  const { ensurePermission } = useNotificationPermission();

  const loader = useCallback(() => getTodayPlan(), []);
  const { data: plan, loading, error, reload } = useFocusData(loader, 'plan:load');

  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<{ warning: string | null }>) => {
    setBusy(true);
    try {
      if (settings.planTaskNotifications) {
        await ensurePermission();
      }
      const result = await action();
      setEditing(false);
      setInputError(undefined);
      await reload();
      if (result.warning) {
        Alert.alert('Notifications not scheduled', result.warning);
      }
    } catch (e) {
      if (e instanceof ValidationError) {
        setInputError(Object.values(e.fieldErrors)[0]);
      } else {
        logError('plan:organize', e);
        Alert.alert('Could not organize your day', describeError(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (task: PlanTask) => {
    try {
      await setPlanTaskDone(task.id, !task.isDone);
      await reload();
    } catch (e) {
      logError('plan:toggle', e);
      Alert.alert('Could not update the task', describeError(e));
    }
  };

  if (loading && plan === undefined) {
    return <LoadingView />;
  }
  if (error && plan === undefined) {
    return <ErrorView message={error} onRetry={reload} />;
  }

  const now = Date.now();
  const showEditor = editing || !plan;

  if (showEditor) {
    return (
      <Screen keyboard>
        <AppText variant="h2">{formatLongToday(now)}</AppText>
        <AppText tone="secondary" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
          Write what you have to do today. The app organizes your day from now until{' '}
          {settings.planDayEnd}.
        </AppText>
        <SyntaxHelp />
        <TextField
          label="Today's to-do list"
          value={input}
          onChangeText={text => {
            setInput(text);
            setInputError(undefined);
          }}
          placeholder={EXAMPLE}
          multiline
          maxLength={MAX_PLAN_INPUT_LENGTH}
          error={inputError}
          style={{ minHeight: 200 }}
        />
        <Button
          title={plan ? 'Re-organize my day' : 'Organize my day'}
          icon="clipboard-text-clock-outline"
          loading={busy}
          onPress={() => run(() => organizeToday(input))}
        />
        {plan ? (
          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => setEditing(false)}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
          Day {settings.planDayStart}–{settings.planDayEnd}
          {settings.planLunchBreak ? ` · lunch ${LUNCH_START}–${LUNCH_END} kept free` : ''} · 5 min between
          tasks, 15 min break after 2 h. Change it in Settings → Day planner.
        </AppText>
      </Screen>
    );
  }

  const timeline = buildTimeline(plan, settings.planLunchBreak, now);
  const unscheduled = plan.tasks.filter(t => t.startAt === null && !t.isDone);
  const doneCount = plan.tasks.filter(t => t.isDone).length;
  const lastEnd = Math.max(0, ...plan.tasks.map(t => t.endAt ?? 0));

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <AppText variant="h2">{formatLongToday(now)}</AppText>
      <AppText tone="secondary" style={{ marginTop: spacing.xs }}>
        {doneCount} of {plan.tasks.length} done{lastEnd ? ` · day ends around ${formatTime(lastEnd)}` : ''}
      </AppText>

      <View style={[styles.actions, { marginVertical: spacing.lg }]}>
        <Button
          title="Re-plan from now"
          icon="calendar-refresh"
          variant="secondary"
          compact
          loading={busy}
          onPress={() => run(() => replanRemaining())}
          style={[styles.flex, { marginRight: spacing.sm }]}
        />
        <Button
          title="Edit list"
          icon="pencil-outline"
          variant="secondary"
          compact
          onPress={() => {
            setInput(plan.rawInput);
            setEditing(true);
          }}
          style={styles.flex}
        />
      </View>

      {timeline.map(item => {
        if (item.kind === 'lunch') {
          return (
            <View key="lunch" style={[styles.row, { marginBottom: spacing.sm }]}>
              <View style={styles.timeCol}>
                <AppText variant="caption" tone="muted">{formatTime(item.start)}</AppText>
                <AppText variant="caption" tone="muted">{formatTime(item.end)}</AppText>
              </View>
              <View
                style={[
                  styles.lunch,
                  { borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
                ]}
              >
                <Icon name="food-fork-drink" size={18} color={colors.textMuted} />
                <AppText tone="muted" style={{ marginLeft: spacing.sm }}>
                  Lunch break
                </AppText>
              </View>
            </View>
          );
        }
        const { task } = item;
        const current = !task.isDone && task.startAt! <= now && now < task.endAt!;
        return (
          <View key={task.id} style={[styles.row, { marginBottom: spacing.sm }]}>
            <View style={styles.timeCol}>
              <AppText variant="caption" tone={current ? 'default' : 'secondary'}>
                {formatTime(task.startAt!)}
              </AppText>
              <AppText variant="caption" tone="muted">{formatTime(task.endAt!)}</AppText>
            </View>
            <Card
              onPress={() => toggle(task)}
              accessibilityLabel={`${task.title}, ${task.isDone ? 'done' : 'not done'}`}
              style={[
                styles.flex,
                current && { borderColor: colors.primary, borderWidth: 2 },
                task.isDone && { opacity: 0.6 },
              ]}
            >
              <View style={styles.taskRow}>
                <Icon
                  name={task.isDone ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                  size={22}
                  color={task.isDone ? colors.success : colors.textMuted}
                />
                <View style={[styles.flex, { marginLeft: spacing.sm }]}>
                  <AppText
                    variant="bodyStrong"
                    style={task.isDone ? styles.done : undefined}
                  >
                    {task.important ? '⭐ ' : ''}
                    {task.title}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {formatDuration(task.durationMin)}
                    {task.fixedStartMin !== null ? ' · fixed time' : ''}
                    {current ? ' · now' : ''}
                  </AppText>
                </View>
              </View>
            </Card>
          </View>
        );
      })}

      {unscheduled.length > 0 ? (
        <>
          <SectionHeader title="Doesn't fit today" />
          <Card>
            {unscheduled.map(task => (
              <View key={task.id} style={[styles.taskRow, { paddingVertical: spacing.xs }]}>
                <Icon name="alert-circle-outline" size={18} color={colors.warning} />
                <AppText style={[styles.flex, { marginLeft: spacing.sm }]}>
                  {task.title} ({formatDuration(task.durationMin)})
                </AppText>
              </View>
            ))}
            <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
              Remove or shorten some tasks, or set a later end of day in Settings → Day planner.
            </AppText>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  help: { flexDirection: 'row', marginBottom: 16 },
  actions: { flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  timeCol: { width: 52, paddingTop: 12 },
  taskRow: { flexDirection: 'row', alignItems: 'center' },
  lunch: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderStyle: 'dashed' },
  done: { textDecorationLine: 'line-through' },
});
