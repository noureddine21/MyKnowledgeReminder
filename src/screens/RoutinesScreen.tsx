import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Switch, View } from 'react-native';
import { AppText, Button, Card, Chip, EmptyState, Icon, Screen, TextField } from '../components';
import { useFocusData } from '../hooks/useFocusData';
import type { Routine, RoutineInput } from '../models';
import { formatDuration } from '../services/dayPlanner';
import { deleteRoutine, listRoutines, saveRoutine } from '../services/routineService';
import { useAppTheme, withAlpha } from '../theme';
import { applyTimeString } from '../utils/date';
import { ValidationError, describeError, logError } from '../utils/errors';
import { pickTime } from '../utils/pickers';

import { tr } from '../i18n';
const DAYS = [
  { value: 1, short: 'M', label: 'Mon' },
  { value: 2, short: 'T', label: 'Tue' },
  { value: 3, short: 'W', label: 'Wed' },
  { value: 4, short: 'T', label: 'Thu' },
  { value: 5, short: 'F', label: 'Fri' },
  { value: 6, short: 'S', label: 'Sat' },
  { value: 0, short: 'S', label: 'Sun' },
];
const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120];
const EMPTY: RoutineInput = { title: '', durationMin: 30, fixedStartMin: null, important: false, days: [1, 2, 3, 4, 5], isActive: true };

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function describeDays(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) {
    return tr('Every day');
  }
  if (set.size === 5 && [1, 2, 3, 4, 5].every(d => set.has(d))) {
    return tr('Weekdays');
  }
  if (set.size === 2 && set.has(0) && set.has(6)) {
    return tr('Weekends');
  }
  return DAYS.filter(d => set.has(d.value)).map(d => tr(d.label)).join(' · ');
}

