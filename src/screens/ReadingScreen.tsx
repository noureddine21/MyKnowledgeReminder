import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText, CategoryBadge, Icon, ItemImage, LoadingView, VoiceNotePlayer } from '../components';
import type { InformationItem } from '../models';
import type { RootStackScreenProps } from '../navigation/types';
import { getInformation } from '../services/informationService';
import { arabicTextStyle, fonts, isArabicText, useAppTheme, withAlpha } from '../theme';
import { logError } from '../utils/errors';

import { tr } from '../i18n';

const SIZES = [16, 18, 21, 24, 28, 32];

/**
 * Reading mode: one item per page, big text, swipe left/right to go to the next one.
 * Ideal for the Quran and hadith; the text size is adjustable (A− / A+).
 */
export function ReadingScreen({ route, navigation }: RootStackScreenProps<'Reading'>) {
  const { ids, index: startIndex = 0, title } = route.params;
  const { colors, radius, spacing } = useAppTheme();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<InformationItem[] | null>(null);
  const [page, setPage] = useState(startIndex);
  const [sizeIndex, setSizeIndex] = useState(2);
  const list = useRef<FlatList<InformationItem>>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await Promise.all(ids.map(id => getInformation(id)));
        if (!cancelled) {
          setItems(loaded.filter((i): i is InformationItem => i !== null));
        }
      } catch (e) {
        logError('reading:load', e);
        !cancelled && setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: title ?? tr('Reading mode'),
      headerRight: () => (
        <View style={styles.row}>
          <Pressable
            onPress={() => setSizeIndex(i => Math.max(0, i - 1))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr('Smaller text')}
            style={styles.headerButton}
          >
            <AppText style={{ fontFamily: fonts.bold, color: colors.accent }}>A−</AppText>
          </Pressable>
          <Pressable
            onPress={() => setSizeIndex(i => Math.min(SIZES.length - 1, i + 1))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr('Bigger text')}
            style={styles.headerButton}
          >
            <AppText style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.accent }}>A+</AppText>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, title, colors.accent]);

  const goTo = useCallback(
    (target: number) => {
      if (!items || target < 0 || target >= items.length) {
        return;
      }
      list.current?.scrollToIndex({ index: target, animated: true });
      setPage(target);
    },
    [items],
  );

  if (!items) {
    return <LoadingView />;
  }
  if (items.length === 0) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: colors.background }]}>
        <AppText tone="muted">{tr('Information not found')}</AppText>
      </View>
    );
  }

  const fontSize = SIZES[sizeIndex];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <FlatList
        ref={list}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={i => String(i.id)}
        initialScrollIndex={Math.min(startIndex, items.length - 1)}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => {
          const arabic = isArabicText(item.content);
          return (
            <ScrollView style={{ width }} contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxl }}>
              <CategoryBadge category={item.category} />
              <AppText variant="title" style={{ marginTop: spacing.sm }} selectable>
                {item.title}
              </AppText>
              <View style={[styles.rule, { backgroundColor: colors.accent, marginVertical: spacing.lg }]} />
              <AppText
                selectable
                style={[
                  arabicTextStyle(item.content),
                  { fontSize: arabic ? fontSize + 6 : fontSize, lineHeight: (arabic ? fontSize + 6 : fontSize) * (arabic ? 1.9 : 1.6) },
                ]}
              >
                {item.content}
              </AppText>
              {item.source ? (
                <AppText tone="secondary" style={{ marginTop: spacing.lg, fontSize: Math.max(14, fontSize - 4) }}>
                  — {item.source}
                </AppText>
              ) : null}
              {item.imagePath ? (
                <View style={{ marginTop: spacing.lg }}>
                  <ItemImage uri={item.imagePath} />
                </View>
              ) : null}
              {item.audioPath ? (
                <View style={{ marginTop: spacing.lg }}>
                  <VoiceNotePlayer path={item.audioPath} />
                </View>
              ) : null}
            </ScrollView>
          );
        }}
      />
      {items.length > 1 ? (
        <View style={[styles.footer, { borderTopColor: colors.border, padding: spacing.md }]}>
          <Pressable onPress={() => goTo(page - 1)} disabled={page === 0} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('Previous')}>
            <Icon name="chevron-left" size={32} color={page === 0 ? colors.border : colors.primary} />
          </Pressable>
          <View style={[styles.counter, { backgroundColor: withAlpha(colors.primary, 0.1), borderRadius: radius.pill }]}>
            <AppText variant="bodyStrong" color={colors.primary}>
              {page + 1} / {items.length}
            </AppText>
          </View>
          <Pressable
            onPress={() => goTo(page + 1)}
            disabled={page === items.length - 1}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tr('Next')}
          >
            <Icon name="chevron-right" size={32} color={page === items.length - 1 ? colors.border : colors.primary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  headerButton: { paddingHorizontal: 10 },
  rule: { width: 48, height: 3, borderRadius: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth },
  counter: { paddingHorizontal: 16, paddingVertical: 6 },
});
