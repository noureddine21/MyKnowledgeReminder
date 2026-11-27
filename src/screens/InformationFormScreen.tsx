import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import {
  AppText,
  Button,
  Chip,
  DateTimeField,
  ErrorView,
  Icon,
  ItemImage,
  LoadingView,
  ReminderEditor,
  Screen,
  TagPicker,
  TextField,
  VoiceNoteRecorder,
} from '../components';
import { MAX_CONTENT_LENGTH, MAX_SOURCE_LENGTH, MAX_TITLE_LENGTH } from '../constants';
import { useFocusData } from '../hooks/useFocusData';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useSettings } from '../hooks/useSettings';
import type { AppSettings, Category, InformationItem, ReminderInput } from '../models';
import type { RootStackScreenProps, TabScreenProps } from '../navigation/types';
import type { SharedDraft } from '../services/shareIntake';
import { listCategories } from '../services/categoryService';
import { createCollection, listCollections } from '../services/collectionService';
import { findSimilarInformation, getInformation, saveInformation } from '../services/informationService';
import { applyTemplate, TEMPLATES, templateById, type TemplateId } from '../services/templates';
import { importImage, isNativeAvailable, pickImage } from '../native/mkrNative';
import { useAppTheme } from '../theme';
import { addDays, applyTimeString } from '../utils/date';
import { ValidationError, describeError, logError } from '../utils/errors';

import { tr } from '../i18n';

const MAX_QUESTION_LENGTH = 300;

interface FormState {
  title: string;
  content: string;
  question: string;
  isFavorite: boolean;
  categoryId: number | null;
  collectionId: number | null;
  tagIds: number[];
  source: string;
  imagePath: string | null;
  audioPath: string | null;
  createdAt: number;
  reminder: ReminderInput;
}

