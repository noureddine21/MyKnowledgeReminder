import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorView,
  Icon,
  LoadingView,
  MasteryDots,
  ProgressBar,
  Screen,
} from '../components';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useFocusData } from '../hooks/useFocusData';
import type { RootStackScreenProps } from '../navigation/types';
import {
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  moveInCollection,
  renameCollection,
} from '../services/collectionService';
import { listInformation } from '../services/informationService';
import { LEARNED_MASTERY } from '../services/mastery';
import { useAppTheme } from '../theme';
import { ValidationError } from '../utils/errors';

import { tr, trn } from '../i18n';

/** Inline "name" input with a ✓ button. */
function NameInput({ initial, placeholder, onSubmit, onCancel }: {
  initial: string;
  placeholder: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const { colors, radius, spacing, typography } = useAppTheme();
  const [value, setValue] = useState(initial);
  return (
    <View style={[styles.input, { borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md }]}>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoFocus
        maxLength={40}
        onSubmitEditing={() => onSubmit(value)}
        style={[typography.body, styles.flex, { color: colors.text, paddingVertical: 10 }]}
      />
      <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('Cancel')} style={{ marginRight: spacing.md }}>
        <Icon name="close" size={22} color={colors.textMuted} />
      </Pressable>
      <Pressable onPress={() => onSubmit(value)} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('Save')}>
        <Icon name="check" size={24} color={colors.primary} />
      </Pressable>
    </View>
  );
}

/** All collections with their progress; create, rename (long press) and delete. */
export function CollectionsScreen({ navigation }: RootStackScreenProps<'Collections'>) {
  const { colors, spacing } = useAppTheme();
  const handleError = useErrorHandler();
  const loader = useCallback(() => listCollections(), []);
  const { data, error, reload } = useFocusData(loader, 'collections');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);

  const showError = (e: unknown, context: string) =>
    e instanceof ValidationError ? Alert.alert(tr(e.userMessage)) : handleError(e, context);

  const create = async (name: string) => {
    try {
      await createCollection(name);
      setCreating(false);
      reload();
    } catch (e) {
      showError(e, 'collections:create');
    }
  };

  const rename = async (id: number, name: string) => {
    try {
      await renameCollection(id, name);
      setRenamingId(null);
      reload();
    } catch (e) {
      showError(e, 'collections:rename');
    }
  };

  const options = (id: number, name: string) =>
    Alert.alert(name, undefined, [
      { text: tr('Rename'), onPress: () => setRenamingId(id) },
      {
        text: tr('Delete'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(tr('Delete the collection?'), tr('The items are kept; they only leave the collection.'), [
            { text: tr('Cancel'), style: 'cancel' },
            {
              text: tr('Delete'),
              style: 'destructive',
              onPress: () => deleteCollection(id).then(reload).catch(e => handleError(e, 'collections:delete')),
            },
          ]),
      },
      { text: tr('Cancel'), style: 'cancel' },
    ]);

  if (!data) {
    return error ? <ErrorView message={error} onRetry={reload} /> : <LoadingView />;
  }

  return (
    <Screen>
      <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
        {tr('Group items in an order, like a course or a book: "40 Hadith Nawawi", "Juz Amma"…')}
      </AppText>
      {creating ? (
        <NameInput initial="" placeholder={tr('e.g. 40 Hadith Nawawi')} onSubmit={create} onCancel={() => setCreating(false)} />
      ) : (
        <Button title={tr('New collection')} icon="plus" onPress={() => setCreating(true)} style={{ marginBottom: spacing.lg }} />
      )}
      {data.length === 0 ? (
        <EmptyState icon="bookmark-multiple-outline" title={tr('No collection yet')} message={tr('Create one, then choose it when you add information.')} />
      ) : (
        data.map(c =>
          renamingId === c.id ? (
            <NameInput key={c.id} initial={c.name} placeholder={c.name} onSubmit={name => rename(c.id, name)} onCancel={() => setRenamingId(null)} />
          ) : (
            <Card
              key={c.id}
              onPress={() => navigation.navigate('Collection', { collectionId: c.id })}
              onLongPress={() => options(c.id, c.name)}
              style={{ marginBottom: spacing.md }}
              accessibilityLabel={c.name}
            >
              <View style={styles.row}>
                <Icon name="bookmark-multiple" size={22} color={c.color} />
                <AppText variant="h3" style={[styles.flex, { marginLeft: spacing.sm }]}>
                  {c.name}
                </AppText>
                <AppText variant="bodyStrong" color={colors.primary}>
                  {c.learnedCount}/{c.itemCount}
                </AppText>
              </View>
              <View style={{ marginTop: spacing.sm }}>
                <ProgressBar value={c.learnedCount} total={c.itemCount} color={c.color} />
              </View>
              <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
                {trn('{n} item', '{n} items', c.itemCount)} · {tr('{n} learned', { n: c.learnedCount })}
              </AppText>
            </Card>
          ),
        )
      )}
      {data.length > 0 ? (
        <AppText variant="caption" tone="muted">{tr('Long-press a collection to rename or delete it.')}</AppText>
      ) : null}
    </Screen>
  );
}

