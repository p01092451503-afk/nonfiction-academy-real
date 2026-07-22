import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ko from './locales/ko.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import zhCN from './locales/zh-CN.json';
import yue from './locales/yue.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
      ja: { translation: ja },
      'zh-CN': { translation: zhCN },
      yue: { translation: yue },
    },
    // KO를 모든 비KO 로케일의 폴백으로 사용 — 새 키가 EN/JA/ZH/YUE에 아직 없어도 한국어로라도 표시됨
    fallbackLng: { 'en': ['ko'], 'ja': ['ko'], 'zh-CN': ['ko'], 'yue': ['ko'], default: ['ko'] },
    supportedLngs: ['ko', 'en', 'ja', 'zh-CN', 'yue'],
    // 빈 문자열도 "값 없음"으로 보고 폴백을 타도록
    returnEmptyString: false,
    returnNull: false,
    // 개발 모드에서 누락 키를 콘솔에 경고 — 새 키 추가 시 즉시 알림
    saveMissing: import.meta.env?.DEV ?? false,
    missingKeyHandler: (lngs, _ns, key, fallbackValue) => {
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn(
          `[i18n] missing key "${key}" in [${(lngs || []).join(', ')}] — KO 폴백 사용. ` +
          `다음 명령으로 자동 채우기: npm run i18n:sync`,
          fallbackValue ? `(fallback: "${fallbackValue}")` : ''
        );
      }
    },
    // Keep region codes intact (zh-CN must NOT be truncated to zh)
    load: 'currentOnly',
    nonExplicitSupportedLngs: false,
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'nfl-lang',
      lookupQuerystring: 'lang',
      // Map browser zh / zh-Hans / zh-SG → zh-CN, and zh-HK / zh-Hant-HK / zh-MO / yue → yue
      convertDetectedLanguage: (lng: string) => {
        if (!lng) return 'ko';
        const lower = lng.toLowerCase();
        if (lower === 'yue' || lower.startsWith('yue-') ||
            lower === 'zh-hk' || lower === 'zh-mo' ||
            lower.startsWith('zh-hant-hk') || lower.startsWith('zh-yue')) return 'yue';
        if (lower === 'zh' || lower.startsWith('zh-hans') || lower === 'zh-sg' || lower === 'zh-cn') return 'zh-CN';
        if (lower.startsWith('zh')) return 'zh-CN';
        if (lower.startsWith('ja')) return 'ja';
        if (lower.startsWith('en')) return 'en';
        if (lower.startsWith('ko')) return 'ko';
        return 'ko';
      },
    },
    interpolation: { escapeValue: false },
  });

// Reflect language on <html lang> for accessibility & font-family rules
const setHtmlLang = (lng: string) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
  }
};
setHtmlLang(i18n.language);
i18n.on('languageChanged', setHtmlLang);

// Merge admin-edited UI string overrides from DB on top of static JSON.
// Non-blocking — UI renders with static strings first, then re-renders when overrides arrive.
import('./uiOverrides').then(({ loadUiOverrides }) => loadUiOverrides());

export default i18n;
