import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { tr } from '../i18n';
import { DEFAULT_TASK_MINUTES, formatDuration, parseTaskLine, type ParsedTask } from '../services/dayPlanner';
import { fonts, useAppTheme, withAlpha } from '../theme';
import { applyTimeString } from '../utils/date';
import { pickTime } from '../utils/pickers';
import { AppText } from './AppText';
import { Chip } from './Chip';
import { Icon } from './Icon';
import { TaskTimeEditor, type TaskTiming } from './TaskTimeEditor';

const DURATIONS = [15, 30, 45, 60, 90, 120];

/** Quick ideas, added in one tap. */
export const TASK_SUGGESTIONS: { title: string; durationMin: number; icon: string }[] = [
  { title: 'Sport', durationMin: 60, icon: 'dumbbell' },
  { title: 'Walk', durationMin: 30, icon: 'walk' },
  { title: 'Read', durationMin: 30, icon: 'book-open-variant' },
  { title: 'Learn something new', durationMin: 30, icon: 'school-outline' },
  { title: 'Read Quran', durationMin: 20, icon: 'book-open-page-variant' },
  { title: 'Review my notes', durationMin: 15, icon: 'brain' },
  { title: 'Call family', durationMin: 15, icon: 'phone-outline' },
  { title: 'Groceries', durationMin: 45, icon: 'cart-outline' },
  { title: 'Tidy up', durationMin: 20, icon: 'broom' },
];

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

interface Props {
  tasks: ParsedTask[];
  onChange: (tasks: ParsedTask[]) => void;
  /** Alarm mode pre-selected (Settings → Alarms). */
  alarmDefault: boolean;
  error?: string;
}

/**
 * Day-plan list built one task at a time: type a task, choose its duration
 * (and optionally a fixed time, ⭐ or ⏰), tap "+". Each task can then be edited,
 * starred or removed. Suggestions add common tasks in one tap.
 */
