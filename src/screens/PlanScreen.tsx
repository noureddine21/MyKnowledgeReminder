import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
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
import type { DayPlan, DayWindow, PlanTask } from '../models';
import { formatDuration, lunchWindow, workWindow, LUNCH_END, LUNCH_START } from '../services/dayPlanner';
import {
  MAX_PLAN_INPUT_LENGTH,
  getTodayPlan,
  organizeToday,
  proposedWindow,
  replanRemaining,
  setPlanTaskDone,
} from '../services/planService';
import { useAppTheme } from '../theme';
import { applyTimeString, formatLongToday, formatTime, toTimeString } from '../utils/date';
import { pickTime } from '../utils/pickers';
import { ValidationError, describeError, logError } from '../utils/errors';

const EXAMPLE = 'Sport 1h\n!Finish the report 2h\nMeeting @14:00 1h\nCall Ahmed 15m\nRead Quran 20m';

type TimelineItem =
  | { kind: 'task'; task: PlanTask }
  | { kind: 'lunch' | 'work'; start: number; end: number };

function buildTimeline(plan: DayPlan, lunch: boolean, now: number): TimelineItem[] {
  const items: TimelineItem[] = plan.tasks
    .filter(t => t.startAt !== null)
    .map(task => ({ kind: 'task' as const, task }));
  const work =
    plan.window?.workStart && plan.window.workEnd
      ? workWindow(now, { start: plan.window.workStart, end: plan.window.workEnd })
      : null;
  if (work) {
    items.push({ kind: 'work', ...work });
  }
  if (lunch) {
    const lunchSlot = lunchWindow(now);
    // During work hours, lunch is part of the work block.
    if (!work || lunchSlot.end <= work.start || lunchSlot.start >= work.end) {
      items.push({ kind: 'lunch', ...lunchSlot });
    }
  }
  const startOf = (i: TimelineItem) => (i.kind === 'task' ? i.task.startAt! : i.start);
  return items.sort((a, b) => startOf(a) - startOf(b));
}

function TimeButton({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={async () => {
        const picked = await pickTime(applyTimeString(Date.now(), value));
        if (picked !== null) {
          onChange(toTimeString(picked));
        }
      }}
      style={[
        styles.timeButton,
        { borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, marginHorizontal: spacing.xs },
      ]}
    >
      <AppText variant="bodyStrong" color={colors.primary}>
        {value}
      </AppText>
    </Pressable>
  );
}

/** "Are you working today?" + work hours + day window, for today only. */
function DayWindowEditor({
  value,
  onChange,
  errors,
}: {
  value: DayWindow;
  onChange: (value: DayWindow) => void;
  errors: Record<string, string>;
}) {
  const { colors, spacing } = useAppTheme();
  const { settings } = useSettings();
  const working = value.workStart !== null;
  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>
        Are you working today?
      </AppText>
      <View style={styles.chips}>
        <Chip
          label="Yes, I work"
          icon="briefcase-outline"
          selected={working}
          onPress={() =>
            onChange({
              ...value,
              workStart: value.workStart ?? settings.planWorkStart,
              workEnd: value.workEnd ?? settings.planWorkEnd,
            })
          }
        />
        <Chip
          label="No, day off"
          icon="beach"
          selected={!working}
          onPress={() => onChange({ ...value, workStart: null, workEnd: null })}
        />
      </View>
      {working ? (
        <View style={[styles.timeRow, { marginTop: spacing.sm }]}>
          <AppText>Work from</AppText>
          <TimeButton label="Work starts" value={value.workStart!} onChange={workStart => onChange({ ...value, workStart })} />
          <AppText>to</AppText>
          <TimeButton label="Work ends" value={value.workEnd!} onChange={workEnd => onChange({ ...value, workEnd })} />
        </View>
      ) : null}
      {errors.work ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {errors.work}
        </AppText>
      ) : null}
      <View style={[styles.timeRow, { marginTop: spacing.md }]}>
        <AppText>My day from</AppText>
        <TimeButton label="Day starts" value={value.dayStart} onChange={dayStart => onChange({ ...value, dayStart })} />
        <AppText>to</AppText>
        <TimeButton label="Day ends" value={value.dayEnd} onChange={dayEnd => onChange({ ...value, dayEnd })} />
      </View>
      {errors.day ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {errors.day}
        </AppText>
      ) : null}
      <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
        {working
          ? 'Your tasks are planned before work, after work and in free gaps.'
          : 'The whole day is free for your tasks.'}
      </AppText>
    </Card>
  );
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
  const { settings, update } = useSettings();
  const { ensurePermission } = useNotificationPermission();

  const loader = useCallback(() => getTodayPlan(), []);
  const { data: plan, loading, error, reload } = useFocusData(loader, 'plan:load');

  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [dayWindow, setDayWindow] = useState<DayWindow>(() => proposedWindow(settings, Date.now()));
  const [windowErrors, setWindowErrors] = useState<Record<string, string>>({});

  const run = async (action: () => Promise<{ warning: string | null }>) => {
    setBusy(true);
    try {
      if (settings.planTaskNotifications) {
        await ensurePermission();
      }
      const result = await action();
      setEditing(false);
      setInputError(undefined);
      setWindowErrors({});
      await reload();
      if (result.warning) {
        Alert.alert('Notifications not scheduled', result.warning);
      }
    } catch (e) {
      if (e instanceof ValidationError) {
        const { day, work, ...rest } = e.fieldErrors;
        setWindowErrors({ ...(day ? { day } : {}), ...(work ? { work } : {}) });
        setInputError(Object.values(rest)[0]);
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
          Tell me how your day looks, then write what you have to do. The app organizes it for you.
        </AppText>
        <DayWindowEditor
          value={dayWindow}
          onChange={value => {
            setDayWindow(value);
            setWindowErrors({});
          }}
          errors={windowErrors}
        />
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
          onPress={() =>
            run(async () => {
              const result = await organizeToday(input, Date.now(), dayWindow);
              if (dayWindow.workStart && dayWindow.workEnd) {
                // Proposed again on the next work day.
                await update('planWorkStart', dayWindow.workStart);
                await update('planWorkEnd', dayWindow.workEnd);
              }
              return result;
            })
          }
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
          {settings.planLunchBreak ? `Lunch ${LUNCH_START}–${LUNCH_END} kept free · ` : ''}5 min between tasks,
          15 min break after 2 h. Defaults are in Settings → Day planner.
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
            setDayWindow(plan.window ?? proposedWindow(settings, Date.now()));
            setWindowErrors({});
            setEditing(true);
          }}
          style={styles.flex}
        />
      </View>

      {timeline.map(item => {
        if (item.kind !== 'task') {
          return (
            <View key={item.kind} style={[styles.row, { marginBottom: spacing.sm }]}>
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
                <Icon
                  name={item.kind === 'work' ? 'briefcase-outline' : 'food-fork-drink'}
                  size={18}
                  color={colors.textMuted}
                />
                <AppText tone="muted" style={{ marginLeft: spacing.sm }}>
                  {item.kind === 'work' ? 'Work' : 'Lunch break'}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  timeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  timeButton: { borderWidth: 1, minHeight: 40, justifyContent: 'center' },
});
