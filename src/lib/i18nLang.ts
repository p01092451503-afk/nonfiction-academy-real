// Centralized helpers for picking the active language across student-facing pages.
// Many existing pages still gate translations as `KO/EN` only — this util normalizes
// the i18next language code to one of the 4 supported codes used in DB i18n tables.

export type SupportedLang = "ko" | "en" | "ja" | "zh-CN" | "yue";

export function normalizeLang(code?: string | null): SupportedLang {
  if (!code) return "ko";
  const lower = code.toLowerCase();
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("ja")) return "ja";
  if (lower === "yue" || lower.startsWith("yue-") ||
      lower === "zh-hk" || lower === "zh-mo" ||
      lower.startsWith("zh-hant-hk") || lower.startsWith("zh-yue")) return "yue";
  if (lower.startsWith("zh")) return "zh-CN";
  return "ko";
}

/**
 * Pick the best translation for a row that has a `*_i18n` array of
 * `{ language_code, ...translatable fields }`.
 * Falls back to the original row when no translation exists.
 */
export function pickI18n<T extends { language_code: string }>(
  list: T[] | null | undefined,
  lang: SupportedLang
): T | undefined {
  if (!list || list.length === 0) return undefined;
  // exact match
  const exact = list.find((x) => x.language_code === lang);
  if (exact) return exact;
  // generic prefix match (e.g. "zh" matching "zh-CN")
  const prefix = list.find((x) => x.language_code.startsWith(lang.split("-")[0]));
  return prefix;
}
