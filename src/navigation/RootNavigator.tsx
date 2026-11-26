import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
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
import { useAppTheme } from '../theme';
import { flushPendingNavigation, navigationRef } from './navigationRef';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, [string, string]> = {
  Home: ['view-dashboard', 'view-dashboard-outline'],
  Library: ['bookshelf', 'bookshelf'],
  AddInformation: ['plus-circle', 'plus-circle-outline'],
  Plan: ['clipboard-text-clock', 'clipboard-text-clock-outline'],
  ReviewToday: ['calendar-check', 'calendar-check-outline'],
  Settings: ['cog', 'cog-outline'],
};

function TabIcon({ route, focused, color, size }: { route: keyof TabParamList; focused: boolean; color: string; size: number }) {
  return <Icon name={TAB_ICONS[route][focused ? 0 : 1]} color={color} size={size} />;
}

function Tabs() {
  const { colors } = useAppTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        tabBarIcon: props => TabIcon({ route: route.name, ...props }),
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ headerShown: false, title: 'Home' }} />
      <Tab.Screen name="Library" component={InformationListScreen} options={{ title: 'My Information' }} />
      <Tab.Screen name="AddInformation" component={AddInformationScreen} options={{ title: 'Add', headerTitle: 'Add Information' }} />
      <Tab.Screen name="Plan" component={PlanScreen} options={{ title: 'Plan', headerTitle: 'My Day' }} />
      <Tab.Screen name="ReviewToday" component={ReviewTodayScreen} options={{ title: 'Review', headerTitle: 'Review Today' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
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
        <Stack.Screen name="InformationDetails" component={InformationDetailsScreen} options={{ title: 'Details' }} />
        <Stack.Screen name="EditInformation" component={EditInformationScreen} options={{ title: 'Edit Information' }} />
        <Stack.Screen name="Categories" component={CategoriesScreen} />
        <Stack.Screen name="ReminderSettings" component={ReminderSettingsScreen} options={{ title: 'Reminder Settings' }} />
        <Stack.Screen name="Backup" component={BackupScreen} options={{ title: 'Backup & restore' }} />
        <Stack.Screen name="Routines" component={RoutinesScreen} options={{ title: 'Routines' }} />
        <Stack.Screen name="Quiz" component={QuizScreen} options={{ title: 'Quiz' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
