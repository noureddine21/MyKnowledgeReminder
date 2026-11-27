import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  AppText,
  Chip,
  TagPill,
  EmptyState,
  ErrorView,
  Icon,
  InformationCard,
  LoadingView,
} from '../components';
import { useFocusData } from '../hooks/useFocusData';
import type { InformationStatus, SortOption } from '../models';
import type { TabScreenProps } from '../navigation/types';
import { listCategories } from '../services/categoryService';
import { listInformation } from '../services/informationService';
import { useAppTheme } from '../theme';

import { tr, trn } from '../i18n';
import type { TagWithCount } from '../models';
import { deleteTag, listTags } from '../services/tagService';
import { describeError } from '../utils/errors';
const STATUS_OPTIONS: { value: InformationStatus; label: string; icon: string }[] = [
  { value: 'favorites', label: 'Favorites', icon: 'star-outline' },
  { value: 'due', label: 'To review', icon: 'bell-alert-outline' },
  { value: 'new', label: 'New', icon: 'sprout-outline' },
  { value: 'learning', label: 'Learning', icon: 'progress-clock' },
  { value: 'known', label: 'Known', icon: 'check-circle-outline' },
  { value: 'mastered', label: 'Mastered', icon: 'trophy-outline' },
];

const SORT_OPTIONS: { value: SortOption; label: string; icon: string }[] = [
  { value: 'createdDesc', label: 'Newest', icon: 'sort-calendar-descending' },
  { value: 'createdAsc', label: 'Oldest', icon: 'sort-calendar-ascending' },
  { value: 'nextReminder', label: 'Next reminder', icon: 'bell-outline' },
];

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function InformationListScreen({ navigation, route }: TabScreenProps<'Library'>) {
  const { colors, radius, spacing, typography } = useAppTheme();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tagId, setTagId] = useState<number | null>(null);
  const [sort, setSort] = useState<SortOption>('createdDesc');
  const [status, setStatus] = useState<InformationStatus>('all');
  const debouncedSearch = useDebounced(search, 250);

  // Category selected from the dashboard.
  const routeCategoryId = route.params?.categoryId;
  useEffect(() => {
    if (routeCategoryId !== undefined) {
      setCategoryId(routeCategoryId);
      navigation.setParams({ categoryId: undefined });
    }
  }, [routeCategoryId, navigation]);

  const categoriesLoader = useCallback(() => listCategories(), []);
  const { data: categories } = useFocusData(categoriesLoader, 'library:categories');
  const tagsLoader = useCallback(() => listTags(), []);
  const { data: tags, reload: reloadTags } = useFocusData(tagsLoader, 'library:tags');

  const confirmDeleteTag = (tag: TagWithCount) =>
    Alert.alert(tr('Delete the tag #{name}?', { name: tag.name }), tr('The items keep their content; only the tag is removed.'), [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: tr('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTag(tag.id);
            if (tagId === tag.id) {
              setTagId(null);
            }
            reloadTags();
          } catch (e) {
            Alert.alert(tr('Could not delete'), describeError(e));
          }
        },
      },
    ]);

  const loader = useCallback(async () => {
    const now = Date.now();
    const items = await listInformation({ search: debouncedSearch, categoryId, tagId, status, sort }, now);
    return { now, items };
  }, [debouncedSearch, categoryId, tagId, status, sort]);
  const { data, loading, error, reload } = useFocusData(loader, 'library');

  const filtersActive = debouncedSearch.trim().length > 0 || categoryId !== null || tagId !== null || status !== 'all';

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View
          style={[
            styles.search,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          <Icon name="magnify" size={20} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={tr('Search title, content or source')}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={tr('Search information')}
            returnKeyType="search"
            style={[typography.body, styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={tr('Clear search')}
            >
              <Icon name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
        style={styles.noGrow}
      >
        <Chip label={tr('All')} selected={categoryId === null} onPress={() => setCategoryId(null)} />
        {(categories ?? []).map(c => (
          <Chip
            key={c.id}
            label={c.name}
            icon={c.icon}
            color={c.color}
            selected={categoryId === c.id}
            onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
          />
        ))}
      </ScrollView>
      {tags && tags.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg }}
          style={styles.noGrow}
        >
          {tags.map(tag => (
            <TagPill
              key={tag.id}
              name={`${tag.name} · ${tag.itemCount}`}
              color={tag.color}
              selected={tagId === tag.id}
              onPress={() => setTagId(tagId === tag.id ? null : tag.id)}
              onLongPress={() => confirmDeleteTag(tag)}
            />
          ))}
        </ScrollView>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg }}
        style={styles.noGrow}
      >
        {STATUS_OPTIONS.map(option => (
          <Chip
            key={option.value}
            label={tr(option.label)}
            icon={option.icon}
            selected={status === option.value}
            onPress={() => setStatus(status === option.value ? 'all' : option.value)}
          />
        ))}
        <View style={[styles.divider, { backgroundColor: colors.border, marginRight: spacing.sm }]} />
        {SORT_OPTIONS.map(option => (
          <Chip
            key={option.value}
            label={tr(option.label)}
            icon={option.icon}
            selected={sort === option.value}
            onPress={() => setSort(option.value)}
          />
        ))}
      </ScrollView>

      {!data && error ? (
        <ErrorView message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingView />
      ) : (
        <FlatList
          data={data.items}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 }}
          refreshing={loading}
          onRefresh={reload}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={[styles.headerRow, { marginBottom: spacing.sm }]}>
              <AppText variant="caption" tone="muted" style={styles.flex}>
                {trn('{n} item', '{n} items', data.items.length)}
              </AppText>
              <Pressable
                onPress={() => navigation.navigate('Collections')}
                hitSlop={8}
                accessibilityRole="button"
                style={[styles.headerRow, { marginRight: spacing.lg }]}
              >
                <Icon name="bookmark-multiple-outline" size={18} color={colors.primary} />
                <AppText variant="small" color={colors.primary} style={styles.headerLink}>{tr('Collections')}</AppText>
              </Pressable>
              {data.items.length > 0 ? (
                <Pressable
                  onPress={() => navigation.navigate('Reading', { ids: data.items.slice(0, 200).map(i => i.id) })}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={styles.headerRow}
                >
                  <Icon name="book-open-outline" size={18} color={colors.primary} />
                  <AppText variant="small" color={colors.primary} style={styles.headerLink}>{tr('Read')}</AppText>
                </Pressable>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            filtersActive ? (
              <EmptyState
                icon="file-search-outline"
                title={tr('No results')}
                message={tr('Try another search term or category.')}
              />
            ) : (
              <EmptyState
                icon="bookshelf"
                title={tr('Nothing saved yet')}
                message={tr('Information you add will appear here.')}
                actionLabel={tr('Add information')}
                onAction={() => navigation.navigate('AddInformation')}
              />
            )
          }
          renderItem={({ item }) => (
            <InformationCard
              item={item}
              now={data.now}
              onPress={() => navigation.navigate('InformationDetails', { informationId: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  noGrow: { flexGrow: 0 },
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 46 },
  searchInput: { flex: 1, marginLeft: 8, paddingVertical: 8 },
  divider: { width: 1, height: 24, alignSelf: 'center', marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerLink: { marginLeft: 4 },
});
