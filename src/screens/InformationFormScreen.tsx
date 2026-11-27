import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Chip,
  DateTimeField,
  ErrorView,
  Icon,
  LoadingView,
  ReminderEditor,
  Screen,
  TagPicker,
  TextField,
} from '../components';
import { MAX_CONTENT_LENGTH, MAX_SOURCE_LENGTH, MAX_TITLE_LENGTH } from '../constants';
import { useFocusData } from '../hooks/useFocusData';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useSettings } from '../hooks/useSettings';
import type { AppSettings, InformationItem, ReminderInput } from '../models';
import type { RootStackScreenProps, TabScreenProps } from '../navigation/types';
import type { SharedDraft } from '../services/shareIntake';
import { listCategories } from '../services/categoryService';
import { getInformation, saveInformation } from '../services/informationService';
import { useAppTheme } from '../theme';
import { addDays, applyTimeString } from '../utils/date';
import { ValidationError, describeError, logError } from '../utils/errors';

import { tr } from '../i18n';
interface FormState {
  title: string;
  content: string;
  categoryId: number | null;
  tagIds: number[];
  source: string;
  createdAt: number;
  reminder: ReminderInput;
}

function emptyForm(settings: AppSettings): FormState {
  const now = Date.now();
  return {
    title: '',
    content: '',
    categoryId: null,
    tagIds: [],
    source: '',
    createdAt: now,
    reminder: {
      enabled: true,
      frequency: settings.useSmartScheduleByDefault ? 'spaced' : 'once',
      alarm: settings.alarmByDefault,
      scheduledAt: applyTimeString(addDays(now, 1), settings.defaultReminderTime),
    },
  };
}

function formFromItem(item: InformationItem, settings: AppSettings): FormState {
  const base = emptyForm(settings);
  return {
    title: item.title,
    content: item.content,
    categoryId: item.categoryId,
    tagIds: (item.tags ?? []).map(t => t.id),
    source: item.source ?? '',
    createdAt: item.createdAt,
    reminder: item.reminder
      ? {
          enabled: item.reminder.isActive,
          frequency: item.reminder.frequency,
          repeatInterval: item.reminder.repeatInterval,
          alarm: item.reminder.alarm,
          scheduledAt: item.reminder.isActive ? item.reminder.scheduledAt : base.reminder.scheduledAt,
        }
      : { ...base.reminder, enabled: false },
  };
}

interface Props {
  informationId?: number;
  onSaved: (id: number, isNew: boolean) => void;
  /** Content shared from another app; applied each time `shareId` changes. */
  shared?: SharedDraft;
  shareId?: number;
}

