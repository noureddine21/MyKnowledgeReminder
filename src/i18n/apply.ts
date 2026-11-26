import { I18nManager } from 'react-native';
import { isRTL, resolveLanguage, setLanguage, type Language, type LanguageSetting } from './index';

/**
 * Activates the interface language. Arabic also needs right-to-left layout, which
 * Android applies at the next app start: returns true when a restart is needed.
 */
export function applyLanguage(setting: LanguageSetting): { language: Language; restartNeeded: boolean } {
  const language = resolveLanguage(setting);
  setLanguage(language);
  const wantRTL = isRTL(language);
  let restartNeeded = false;
  try {
    I18nManager.allowRTL(wantRTL);
    if (I18nManager.isRTL !== wantRTL) {
      I18nManager.forceRTL(wantRTL);
      restartNeeded = true;
    }
  } catch {
    // RTL switching is best effort (not available in tests).
  }
  return { language, restartNeeded };
}
