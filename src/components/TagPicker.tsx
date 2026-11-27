import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { tr } from '../i18n';
import type { TagWithCount } from '../models';
import { createTag, listTags, MAX_TAG_LENGTH } from '../services/tagService';
import { fonts, useAppTheme, withAlpha } from '../theme';
import { describeError, ValidationError } from '../utils/errors';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface Props {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}

/** One tag as a small pill: "#tafsir". */
export function TagPill({ name, color, selected = true, onPress, onLongPress }: {
  name: string;
  color: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected } : undefined}
      accessibilityLabel={`#${name}`}
      style={[
        styles.pill,
        {
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          marginRight: spacing.sm,
          marginBottom: spacing.sm,
          backgroundColor: selected ? withAlpha(color, 0.14) : colors.surface,
          borderColor: selected ? withAlpha(color, 0.5) : colors.border,
        },
      ]}
    >
      <AppText variant="small" color={selected ? color : colors.textSecondary} style={{ fontFamily: fonts.semibold }}>
        #{name}
      </AppText>
    </Pressable>
  );
}

/** Pick several tags for an item, or create a new one inline. */
export function TagPicker({ selectedIds, onChange }: Props) {
  const { colors, radius, spacing, typography } = useAppTheme();
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTags(await listTags());
    } catch (e) {
      setError(describeError(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: number) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);

  const add = async () => {
    if (!draft.trim()) {
      return;
    }
    try {
      const tag = await createTag(draft);
      setDraft('');
      setError(null);
      await load();
      onChange([...selectedIds, tag.id]);
    } catch (e) {
      if (e instanceof ValidationError) {
        setError(tr(Object.values(e.fieldErrors)[0]));
      } else {
        Alert.alert(tr('Could not save'), describeError(e));
      }
    }
  };

  return (
    <View>
      {tags.length > 0 ? (
        <View style={styles.wrap}>
          {tags.map(tag => (
            <TagPill
              key={tag.id}
              name={tag.name}
              color={tag.color}
              selected={selectedIds.includes(tag.id)}
              onPress={() => toggle(tag.id)}
            />
          ))}
        </View>
      ) : null}
      <View
        style={[
          styles.newRow,
          { borderColor: error ? colors.danger : colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
        ]}
      >
        <AppText color={colors.textMuted} style={{ marginLeft: spacing.md }}>
          #
        </AppText>
        <TextInput
          value={draft}
          onChangeText={text => {
            setDraft(text);
            setError(null);
          }}
          onSubmitEditing={add}
          placeholder={tr('New tag, e.g. tafsir')}
          placeholderTextColor={colors.textMuted}
          maxLength={MAX_TAG_LENGTH + 1}
          autoCapitalize="none"
          returnKeyType="done"
          accessibilityLabel={tr('New tag')}
          style={[typography.body, styles.flex, { color: colors.text, paddingHorizontal: spacing.xs }]}
        />
        <Pressable
          onPress={add}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel={tr('Add tag')}
          style={[styles.addButton, { opacity: draft.trim() ? 1 : 0.4 }]}
        >
          <Icon name="plus-circle" size={26} color={colors.primary} />
        </Pressable>
      </View>
      {error ? (
        <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: { borderWidth: 1, minHeight: 34, justifyContent: 'center' },
  newRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 48 },
  addButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
