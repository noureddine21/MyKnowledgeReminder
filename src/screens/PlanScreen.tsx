import React, { useCallback, useEffect, useState } from 'react';
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
  TaskTimeEditor,
  TextField,
} from '../components';
import { useFocusData } from '../hooks/useFocusData';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useSettings } from '../hooks/useSettings';
import { useNavigation } from '@react-navigation/native';
import type { AppSettings, DayPlan, DayWindow, PlanTask, Routine } from '../models';
import { formatDuration, lunchWindow, workWindow } from '../services/dayPlanner';
import {
  MAX_PLAN_INPUT_LENGTH,
  getTodayPlan,
  editPlanTaskTiming,
  getCarryOver,
  type CarryOver,
  organizeToday,
  prayersToAvoid,
  proposedWindow,
  replanRemaining,
  setPlanTaskDone,
} from '../services/planService';
import { listRoutines, routinesForDay } from '../services/routineService';
import { speechToTaskLines } from '../services/voiceInput';
import { isSpeechAvailable, startSpeech } from '../native/mkrNative';
import { useAppTheme, withAlpha } from '../theme';
import { applyTimeString, formatLongToday, formatTime, toTimeString } from '../utils/date';
import { pickTime } from '../utils/pickers';
import { ValidationError, describeError, logError } from '../utils/errors';

import { tr, trn } from '../i18n';
const EXAMPLE = 'Sport 1h\n!Finish the report 2h\nMeeting @14:00 1h\nCall Ahmed 15m\nRead Quran 20m';

type TimelineItem =
  | { kind: 'task'; task: PlanTask }
  | { kind: 'lunch' | 'work'; start: number; end: number }
  | { kind: 'prayer'; name: string; start: number; end: number };

function buildTimeline(plan: DayPlan, settings: AppSettings, now: number): TimelineItem[] {
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
  const lunchSlot = settings.planLunchBreak
    ? lunchWindow(now, { start: settings.planLunchStart, end: settings.planLunchEnd })
    : null;
  if (lunchSlot) {
    // During work hours, lunch is part of the work block.
    if (!work || lunchSlot.end <= work.start || lunchSlot.start >= work.end) {
      items.push({ kind: 'lunch', ...lunchSlot });
    }
  }
  const dayStart = applyTimeString(now, plan.window?.dayStart ?? settings.planDayStart);
  const dayEnd = applyTimeString(now, plan.window?.dayEnd ?? settings.planDayEnd);
  for (const prayer of prayersToAvoid(settings, now)) {
    if (prayer.end > dayStart && prayer.start < dayEnd) {
      items.push({ kind: 'prayer', ...prayer });
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

/** Today's work hours and day window, to change them for today only (exceptions). */
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
      <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{tr('Working today?')}</AppText>
      <View style={styles.chips}>
        <Chip
          label={tr('Yes, I work')}
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
          label={tr('No, day off')}
          icon="beach"
          selected={!working}
          onPress={() => onChange({ ...value, workStart: null, workEnd: null })}
        />
      </View>
      {working ? (
        <View style={[styles.timeRow, { marginTop: spacing.sm }]}>
          <AppText>{tr('Work from')}</AppText>
          <TimeButton label={tr('Work starts')} value={value.workStart!} onChange={workStart => onChange({ ...value, workStart })} />
          <AppText>{tr('to')}</AppText>
          <TimeButton label={tr('Work ends')} value={value.workEnd!} onChange={workEnd => onChange({ ...value, workEnd })} />
        </View>
      ) : null}
      {errors.work ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {errors.work}
        </AppText>
      ) : null}
      <View style={[styles.timeRow, { marginTop: spacing.md }]}>
        <AppText>{tr('My day from')}</AppText>
        <TimeButton label={tr('Day starts')} value={value.dayStart} onChange={dayStart => onChange({ ...value, dayStart })} />
        <AppText>{tr('to')}</AppText>
        <TimeButton label={tr('Day ends')} value={value.dayEnd} onChange={dayEnd => onChange({ ...value, dayEnd })} />
      </View>
      {errors.day ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {errors.day}
        </AppText>
      ) : null}
      <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
        {working
          ? tr('Your tasks are planned before work, after work and in free gaps.')
          : tr('The whole day is free for your tasks.')}
      </AppText>
    </Card>
  );
}

