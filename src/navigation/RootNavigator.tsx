import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Icon } from '../components';
import { AlarmScreen } from '../screens/AlarmScreen';
import { BackupScreen } from '../screens/BackupScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { CollectionScreen, CollectionsScreen } from '../screens/CollectionsScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { InformationDetailsScreen } from '../screens/InformationDetailsScreen';
import { AddInformationScreen, EditInformationScreen } from '../screens/InformationFormScreen';
import { InformationListScreen } from '../screens/InformationListScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { ReadingScreen } from '../screens/ReadingScreen';
import { ReminderSettingsScreen } from '../screens/ReminderSettingsScreen';
import { RoutinesScreen } from '../screens/RoutinesScreen';
import { ReviewTodayScreen } from '../screens/ReviewTodayScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { fonts, shadow, useAppTheme } from '../theme';
import { flushPendingNavigation, navigationRef } from './navigationRef';
import type { RootStackParamList, TabParamList } from './types';

import { tr } from '../i18n';
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, [string, string]> = {
  Home: ['view-dashboard', 'view-dashboard-outline'],
  Library: ['bookshelf', 'bookshelf'],
  AddInformation: ['plus-circle', 'plus-circle-outline'],
  Plan: ['clipboard-text-clock', 'clipboard-text-clock-outline'],
  ReviewToday: ['calendar-check', 'calendar-check-outline'],
};

/**
 * Bottom menu: emerald & gold, above the Android navigation bar (safe area),
 * active tab highlighted with a soft pill, raised gold "+" in the middle with its label.
 */
function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, dark } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        shadow(dark, 2),
      ]}
    >
      {state.routes.map((route, index) => {
        const name = route.name as keyof TabParamList;
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label =
          typeof options.tabBarLabel === 'string' ? options.tabBarLabel : typeof options.title === 'string' ? options.title : route.name;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };
        const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

        if (name === 'AddInformation') {
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tr('Add information')}
              style={styles.tab}
            >
              {({ pressed }) => (
                <>
                  <View
                    style={[
                      styles.addButton,
                      {
                        backgroundColor: colors.accent,
                        borderColor: colors.surface,
                        transform: [{ scale: pressed ? 0.94 : 1 }],
                      },
                      shadow(dark, 3),
                    ]}
                  >
                    <Icon name="plus" size={30} color={colors.hero} />
                  </View>
                  <AppText
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={[styles.label, { color: focused ? colors.accentStrong : colors.textMuted, fontFamily: focused ? fonts.bold : fonts.semibold }]}
                  >
                    {label}
                  </AppText>
                </>
              )}
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.pill, { backgroundColor: focused ? colors.primarySoft : 'transparent' }]}>
              <Icon name={TAB_ICONS[name][focused ? 0 : 1]} size={24} color={focused ? colors.primary : colors.textMuted} />
            </View>
            <AppText
              numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
              style={[styles.label, { color: focused ? colors.primary : colors.textMuted, fontFamily: focused ? fonts.bold : fonts.semibold }]}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const renderTabBar = (props: BottomTabBarProps) => <AppTabBar {...props} />;

function Tabs() {
  const { colors } = useAppTheme();
  return (
    <Tab.Navigator
      tabBar={renderTabBar}
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.bold },
      }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ headerShown: false, title: tr('Home') }} />
      <Tab.Screen name="Library" component={InformationListScreen} options={{ title: tr('My Information'), tabBarLabel: tr('Library') }} />
      <Tab.Screen
        name="AddInformation"
        component={AddInformationScreen}
        options={{ title: tr('Add'), headerTitle: tr('Add Information') }}
      />
      <Tab.Screen name="Plan" component={PlanScreen} options={{ title: tr('Plan'), headerTitle: tr('My Day') }} />
      <Tab.Screen name="ReviewToday" component={ReviewTodayScreen} options={{ title: tr('Review'), headerTitle: tr('Review Today') }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const theme = useAppTheme();
  const { colors } = theme;

  const navigationTheme: NavigationTheme = useMemo(() => {
    const base = theme.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    };
  }, [theme.dark, colors]);

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} onReady={flushPendingNavigation}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.bold },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="InformationDetails" component={InformationDetailsScreen} options={{ title: tr('Details') }} />
        <Stack.Screen name="EditInformation" component={EditInformationScreen} options={{ title: tr('Edit Information') }} />
        <Stack.Screen name="Categories" component={CategoriesScreen} />
        <Stack.Screen name="ReminderSettings" component={ReminderSettingsScreen} options={{ title: tr('Notifications & permissions') }} />
        <Stack.Screen name="Backup" component={BackupScreen} options={{ title: tr('Backup & restore') }} />
        <Stack.Screen name="Routines" component={RoutinesScreen} options={{ title: tr('Routines') }} />
        <Stack.Screen name="Quiz" component={QuizScreen} options={{ title: tr('Quiz') }} />
        <Stack.Screen name="Stats" component={StatsScreen} options={{ title: tr('Statistics') }} />
        <Stack.Screen name="Collections" component={CollectionsScreen} options={{ title: tr('Collections') }} />
        <Stack.Screen name="Collection" component={CollectionScreen} options={{ title: tr('Collection') }} />
        <Stack.Screen name="Reading" component={ReadingScreen} options={{ title: tr('Reading mode') }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: tr('Settings') }} />
        <Stack.Screen
          name="Alarm"
          component={AlarmScreen}
          options={{ headerShown: false, animation: 'fade', gestureEnabled: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 52 },
  pill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 15, marginTop: 3, textAlign: 'center' },
  addButton: {
    width: 56,
    height: 56,
    borderRadius: 20,
    borderWidth: 4,
    marginTop: -26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
