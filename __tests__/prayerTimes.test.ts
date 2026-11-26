import { DEFAULT_SETTINGS } from '../src/constants';
import { organizeDay, parseTaskList } from '../src/services/dayPlanner';
import { prayersToAvoid } from '../src/services/planService';
import { findPrayerCity, prayerBlocks, PRAYER_CITIES } from '../src/services/prayerTimes';

jest.mock('../src/database/connection', () => ({ getDatabase: jest.fn() }));

const CASABLANCA_OFFSET_HOURS = 1; // Morocco: UTC+1
/** Wall-clock time in Casablanca, whatever the machine time zone. */
const casaTime = (ts: number) => {
  const d = new Date(ts + CASABLANCA_OFFSET_HOURS * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

describe('prayer times (offline)', () => {
  const casa = findPrayerCity('casablanca')!;
  // Thursday 26 Nov 2026, noon UTC.
  const thursday = Date.UTC(2026, 10, 26, 12);

  it('calculates the five prayers for Casablanca (Morocco 19°/17°)', () => {
    const blocks = prayerBlocks(casa, thursday, 20);
    expect(blocks.map(b => [b.name, casaTime(b.start)])).toEqual([
      ['Fajr', '06:40'],
      ['Dhuhr', '13:18'],
      ['Asr', '16:03'],
      ['Maghrib', '18:23'],
      ['Isha', '19:45'],
    ]);
    expect(blocks.every(b => b.end - b.start === 20 * 60_000)).toBe(true);
  });

  it("keeps at least 1 h for Jumu'ah on Friday", () => {
    const friday = Date.UTC(2026, 10, 27, 12);
    const jumuah = prayerBlocks(casa, friday, 20).find(b => b.name === "Jumu'ah")!;
    expect(jumuah.end - jumuah.start).toBe(60 * 60_000);
  });

  it('has a valid built-in city list', () => {
    expect(new Set(PRAYER_CITIES.map(c => c.id)).size).toBe(PRAYER_CITIES.length);
    expect(PRAYER_CITIES.every(c => /^[a-z]+$/.test(c.id))).toBe(true);
  });

  it('only avoids prayers when enabled and a city is chosen', () => {
    expect(prayersToAvoid({ ...DEFAULT_SETTINGS, planAvoidPrayers: true, planPrayerCity: null }, thursday)).toEqual([]);
    expect(prayersToAvoid({ ...DEFAULT_SETTINGS, planAvoidPrayers: false, planPrayerCity: 'casablanca' }, thursday)).toEqual([]);
    expect(prayersToAvoid({ ...DEFAULT_SETTINGS, planAvoidPrayers: true, planPrayerCity: 'casablanca' }, thursday)).toHaveLength(5);
  });

  it('never places a task during a busy block (prayer)', () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 26, h, m).getTime();
    const result = organizeDay(parseTaskList('A 1h\nB 30m'), {
      day: at(8),
      now: at(12, 0),
      dayStart: '08:00',
      dayEnd: '22:00',
      busy: [{ start: at(12, 50), end: at(13, 10) }],
    });
    const time = (ts: number | null) => new Date(ts!).toTimeString().slice(0, 5);
    expect(result.map(t => [t.title, time(t.startAt)])).toEqual([
      ['A', '13:10'], // 12:00-13:00 would overlap the prayer at 12:50
      ['B', '14:15'],
    ]);
  });
});
