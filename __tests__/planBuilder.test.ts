import notifee from 'react-native-notify-kit';
import { getDatabase } from '../src/database/connection';
import type { AppDatabase } from '../src/database/types';
import { parseTaskLine, parseTaskList, type ParsedTask } from '../src/services/dayPlanner';
import { editableTasks, organizeToday, tasksToText, upcomingWorkNudges } from '../src/services/planService';
import { saveRoutine } from '../src/services/routineService';
import { getSettings, updateSetting } from '../src/services/settingsService';
import { workNudgeSlots } from '../src/services/workNudges';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const time = (ts: number) => new Date(ts).toTimeString().slice(0, 5);
const DAY_OFF = { dayStart: '08:00', dayEnd: '22:00', workStart: null, workEnd: null };
const mockedNotifee = notifee as jest.Mocked<typeof notifee>;

const task = (title: string, extra: Partial<ParsedTask> = {}): ParsedTask => ({
  title,
  durationMin: 30,
  fixedStartMin: null,
  important: false,
  position: 0,
  ...extra,
});

describe('task list built one item at a time', () => {
  it('writes tasks back in the list syntax, and reads them identically', () => {
    const tasks = [
      task('Finish the report', { important: true, durationMin: 120 }),
      task('Meeting', { durationMin: 60, fixedStartMin: 14 * 60, alarm: true }),
      task('Call Ahmed', { durationMin: 15, alarm: false }),
    ];
    const text = tasksToText(tasks);
    expect(text).toBe('!Finish the report 2h\nMeeting 1h @14:00 ⏰\nCall Ahmed 15m 🔕');
    expect(parseTaskList(text)).toEqual(tasks.map((t, position) => ({ ...t, position })));
  });

  it('🔕 means "no alarm" even when alarms are on by default', () => {
    expect(parseTaskLine('Emails 15m 🔕', 0)).toMatchObject({ title: 'Emails', durationMin: 15, alarm: false });
    expect(parseTaskLine('Emails 15m', 0)?.alarm).toBeUndefined();
  });

  describe('with a database', () => {
    let db: AppDatabase;

    beforeEach(async () => {
      jest.clearAllMocks();
      db = await createTestDatabase();
      (getDatabase as jest.Mock).mockResolvedValue(db);
    });

    afterEach(() => db.close());

    it('organizes the list of items and gives them back for editing (routines excluded)', async () => {
      await saveRoutine({ title: 'Read Quran', durationMin: 20, fixedStartMin: 21 * 60, important: false, days: [0, 1, 2, 3, 4, 5, 6], isActive: true, alarm: false });
      await updateSetting('planAlarmByDefault', true);
      const { plan } = await organizeToday(
        [task('Sport', { durationMin: 60, alarm: false }), task('  Emails ', { durationMin: 15, important: true })],
        at(26, 8),
        DAY_OFF,
      );
      expect(plan.tasks.map(t => [t.title, t.alarm, t.startAt !== null && time(t.startAt)])).toEqual([
        ['Sport', false, '08:20'],
        ['Emails', true, '08:00'],
        ['Read Quran', false, '21:00'],
      ]);
      expect(editableTasks(plan).map(t => [t.title, t.durationMin, t.important, t.alarm])).toEqual([
        ['Sport', 60, false, false],
        ['Emails', 15, true, true],
      ]);
    });
  });
});

describe('work-time nudges', () => {
  const WORK = { workStart: '09:00', workEnd: '13:00' };

  it('cycles the chosen nudges every N minutes during work, skipping lunch and past times', () => {
    const slots = workNudgeSlots(at(26, 0), WORK, ['water', 'walk'], 60, { start: '11:30', end: '12:30' }, at(26, 10, 30));
    // 10:00 (water) is past, 12:00 is during lunch.
    expect(slots.map(s => [time(s.at), s.key])).toEqual([['11:00', 'walk']]);
    const noLunch = workNudgeSlots(at(26, 0), WORK, ['water', 'walk'], 60, null, 0);
    expect(noLunch.map(s => [time(s.at), s.key])).toEqual([
      ['10:00', 'water'],
      ['11:00', 'walk'],
      ['12:00', 'water'],
    ]);
  });

  it('nothing on a day off, with no nudge chosen, or with unknown keys', () => {
    expect(workNudgeSlots(at(26, 0), { workStart: null, workEnd: null }, ['water'], 60, null, 0)).toEqual([]);
    expect(workNudgeSlots(at(26, 0), WORK, [], 60, null, 0)).toEqual([]);
    expect(workNudgeSlots(at(26, 0), WORK, ['nope'], 60, null, 0)).toEqual([]);
  });

  it('covers today and the next work days from the settings', () => {
    // Thursday 26 → Friday 27 (work) → Saturday 28 (off)
    const settings = { ...DEFAULT_SETTINGS, planWorkNudges: ['water'], planWorkNudgeEveryMin: 120, planLunchBreak: false };
    const slots = upcomingWorkNudges(settings, null, at(26, 8));
    expect(slots.map(s => new Date(s.at).getDate() + ' ' + time(s.at))).toEqual([
      '26 11:00',
      '26 13:00',
      '26 15:00',
      '27 11:00',
      '27 13:00',
      '27 15:00',
    ]);
  });

  it('schedules them as notifications and keeps the setting', async () => {
    const db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
    jest.clearAllMocks();
    try {
      await updateSetting('planWorkNudges', ['water', 'stretch']);
      await updateSetting('planWorkNudgeEveryMin', 90);
      expect((await getSettings()).planWorkNudges).toEqual(['water', 'stretch']);
      await organizeToday('Emails 15m', at(26, 7), { dayStart: '07:00', dayEnd: '22:00', workStart: '09:00', workEnd: '17:00' });
      const ids = mockedNotifee.createTriggerNotification.mock.calls.map(([n]) => n.id ?? '');
      expect(ids.some(id => id.startsWith('plan-nudge-'))).toBe(true);
    } finally {
      db.close();
    }
  });
});
