import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { PRAYER_CITIES, type PrayerCity } from '../services/prayerTimes';
import { useAppTheme } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface Props {
  visible: boolean;
  selectedId: string | null;
  onSelect: (city: PrayerCity) => void;
  onClose: () => void;
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Full-screen searchable list of the built-in cities. */
export function CityPicker({ visible, selectedId, onSelect, onClose }: Props) {
  const { colors, radius, spacing, typography } = useAppTheme();
  const [query, setQuery] = useState('');

  const cities = useMemo(() => {
    const q = normalize(query.trim());
    return q
      ? PRAYER_CITIES.filter(c => normalize(`${c.name} ${c.country}`).includes(q))
      : PRAYER_CITIES;
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.flex, { backgroundColor: colors.background, padding: spacing.lg }]}>
        <View style={[styles.header, { marginBottom: spacing.md }]}>
          <AppText variant="h2" style={styles.flex}>
            Your city
          </AppText>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Icon name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <View
          style={[
            styles.search,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
          ]}
        >
          <Icon name="magnify" size={20} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search a city or country"
            placeholderTextColor={colors.textMuted}
            style={[typography.body, styles.flex, { color: colors.text, marginLeft: spacing.sm }]}
            autoFocus
          />
        </View>
        <FlatList
          data={cities}
          keyExtractor={c => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: spacing.md }}
          ListEmptyComponent={
            <AppText tone="muted" style={{ marginTop: spacing.lg }}>
              No city found. Choose the closest one.
            </AppText>
          }
          renderItem={({ item }) => {
            const selected = item.id === selectedId;
            return (
              <Pressable
                onPress={() => onSelect(item)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: selected ? colors.primarySoft : pressed ? colors.surface : 'transparent',
                    borderRadius: radius.md,
                    padding: spacing.md,
                  },
                ]}
              >
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{item.name}</AppText>
                  <AppText variant="caption" tone="secondary">
                    {item.country}
                  </AppText>
                </View>
                {selected ? <Icon name="check" size={22} color={colors.primary} /> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 48 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
