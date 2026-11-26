import notifee, { RepeatFrequency } from 'react-native-notify-kit';
import { getDatabase } from '../src/database/connection';
import { createRepositories } from '../src/database/repositories';
import type { AppDatabase } from '../src/database/types';
import { dateKey, organizeDay, parseTaskLine, parseTaskList } from '../src/services/dayPlanner';
import { handleNotificationEvent } from '../src/services/notificationEvents';
import {
  applyPlannerSettings,
  editPlanTaskTiming,
  getTodayPlan,
  organizeToday,
  proposedWindow,
  replanRemaining,
  setPlanTaskDone,
  validateWindow,
} from '../src/services/planService';
import { ValidationError } from '../src/utils/errors';
import { createTestDatabase } from '../test-utils/testDatabase';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../src/navigation/navigationRef', () => ({ openInformationDetails: jest.fn(), openPlan: jest.fn() }));

const at = (h: number, min = 0, d = 26) => new Date(2026, 10, d, h, min).getTime();
const time = (ts: number | null) => (ts === null ? null : new Date(ts).toTimeString().slice(0, 5));
const mockedNotifee = notifee as jest.Mocked<typeof notifee>;

const DAY_OFF = { dayStart: '08:00', dayEnd: '22:00', workStart: null, workEnd: null };
const OPTIONS = {
  day: at(7),
  now: at(7),
  dayStart: '08:00',
  dayEnd: '22:00',
  lunch: { start: '12:30', end: '13:30' },
};

describe('day planner: reading the list', () => {
  it('reads durations, fixed times and importance', () => {
    expect(parseTaskLine('Sport 1h', 0)).toMatchObject({ title: 'Sport', durationMin: 60, fixedStartMin: null, important: false });
    expect(parseTaskLine('Call Ahmed 15m', 0)).toMatchObject({ title: 'Call Ahmed', durationMin: 15 });
    expect(parseTaskLine('!Finish report 2h30', 0)).toMatchObject({ title: 'Finish report', durationMin: 150, important: true });
    expect(parseTaskLine('Meeting @14:00 1h', 0)).toMatchObject({ title: 'Meeting', durationMin: 60, fixedStartMin: 14 * 60 });
    expect(parseTaskLine('Réunion à 9h30 45min', 0)).toMatchObject({ title: 'Réunion', durationMin: 45, fixedStartMin: 9 * 60 + 30 });
    expect(parseTaskLine('Dentist @16h', 0)).toMatchObject({ title: 'Dentist', fixedStartMin: 16 * 60, durationMin: 30 });
    expect(parseTaskLine('Revise 1.5h', 0)).toMatchObject({ title: 'Revise', durationMin: 90 });
    expect(parseTaskLine('- Groceries', 0)).toMatchObject({ title: 'Groceries', durationMin: 30 });
  });

  it('skips empty lines and keeps the order', () => {
    const tasks = parseTaskList('A\n\n  \nB 10m\n');
    expect(tasks.map(t => [t.title, t.position])).toEqual([['A', 0], ['B', 1]]);
  });
});

describe('day planner: organizing the day', () => {
  it('starts at the beginning of the day with 5 min gaps', () => {
    const result = organizeDay(parseTaskList('A 1h\nB 30m'), OPTIONS);
    expect(result.map(t => [t.title, time(t.startAt), time(t.endAt)])).toEqual([
      ['A', '08:00', '09:00'],
      ['B', '09:05', '09:35'],
    ]);
  });

  it('starts from now (rounded to 5 min) when the day already began', () => {
    const [task] = organizeDay(parseTaskList('A 30m'), { ...OPTIONS, now: at(10, 12) });
    expect(time(task.startAt)).toBe('10:15');
  });

  it('puts important tasks first and keeps fixed times', () => {
    const result = organizeDay(parseTaskList('Normal 1h\n!Urgent 1h\nMeeting @09:30 30m'), OPTIONS);
    expect(result.map(t => [t.title, time(t.startAt)])).toEqual([
      ['Urgent', '08:00'],
      ['Meeting', '09:30'],
      ['Normal', '10:05'], // does not fit before the meeting (5 min gap kept)
    ]);
  });

  it('keeps lunch free and adds a break after 2 hours of work', () => {
    const result = organizeDay(parseTaskList('A 1h\nB 1h\nC 1h\nD 1h'), { ...OPTIONS, now: at(9) });
    expect(result.map(t => [t.title, time(t.startAt)])).toEqual([
      ['A', '09:00'],
      ['B', '10:05'], // A + B = 2 h -> 15 min break
      ['C', '11:20'],
      ['D', '13:30'], // would overlap lunch (12:30-13:30)
    ]);
  });

  it('returns tasks that do not fit as unscheduled', () => {
    const result = organizeDay(parseTaskList('Long 3h\nShort 30m'), { ...OPTIONS, now: at(20) });
    expect(result.map(t => [t.title, time(t.startAt)])).toEqual([
      ['Short', '20:00'],
      ['Long', null],
    ]);
  });
});