/** Small "edit time" button shown on each task. */
function EditTimeButton({ task, onPress }: { task: PlanTask; onPress: () => void }) {
  const { colors, spacing } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={tr('Edit the time of {title}', { title: task.title })}
      style={{ paddingLeft: spacing.sm }}
    >
      <Icon name="clock-edit-outline" size={22} color={colors.primary} />
    </Pressable>
  );
}

/** "3 unfinished tasks from yesterday" with a one-tap "Add to today". */
function CarryOverBanner({ carry, onAdd, onDismiss }: { carry: CarryOver; onAdd: () => void; onDismiss: () => void }) {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: withAlpha(colors.warning, 0.12), borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
      ]}
    >
      <View style={styles.taskRow}>
        <Icon name="calendar-arrow-right" size={20} color={colors.warning} />
        <AppText variant="bodyStrong" style={[styles.flex, { marginLeft: spacing.sm }]}>
          {trn('{n} unfinished task from your last plan', '{n} unfinished tasks from your last plan', carry.lines.length)}</AppText>
      </View>
      <AppText variant="small" tone="secondary" style={{ marginTop: spacing.xs }} numberOfLines={3}>
        {carry.lines.join(' · ')}
      </AppText>
      <View style={[styles.taskRow, { marginTop: spacing.sm }]}>
        <Button title={tr('Add to today')} icon="plus" compact onPress={onAdd} style={{ marginRight: spacing.sm }} />
        <Button title={tr('Not now')} compact variant="ghost" onPress={onDismiss} />
      </View>
    </View>
  );
}

/** Today's routines, added automatically to the plan. */
function RoutinesToday({ routines, onManage }: { routines: Routine[]; onManage: () => void }) {
  const { colors, spacing } = useAppTheme();
  return (
    <View style={[styles.taskRow, { marginBottom: spacing.md }]}>
      <Icon name="repeat" size={18} color={colors.primary} />
      <AppText variant="small" tone="secondary" style={[styles.flex, { marginLeft: spacing.sm }]}>
        {routines.length > 0
          ? tr('Added automatically: {list}', { list: routines.map(r => `${r.title} (${formatDuration(r.durationMin)})`).join(', ') })
          : tr('No routine today.')}
      </AppText>
      <Pressable onPress={onManage} hitSlop={8} accessibilityRole="button">
        <AppText variant="small" color={colors.primary}>{tr('Routines')}</AppText>
      </Pressable>
    </View>
  );
}

function SyntaxHelp() {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <View style={[styles.help, { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md }]}>
      <Icon name="lightbulb-on-outline" size={18} color={colors.primary} />
      <View style={[styles.flex, { marginLeft: spacing.sm }]}>
        <AppText variant="small">{tr('One task per line. Optional:')}</AppText>
        <AppText variant="small">{tr('• duration: 1h, 1h30, 45m (default 30 min)')}</AppText>
        <AppText variant="small">{tr('• fixed time: @14:00 or "à 14h"')}</AppText>
        <AppText variant="small">{tr('• important first: start with !')}</AppText>
      </View>
    </View>
  );
}

function describeWindow(window: DayWindow, settings: AppSettings): string[] {
  const work = window.workStart ? tr('Work {start}–{end}', { start: window.workStart, end: window.workEnd ?? '' }) : tr('Day off');
  const extras = [tr('Day {start}–{end}', { start: window.dayStart, end: window.dayEnd })];
  if (settings.planLunchBreak) {
    extras.push(tr('lunch {start}–{end}', { start: settings.planLunchStart, end: settings.planLunchEnd }));
  }
  if (settings.planAvoidPrayers && settings.planPrayerCity) {
    extras.push(tr('prayer times kept free'));
  }
  if (settings.planBreakMinutes > 0) {
    extras.push(tr('{n} min break every {every}', { n: settings.planBreakMinutes, every: formatDuration(settings.planBreakAfterMinutes) }));
  }
  return [work, extras.join(' · ')];
}

