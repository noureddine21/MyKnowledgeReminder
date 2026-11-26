import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '../components';
import { BackupScreen } from '../screens/BackupScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { InformationDetailsScreen } from '../screens/InformationDetailsScreen';
import { AddInformationScreen, EditInformationScreen } from '../screens/InformationFormScreen';
import { InformationListScreen } from '../screens/InformationListScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { ReminderSettingsScreen } from '../screens/ReminderSettingsScreen';
import { RoutinesScreen } from '../screens/RoutinesScreen';
import { ReviewTodayScreen } from '../screens/ReviewTodayScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { shadow, useAppTheme } from '../theme';
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

function TabIcon({ route, focused, color, size }: { route: keyof TabParamList; focused: boolean; color: string; size: number }) {
  return <Icon name={TAB_ICONS[route][focused ? 0 : 1]} color={color} size={size} />;
}

/** Raised round "+" button in the middle of the tab bar (Add information). */
function AddTabButton({ onPress, accessibilityState }: BottomTabBarButtonProps) {
  const { colors, dark } = useAppTheme();
  const focused = accessibilityState?.selected;
  return (
    <View style={styles.addWrap} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={tr('Add information')}
        style={({ pressed }) => [
          styles.addButton,
          {
            backgroundColor: colors.primary,
            borderColor: colors.surface,
            transform: [{ scale: pressed ? 0.94 : 1 }],
            opacity: focused ? 1 : 0.95,
          },
          shadow(dark, 3),
        ]}
      >
        <Icon name="plus" size={30} color={colors.primaryContrast} />
      </Pressable>
    </View>
  );
}

function Tabs() {
  const { colors } = useAppTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        tabBarIcon: props => TabIcon({ route: route.name, ...props }),
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ headerShown: false, title: tr('Home') }} />
      <Tab.Screen name="Library" component={InformationListScreen} options={{ title: tr('My Information') }} />
      <Tab.Screen
        name="AddInformation"
        component={AddInformationScreen}
        options={{ title: tr('Add'), headerTitle: tr('Add Information'), tabBarButton: AddTabButton }}
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
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="InformationDetails" component={InformationDetailsScreen} options={{ title: tr('Details') }} />
        <Stack.Screen name="EditInformation" component={EditInformationScreen} options={{ title: tr('Edit Information') }} />
        <Stack.Screen name="Categories" component={CategoriesScreen} />
        <Stack.Screen name="ReminderSettings" component={ReminderSettingsScreen} options={{ title: tr('Reminder Settings') }} />
        <Stack.Screen name="Backup" component={BackupScreen} options={{ title: tr('Backup & restore') }} />
        <Stack.Screen name="Routines" component={RoutinesScreen} options={{ title: tr('Routines') }} />
        <Stack.Screen name="Quiz" component={QuizScreen} options={{ title: tr('Quiz') }} />
        <Stack.Screen name="Stats" component={StatsScreen} options={{ title: tr('Statistics') }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: tr('Settings') }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  addWrap: { flex: 1, alignItems: 'center' },
  addButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 4,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
