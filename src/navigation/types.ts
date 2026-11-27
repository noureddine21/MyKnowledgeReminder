import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SharedDraft } from '../services/shareIntake';

export type TabParamList = {
  Home: undefined;
  Library: { categoryId?: number } | undefined;
  /** `shared` pre-fills the form (Share from another app); `shareId` makes each share unique. */
  AddInformation: { shared?: SharedDraft; shareId?: number } | undefined;
  Plan: undefined;
  ReviewToday: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  InformationDetails: { informationId: number };
  EditInformation: { informationId: number };
  Categories: undefined;
  ReminderSettings: undefined;
  Backup: undefined;
  Routines: undefined;
  /**
   * practice: random items, nothing rescheduled; minutes: timed session (most urgent first);
   * collectionId: only the items of a collection, in order.
   */
  Quiz: { practice?: boolean; minutes?: number; collectionId?: number } | undefined;
  Collections: undefined;
  Collection: { collectionId: number };
  /** Full-screen reading, swipe from one item to the next. */
  Reading: { ids: number[]; index?: number; title?: string };
  Stats: undefined;
  Settings: undefined;
  /** Full-screen alarm for a review item or a day-plan task. */
  Alarm: { informationId?: number; planTaskId?: number; notificationId?: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
