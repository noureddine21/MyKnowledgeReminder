import React, { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { tr } from '../i18n';
import type { InformationItem } from '../models';
import { listInformation } from '../services/informationService';
import { useAppTheme } from '../theme';
import { logError } from '../utils/errors';
import { AppText } from './AppText';
import { CategoryBadge } from './CategoryBadge';
import { Icon } from './Icon';

interface Props {
  visible: boolean;
  title: string;
  /** Items not offered (the item itself, already linked ones). */
  excludeIds: number[];
  onClose: () => void;
  onPick: (item: InformationItem) => void;
}

/** Bottom sheet to choose one information item, with a search box. */
export function ItemPickerModal({ visible, title, excludeIds, onClose, onPick }: Props) {
  const { colors, radius, spacing, typography } = useAppTheme();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<InformationItem[]>([]);
  const excluded = excludeIds.join(',');

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await listInformation({ search, sort: 'createdDesc' });
        if (!cancelled) {
          const skip = new Set(excluded.split(',').map(Number));
          setItems(found.filter(i => !skip.has(i.id)).slice(0, 60));
        }
      } catch (e) {
        logError('picker:load', e);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, search, excluded]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={tr('Close')} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
        ]}
      >
        <View style={[styles.row, { marginBottom: spacing.md }]}>
          <AppText variant="h3" style={styles.flex}>
            {title}
          </AppText>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('Close')}>
            <Icon name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md }]}>
          <Icon name="magnify" size={20} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={tr('Search title, content or source')}
            placeholderTextColor={colors.textMuted}
            style={[typography.body, styles.input, { color: colors.text }]}
          />
        </View>
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          keyboardShouldPersistTaps="handled"
          style={{ marginTop: spacing.sm }}
          ListEmptyComponent={
            <AppText tone="muted" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
              {tr('No results')}
            </AppText>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.item,
                { borderBottomColor: colors.border, paddingVertical: spacing.md, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {item.title}
                </AppText>
                <AppText variant="small" tone="secondary" numberOfLines={1}>
                  {item.content}
                </AppText>
              </View>
              <CategoryBadge category={item.category} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '80%', minHeight: '60%' },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1, marginRight: 8 },
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 46 },
  input: { flex: 1, marginLeft: 8, paddingVertical: 8 },
  item: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
});