function InformationForm({ informationId, onSaved, shared, shareId }: Props) {
  const { colors, radius, spacing } = useAppTheme();
  const { settings } = useSettings();
  const { ensurePermission } = useNotificationPermission();
  const isEdit = informationId !== undefined;

  const [form, setForm] = useState<FormState>(() => emptyForm(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(isEdit ? 'loading' : 'ready');
  const [loadError, setLoadError] = useState('');
  const [fromShare, setFromShare] = useState<'text' | 'image' | null>(null);

  useEffect(() => {
    if (!shared || shareId === undefined) {
      return;
    }
    setForm({ ...emptyForm(settings), title: shared.title, content: shared.content, source: shared.source ?? '' });
    setErrors({});
    setFromShare(shared.origin ?? 'text');
    // Only a new share (new shareId) replaces the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  const categoriesLoader = useCallback(() => listCategories(), []);
  const { data: categories } = useFocusData(categoriesLoader, 'form:categories');

  const loadItem = useCallback(async () => {
    if (informationId === undefined) {
      return;
    }
    setLoadState('loading');
    try {
      const item = await getInformation(informationId);
      if (!item) {
        setLoadError('This information no longer exists.');
        setLoadState('error');
        return;
      }
      setForm(formFromItem(item, settings));
      setLoadState('ready');
    } catch (error) {
      logError('form:load', error);
      setLoadError(describeError(error));
      setLoadState('error');
    }
    // Settings are only used for defaults; do not reload the item when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [informationId]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key as string] || (key === 'reminder' && errors.repeatInterval)) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[key as string];
        if (key === 'reminder') {
          delete next.repeatInterval;
        }
        return next;
      });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      if (form.reminder.enabled) {
        // Asks for permission if needed; never blocks saving the data itself.
        await ensurePermission();
      }
      const result = await saveInformation(
        {
          title: form.title,
          content: form.content,
          categoryId: form.categoryId,
          tagIds: form.tagIds,
          source: form.source.trim() || null,
          createdAt: form.createdAt,
        },
        form.reminder,
        informationId,
      );
      setErrors({});
      if (result.warning) {
        Alert.alert(tr('Reminder not scheduled'), result.warning);
      }
      if (!isEdit) {
        setForm(emptyForm(settings));
        setFromShare(null);
      }
      onSaved(result.id, !isEdit);
    } catch (error) {
      if (error instanceof ValidationError) {
        setErrors(error.fieldErrors);
      } else {
        logError('form:save', error);
        Alert.alert(tr('Could not save'), describeError(error));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loadState === 'loading') {
    return <LoadingView />;
  }
  if (loadState === 'error') {
    return <ErrorView message={loadError} onRetry={loadItem} />;
  }

  return (
    <Screen keyboard>
      {fromShare ? (
        <View
          style={[
            styles.shareNotice,
            { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
          ]}
        >
          <Icon name="share-variant" size={18} color={colors.primary} />
          <AppText variant="small" style={{ marginLeft: spacing.sm, flex: 1 }}>
            {fromShare === 'image'
              ? 'Text read from your screenshot — check and correct it, then save. (Arabic text cannot be read automatically: type it if needed.)'
              : 'Filled from what you shared. Write the key point to remember in Content, then save.'}
          </AppText>
        </View>
      ) : null}
      <TextField
        label={tr('Title')}
        required
        value={form.title}
        onChangeText={t => update('title', t)}
        placeholder={tr('e.g. Ayat al-Kursi, Azure Artifacts feeds…')}
        maxLength={MAX_TITLE_LENGTH}
        error={errors.title}
        returnKeyType="next"
      />
      <TextField
        label={tr('Content')}
        required
        multiline
        value={form.content}
        onChangeText={t => update('content', t)}
        placeholder={tr('Write the information you want to remember')}
        maxLength={MAX_CONTENT_LENGTH}
        error={errors.content}
      />

      <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>{tr('Category')}</AppText>
      <View style={styles.chips}>
        {(categories ?? []).map(category => (
          <Chip
            key={category.id}
            label={category.name}
            icon={category.icon}
            color={category.color}
            selected={form.categoryId === category.id}
            onPress={() => update('categoryId', form.categoryId === category.id ? null : category.id)}
          />
        ))}
      </View>
      <AppText variant="caption" tone="muted" style={{ marginBottom: spacing.lg }}>{tr('Tap again to unselect. Create your own categories in Settings → Categories.')}</AppText>

      <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>{tr('Tags')}</AppText>
      <View style={{ marginBottom: spacing.lg }}>
        <TagPicker selectedIds={form.tagIds} onChange={ids => update('tagIds', ids)} />
      </View>

      <TextField
        label={tr('Source / reference')}
        value={form.source}
        onChangeText={t => update('source', t)}
        placeholder={tr('e.g. Surah Al-Baqarah 2:255, Microsoft Learn…')}
        maxLength={MAX_SOURCE_LENGTH}
        error={errors.source}
      />

      <DateTimeField
        label={tr('Creation date')}
        mode="date"
        value={form.createdAt}
        onChange={value => update('createdAt', value)}
        error={errors.createdAt}
      />

      <AppText variant="h3" style={{ marginBottom: spacing.md }}>{tr('Reminder')}</AppText>
      <ReminderEditor
        value={form.reminder}
        onChange={value => update('reminder', value)}
        createdAt={form.createdAt}
        intervals={settings.reviewIntervals}
        now={Date.now()}
        error={errors.reminder}
        intervalError={errors.repeatInterval}
      />

      {Object.keys(errors).length > 0 ? (
        <AppText variant="small" color={colors.danger} style={{ marginBottom: spacing.md }}>{tr('Please fix the highlighted fields.')}</AppText>
      ) : null}

      <Button
        title={isEdit ? tr('Save changes') : tr('Save information')}
        icon="content-save-outline"
        onPress={save}
        loading={saving}
      />
    </Screen>
  );
}

export function AddInformationScreen({ route, navigation }: TabScreenProps<'AddInformation'>) {
  return (
    <InformationForm
      shared={route.params?.shared}
      shareId={route.params?.shareId}
      onSaved={id => {
        navigation.setParams({ shared: undefined, shareId: undefined });
        navigation.navigate('InformationDetails', { informationId: id });
      }}
    />
  );
}

export function EditInformationScreen({ route, navigation }: RootStackScreenProps<'EditInformation'>) {
  return (
    <InformationForm
      informationId={route.params.informationId}
      onSaved={() => navigation.goBack()}
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  shareNotice: { flexDirection: 'row', alignItems: 'center' },
});
