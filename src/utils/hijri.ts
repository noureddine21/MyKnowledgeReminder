/**
 * Hijri (Islamic) date, computed offline with the tabular "Kuwaiti" algorithm.
 * It can differ by a day from the official moon-sighting calendar, so it is
 * only shown as an indication on the home screen.
 */
export const HIJRI_MONTHS = [
  'Muharram',
  'Safar',
  "Rabi' I",
  "Rabi' II",
  'Jumada I',
  'Jumada II',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qi'dah",
  'Dhu al-Hijjah',
];

export interface HijriDate {
  day: number;
  /** 1-12 */
  month: number;
  year: number;
}

export function toHijri(ts: number): HijriDate {
  const date = new Date(ts);
  const day = date.getDate();
  let month = date.getMonth() + 1;
  let year = date.getFullYear();
  if (month < 3) {
    year -= 1;
    month += 12;
  }
  // Julian day (Gregorian calendar).
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  const jd = Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524;

  // Kuwaiti algorithm (arithmetical Islamic calendar).
  const iyear = 10631 / 30;
  const epochAstro = 1948084;
  const shift = 8.01 / 60;
  let z = jd - epochAstro;
  const cycle = Math.floor(z / 10631);
  z -= 10631 * cycle;
  const j = Math.floor((z - shift) / iyear);
  const hYear = 30 * cycle + j;
  z -= Math.floor(j * iyear + shift);
  let hMonth = Math.floor((z + 28.5001) / 29.5);
  if (hMonth === 13) {
    hMonth = 12;
  }
  const hDay = z - Math.floor(29.5001 * hMonth - 29);
  return { day: hDay, month: hMonth, year: hYear };
}