describe('day planner: service (SQLite + notifications)', () => {
  let db: AppDatabase;
  let nowSpy: jest.SpyInstance;
  const NOW = at(9);

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    db.close();
  });

  it('organizes and stores today, and schedules a notification per future task', async () => {
    const { plan, warning } = await organizeToday('Sport 1h\nRead 20m', NOW, DAY_OFF);
    expect(warning).toBeNull();
    expect(plan.planDate).toBe(dateKey(NOW));
    expect(plan.tasks.map(t => [t.title, time(t.startAt)])).toEqual([
      ['Sport', '09:00'],
      ['Read', '10:05'],
    ]);
    const ids = mockedNotifee.createTriggerNotification.mock.calls.map(([n]) => n.id);
    expect(ids).toEqual(plan.tasks.filter(t => t.startAt! > NOW).map(t => `plan-task-${t.id}`));
    expect(await getTodayPlan(NOW)).toMatchObject({ rawInput: 'Sport 1h\nRead 20m' });
  });

  it('rejects an empty list', async () => {
    await expect(organizeToday('  \n ', NOW)).rejects.toBeInstanceOf(ValidationError);
  });

  it('re-plans only the remaining tasks from now', async () => {
    const { plan } = await organizeToday('A 1h\nB 1h', NOW, DAY_OFF);
    await setPlanTaskDone(plan.tasks[0].id, true, NOW);
    const later = at(15, 2);
    const { plan: replanned } = await replanRemaining(later);
    expect(replanned.tasks.map(t => [t.title, t.isDone, time(t.startAt)])).toEqual([
      ['A', true, '09:00'],
      ['B', false, '15:05'],
    ]);
  });

  it('"Done" from the notification checks the task off', async () => {
    const { plan } = await organizeToday('A 1h', NOW, DAY_OFF);
    const id = plan.tasks[0].id;
    await handleNotificationEvent({
      type: 2, // EventType.ACTION_PRESS
      detail: { pressAction: { id: 'plan-done' }, notification: { id: `plan-task-${id}`, data: { planTaskId: String(id) } } },
    } as never);
    expect((await createRepositories(db).plans.findTask(id))?.isDone).toBe(true);
    expect(mockedNotifee.cancelNotification).toHaveBeenCalledWith(`plan-task-${id}`);
  });

  it('schedules the daily morning reminder from the settings', async () => {
    await applyPlannerSettings(NOW);
    const call = mockedNotifee.createTriggerNotification.mock.calls.find(([n]) => n.id === 'plan-morning');
    expect(call?.[1]).toMatchObject({ timestamp: at(7, 0, 27), repeatFrequency: RepeatFrequency.DAILY });

    await createRepositories(db).settings.set('planMorningReminder', false);
    await applyPlannerSettings(NOW);
    expect(mockedNotifee.cancelNotification).toHaveBeenCalledWith('plan-morning');
  });
});

describe('day planner: work day and day window', () => {
  it('plans tasks around work hours', () => {
    const result = organizeDay(parseTaskList('Gym 1h\nShopping 30m\nCook 1h'), {
      ...OPTIONS,
      dayStart: '07:00',
      work: { start: '09:00', end: '17:00' },
    });
    expect(result.map(t => [t.title, time(t.startAt)])).toEqual([
      ['Gym', '07:00'],
      ['Shopping', '08:05'], // still fits before work
      ['Cook', '17:00'], // 1 h does not fit before 09:00 -> after work
    ]);
  });

  it('uses the work schedule from the settings (work days + hours)', () => {
    const settings = {
      ...require('../src/constants').DEFAULT_SETTINGS,
      planWorkStart: '10:00',
      planWorkEnd: '18:00',
    };
    expect(proposedWindow(settings, at(9, 0, 26))).toMatchObject({ workStart: '10:00', workEnd: '18:00' }); // Thursday
    expect(proposedWindow(settings, at(9, 0, 28))).toMatchObject({ workStart: null, workEnd: null }); // Saturday
    // Works on Saturdays, not on Thursdays.
    const custom = { ...settings, planWorkDays: [1, 2, 3, 6] };
    expect(proposedWindow(custom, at(9, 0, 26)).workStart).toBeNull();
    expect(proposedWindow(custom, at(9, 0, 28)).workStart).toBe('10:00');
  });

  it('applies the configured breaks and lunch hours', () => {
    const tasks = parseTaskList('A 1h\nB 1h\nC 30m');
    const noBreak = organizeDay(tasks, { ...OPTIONS, now: at(8), breakMinutes: 0, lunch: null });
    expect(noBreak.map(t => time(t.startAt))).toEqual(['08:00', '09:05', '10:10']);
    const hourly = organizeDay(tasks, { ...OPTIONS, now: at(8), breakMinutes: 30, breakAfterMinutes: 60 });
    expect(hourly.map(t => time(t.startAt))).toEqual(['08:00', '09:30', '11:00']);
    const lateLunch = organizeDay(parseTaskList('A 3h\nB 1h'), {
      ...OPTIONS,
      now: at(10),
      breakMinutes: 0,
      lunch: { start: '13:00', end: '14:00' },
    });
    expect(lateLunch.map(t => time(t.startAt))).toEqual(['10:00', '14:00']);
  });

  it('validates the window', () => {
    expect(validateWindow({ dayStart: '08:00', dayEnd: '22:00', workStart: null, workEnd: null })).toEqual({});
    expect(validateWindow({ dayStart: '22:00', dayEnd: '08:00', workStart: null, workEnd: null })).toHaveProperty('day');
    expect(validateWindow({ dayStart: '08:00', dayEnd: '22:00', workStart: '17:00', workEnd: '09:00' })).toHaveProperty('work');
  });
});

