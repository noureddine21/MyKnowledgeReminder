/**
 * Prayer times, calculated offline (adhan library) for the city chosen in Settings.
 * Used only by the day planner: no task is planned during a prayer.
 * (No prayer notifications: the user already has a dedicated prayer app.)
 */
import { CalculationMethod, CalculationParameters, Coordinates, PrayerTimes } from 'adhan';

export type PrayerMethod =
  | 'morocco'
  | 'algeria'
  | 'tunisia'
  | 'mwl'
  | 'egypt'
  | 'ummAlQura'
  | 'dubai'
  | 'turkey'
  | 'northAmerica';

export interface PrayerCity {
  id: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  method: PrayerMethod;
}

/** Built-in list (no GPS, no permission). */
export const PRAYER_CITIES: PrayerCity[] = [
  { id: 'casablanca', name: 'Casablanca', country: 'Morocco', latitude: 33.5731, longitude: -7.5898, method: 'morocco' },
  { id: 'rabat', name: 'Rabat', country: 'Morocco', latitude: 34.0209, longitude: -6.8416, method: 'morocco' },
  { id: 'fes', name: 'Fès', country: 'Morocco', latitude: 34.0181, longitude: -5.0078, method: 'morocco' },
  { id: 'marrakech', name: 'Marrakech', country: 'Morocco', latitude: 31.6295, longitude: -7.9811, method: 'morocco' },
  { id: 'tanger', name: 'Tanger', country: 'Morocco', latitude: 35.7595, longitude: -5.834, method: 'morocco' },
  { id: 'meknes', name: 'Meknès', country: 'Morocco', latitude: 33.8935, longitude: -5.5473, method: 'morocco' },
  { id: 'agadir', name: 'Agadir', country: 'Morocco', latitude: 30.4278, longitude: -9.5981, method: 'morocco' },
  { id: 'oujda', name: 'Oujda', country: 'Morocco', latitude: 34.6814, longitude: -1.9086, method: 'morocco' },
  { id: 'tetouan', name: 'Tétouan', country: 'Morocco', latitude: 35.5889, longitude: -5.3626, method: 'morocco' },
  { id: 'kenitra', name: 'Kénitra', country: 'Morocco', latitude: 34.261, longitude: -6.5802, method: 'morocco' },
  { id: 'laayoune', name: 'Laâyoune', country: 'Morocco', latitude: 27.1253, longitude: -13.1625, method: 'morocco' },
  { id: 'alger', name: 'Alger', country: 'Algeria', latitude: 36.7538, longitude: 3.0588, method: 'algeria' },
  { id: 'oran', name: 'Oran', country: 'Algeria', latitude: 35.6971, longitude: -0.6308, method: 'algeria' },
  { id: 'constantine', name: 'Constantine', country: 'Algeria', latitude: 36.365, longitude: 6.6147, method: 'algeria' },
  { id: 'tunis', name: 'Tunis', country: 'Tunisia', latitude: 36.8065, longitude: 10.1815, method: 'tunisia' },
  { id: 'sfax', name: 'Sfax', country: 'Tunisia', latitude: 34.7406, longitude: 10.7603, method: 'tunisia' },
  { id: 'paris', name: 'Paris', country: 'France', latitude: 48.8566, longitude: 2.3522, method: 'mwl' },
  { id: 'lyon', name: 'Lyon', country: 'France', latitude: 45.764, longitude: 4.8357, method: 'mwl' },
  { id: 'marseille', name: 'Marseille', country: 'France', latitude: 43.2965, longitude: 5.3698, method: 'mwl' },
  { id: 'lille', name: 'Lille', country: 'France', latitude: 50.6292, longitude: 3.0573, method: 'mwl' },
  { id: 'toulouse', name: 'Toulouse', country: 'France', latitude: 43.6047, longitude: 1.4442, method: 'mwl' },
  { id: 'strasbourg', name: 'Strasbourg', country: 'France', latitude: 48.5734, longitude: 7.7521, method: 'mwl' },
  { id: 'bruxelles', name: 'Bruxelles', country: 'Belgium', latitude: 50.8503, longitude: 4.3517, method: 'mwl' },
  { id: 'amsterdam', name: 'Amsterdam', country: 'Netherlands', latitude: 52.3676, longitude: 4.9041, method: 'mwl' },
  { id: 'madrid', name: 'Madrid', country: 'Spain', latitude: 40.4168, longitude: -3.7038, method: 'mwl' },
  { id: 'barcelona', name: 'Barcelona', country: 'Spain', latitude: 41.3874, longitude: 2.1686, method: 'mwl' },
  { id: 'london', name: 'London', country: 'United Kingdom', latitude: 51.5072, longitude: -0.1276, method: 'mwl' },
  { id: 'berlin', name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405, method: 'mwl' },
  { id: 'montreal', name: 'Montréal', country: 'Canada', latitude: 45.5019, longitude: -73.5674, method: 'northAmerica' },
  { id: 'cairo', name: 'Cairo', country: 'Egypt', latitude: 30.0444, longitude: 31.2357, method: 'egypt' },
  { id: 'makkah', name: 'Makkah', country: 'Saudi Arabia', latitude: 21.3891, longitude: 39.8579, method: 'ummAlQura' },
  { id: 'madinah', name: 'Madinah', country: 'Saudi Arabia', latitude: 24.5247, longitude: 39.5692, method: 'ummAlQura' },
  { id: 'riyadh', name: 'Riyadh', country: 'Saudi Arabia', latitude: 24.7136, longitude: 46.6753, method: 'ummAlQura' },
  { id: 'dubai', name: 'Dubai', country: 'United Arab Emirates', latitude: 25.2048, longitude: 55.2708, method: 'dubai' },
  { id: 'istanbul', name: 'Istanbul', country: 'Turkey', latitude: 41.0082, longitude: 28.9784, method: 'turkey' },
  { id: 'dakar', name: 'Dakar', country: 'Senegal', latitude: 14.7167, longitude: -17.4677, method: 'mwl' },
];

