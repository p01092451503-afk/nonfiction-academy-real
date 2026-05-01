import { translateKoTo, type TargetLang } from "@/lib/translate";

const TARGETS: TargetLang[] = ["en", "ja", "zh-CN"];

export interface NotificationI18n {
  ko: string;
  en: string;
  ja: string;
  "zh-CN": string;
}

/**
 * Translates a Korean title + message into en/ja/zh-CN concurrently.
 * Returns JSONB-ready maps. Falls back to KO on failure.
 */
export async function buildNotificationI18n(koTitle: string, koMessage: string): Promise<{
  title_i18n: NotificationI18n;
  message_i18n: NotificationI18n;
}> {
  const title_i18n: NotificationI18n = { ko: koTitle, en: koTitle, ja: koTitle, "zh-CN": koTitle };
  const message_i18n: NotificationI18n = { ko: koMessage, en: koMessage, ja: koMessage, "zh-CN": koMessage };

  await Promise.all(
    TARGETS.map(async (lc) => {
      try {
        const [tt, tm] = await translateKoTo(lc, [koTitle, koMessage]);
        if (tt) title_i18n[lc] = tt;
        if (tm) message_i18n[lc] = tm;
      } catch {
        // Keep KO fallback
      }
    })
  );

  return { title_i18n, message_i18n };
}

/**
 * Picks the best translation from a JSONB i18n map for the current language.
 * Falls back to ko, then to the provided base text.
 */
export function pickNotificationText(
  i18nMap: Record<string, string> | null | undefined,
  lang: string,
  fallback: string
): string {
  if (!i18nMap || typeof i18nMap !== "object") return fallback;
  return i18nMap[lang] || i18nMap.ko || fallback;
}
