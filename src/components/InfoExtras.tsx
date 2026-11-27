/**
 * Small building blocks of the information screens: mastery badge and dots,
 * progress bar, voice-note player and recorder, photo.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, PermissionsAndroid, Platform, Pressable, StyleSheet, View } from 'react-native';
import { tr } from '../i18n';
import {
  cancelRecording,
  isNativeAvailable,
  playAudio,
  startRecording,
  stopAudio,
  stopRecording,
} from '../native/mkrNative';
import { MASTERY_ICONS, MASTERY_LABELS, MAX_MASTERY, masteryLevel } from '../services/mastery';
import { fonts, useAppTheme, withAlpha } from '../theme';
import { describeError, logError } from '../utils/errors';
import { AppText } from './AppText';
import { Icon } from './Icon';

export function useMasteryColor(mastery: number): string {
  const { colors } = useAppTheme();
  const level = masteryLevel(mastery);
  return level === 'new'
    ? colors.textMuted
    : level === 'learning'
      ? colors.warning
      : level === 'known'
        ? colors.primary
        : colors.accentStrong;
}

/** Five dots filled up to the mastery level. */
export function MasteryDots({ mastery, size = 7 }: { mastery: number; size?: number }) {
  const color = useMasteryColor(mastery);
  const { colors } = useAppTheme();
  return (
    <View style={styles.row} accessibilityLabel={tr(MASTERY_LABELS[masteryLevel(mastery)])}>
      {Array.from({ length: MAX_MASTERY }, (_, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            marginRight: 3,
            backgroundColor: i < mastery ? color : withAlpha(colors.textMuted, 0.25),
          }}
        />
      ))}
    </View>
  );
}

/** "🏆 Mastered ●●●●●" */
export function MasteryBadge({ mastery }: { mastery: number }) {
  const { radius, spacing } = useAppTheme();
  const color = useMasteryColor(mastery);
  const level = masteryLevel(mastery);
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: withAlpha(color, 0.12), borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
      ]}
    >
      <Icon name={MASTERY_ICONS[level]} size={14} color={color} />
      <AppText variant="caption" color={color} style={[styles.badgeText, { marginRight: spacing.sm }]}>
        {tr(MASTERY_LABELS[level])}
      </AppText>
      <MasteryDots mastery={mastery} size={6} />
    </View>
  );
}

export function ProgressBar({ value, total, color }: { value: number; total: number; color?: string }) {
  const { colors } = useAppTheme();
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  const fill = color ?? colors.primary;
  return (
    <View style={[styles.track, { backgroundColor: withAlpha(fill, 0.14) }]}>
      <View style={[styles.fill, { backgroundColor: fill, width: `${Math.round(ratio * 100)}%` }]} />
    </View>
  );
}

/** Photo of an item (fits the width, keeps the ratio). */
export function ItemImage({ uri, onPress }: { uri: string; onPress?: () => void }) {
  const { radius, colors } = useAppTheme();
  const [ratio, setRatio] = useState(4 / 3);
  useEffect(() => {
    Image.getSize(
      uri,
      (w, h) => h > 0 && setRatio(Math.max(0.5, Math.min(2.5, w / h))),
      () => undefined,
    );
  }, [uri]);
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'imagebutton' : 'image'}>
      <Image
        source={{ uri }}
        style={{ width: '100%', aspectRatio: ratio, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}

function formatSeconds(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** ▶ Play / ■ Stop of a voice note. */
export function VoiceNotePlayer({ path, compact }: { path: string; compact?: boolean }) {
  const { colors, radius, spacing } = useAppTheme();
  const [playing, setPlaying] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      stopAudio();
    },
    [],
  );

  const toggle = async () => {
    if (playing) {
      await stopAudio();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    try {
      await playAudio(path);
    } catch (e) {
      logError('voice:play', e);
      Alert.alert(tr('Could not play the voice note'), describeError(e));
    } finally {
      if (mounted.current) {
        setPlaying(false);
      }
    }
  };

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={playing ? tr('Stop the voice note') : tr('Play the voice note')}
      style={({ pressed }) => [
        styles.player,
        {
          backgroundColor: withAlpha(colors.primary, pressed ? 0.2 : 0.1),
          borderRadius: radius.pill,
          paddingHorizontal: compact ? spacing.md : spacing.lg,
          paddingVertical: compact ? 6 : spacing.sm,
        },
      ]}
    >
      <Icon name={playing ? 'stop-circle' : 'play-circle'} size={compact ? 22 : 28} color={colors.primary} />
      <AppText variant={compact ? 'small' : 'bodyStrong'} color={colors.primary} style={{ marginLeft: spacing.sm }}>
        {playing ? tr('Playing…') : tr('Voice note')}
      </AppText>
    </Pressable>
  );
}

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/** Record / re-record / delete the voice note of the item being edited. */
export function VoiceNoteRecorder({ value, onChange }: { value: string | null; onChange: (path: string | null) => void }) {
  const { colors, radius, spacing } = useAppTheme();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearInterval(timer.current);
      }
      cancelRecording();
    },
    [],
  );

  if (!isNativeAvailable()) {
    return null;
  }

  const start = async () => {
    try {
      if (!(await ensureMicPermission())) {
        Alert.alert(tr('Microphone not allowed'), tr('Allow the microphone to record a voice note.'));
        return;
      }
      await startRecording();
      const started = Date.now();
      setElapsed(0);
      setRecording(true);
      timer.current = setInterval(() => setElapsed(Date.now() - started), 500);
    } catch (e) {
      logError('voice:start', e);
      Alert.alert(tr('Could not record'), describeError(e));
    }
  };

  const stop = async () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setRecording(false);
    try {
      const result = await stopRecording();
      onChange(result.path);
    } catch (e) {
      logError('voice:stop', e);
      Alert.alert(tr('Could not record'), describeError(e));
    }
  };

  if (recording) {
    return (
      <Pressable
        onPress={stop}
        accessibilityRole="button"
        style={[styles.player, { backgroundColor: colors.dangerSoft, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }]}
      >
        <Icon name="stop-circle" size={28} color={colors.danger} />
        <AppText variant="bodyStrong" color={colors.danger} style={{ marginLeft: spacing.sm }}>
          {tr('Recording {time} — tap to stop', { time: formatSeconds(elapsed) })}
        </AppText>
      </Pressable>
    );
  }

  if (value) {
    return (
      <View style={styles.row}>
        <VoiceNotePlayer path={value} />
        <Pressable onPress={start} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('Record again')} style={{ marginLeft: spacing.md }}>
          <Icon name="microphone-outline" size={24} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => onChange(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('Delete the voice note')} style={{ marginLeft: spacing.md }}>
          <Icon name="delete-outline" size={24} color={colors.danger} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={start}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.player,
        { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name="microphone-outline" size={24} color={colors.primary} />
      <AppText variant="bodyStrong" color={colors.primary} style={{ marginLeft: spacing.sm }}>
        {tr('Record a voice note')}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  badgeText: { marginLeft: 4, fontFamily: fonts.semibold },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  player: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
});