export function TaskListBuilder({ tasks, onChange, alarmDefault, error }: Props) {
  const { colors, radius, spacing } = useAppTheme();
  const inputRef = useRef<TextInput>(null);
  const [title, setTitle] = useState('');
  const [durationMin, setDurationMin] = useState(DEFAULT_TASK_MINUTES);
  const [fixedStartMin, setFixedStartMin] = useState<number | null>(null);
  const [important, setImportant] = useState(false);
  const [alarm, setAlarm] = useState(alarmDefault);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const resetDraft = () => {
    setTitle('');
    setDurationMin(DEFAULT_TASK_MINUTES);
    setFixedStartMin(null);
    setImportant(false);
    setAlarm(alarmDefault);
  };

  const add = () => {
    // The title may also use the list syntax: "Sport 1h @18:00 !".
    const parsed = parseTaskLine(title, tasks.length);
    if (!parsed) {
      inputRef.current?.focus();
      return;
    }
    onChange([
      ...tasks,
      {
        title: parsed.title,
        durationMin: parsed.durationMin !== DEFAULT_TASK_MINUTES ? parsed.durationMin : durationMin,
        fixedStartMin: parsed.fixedStartMin ?? fixedStartMin,
        important: parsed.important || important,
        position: tasks.length,
        alarm: parsed.alarm ?? alarm,
      },
    ]);
    resetDraft();
    inputRef.current?.focus();
  };

  const addSuggestion = (suggestion: (typeof TASK_SUGGESTIONS)[number]) => {
    onChange([
      ...tasks,
      {
        title: tr(suggestion.title),
        durationMin: suggestion.durationMin,
        fixedStartMin: null,
        important: false,
        position: tasks.length,
        alarm: alarmDefault,
      },
    ]);
  };

  const update = (index: number, patch: Partial<ParsedTask>) =>
    onChange(tasks.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const remove = (index: number) => onChange(tasks.filter((_, i) => i !== index).map((t, position) => ({ ...t, position })));

  const moveUp = (index: number) => {
    if (index === 0) {
      return;
    }
    const next = [...tasks];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next.map((t, position) => ({ ...t, position })));
  };

  const chooseTime = async () => {
    const picked = await pickTime(applyTimeString(Date.now(), minutesToTime(fixedStartMin ?? 18 * 60)));
    if (picked !== null) {
      const d = new Date(picked);
      setFixedStartMin(d.getHours() * 60 + d.getMinutes());
    }
  };

  const titles = new Set(tasks.map(t => t.title.toLowerCase()));
  const suggestions = TASK_SUGGESTIONS.filter(s => !titles.has(tr(s.title).toLowerCase()));
  const editing = editingIndex !== null ? tasks[editingIndex] : null;
  const totalMin = tasks.reduce((sum, t) => sum + t.durationMin, 0);

  return (
    <View>
      {/* New task */}
      <View
        style={[
          styles.composer,
          { backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border, borderRadius: radius.lg, padding: spacing.md },
        ]}
      >
        <View style={styles.row}>
          <TextInput
            ref={inputRef}
            value={title}
            onChangeText={setTitle}
            placeholder={tr('New task, e.g. Sport')}
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={add}
            submitBehavior="submit"
            returnKeyType="done"
            maxLength={150}
            style={[styles.input, { color: colors.text, fontFamily: fonts.medium }]}
            accessibilityLabel={tr('New task')}
          />
          <Pressable
            onPress={add}
            accessibilityRole="button"
            accessibilityLabel={tr('Add the task')}
            style={({ pressed }) => [
              styles.plus,
              { backgroundColor: title.trim() ? colors.primary : withAlpha(colors.primary, 0.35), opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Icon name="plus" size={28} color={colors.accent} />
          </Pressable>
        </View>

        <View style={[styles.wrap, { marginTop: spacing.sm }]}>
          {DURATIONS.map(minutes => (
            <Chip key={minutes} label={formatDuration(minutes)} selected={durationMin === minutes} onPress={() => setDurationMin(minutes)} />
          ))}
        </View>
        <View style={styles.wrap}>
          <Chip label={tr('Important')} icon="star-outline" selected={important} color={colors.accentStrong} onPress={() => setImportant(v => !v)} />
          <Chip
            label={fixedStartMin !== null ? tr('At {time}', { time: minutesToTime(fixedStartMin) }) : tr('Fixed time')}
            icon="pin-outline"
            selected={fixedStartMin !== null}
            onPress={chooseTime}
            onLongPress={() => setFixedStartMin(null)}
          />
          {fixedStartMin !== null ? (
            <Chip label={tr('Any time')} icon="close" onPress={() => setFixedStartMin(null)} />
          ) : null}
          <Chip label={tr('Alarm')} icon="alarm" selected={alarm} onPress={() => setAlarm(v => !v)} />
        </View>
      </View>
      {error ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {tr(error)}
        </AppText>
      ) : null}

      {/* Suggestions */}
      {suggestions.length > 0 ? (
        <>
          <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
            {tr('Suggestions — tap to add')}
          </AppText>
          <View style={styles.wrap}>
            {suggestions.map(s => (
              <Chip key={s.title} label={`${tr(s.title)} · ${formatDuration(s.durationMin)}`} icon={s.icon} onPress={() => addSuggestion(s)} />
            ))}
          </View>
        </>
      ) : null}

      {/* List */}
      <View style={[styles.row, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
        <AppText variant="bodyStrong" style={styles.flex}>
          {tr('My tasks today')} {tasks.length > 0 ? `(${tasks.length})` : ''}
        </AppText>
        {tasks.length > 0 ? (
          <AppText variant="caption" tone="secondary">
            {tr('Total {duration}', { duration: formatDuration(totalMin) })}
          </AppText>
        ) : null}
      </View>
      {tasks.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg }]}>
          <Icon name="playlist-plus" size={28} color={colors.textMuted} />
          <AppText tone="muted" style={{ marginTop: spacing.xs, textAlign: 'center' }}>
            {tr('No task yet. Write one above and tap +')}
          </AppText>
        </View>
      ) : (
        tasks.map((task, index) => {
          const taskAlarm = task.alarm ?? alarmDefault;
          return (
            <View
              key={`${index}-${task.title}`}
              style={[
                styles.item,
                {
                  backgroundColor: colors.surface,
                  borderColor: task.important ? withAlpha(colors.accentStrong, 0.5) : colors.border,
                  borderRadius: radius.md,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  marginBottom: spacing.sm,
                },
              ]}
            >
              <Pressable
                onPress={() => moveUp(index)}
                disabled={index === 0}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={tr('Move up')}
                style={[styles.number, { backgroundColor: colors.primarySoft }]}
              >
                <AppText variant="caption" color={colors.primary} style={{ fontFamily: fonts.bold }}>
                  {index + 1}
                </AppText>
              </Pressable>
              <Pressable style={[styles.flex, { marginHorizontal: spacing.sm }]} onPress={() => setEditingIndex(index)}>
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {task.title}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {formatDuration(task.durationMin)}
                  {task.fixedStartMin !== null ? ` · 📌 ${minutesToTime(task.fixedStartMin)}` : ''}
                  {taskAlarm ? ' · ⏰' : ''}
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => update(index, { important: !task.important })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={tr('Important')}
                style={styles.iconButton}
              >
                <Icon name={task.important ? 'star' : 'star-outline'} size={22} color={task.important ? colors.accentStrong : colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={() => setEditingIndex(index)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={tr('Edit the time of {title}', { title: task.title })}
                style={styles.iconButton}
              >
                <Icon name="clock-edit-outline" size={22} color={colors.primary} />
              </Pressable>
              <Pressable
                onPress={() => remove(index)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={tr('Remove {title}', { title: task.title })}
                style={styles.iconButton}
              >
                <Icon name="close-circle-outline" size={22} color={colors.danger} />
              </Pressable>
            </View>
          );
        })
      )}

      <TaskTimeEditor
        task={
          editing
            ? { title: editing.title, durationMin: editing.durationMin, fixedStartMin: editing.fixedStartMin, alarm: editing.alarm ?? alarmDefault, startAt: null }
            : null
        }
        onCancel={() => setEditingIndex(null)}
        onSave={(timing: TaskTiming) => {
          if (editingIndex !== null) {
            update(editingIndex, timing);
          }
          setEditingIndex(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  composer: { borderWidth: 1 },
  input: { flex: 1, fontSize: 17, minHeight: 48, paddingVertical: 8 },
  plus: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  empty: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconButton: { paddingHorizontal: 5 },
});
