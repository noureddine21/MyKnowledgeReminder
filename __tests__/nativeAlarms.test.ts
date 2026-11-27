import notifee from 'react-native-notify-kit';
import { getDatabase } from '../src/database/connection';
import type { AppDatabase } from '../src/database/types';
import * as native from '../src/native/mkrNative';
import { openAlarm } from '../src/navigation/navigationRef';
import { deleteInformation, saveInformation } from '../src/services/informationService';
import { organizeToday } from '../src/services/planService';
import { handleIncomingUrl, parseAlarmUrl } from '../src/services/shareIntake';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../src/navigation/navigationRef', () => ({ openAlarm: jest.fn(), openSharedDraft: jest.fn(), openPlan: jest.fn() }));
jest.mock('../src/native/mkrNative', () => ({
  isNativeAvailable: () => true,
  scheduleNativeAlarm: jest.fn(async () => true),
  cancelNativeAlarm: jest.fn(async () => {}),
  cancelNativeAlarmsWithPrefix: jest.fn(async () => {}),
  updateWidget: jest.fn(async () => 0),
  recognizeText: jest.fn(),
  deleteAppFile: jest.fn(async () => {}),
}));

const at = (h: number, m = 0) => new Date(2026, 10, 27, h, m).getTime();
const DAY_OFF = { dayStart: '08:00', dayEnd: '22:00', workStart: null, workEnd: null };
const mockedNotifee = notifee as jest.Mocked<typeof notifee>;

describe('real alarms (alarm clock + ringing service)', () => {
  let db: AppDatabase;
  let nowSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(at(8));
  });

  afterEach(() => {
    nowSpy.mockRestore();
    db.close();
  });

  it('schedules a native alarm (with repeat) instead of a notification for alarm items', async () => {
    const { id } = await saveInformation(
      { title: 'Ayat al-Kursi', content: 'x', categoryId: 1, source: null, createdAt: at(8) },
      { enabled: true, frequency: 'daily', repeatInterval: 2, scheduledAt: at(9), alarm: true },
    );
    expect(native.scheduleNativeAlarm).toHaveBeenCalledWith(
      expect.objectContaining({ id: `info-${id}`, at: at(9), informationId: id, repeatMs: 2 * 24 * 3_600_000 }),
    );
    expect(mockedNotifee.createTriggerNotification.mock.calls.some(([n]) => n.id === `info-${id}`)).toBe(false);

    await deleteInformation(id);
    expect(native.cancelNativeAlarm).toHaveBeenCalledWith(`info-${id}`);
  });

  it('normal items keep the notification and cancel any old alarm', async () => {
    const { id } = await saveInformation(
      { title: 'Note', content: 'x', categoryId: null, source: null, createdAt: at(8) },
      { enabled: true, frequency: 'once', scheduledAt: at(9), alarm: false },
    );
    expect(native.scheduleNativeAlarm).not.toHaveBeenCalled();
    expect(native.cancelNativeAlarm).toHaveBeenCalledWith(`info-${id}`);
    expect(mockedNotifee.createTriggerNotification.mock.calls.some(([n]) => n.id === `info-${id}`)).toBe(true);
  });

  it('day-plan alarm tasks ring as native alarms', async () => {
    const { plan } = await organizeToday('Emails 15m\nGym 1h ⏰', at(8), DAY_OFF);
    const gym = plan.tasks.find(t => t.title === 'Gym')!;
    expect(native.cancelNativeAlarmsWithPrefix).toHaveBeenCalledWith('plan-task-');
    expect(native.scheduleNativeAlarm).toHaveBeenCalledWith(
      expect.objectContaining({ id: `plan-task-${gym.id}`, at: gym.startAt, planTaskId: gym.id }),
    );
  });

  it('opens the Alarm screen from the alarm link set by the app', () => {
    expect(parseAlarmUrl('myknowledgereminder://alarm?alarmId=info-3&informationId=3')).toEqual({
      informationId: 3,
      planTaskId: undefined,
      notificationId: 'info-3',
    });
    expect(parseAlarmUrl('myknowledgereminder://share?text=x')).toBeNull();
    expect(handleIncomingUrl('myknowledgereminder://alarm?alarmId=plan-task-5&planTaskId=5')).toBe(true);
    expect(openAlarm).toHaveBeenCalledWith({ informationId: undefined, planTaskId: 5, notificationId: 'plan-task-5' });
  });
});