function emptyForm(settings: AppSettings): FormState {
  const now = Date.now();
  return {
    title: '',
    content: '',
    question: '',
    isFavorite: false,
    categoryId: null,
    collectionId: null,
    tagIds: [],
    source: '',
    imagePath: null,
    audioPath: null,
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
    question: item.question ?? '',
    isFavorite: item.isFavorite,
    categoryId: item.categoryId,
    collectionId: item.collectionId,
    tagIds: (item.tags ?? []).map(t => t.id),
    source: item.source ?? '',
    imagePath: item.imagePath,
    audioPath: item.audioPath,
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
  /** Opens an existing item (duplicate warning). */
  onOpenExisting: (id: number) => void;
  /** Content shared from another app; applied each time `shareId` changes. */
  shared?: SharedDraft;
  shareId?: number;
}

function findCategory(categories: Category[] | undefined, name: string | null): number | null {
  if (!name) {
    return null;
  }
  return categories?.find(c => c.name.toLowerCase() === name.toLowerCase())?.id ?? null;
}

function InformationForm({ informationId, onSaved, onOpenExisting, shared, shareId }: Props) {
  const { colors, radius, spacing, typography } = useAppTheme();
  const { settings } = useSettings();
  const { ensurePermission } = useNotificationPermission();
  const isEdit = informationId !== undefined;

  const [form, setForm] = useState<FormState>(() => emptyForm(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(isEdit ? 'loading' : 'ready');
  const [loadError, setLoadError] = useState('');
  const [fromShare, setFromShare] = useState<'text' | 'image' | null>(null);
  const [template, setTemplate] = useState<TemplateId>('free');
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [templateNotes, setTemplateNotes] = useState('');
  const [newCollection, setNewCollection] = useState<string | null>(null);

  const categoriesLoader = useCallback(() => listCategories(), []);
  const { data: categories } = useFocusData(categoriesLoader, 'form:categories');
  const collectionsLoader = useCallback(() => listCollections(), []);
  const { data: collections, reload: reloadCollections } = useFocusData(collectionsLoader, 'form:collections');

  useEffect(() => {
    if (!shared || shareId === undefined) {
      return;
    }
    setForm({
      ...emptyForm(settings),
      title: shared.title,
      content: shared.content,
      source: shared.source ?? '',
    });
    setErrors({});
    setTemplate('free');
    setFromShare(shared.origin ?? 'text');
    // Keep the shared screenshot as the item's photo.
    if (shared.imageUri && isNativeAvailable()) {
      importImage(shared.imageUri)
        .then(path => setForm(prev => ({ ...prev, imagePath: path })))
        .catch(e => logError('form:share-image', e));
    }
    // Only a new share (new shareId) replaces the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

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

  const clearError = (key: string) => {
    if (errors[key] || (key === 'reminder' && errors.repeatInterval)) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[key];
        if (key === 'reminder') {
          delete next.repeatInterval;
        }
        return next;
      });
    }
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    clearError(key as string);
  };

  /** Re-applies the template to title / source / question (and content for a word). */
  const applyTemplateValues = (id: TemplateId, values: Record<string, string>, notes: string) => {
    const result = applyTemplate(id, values, notes, (text, vars) => tr(text, vars));
    setForm(prev => ({
      ...prev,
      ...(result.title !== undefined ? { title: result.title } : {}),
      ...(result.source !== undefined ? { source: result.source } : {}),
      ...(result.question !== undefined ? { question: result.question } : {}),
      ...(result.content !== undefined ? { content: result.content } : {}),
    }));
    setErrors({});
  };

  const chooseTemplate = (id: TemplateId) => {
    setTemplate(id);
    setTemplateValues({});
    setTemplateNotes('');
    const categoryId = findCategory(categories, templateById(id).category);
    if (categoryId !== null) {
      update('categoryId', categoryId);
    }
  };

  const choosePhoto = async () => {
    try {
      const path = await pickImage();
      if (path) {
        update('imagePath', path);
      }
    } catch (e) {
      logError('form:photo', e);
      Alert.alert(tr('Could not add the photo'), describeError(e));
    }
  };

  const addCollection = async () => {
    if (!newCollection?.trim()) {
      setNewCollection(null);
      return;
    }
    try {
      const created = await createCollection(newCollection);
      await reloadCollections();
      update('collectionId', created.id);
      setNewCollection(null);
    } catch (e) {
      Alert.alert(tr('Could not create the collection'), e instanceof ValidationError ? tr(e.userMessage) : describeError(e));
    }
  };

  const doSave = async () => {
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
          question: form.question.trim() || null,
          isFavorite: form.isFavorite,
          imagePath: form.imagePath,
          audioPath: form.audioPath,
          collectionId: form.collectionId,
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
        setTemplate('free');
        setTemplateValues({});
        setTemplateNotes('');
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

  /** Warns before saving something that already exists. */
  const save = async () => {
    if (!isEdit && form.title.trim() && form.content.trim()) {
      try {
        const similar = await findSimilarInformation({ title: form.title, content: form.content });
        if (similar) {
          Alert.alert(tr('A similar information already exists'), `« ${similar.title} »`, [
            { text: tr('Open it'), onPress: () => onOpenExisting(similar.id) },
            { text: tr('Save anyway'), onPress: doSave },
            { text: tr('Cancel'), style: 'cancel' },
          ]);
          return;
        }
      } catch (e) {
        logError('form:similar', e);
      }
    }
    await doSave();
  };

  if (loadState === 'loading') {
    return <LoadingView />;
  }
  if (loadState === 'error') {
    return <ErrorView message={loadError} onRetry={loadItem} />;
  }

  const def = templateById(template);
  const isWord = template === 'word';

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
              ? tr('Text read from your screenshot — check and correct it, then save. (Arabic text cannot be read automatically: type it if needed.)')
              : tr('Filled from what you shared. Write the key point to remember in Content, then save.')}
          </AppText>
        </View>
      ) : null}

      {!isEdit ? (
        <>
          <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
            {tr('Template')}
          </AppText>
          <View style={[styles.chips, { marginBottom: spacing.sm }]}>
            {TEMPLATES.map(t => (
              <Chip key={t.id} label={tr(t.label)} icon={t.icon} selected={template === t.id} onPress={() => chooseTemplate(t.id)} />
            ))}
          </View>
          {def.fields.map(field => (
            <TextField
              key={`${template}-${field.key}`}
              label={tr(field.label)}
              value={templateValues[field.key] ?? ''}
              onChangeText={text => {
                const values = { ...templateValues, [field.key]: text };
                setTemplateValues(values);
                applyTemplateValues(template, values, templateNotes);
              }}
              placeholder={tr(field.placeholder)}
              keyboardType={field.keyboard ?? 'default'}
              maxLength={120}
            />
          ))}
        </>
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
      {isWord ? (
        <>
          <TextField
            label={tr(def.contentLabel)}
            multiline
            value={templateNotes}
            onChangeText={notes => {
              setTemplateNotes(notes);
              applyTemplateValues(template, templateValues, notes);
            }}
            placeholder={tr(def.contentPlaceholder)}
            maxLength={1000}
          />
          {form.content ? (
            <View style={[styles.preview, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }]}>
              <AppText variant="caption" tone="secondary">{tr('Saved content')}</AppText>
              <AppText>{form.content}</AppText>
            </View>
          ) : null}
          {errors.content ? (
            <AppText variant="caption" color={colors.danger} style={{ marginBottom: spacing.md }}>
              {errors.content}
            </AppText>
          ) : null}
        </>
      ) : (
        <TextField
          label={tr(def.contentLabel)}
          required
          multiline
          value={form.content}
          onChangeText={t => update('content', t)}
          placeholder={tr(def.contentPlaceholder)}
          maxLength={MAX_CONTENT_LENGTH}
          error={errors.content}
        />
      )}

      <TextField
        label={tr('Flashcard question (optional)')}
        value={form.question}
        onChangeText={t => update('question', t)}
        placeholder={tr('e.g. What is the meaning of…? The answer is the content.')}
        maxLength={MAX_QUESTION_LENGTH}
        hint={tr('Shown first in the quiz and in alarms; the content is the answer.')}
      />

      <View style={[styles.switchRow, { marginBottom: spacing.lg }]}>
        <Icon name={form.isFavorite ? 'star' : 'star-outline'} size={22} color={colors.accentStrong} />
        <AppText style={[styles.flex, { marginLeft: spacing.sm }]}>{tr('Favorite (shown at the top)')}</AppText>
        <Switch
          value={form.isFavorite}
          onValueChange={v => update('isFavorite', v)}
          trackColor={{ true: colors.accent, false: colors.border }}
          thumbColor={form.isFavorite ? colors.accentStrong : colors.surface}
        />
      </View>

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

      <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>{tr('Collection (ordered series)')}</AppText>
      <View style={styles.chips}>
        {(collections ?? []).map(c => (
          <Chip
            key={c.id}
            label={c.name}
            icon="bookmark-multiple-outline"
            color={c.color}
            selected={form.collectionId === c.id}
            onPress={() => update('collectionId', form.collectionId === c.id ? null : c.id)}
          />
        ))}
        {newCollection === null ? (
          <Chip label={tr('New collection')} icon="plus" onPress={() => setNewCollection('')} />
        ) : null}
      </View>
      {newCollection !== null ? (
        <View style={[styles.inline, { borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm }]}>
          <TextInput
            value={newCollection}
            onChangeText={setNewCollection}
            placeholder={tr('e.g. 40 Hadith Nawawi')}
            placeholderTextColor={colors.textMuted}
            autoFocus
            maxLength={40}
            onSubmitEditing={addCollection}
            style={[typography.body, styles.flex, { color: colors.text, paddingVertical: 8 }]}
          />
          <Pressable onPress={addCollection} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('Add')}>
            <Icon name="check" size={24} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
      <View style={{ marginBottom: spacing.lg }} />

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

      {isNativeAvailable() ? (
        <>
          <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>{tr('Photo & voice note')}</AppText>
          {form.imagePath ? (
            <View style={{ marginBottom: spacing.sm }}>
              <ItemImage uri={form.imagePath} />
              <View style={[styles.switchRow, { marginTop: spacing.xs }]}>
                <Button title={tr('Change')} icon="image-edit-outline" variant="ghost" compact onPress={choosePhoto} style={{ marginRight: spacing.sm }} />
                <Button title={tr('Remove')} icon="image-remove" variant="danger" compact onPress={() => update('imagePath', null)} />
              </View>
            </View>
          ) : (
            <Button
              title={tr('Add a photo')}
              icon="image-plus"
              variant="secondary"
              compact
              onPress={choosePhoto}
              style={{ alignSelf: 'flex-start', marginBottom: spacing.sm }}
            />
          )}
          <View style={{ marginBottom: spacing.lg }}>
            <VoiceNoteRecorder value={form.audioPath} onChange={path => update('audioPath', path)} />
          </View>
        </>
      ) : null}

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
      onOpenExisting={id => navigation.navigate('InformationDetails', { informationId: id })}
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
      onOpenExisting={id => navigation.replace('InformationDetails', { informationId: id })}
      onSaved={() => navigation.goBack()}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  shareNotice: { flexDirection: 'row', alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  preview: {},
});
