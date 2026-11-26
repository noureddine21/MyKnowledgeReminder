import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Icon, Screen } from '../components';
import { useSettings } from '../hooks/useSettings';
import { isNativeAvailable, openTextFile, saveTextFile } from '../native/mkrNative';
import {
  backupFileName,
  createBackup,
  parseBackup,
  restoreBackup,
  summarizeBackup,
  type BackupFile,
} from '../services/backupService';
import { useAppTheme, withAlpha } from '../theme';
import { formatDateTime, formatRelative } from '../utils/date';
import { describeError, logError } from '../utils/errors';

function Step({ icon, text }: { icon: string; text: string }) {
  const { colors, spacing } = useAppTheme();
  return (
    <View style={[styles.step, { marginBottom: spacing.sm }]}>
      <Icon name={icon} size={18} color={colors.primary} />
      <AppText variant="small" tone="secondary" style={[styles.flex, { marginLeft: spacing.sm }]}>
        {text}
      </AppText>
    </View>
  );
}

export function BackupScreen() {
  const { colors, radius, spacing } = useAppTheme();
  const { settings, update, reload } = useSettings();
  const [busy, setBusy] = useState<'save' | 'restore' | null>(null);
  const available = isNativeAvailable();
  const now = Date.now();

  const save = async () => {
    setBusy('save');
    try {
      const backup = await createBackup();
      const uri = await saveTextFile(backupFileName(), JSON.stringify(backup));
      if (uri) {
        await update('lastBackupAt', backup.exportedAt);
        const s = summarizeBackup(backup);
        Alert.alert('Backup saved ✓', `${s.items} items, ${s.categories} categories and ${s.plans} day plans were saved.`);
      }
    } catch (e) {
      logError('backup:save', e);
      Alert.alert('Backup failed', describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async (backup: BackupFile) => {
    setBusy('restore');
    try {
      const s = await restoreBackup(backup);
      await reload();
      Alert.alert('Backup restored ✓', `${s.items} items and ${s.plans} day plans are back. Reminders were rescheduled.`);
    } catch (e) {
      logError('backup:restore', e);
      Alert.alert('Restore failed', describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('restore');
    let backup: BackupFile;
    try {
      const text = await openTextFile();
      if (!text) {
        setBusy(null);
        return;
      }
      backup = await parseBackup(text);
    } catch (e) {
      logError('backup:open', e);
      Alert.alert('Cannot use this file', describeError(e));
      setBusy(null);
      return;
    }
    setBusy(null);
    const s = summarizeBackup(backup);
    Alert.alert(
      'Replace all your data?',
      `Backup from ${formatDateTime(s.exportedAt)}: ${s.items} items, ${s.categories} categories, ${s.plans} day plans.\n\n` +
        'Everything currently in the app will be replaced by this backup.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => doRestore(backup) },
      ],
    );
  };

  return (
    <Screen>
      <View
        style={[
          styles.hero,
          { backgroundColor: withAlpha(colors.primary, 0.1), borderRadius: radius.lg, padding: spacing.lg },
        ]}
      >
        <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
          <Icon name="shield-check-outline" size={28} color={colors.primaryContrast} />
        </View>
        <AppText variant="h2" style={{ marginTop: spacing.md }}>
          Keep your knowledge safe
        </AppText>
        <AppText tone="secondary" style={[styles.center, { marginTop: spacing.xs }]}>
          Your data lives only on this phone. Save a backup file to Google Drive, your email or WhatsApp to never lose
          it.
        </AppText>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: settings.lastBackupAt ? withAlpha(colors.success, 0.15) : withAlpha(colors.warning, 0.15),
              borderRadius: radius.lg,
              marginTop: spacing.md,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          <Icon
            name={settings.lastBackupAt ? 'check-circle-outline' : 'alert-outline'}
            size={16}
            color={settings.lastBackupAt ? colors.success : colors.warning}
          />
          <AppText variant="small" style={{ marginLeft: spacing.xs }}>
            {settings.lastBackupAt
              ? `Last backup: ${formatRelative(settings.lastBackupAt, now)}`
              : 'No backup yet'}
          </AppText>
        </View>
      </View>

      <Card style={{ marginTop: spacing.lg }}>
        <AppText variant="h3" style={{ marginBottom: spacing.md }}>
          Save a backup
        </AppText>
        <Step icon="numeric-1-circle-outline" text="Tap the button and choose where to save (Drive, Downloads…)." />
        <Step icon="numeric-2-circle-outline" text="All items, categories, reminders, plans and settings are included." />
        <Button
          title="Save a backup"
          icon="content-save-outline"
          loading={busy === 'save'}
          disabled={!available || busy !== null}
          onPress={save}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <AppText variant="h3" style={{ marginBottom: spacing.md }}>
          Restore
        </AppText>
        <Step icon="swap-horizontal" text="New phone or reinstalled app? Pick your backup file to get everything back." />
        <Step icon="alert-circle-outline" text="Restoring replaces all the data currently in the app." />
        <Button
          title="Restore from a file"
          icon="backup-restore"
          variant="secondary"
          loading={busy === 'restore'}
          disabled={!available || busy !== null}
          onPress={restore}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <AppText variant="caption" tone="muted" style={[styles.center, { marginTop: spacing.lg }]}>
        The app never uploads anything by itself: you choose where the file goes.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  hero: { alignItems: 'center' },
  heroIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
});
