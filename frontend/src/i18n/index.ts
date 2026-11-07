import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// NOTE: Translations are currently loaded eagerly. With only 2 languages and
// 5 small JSON files, the overhead is minimal (~15KB). Consider lazy-loading
// with i18next-http-backend when adding more languages or larger translation files.
import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enDashboard from './locales/en/dashboard.json';
import enSettings from './locales/en/settings.json';
import enAccount from './locales/en/account.json';

import pcmCommon from './locales/pcm/common.json';
import pcmNav from './locales/pcm/nav.json';
import pcmDashboard from './locales/pcm/dashboard.json';
import pcmSettings from './locales/pcm/settings.json';
import pcmAccount from './locales/pcm/account.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        nav: enNav,
        dashboard: enDashboard,
        settings: enSettings,
        account: enAccount,
      },
      pcm: {
        common: pcmCommon,
        nav: pcmNav,
        dashboard: pcmDashboard,
        settings: pcmSettings,
        account: pcmAccount,
      },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
