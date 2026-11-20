import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  ErrorView,
  Icon,
  LoadingView,
  Screen,
  SectionHeader,
  TextField,
} from '../components';
import { CATEGORY_COLORS, CATEGORY_ICONS, MAX_CATEGORY_NAME_LENGTH } from '../constants';
import type { CategoryWithCount } from '../database/repositories';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useFocusData } from '../hooks/useFocusData';
import {
  createCategory,
  deleteCategory,
  listCategoriesWithCounts,
  updateCategory,
} from '../services/categoryService';
import { useAppTheme, withAlpha } from '../theme';
import { ValidationError } from '../utils/errors';

interface Draft {
  id: number | null;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
}

const NEW_DRAFT: Draft = { id: null, name: '', color: CATEGORY_COLORS[6], icon: CATEGORY_ICONS[0], isDefault: false };

export function CategoriesScreen() {
  const { colors, radius, spacing } = useAppTheme();
  const handleError = useErrorHandler();
  const loader = useCallback(() => listCategoriesWithCounts(), []);
  const { data, error, reload } = useFocusData(loader, 'categories');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const startEdit = (c: CategoryWithCount) => {
    setNameError(undefined);
    setDraft({ id: c.id, name: c.name, color: c.color, icon: c.icon, isDefault: c.isDefault });
  };

  const save = async () => {
    if (!draft) {
      return;
    }
    setSaving(true);
    try {
      if (draft.id === null) {
        await createCategory(draft.name, draft.color, draft.icon);
      } else {
        await updateCategory(draft.id, draft.name, draft.color, draft.icon);
      }
      setDraft(null);
      reload();
    } catch (e) {
      if (e instanceof ValidationError) {
        setNameError(e.fieldErrors.name ?? e.userMessage);
      } else {
        handleError(e, 'categories:save');
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (c: CategoryWithCount) => {
    Alert.alert(
      `Delete "${c.name}"?`,
      c.itemCount > 0
        ? `${c.itemCount} item(s) in this category will be moved to "Other". Nothing else is deleted.`
        : 'This category is empty.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(c.id);
              if (draft?.id === c.id) {
                setDraft(null);
              }
              reload();
            } catch (e) {
              handleError(e, 'categories:delete');
            }
          },
        },
      ],
    );
  };

  if (!data) {
    return error ? <ErrorView message={error} onRetry={reload} /> : <LoadingView />;
  }

  return (
    <Screen keyboard>
      {draft ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <AppText variant="h3" style={{ marginBottom: spacing.md }}>
            {draft.id === null ? 'New category' : 'Edit category'}
          </AppText>
          <TextField
            label="Name"
            required
            value={draft.name}
            editable={!draft.isDefault}
            onChangeText={name => {
              setDraft({ ...draft, name });
              setNameError(undefined);
            }}
            maxLength={MAX_CATEGORY_NAME_LENGTH}
            placeholder="e.g. Arabic, Azure, Quotes"
            error={nameError}
            hint={draft.isDefault ? 'Built-in categories keep their name.' : undefined}
          />
          <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
            Color
          </AppText>
          <View style={[styles.wrap, { marginBottom: spacing.md }]}>
            {CATEGORY_COLORS.map(color => (
              <Pressable
                key={color}
                onPress={() => setDraft({ ...draft, color })}
                accessibilityRole="button"
                accessibilityLabel={`Color ${color}`}
                accessibilityState={{ selected: draft.color === color }}
                style={[
                  styles.swatch,
                  { backgroundColor: color, borderColor: draft.color === color ? colors.text : 'transparent' },
                ]}
              >
                {draft.color === color ? <Icon name="check" size={18} color="#FFFFFF" /> : null}
              </Pressable>
            ))}
          </View>
          <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
            Icon
          </AppText>
          <View style={[styles.wrap, { marginBottom: spacing.md }]}>
            {CATEGORY_ICONS.map(icon => (
              <Pressable
                key={icon}
                onPress={() => setDraft({ ...draft, icon })}
                accessibilityRole="button"
                accessibilityLabel={`Icon ${icon}`}
                accessibilityState={{ selected: draft.icon === icon }}
                style={[
                  styles.iconChoice,
                  {
                    borderRadius: radius.md,
                    backgroundColor: draft.icon === icon ? withAlpha(draft.color, 0.2) : colors.surfaceAlt,
                    borderColor: draft.icon === icon ? draft.color : 'transparent',
                  },
                ]}
              >
                <Icon name={icon} size={22} color={draft.icon === icon ? draft.color : colors.textSecondary} />
              </Pressable>
            ))}
          </View>
          <View style={[styles.row, { gap: spacing.sm }]}>
            <Button title="Save" icon="check" onPress={save} loading={saving} style={styles.flex} />
            <Button title="Cancel" variant="ghost" onPress={() => setDraft(null)} style={styles.flex} />
          </View>
        </Card>
      ) : (
        <Button
          title="New category"
          icon="plus"
          onPress={() => {
            setNameError(undefined);
            setDraft({ ...NEW_DRAFT });
          }}
        />
      )}

      <SectionHeader title={`${data.length} categories`} />
      {data.map(c => (
        <Card key={c.id} style={{ marginBottom: spacing.sm, paddingVertical: spacing.md }}>
          <View style={styles.row}>
            <View style={[styles.catIcon, { backgroundColor: withAlpha(c.color, 0.15), borderRadius: radius.md }]}>
              <Icon name={c.icon} size={22} color={c.color} />
            </View>
            <View style={[styles.flex, { marginLeft: spacing.md }]}>
              <AppText variant="bodyStrong">{c.name}</AppText>
              <AppText variant="caption" tone="muted">
                {c.itemCount} {c.itemCount === 1 ? 'item' : 'items'}
                {c.isDefault ? ' · Built-in' : ''}
              </AppText>
            </View>
            <Pressable onPress={() => startEdit(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${c.name}`} style={styles.action}>
              <Icon name="pencil-outline" size={20} color={colors.textSecondary} />
            </Pressable>
            {!c.isDefault ? (
              <Pressable onPress={() => confirmDelete(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${c.name}`} style={styles.action}>
                <Icon name="delete-outline" size={20} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChoice: {
    width: 44,
    height: 44,
    marginRight: 8,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  catIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  action: { padding: 8 },
});