describe('day planner: saving the day window', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
  });

  afterEach(() => db.close());

  it('stores the window of the day and keeps it when re-planning', async () => {
    const window = { dayStart: '07:00', dayEnd: '23:00', workStart: '08:30', workEnd: '16:30' };
    // 2 h does not fit before work (07:00 -> 09:00 overlaps 08:30) -> after work.
    const { plan } = await organizeToday('Gym 2h', at(7), window);
    expect(plan.window).toEqual(window);
    expect(time(plan.tasks[0].startAt)).toBe('16:30');


    const { plan: replanned } = await replanRemaining(at(7, 30));
    expect(replanned.window).toEqual(window);
    expect(time(replanned.tasks[0].startAt)).toBe('16:30');
  });

  it('uses the settings work schedule when no exception is given', async () => {
    const repos = createRepositories(db);
    await repos.settings.set('planWorkStart', '08:00');
    await repos.settings.set('planWorkEnd', '16:00');
    const { plan } = await organizeToday('Gym 1h', at(7, 0, 26)); // Thursday = work day
    expect(plan.window).toMatchObject({ workStart: '08:00', workEnd: '16:00' });
    expect(time(plan.tasks[0].startAt)).toBe('16:00');
  });

  it('rejects an invalid window', async () => {
    await expect(
      organizeToday('Gym 1h', at(7), { dayStart: '08:00', dayEnd: '22:00', workStart: '17:00', workEnd: '09:00' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('day planner: editing the time of a task', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDatabase();
    (getDatabase as jest.Mock).mockResolvedValue(db);
  });

  afterEach(() => db.close());

  it('pins a task to a new time and re-plans the others around it', async () => {
    const { plan } = await organizeToday('A 1h\nB 1h\nC 30m', at(8), DAY_OFF);
    expect(plan.tasks.map(t => time(t.startAt))).toEqual(['08:00', '09:05', '10:20']); // 15 min break after 2 h

    const b = plan.tasks[1];
    const { plan: edited } = await editPlanTaskTiming(b.id, { durationMin: 45, fixedStartMin: 8 * 60 + 30 }, at(8));
    const byTitle = Object.fromEntries(edited.tasks.map(t => [t.title, [time(t.startAt), t.durationMin]]));
    expect(byTitle).toEqual({
      B: ['08:30', 45], // pinned at 08:30 for 45 min
      A: ['09:20', 60], // 1 h does not fit before 08:25 -> after B (+5 min)
      C: ['10:25', 30],
    });
    expect(edited.tasks.find(t => t.title === 'B')?.fixedStartMin).toBe(8 * 60 + 30);
  });

  it('unpins a task so the app places it again', async () => {
    const { plan } = await organizeToday('A 1h @15:00\nB 30m', at(8), DAY_OFF);
    const a = plan.tasks.find(t => t.title === 'A')!;
    const { plan: edited } = await editPlanTaskTiming(a.id, { durationMin: 60, fixedStartMin: null }, at(8));
    expect(edited.tasks.map(t => [t.title, time(t.startAt)])).toEqual([
      ['A', '08:00'],
      ['B', '09:05'],
    ]);
  });

  it('rejects an invalid duration', async () => {
    const { plan } = await organizeToday('A 1h', at(8), DAY_OFF);
    await expect(
      editPlanTaskTiming(plan.tasks[0].id, { durationMin: 2, fixedStartMin: null }, at(8)),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