/** One-line summary of how today is organized (from Settings), with "Change for today". */
function TodaySummary({ window, onChange }: { window: DayWindow; onChange: () => void }) {
  const { colors, spacing } = useAppTheme();
  const { settings } = useSettings();
  const [title, details] = describeWindow(window, settings);
  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={styles.taskRow}>
        <Icon name={window.workStart ? 'briefcase-outline' : 'beach'} size={20} color={colors.primary} />
        <View style={[styles.flex, { marginLeft: spacing.sm }]}>
          <AppText variant="bodyStrong">{title}</AppText>
          <AppText variant="caption" tone="secondary">
            {details}
          </AppText>
        </View>
        <Pressable onPress={onChange} hitSlop={8} accessibilityRole="button">
          <AppText variant="small" color={colors.primary}>{tr('Change for today')}</AppText>
        </Pressable>
      </View>
    </Card>
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
  /** Set when the user changed today's hours (exception); otherwise the settings apply. */
  const [customWindow, setCustomWindow] = useState<DayWindow | null>(null);
  const [windowErrors, setWindowErrors] = useState<Record<string, string>>({});
  const navigation = useNavigation();
  const [carry, setCarry] = useState<CarryOver | null>(null);
  const [todayRoutines, setTodayRoutines] = useState<Routine[]>([]);
  const [timingTask, setTimingTask] = useState<PlanTask | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    isSpeechAvailable().then(setSpeechAvailable);
  }, []);

  const dictate = async () => {
    setListening(true);
    try {
      const text = await startSpeech(null, tr('Say your tasks, e.g. "sport one hour, then call Ahmed"'));
      const lines = text ? speechToTaskLines(text) : [];
      if (lines.length > 0) {
        setInput(prev => [prev.trim(), ...lines].filter(Boolean).join('\n'));
        setInputError(undefined);
      }
    } catch (e) {
      logError('plan:voice', e);
      Alert.alert(tr('Voice input unavailable'), describeError(e));
    } finally {
      setListening(false);
    }
  };
  const [savingTiming, setSavingTiming] = useState(false);

  const saveTiming = async (timing: { durationMin: number; fixedStartMin: number | null }) => {
    if (!timingTask) {
      return;
    }
    setSavingTiming(true);
    try {
      const result = await editPlanTaskTiming(timingTask.id, timing);
      setTimingTask(null);
      await reload();
      if (result.warning) {
        Alert.alert(tr('Notifications not scheduled'), result.warning);
      }
    } catch (e) {
      logError('plan:timing', e);
      Alert.alert(tr('Could not change the time'), describeError(e));
    } finally {
      setSavingTiming(false);
    }
  };

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
        Alert.alert(tr('Notifications not scheduled'), result.warning);
      }
    } catch (e) {
      if (e instanceof ValidationError) {
        const { day, work, ...rest } = e.fieldErrors;
        setWindowErrors({ ...(day ? { day } : {}), ...(work ? { work } : {}) });
        setInputError(Object.values(rest)[0]);
      } else {
        logError('plan:organize', e);
        Alert.alert(tr('Could not organize your day'), describeError(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const editorVisible = editing || (!loading && !plan);
  useEffect(() => {
    if (!editorVisible) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [carryOver, routines] = await Promise.all([plan ? null : getCarryOver(), listRoutines()]);
        if (!cancelled) {
          setCarry(carryOver);
          setTodayRoutines(routinesForDay(routines, Date.now()));
        }
      } catch (e) {
        logError('plan:extras', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editorVisible, plan]);

  const toggle = async (task: PlanTask) => {
    try {
      await setPlanTaskDone(task.id, !task.isDone);
      await reload();
    } catch (e) {
      logError('plan:toggle', e);
      Alert.alert(tr('Could not update the task'), describeError(e));
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
  const dayWindow = customWindow ?? proposedWindow(settings, now);

  if (showEditor) {
    return (
      <Screen keyboard>
        <AppText variant="h2">{formatLongToday(now)}</AppText>
        <AppText tone="secondary" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>{tr('Write what you have to do today. The app organizes it around your work, lunch and breaks.')}</AppText>
        {customWindow ? (
          <DayWindowEditor
            value={customWindow}
            onChange={value => {
              setCustomWindow(value);
              setWindowErrors({});
            }}
            errors={windowErrors}
          />
        ) : (
          <TodaySummary window={dayWindow} onChange={() => setCustomWindow(dayWindow)} />
        )}
        {carry ? (
          <CarryOverBanner
            carry={carry}
            onAdd={() => {
              setInput(prev => [prev.trim(), ...carry.lines].filter(Boolean).join('\n'));
              setCarry(null);
            }}
            onDismiss={() => setCarry(null)}
          />
        ) : null}
        <RoutinesToday routines={todayRoutines} onManage={() => navigation.navigate('Routines')} />
        <SyntaxHelp />
        {speechAvailable ? (
          <Button
            title={listening ? tr('Listening…') : tr('Dictate my tasks')}
            icon="microphone-outline"
            variant="secondary"
            compact
            loading={listening}
            onPress={dictate}
            style={{ alignSelf: 'flex-start', marginBottom: spacing.md }}
          />
        ) : null}
        <TextField
          label={tr('Today\'s to-do list')}
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
          title={plan ? tr('Re-organize my day') : tr('Organize my day')}
          icon="clipboard-text-clock-outline"
          loading={busy}
          onPress={() => run(() => organizeToday(input, Date.now(), dayWindow))}
        />
        {plan ? (
          <Button
            title={tr('Cancel')}
            variant="ghost"
            onPress={() => setEditing(false)}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.md }}>{tr('Your work days and hours, lunch and breaks are set once in Settings → Day planner.')}</AppText>
      </Screen>
    );
  }

  const timeline = buildTimeline(plan, settings, now);
  const unscheduled = plan.tasks.filter(t => t.startAt === null && !t.isDone);
  const doneCount = plan.tasks.filter(t => t.isDone).length;
  const lastEnd = Math.max(0, ...plan.tasks.map(t => t.endAt ?? 0));

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <AppText variant="h2">{formatLongToday(now)}</AppText>
      <AppText tone="secondary" style={{ marginTop: spacing.xs }}>
        {tr('{done} of {total} done', { done: doneCount, total: plan.tasks.length })}
        {lastEnd ? tr(' · day ends around {time}', { time: formatTime(lastEnd) }) : ''}
      </AppText>

      <View style={[styles.actions, { marginVertical: spacing.lg }]}>
        <Button
          title={tr('Re-plan from now')}
          icon="calendar-refresh"
          variant="secondary"
          compact
          loading={busy}
          onPress={() => run(() => replanRemaining())}
          style={[styles.flex, { marginRight: spacing.sm }]}
        />
        <Button
          title={tr('Edit list')}
          icon="pencil-outline"
          variant="secondary"
          compact
          onPress={() => {
            setInput(plan.rawInput);
            const proposed = proposedWindow(settings, Date.now());
            const saved = plan.window;
            const differs =
              saved !== null &&
              (saved.dayStart !== proposed.dayStart ||
                saved.dayEnd !== proposed.dayEnd ||
                saved.workStart !== proposed.workStart ||
                saved.workEnd !== proposed.workEnd);
            setCustomWindow(differs ? saved : null);
            setWindowErrors({});
            setEditing(true);
          }}
          style={styles.flex}
        />
      </View>

      {timeline.map(item => {
        if (item.kind !== 'task') {
          return (
            <View key={item.kind === 'prayer' ? item.name : item.kind} style={[styles.row, { marginBottom: spacing.sm }]}>
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
                  name={item.kind === 'work' ? 'briefcase-outline' : item.kind === 'prayer' ? 'mosque' : 'food-fork-drink'}
                  size={18}
                  color={item.kind === 'prayer' ? colors.success : colors.textMuted}
                />
                <AppText tone="muted" style={{ marginLeft: spacing.sm }}>
                  {item.kind === 'work' ? tr('Work') : item.kind === 'prayer' ? tr(item.name) : tr('Lunch break')}
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
              accessibilityLabel={`${task.title}, ${task.isDone ? tr('done') : tr('not done')}`}
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
                    {task.fixedStartMin !== null ? tr(' · 📌 pinned') : ''}
                    {current ? tr(' · now') : ''}
                  </AppText>
                </View>
                {!task.isDone ? <EditTimeButton task={task} onPress={() => setTimingTask(task)} /> : null}
              </View>
            </Card>
          </View>
        );
      })}

      {unscheduled.length > 0 ? (
        <>
          <SectionHeader title={tr('Doesn\'t fit today')} />
          <Card>
            {unscheduled.map(task => (
              <View key={task.id} style={[styles.taskRow, { paddingVertical: spacing.xs }]}>
                <Icon name="alert-circle-outline" size={18} color={colors.warning} />
                <AppText style={[styles.flex, { marginLeft: spacing.sm }]}>
                  {task.title} ({formatDuration(task.durationMin)})
                </AppText>
                <EditTimeButton task={task} onPress={() => setTimingTask(task)} />
              </View>
            ))}
            <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>{tr('Shorten or pin them with ⏱, remove some tasks, or set a later end of day in Settings.')}</AppText>
          </Card>
        </>
      ) : null}

      <AppText variant="caption" tone="muted" style={{ marginTop: spacing.lg }}>{tr('Tap a task to check it off · ⏱ to change its time or duration.')}</AppText>

      <TaskTimeEditor
        task={timingTask}
        saving={savingTiming}
        onCancel={() => setTimingTask(null)}
        onSave={saveTiming}
      />
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
  banner: {},
});
