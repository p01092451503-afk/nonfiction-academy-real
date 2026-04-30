import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ko from './locales/ko.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import zhCN from './locales/zh-CN.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
      ja: { translation: ja },
      'zh-CN': { translation: zhCN },
    },
    fallbackLng: 'ko',
    supportedLngs: ['ko', 'en', 'ja', 'zh-CN'],
    // Keep region codes intact (zh-CN must NOT be truncated to zh)
    load: 'currentOnly',
    nonExplicitSupportedLngs: false,
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'nfl-lang',
      lookupQuerystring: 'lang',
      // Map browser zh / zh-Hans / zh-SG → zh-CN so detection doesn't drop it
      convertDetectedLanguage: (lng: string) => {
        if (!lng) return 'ko';
        const lower = lng.toLowerCase();
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

export default i18n;