/** One collection: its items in order (move up/down), progress, read and review. */
export function CollectionScreen({ route, navigation }: RootStackScreenProps<'Collection'>) {
  const { collectionId } = route.params;
  const { colors, radius, spacing } = useAppTheme();
  const handleError = useErrorHandler();
  const loader = useCallback(async () => {
    const [collection, items] = await Promise.all([
      getCollection(collectionId),
      listInformation({ collectionId, sort: 'createdAsc' }),
    ]);
    return { collection, items };
  }, [collectionId]);
  const { data, error, reload } = useFocusData(loader, 'collection');

  useLayoutEffect(() => {
    if (data?.collection) {
      navigation.setOptions({ title: data.collection.name });
    }
  }, [navigation, data?.collection]);

  if (!data) {
    return error ? <ErrorView message={error} onRetry={reload} /> : <LoadingView />;
  }
  const { collection, items } = data;
  if (!collection) {
    return <EmptyState icon="bookmark-remove-outline" title={tr('Collection not found')} actionLabel={tr('Go back')} onAction={() => navigation.goBack()} />;
  }
  const learned = items.filter(i => i.mastery >= LEARNED_MASTERY).length;

  const move = async (id: number, direction: -1 | 1) => {
    try {
      await moveInCollection(id, direction);
      reload();
    } catch (e) {
      handleError(e, 'collection:move');
    }
  };

  return (
    <Screen>
      <View style={[styles.row, { marginBottom: spacing.sm }]}>
        <AppText variant="h2" style={styles.flex}>
          {learned}/{items.length}
        </AppText>
        <AppText tone="secondary">{tr('learned')}</AppText>
      </View>
      <ProgressBar value={learned} total={items.length} color={collection.color} />

      {items.length > 0 ? (
        <View style={[styles.row, { marginTop: spacing.lg, gap: spacing.sm }]}>
          <Button
            title={tr('Read')}
            icon="book-open-outline"
            variant="secondary"
            onPress={() => navigation.navigate('Reading', { ids: items.map(i => i.id), title: collection.name })}
            style={styles.flex}
          />
          <Button
            title={tr('Review')}
            icon="head-lightbulb-outline"
            onPress={() => navigation.navigate('Quiz', { practice: true, collectionId })}
            style={styles.flex}
          />
        </View>
      ) : null}

      <View style={{ marginTop: spacing.lg }}>
        {items.length === 0 ? (
          <EmptyState
            icon="playlist-plus"
            title={tr('Empty collection')}
            message={tr('Choose this collection in the Add form to put items in it.')}
            actionLabel={tr('Add information')}
            onAction={() => navigation.navigate('Tabs', { screen: 'AddInformation' })}
          />
        ) : (
          items.map((item, index) => (
            <View
              key={item.id}
              style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }]}
            >
              <View style={[styles.number, { backgroundColor: collection.color }]}>
                <AppText variant="caption" color="#FFFFFF">
                  {index + 1}
                </AppText>
              </View>
              <Pressable
                style={[styles.flex, { marginHorizontal: spacing.sm }]}
                onPress={() => navigation.navigate('InformationDetails', { informationId: item.id })}
                accessibilityRole="button"
              >
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {item.title}
                </AppText>
                <View style={{ marginTop: 4 }}>
                  <MasteryDots mastery={item.mastery} />
                </View>
              </Pressable>
              <Pressable onPress={() => move(item.id, -1)} disabled={index === 0} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('Move up')}>
                <Icon name="chevron-up" size={26} color={index === 0 ? colors.border : colors.primary} />
              </Pressable>
              <Pressable
                onPress={() => move(item.id, 1)}
                disabled={index === items.length - 1}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={tr('Move down')}
              >
                <Icon name="chevron-down" size={26} color={index === items.length - 1 ? colors.border : colors.primary} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5 },
  item: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
