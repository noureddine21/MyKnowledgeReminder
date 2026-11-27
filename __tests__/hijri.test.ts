import { isArabicText } from '../src/theme';
import { toHijri } from '../src/utils/hijri';

describe('hijri date (tabular, ±1 day)', () => {
  it('converts known dates', () => {
    // 1 Muharram 1446 ≈ 7 July 2024; 1 Ramadan 1445 ≈ 11 March 2024.
    const muharram = toHijri(new Date(2024, 6, 7, 12).getTime());
    expect(muharram.month).toBe(1);
    expect(muharram.year).toBe(1446);
    expect(Math.abs(muharram.day - 1)).toBeLessThanOrEqual(1);
    const ramadan = toHijri(new Date(2024, 2, 11, 12).getTime());
    expect([ramadan.month, ramadan.year]).toEqual([9, 1445]);
    expect(ramadan.day).toBeLessThanOrEqual(2);
  });

  it('detects Arabic text', () => {
    expect(isArabicText('إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ')).toBe(true);
    expect(isArabicText('Ayat al-Kursi (آية الكرسي)')).toBe(false);
    expect(isArabicText('123 ...')).toBe(false);
  });
});
