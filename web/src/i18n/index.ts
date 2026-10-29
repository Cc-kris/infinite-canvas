import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enUS from "@/i18n/locales/en-US";
import zhCN from "@/i18n/locales/zh-CN";

export type AppLocale = "zh-CN" | "en-US";

const LOCALE_STORAGE_KEY = "infinite-canvas:locale";

/** SSR/无 DOM 环境（bun 测试、首屏服务端渲染）没有 localStorage，不能在建模块时直接读。 */
function readStoredLocale(): AppLocale | null {
    try {
        if (typeof localStorage === "undefined") return null;
        const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
        return raw === "zh-CN" || raw === "en-US" ? raw : null;
    } catch {
        return null;
    }
}

i18n.use(initReactI18next).init({
    resources: {
        "zh-CN": { translation: zhCN },
        "en-US": { translation: enUS },
    },
    lng: readStoredLocale() ?? "zh-CN",
    fallbackLng: "zh-CN",
    supportedLngs: ["zh-CN", "en-US"],
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
});

export function changeAppLocale(locale: AppLocale) {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    return i18n.changeLanguage(locale);
}

export default i18n;
