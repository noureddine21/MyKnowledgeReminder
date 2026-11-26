import { resolveLanguage, setLanguage, tr, trn } from '../src/i18n';
import { buildReminderMessage } from '../src/services/notificationService';
import { formatLongToday, formatRelative } from '../src/utils/date';
import { formatRecurrence } from '../src/utils/recurrence';

const at = (d: number, h = 9) => new Date(2026, 10, d, h).getTime();

describe('i18n', () => {
  afterEach(() => setLanguage('en'));

  it('falls back to English and fills variables', () => {
    expect(tr('Organize my day')).toBe('Organize my day');
    expect(tr('Unknown text {x}', { x: 1 })).toBe('Unknown text 1');
    setLanguage('fr');
    expect(tr('Organize my day')).toBe('Organiser ma journée');
    expect(trn('{n} item to review', '{n} items to review', 3)).toBe('3 éléments à réviser');
    expect(trn('{n} item to review', '{n} items to review', 1)).toBe('1 élément à réviser');
  });

  it('translates dates, recurrences and notifications', () => {
    setLanguage('fr');
    expect(formatLongToday(at(26))).toBe('Jeudi, 26 nov.');
    expect(formatRelative(at(27), at(26, 8))).toBe('Demain, 09:00');
    expect(formatRecurrence('hourly', 3)).toBe('Toutes les 3 heures');
    expect(formatRecurrence('daily', 2)).toBe('Tous les 2 jours');
    expect(buildReminderMessage('Ayat al-Kursi', 'Quran').body).toBe('Révisez votre verset enregistré : Ayat al-Kursi');
    setLanguage('ar');
    expect(tr('Settings')).toBe('الإعدادات');
    expect(formatRelative(at(26, 10), at(26, 8))).toBe('اليوم، 10:00');
  });

  it('follows the phone language only for supported languages', () => {
    expect(resolveLanguage('fr')).toBe('fr');
    expect(resolveLanguage('system', 'fr-FR')).toBe('fr');
    expect(resolveLanguage('system', 'ar-MA')).toBe('ar');
    expect(resolveLanguage('system', 'de-DE')).toBe('en');
  });
});
