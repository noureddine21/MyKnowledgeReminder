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
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  InformationDetails: { informationId: number };
  EditInformation: { informationId: number };
  Categories: undefined;
  ReminderSettings: undefined;
  Backup: undefined;
  Routines: undefined;
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
