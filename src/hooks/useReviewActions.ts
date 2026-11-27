import { useNavigation } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert, Platform, ToastAndroid } from 'react-native';
import type { InformationItem } from '../models';
import { deleteInformation } from '../services/informationService';
import { gradeReview, markReviewed, rescheduleReview, type QuizGrade } from '../services/reviewService';
import { addDays, applyTimeString, formatRelative } from '../utils/date';
import { pickDateTime } from '../utils/pickers';
import { useErrorHandler } from './useErrorHandler';
import { useNotificationPermission } from './useNotificationPermission';
import { useSettings } from './useSettings';

function notify(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

/**
 * Review actions shared by "Review Today" and "Information Details":
 * mark as reviewed, schedule another review, edit and delete.
 */
export function useReviewActions(onChanged: () => void) {
  const navigation = useNavigation();
  const handleError = useErrorHandler();
  const { settings } = useSettings();
  const { ensurePermission } = useNotificationPermission();
  const [busyId, setBusyId] = useState<number | null>(null);

  const markAsReviewed = useCallback(
    async (item: InformationItem, grade?: QuizGrade) => {
      setBusyId(item.id);
      try {
        const result = grade ? await gradeReview(item.id, grade) : await markReviewed(item.id);
        if (result.warning) {
          Alert.alert('Reminder not scheduled', result.warning);
        } else if (result.completed) {
          notify(
            item.reminder?.frequency === 'spaced'
              ? 'Reviewed! Smart schedule completed 🎉'
              : 'Reviewed! This reminder is complete.',
          );
        } else if (result.nextAt !== null) {
          notify(`Reviewed! Next review: ${formatRelative(result.nextAt, Date.now())}`);
        } else {
          notify('Reviewed!');
        }
        onChanged();
      } catch (error) {
        handleError(error, 'review:mark');
      } finally {
        setBusyId(null);
      }
    },
    [handleError, onChanged],
  );

  const scheduleAnother = useCallback(
    async (item: InformationItem) => {
      const now = Date.now();
      const initial = applyTimeString(addDays(now, 1), settings.defaultReminderTime);
      const at = await pickDateTime(initial, now);
      if (at === null) {
        return;
      }
      if (at <= Date.now()) {
        Alert.alert('Choose a future time', 'The review must be scheduled in the future.');
        return;
      }
      setBusyId(item.id);
      try {
        await ensurePermission();
        const warning = await rescheduleReview(item.id, at);
        if (warning) {
          Alert.alert('Reminder not scheduled', warning);
        } else {
          notify(`Next review: ${formatRelative(at, Date.now())}`);
        }
        onChanged();
      } catch (error) {
        handleError(error, 'review:reschedule');
      } finally {
        setBusyId(null);
      }
    },
    [ensurePermission, handleError, onChanged, settings.defaultReminderTime],
  );

  const edit = useCallback(
    (item: InformationItem) => navigation.navigate('EditInformation', { informationId: item.id }),
    [navigation],
  );

  const remove = useCallback(
    (item: InformationItem, afterDelete?: () => void) => {
      Alert.alert(
        'Delete information?',
        `"${item.title}" and its reminders and review history will be permanently deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setBusyId(item.id);
              try {
                await deleteInformation(item.id);
                notify('Deleted');
                (afterDelete ?? onChanged)();
              } catch (error) {
                handleError(error, 'review:delete');
              } finally {
                setBusyId(null);
              }
            },
          },
        ],
      );
    },
    [handleError, onChanged],
  );

  return { busyId, markAsReviewed, scheduleAnother, edit, remove };
}
