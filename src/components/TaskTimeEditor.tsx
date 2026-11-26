import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { PlanTask } from '../models';
import { useAppTheme } from '../theme';
import { applyTimeString } from '../utils/date';
import { pickTime } from '../utils/pickers';
import { AppText } from './AppText';
import { Button } from './Button';
import { Chip } from './Chip';
import { Icon } from './Icon';

import { tr } from '../i18n';
export interface TaskTiming {
  durationMin: number;
  /** Minutes after midnight, or null to let the planner place the task. */
  fixedStartMin: number | null;
}

interface Props {
  task: PlanTask | null;
  saving?: boolean;
  onCancel: () => void;
  onSave: (timing: TaskTiming) => void;
}

const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180];

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function durationLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

/** Bottom sheet to change the start time and duration of one planned task. */
export function TaskTimeEditor({ task, saving, onCancel, onSave }: Props) {
  const { colors, radius, spacing } = useAppTheme();
  const [durationMin, setDurationMin] = useState(30);
  const [fixedStartMin, setFixedStartMin] = useState<number | null>(null);

  useEffect(() => {
    if (task) {
      setDurationMin(task.durationMin);
      setFixedStartMin(task.fixedStartMin);
    }
  }, [task]);

  if (!task) {
    return null;
  }

  // Suggest the current planned start when the task is not pinned yet.
  const plannedStart =
    task.startAt !== null ? new Date(task.startAt).getHours() * 60 + new Date(task.startAt).getMinutes() : 9 * 60;

  const chooseStart = async () => {
    const initial = applyTimeString(Date.now(), minutesToTime(fixedStartMin ?? plannedStart));
    const picked = await pickTime(initial);
    if (picked !== null) {
      const d = new Date(picked);
      setFixedStartMin(d.getHours() * 60 + d.getMinutes());
    }
  };

  const durations = DURATIONS.includes(durationMin) ? DURATIONS : [...DURATIONS, durationMin].sort((a, b) => a - b);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel={tr('Close')} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            padding: spacing.lg,
          },
        ]}
      >
        <AppText variant="h3" numberOfLines={2}>
          {task.title}
        </AppText>

        <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>{tr('Start time')}</AppText>
        <View style={styles.row}>
          <Pressable
            onPress={chooseStart}
            accessibilityRole="button"
            accessibilityLabel={tr('Choose start time')}
            style={[
              styles.timeButton,
              { borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
            ]}
          >
            <Icon name="clock-outline" size={18} color={colors.primary} />
            <AppText variant="bodyStrong" color={colors.primary} style={{ marginLeft: spacing.xs }}>
              {fixedStartMin !== null ? minutesToTime(fixedStartMin) : 'Choose a time'}
            </AppText>
          </Pressable>
          {fixedStartMin !== null ? (
            <Pressable onPress={() => setFixedStartMin(null)} hitSlop={8} style={{ marginLeft: spacing.md }}>
              <AppText variant="small" color={colors.primary}>{tr('Let the app choose')}</AppText>
            </Pressable>
          ) : null}
        </View>
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
          {fixedStartMin !== null
            ? 'The task is pinned to this time; the other tasks move around it.'
            : 'Not pinned: the app places this task automatically.'}
        </AppText>

        <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>{tr('Duration')}</AppText>
        <View style={styles.wrap}>
          {durations.map(minutes => (
            <Chip
              key={minutes}
              label={durationLabel(minutes)}
              selected={durationMin === minutes}
              onPress={() => setDurationMin(minutes)}
            />
          ))}
        </View>

        <View style={[styles.row, { marginTop: spacing.lg }]}>
          <Button title={tr('Cancel')} variant="ghost" onPress={onCancel} style={[styles.flex, { marginRight: spacing.sm }]} />
          <Button
            title={tr('Save & re-plan')}
            icon="calendar-refresh"
            loading={saving}
            onPress={() => onSave({ durationMin, fixedStartMin })}
            style={styles.flex}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  flex: { flex: 1 },
  timeButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 44 },
});
