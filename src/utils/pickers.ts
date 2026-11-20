import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { combineDateAndTime } from './date';

/**
 * Promise-based wrappers around the native Android date/time dialogs.
 * Resolve with the chosen timestamp, or null if the user cancelled.
 */

export function pickDate(initial: number, minimumDate?: number): Promise<number | null> {
  return new Promise(resolve => {
    DateTimePickerAndroid.open({
      value: new Date(initial),
      mode: 'date',
      minimumDate: minimumDate !== undefined ? new Date(minimumDate) : undefined,
      onChange: (event, date) => {
        resolve(event.type === 'set' && date ? date.getTime() : null);
      },
    });
  });
}

export function pickTime(initial: number): Promise<number | null> {
  return new Promise(resolve => {
    DateTimePickerAndroid.open({
      value: new Date(initial),
      mode: 'time',
      is24Hour: true,
      onChange: (event, date) => {
        resolve(event.type === 'set' && date ? date.getTime() : null);
      },
    });
  });
}

/** Date dialog followed by a time dialog. Keeps the initial time if the time dialog is cancelled. */
export async function pickDateTime(initial: number, minimumDate?: number): Promise<number | null> {
  const date = await pickDate(initial, minimumDate);
  if (date === null) {
    return null;
  }
  const withInitialTime = combineDateAndTime(date, initial);
  const time = await pickTime(withInitialTime);
  return combineDateAndTime(date, time ?? initial);
}