function DayDots({ days }: { days: number[] }) {
  const { colors, spacing } = useAppTheme();
  return (
    <View style={[styles.row, { marginTop: spacing.sm }]}>
      {DAYS.map(d => {
        const on = days.includes(d.value);
        return (
          <View
            key={d.value}
            style={[
              styles.dot,
              { backgroundColor: on ? colors.primary : withAlpha(colors.textMuted, 0.15), marginRight: spacing.xs },
            ]}
          >
            <AppText variant="caption" color={on ? colors.primaryContrast : colors.textMuted}>
              {tr(d.label + '_short')}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

function RoutineEditor({
  value,
  editingId,
  onClose,
  onSaved,
}: {
  value: RoutineInput;
  editingId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors, radius, spacing } = useAppTheme();
  const [form, setForm] = useState<RoutineInput>(value);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<RoutineInput>) => {
    setForm(prev => ({ ...prev, ...patch }));
    setErrors({});
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveRoutine(form, editingId);
      onSaved();
    } catch (e) {
      if (e instanceof ValidationError) {
        setErrors(e.fieldErrors);
      } else {
        logError('routines:save', e);
        Alert.alert(tr('Could not save the routine'), describeError(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (editingId === undefined) {
      return;
    }
    Alert.alert(tr('Delete this routine?'), form.title, [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: tr('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRoutine(editingId);
            onSaved();
          } catch (e) {
            Alert.alert(tr('Could not delete'), describeError(e));
          }
        },
      },
    ]);
  };

  const chooseTime = async () => {
    const picked = await pickTime(applyTimeString(Date.now(), hhmm(form.fixedStartMin ?? 7 * 60)));
    if (picked !== null) {
      const d = new Date(picked);
      set({ fixedStartMin: d.getHours() * 60 + d.getMinutes() });
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={tr('Close')} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
        ]}
      >
        <AppText variant="h2" style={{ marginBottom: spacing.md }}>
          {editingId === undefined ? tr('New routine') : tr('Edit routine')}
        </AppText>
        <TextField
          label={tr('Name')}
          required
          value={form.title}
          onChangeText={title => set({ title })}
          placeholder={tr('e.g. Sport, Read Quran, Revise French')}
          error={errors.title}
          maxLength={150}
        />

        <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>{tr('Days ')}{errors.days ? <AppText variant="caption" color={colors.danger}>— {errors.days}</AppText> : null}
        </AppText>
        <View style={[styles.wrap, { marginBottom: spacing.md }]}>
          {DAYS.map(d => (
            <Chip
              key={d.value}
              label={tr(d.label)}
              selected={form.days.includes(d.value)}
              onPress={() =>
                set({ days: form.days.includes(d.value) ? form.days.filter(x => x !== d.value) : [...form.days, d.value] })
              }
            />
          ))}
        </View>

        <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>{tr('Duration')}</AppText>
        <View style={[styles.wrap, { marginBottom: spacing.md }]}>
          {DURATIONS.map(m => (
            <Chip key={m} label={formatDuration(m)} selected={form.durationMin === m} onPress={() => set({ durationMin: m })} />
          ))}
        </View>

        <View style={[styles.row, styles.between, { marginBottom: spacing.sm }]}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{tr('Fixed time')}</AppText>
            <AppText variant="caption" tone="secondary">
              {form.fixedStartMin === null ? tr('The app chooses the best moment') : tr('Always at {time}', { time: hhmm(form.fixedStartMin) })}
            </AppText>
          </View>
          {form.fixedStartMin === null ? (
            <Button title={tr('Set')} compact variant="secondary" icon="clock-outline" onPress={chooseTime} />
          ) : (
            <View style={styles.row}>
              <Button title={hhmm(form.fixedStartMin)} compact variant="secondary" onPress={chooseTime} />
              <Pressable onPress={() => set({ fixedStartMin: null })} hitSlop={10} style={{ marginLeft: spacing.sm }}>
                <Icon name="close-circle-outline" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
          )}
        </View>

        <View style={[styles.row, styles.between, { marginBottom: spacing.lg }]}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{tr('Important ⭐')}</AppText>
            <AppText variant="caption" tone="secondary">{tr('Placed before the other tasks')}</AppText>
          </View>
          <Switch value={form.important} onValueChange={important => set({ important })} />
        </View>

        <View style={styles.row}>
          {editingId !== undefined ? (
            <Button title={tr('Delete')} variant="danger" compact icon="delete-outline" onPress={remove} style={{ marginRight: spacing.sm }} />
          ) : null}
          <Button title={tr('Cancel')} variant="ghost" onPress={onClose} style={[styles.flex, { marginRight: spacing.sm }]} />
          <Button title={tr('Save')} icon="check" loading={saving} onPress={save} style={styles.flex} />
        </View>
      </View>
    </Modal>
  );
}

export function RoutinesScreen() {
  const { colors, spacing } = useAppTheme();
  const loader = useCallback(() => listRoutines(), []);
  const { data: routines, loading, reload } = useFocusData(loader, 'routines:load');
  const [editing, setEditing] = useState<{ value: RoutineInput; id?: number } | null>(null);

  const toggle = async (routine: Routine, isActive: boolean) => {
    try {
      await saveRoutine({ ...routine, isActive }, routine.id);
      await reload();
    } catch (e) {
      Alert.alert(tr('Could not update the routine'), describeError(e));
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>{tr('Routines are added to your day plan automatically on their days — no need to write them every morning.')}</AppText>

      {routines && routines.length === 0 ? (
        <EmptyState
          icon="repeat"
          title={tr('No routines yet')}
          message={tr('Add things you do regularly: sport, Quran, revision…')}
        />
      ) : null}

      {(routines ?? []).map(routine => (
        <Card
          key={routine.id}
          onPress={() => setEditing({ value: routine, id: routine.id })}
          style={[{ marginBottom: spacing.md }, !routine.isActive && styles.inactive]}
        >
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: withAlpha(colors.primary, 0.12) }]}>
              <Icon name={routine.important ? 'star' : 'repeat'} size={20} color={colors.primary} />
            </View>
            <View style={[styles.flex, { marginLeft: spacing.md }]}>
              <AppText variant="bodyStrong">{routine.title}</AppText>
              <AppText variant="caption" tone="secondary">
                {formatDuration(routine.durationMin)}
                {routine.fixedStartMin !== null ? tr(' · at {time}', { time: hhmm(routine.fixedStartMin) }) : ''} · {describeDays(routine.days)}
              </AppText>
            </View>
            <Switch value={routine.isActive} onValueChange={value => toggle(routine, value)} />
          </View>
          <DayDots days={routine.days} />
        </Card>
      ))}

      <Button
        title={tr('Add a routine')}
        icon="plus"
        onPress={() => setEditing({ value: EMPTY })}
        style={{ marginTop: spacing.sm }}
      />

      {editing ? (
        <RoutineEditor
          value={editing.value}
          editingId={editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  inactive: { opacity: 0.55 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '90%' },
});
