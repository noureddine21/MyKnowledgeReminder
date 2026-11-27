import notifee from 'react-native-notify-kit';
import { getDatabase } from '../src/database/connection';
import type { AppDatabase } from '../src/database/types';
import { parseTaskList } from '../src/services/dayPlanner';
import { durationToken, getCarryOver, organizeToday, setPlanTaskDone } from '../src/services/planService';
import { listRoutines, mergeRoutines, routinesForDay, saveRoutine } from '../src/services/routineService';
import { ValidationError } from '../src/utils/errors';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const time = (ts: number | null) => (ts === null ? null : new Date(ts).toTimeString().slice(0, 5));
const DAY_OFF = { dayStart: '08:00', dayEnd: '22:00', workStart: null, workEnd: null };
const mockedNotifee = notifee as jest.Mocked<typeof notifee>;

describe('routines and carry-over', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
  });

  afterEach(() => db.close());

  it('validates routines', async () => {
    await expect(
      saveRoutine({ title: ' ', durationMin: 30, fixedStartMin: null, important: false, days: [], isActive: true, alarm: false }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('adds the routines of the day to the plan, without duplicates', async () => {
    // Thursday 26 Nov 2026 = weekday 4
    await saveRoutine({ title: 'Sport', durationMin: 60, fixedStartMin: null, important: false, days: [1, 3, 4], isActive: true, alarm: false });
    await saveRoutine({ title: 'Read Quran', durationMin: 20, fixedStartMin: 21 * 60, important: false, days: [0, 1, 2, 3, 4, 5, 6], isActive: true, alarm: false });
    await saveRoutine({ title: 'Weekend walk', durationMin: 90, fixedStartMin: null, important: false, days: [0, 6], isActive: true, alarm: false });
    await saveRoutine({ title: 'Paused', durationMin: 30, fixedStartMin: null, important: false, days: [4], isActive: false, alarm: false });

    const today = routinesForDay(await listRoutines(), at(26, 8));
    expect(today.map(r => r.title)).toEqual(['Sport', 'Read Quran']);
    expect(mergeRoutines(parseTaskList('sport 30m\nEmails 15m'), today).map(t => t.title)).toEqual([
      'sport', // already in the list (case-insensitive): routine not added twice
      'Emails',
      'Read Quran',
    ]);

    const { plan } = await organizeToday('Emails 15m', at(26, 8), DAY_OFF);
    expect(plan.tasks.map(t => [t.title, time(t.startAt)])).toEqual([
      ['Emails', '08:00'],
      ['Sport', '08:20'],
      ['Read Quran', '21:00'], // fixed time of the routine
    ]);
  });

  it('proposes yesterday\'s unfinished tasks, written the way the list is parsed', async () => {
    const { plan } = await organizeToday('!Finish report 1h30\nCall Ahmed 15m\nGym 1h', at(25, 8), DAY_OFF);
    await setPlanTaskDone(plan.tasks.find(t => t.title === 'Gym')!.id, true, at(25, 18));

    const carry = await getCarryOver(at(26, 7));
    expect(carry).toEqual({ fromDate: '2026-11-25', lines: ['!Finish report 1h30', 'Call Ahmed 15m'] });
    // The lines round-trip through the parser.
    expect(parseTaskList(carry!.lines.join('\n')).map(t => [t.title, t.durationMin, t.important])).toEqual([
      ['Finish report', 90, true],
      ['Call Ahmed', 15, false],
    ]);
    expect(durationToken(45)).toBe('45m');
    expect(durationToken(120)).toBe('2h');
  });

  it('schedules the evening summary while tasks remain, and cancels it when all are done', async () => {
    const { plan } = await organizeToday('A 30m', at(26, 8), DAY_OFF);
    const evening = mockedNotifee.createTriggerNotification.mock.calls.find(([n]) => n.id === 'plan-evening');
    expect(evening?.[0].title).toBe('1 task not done today');
    expect(evening?.[1]).toMatchObject({ timestamp: at(26, 22) });

    mockedNotifee.cancelNotification.mockClear();
    await setPlanTaskDone(plan.tasks[0].id, true, at(26, 9));
    expect(mockedNotifee.cancelNotification).toHaveBeenCalledWith('plan-evening');
  });
});
