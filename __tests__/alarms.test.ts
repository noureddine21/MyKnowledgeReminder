import notifee, { EventType } from 'react-native-notify-kit';
import { getDatabase } from '../src/database/connection';
import { createRepositories } from '../src/database/repositories';
import type { AppDatabase } from '../src/database/types';
import { openAlarm, openInformationDetails } from '../src/navigation/navigationRef';
import { parseTaskLine } from '../src/services/dayPlanner';
import { saveInformation } from '../src/services/informationService';
import { handleNotificationEvent } from '../src/services/notificationEvents';
import { editPlanTaskTiming, organizeToday } from '../src/services/planService';
import { saveRoutine } from '../src/services/routineService';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../src/navigation/navigationRef', () => ({
  openAlarm: jest.fn(),
  openInformationDetails: jest.fn(),
  openPlan: jest.fn(),
}));

const at = (h: number, m = 0) => new Date(2026, 10, 27, h, m).getTime();
const DAY_OFF = { dayStart: '08:00', dayEnd: '22:00', workStart: null, workEnd: null };
const mockedNotifee = notifee as jest.Mocked<typeof notifee>;
const scheduled = (id: string) => mockedNotifee.createTriggerNotification.mock.calls.find(([n]) => n.id === id)?.[0];

describe('alarm mode', () => {
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

  const saveItem = (alarm: boolean) =>
    saveInformation(
      { title: 'Ayat al-Kursi', content: 'x', categoryId: 1, source: null, createdAt: at(8) },
      { enabled: true, frequency: 'once', scheduledAt: at(9), alarm },
    );

  it('an alarm reminder rings until answered, cannot be swiped, and goes full screen', async () => {
    const { id } = await saveItem(true);
    const n = scheduled(`info-${id}`)!;
    expect(n.android).toMatchObject({
      channelId: 'review-alarms',
      loopSound: true,
      ongoing: true,
      autoCancel: false,
      fullScreenAction: { id: 'alarm', launchActivity: 'default' },
      pressAction: { id: 'alarm', launchActivity: 'default' },
    });
    // Actions stay available on the alarm.
    expect(n.android?.actions?.length).toBe(3);
    expect((await createRepositories(db).reminders.findByInformationId(id))?.alarm).toBe(true);
  });

  it('a normal reminder stays a normal notification', async () => {
    const { id } = await saveItem(false);
    const n = scheduled(`info-${id}`)!;
    expect(n.android?.channelId).toBe('review-reminders');
    expect(n.android?.ongoing).toBeUndefined();
    expect(n.android?.fullScreenAction).toBeUndefined();
  });

  it('tapping an alarm opens the Alarm screen; a normal tap opens the details', async () => {
    await handleNotificationEvent({
      type: EventType.PRESS,
      detail: { pressAction: { id: 'alarm' }, notification: { id: 'info-7', data: { informationId: '7' } } },
    } as never);
    expect(openAlarm).toHaveBeenCalledWith({ informationId: 7, notificationId: 'info-7' });

    await handleNotificationEvent({
      type: EventType.PRESS,
      detail: { pressAction: { id: 'default' }, notification: { id: 'info-8', data: { informationId: '8' } } },
    } as never);
    expect(openInformationDetails).toHaveBeenCalledWith(8);
  });

  it('day plan: ⏰ in a line, settings default, routines and the task editor', async () => {
    expect(parseTaskLine('Meeting @14:00 ⏰ 1h', 0)).toMatchObject({ title: 'Meeting', alarm: true, fixedStartMin: 14 * 60 });
    expect(parseTaskLine('Emails 15m', 0)?.alarm).toBeUndefined();

    await saveRoutine({ title: 'Quran', durationMin: 20, fixedStartMin: 21 * 60, important: false, days: [0, 1, 2, 3, 4, 5, 6], isActive: true, alarm: true });
    const { plan } = await organizeToday('Emails 15m\nGym 1h ⏰', at(8), DAY_OFF);
    const byTitle = Object.fromEntries(plan.tasks.map(t => [t.title, t.alarm]));
    expect(byTitle).toEqual({ Gym: true, Emails: false, Quran: true });

    const gym = plan.tasks.find(t => t.title === 'Gym')!;
    expect(scheduled(`plan-task-${gym.id}`)?.android?.fullScreenAction).toEqual({ id: 'alarm', launchActivity: 'default' });

    const emails = plan.tasks.find(t => t.title === 'Emails')!;
    const { plan: edited } = await editPlanTaskTiming(emails.id, { durationMin: 15, fixedStartMin: null, alarm: true }, at(8));
    expect(edited.tasks.find(t => t.title === 'Emails')?.alarm).toBe(true);
  });

  it('new day-plan tasks use the alarm default from Settings', async () => {
    await createRepositories(db).settings.set('planAlarmByDefault', true);
    const { plan } = await organizeToday('Emails 15m', at(8), DAY_OFF);
    expect(plan.tasks[0].alarm).toBe(true);
  });
});