export function findPrayerCity(id: string | null | undefined): PrayerCity | null {
  return PRAYER_CITIES.find(c => c.id === id) ?? null;
}

function parameters(method: PrayerMethod): CalculationParameters {
  const custom = (fajr: number, isha: number) => {
    const params = CalculationMethod.Other();
    params.fajrAngle = fajr;
    params.ishaAngle = isha;
    return params;
  };
  switch (method) {
    case 'morocco':
      return custom(19, 17); // Ministry of Habous and Islamic Affairs
    case 'algeria':
      return custom(18, 17);
    case 'tunisia':
      return custom(18, 18);
    case 'egypt':
      return CalculationMethod.Egyptian();
    case 'ummAlQura':
      return CalculationMethod.UmmAlQura();
    case 'dubai':
      return CalculationMethod.Dubai();
    case 'turkey':
      return CalculationMethod.Turkey();
    case 'northAmerica':
      return CalculationMethod.NorthAmerica();
    default:
      return CalculationMethod.MuslimWorldLeague();
  }
}

export type PrayerName = 'Fajr' | 'Dhuhr' | "Jumu'ah" | 'Asr' | 'Maghrib' | 'Isha';

export interface PrayerBlock {
  name: PrayerName;
  start: number;
  end: number;
}

/** Minimum time kept free for Friday prayer (khutbah + prayer). */
export const JUMUAH_MINUTES = 60;

/**
 * The prayers of `day` as busy blocks of `minutes` starting at each prayer time
 * (Friday's Dhuhr becomes Jumu'ah, at least 60 min).
 */
export function prayerBlocks(city: PrayerCity, day: number, minutes: number): PrayerBlock[] {
  const date = new Date(day);
  const times = new PrayerTimes(new Coordinates(city.latitude, city.longitude), date, parameters(city.method));
  const friday = date.getDay() === 5;
  const entries: [PrayerName, Date, number][] = [
    ['Fajr', times.fajr, minutes],
    [friday ? "Jumu'ah" : 'Dhuhr', times.dhuhr, friday ? Math.max(minutes, JUMUAH_MINUTES) : minutes],
    ['Asr', times.asr, minutes],
    ['Maghrib', times.maghrib, minutes],
    ['Isha', times.isha, minutes],
  ];
  return entries
    .filter(([, time]) => time instanceof Date && !Number.isNaN(time.getTime()))
    .map(([name, time, length]) => ({ name, start: time.getTime(), end: time.getTime() + length * 60_000 }));
}
