/**
 * UI string overrides loaded from the `ui_translations` table.
 *
 * Static JSON files in src/i18n/locales are the baseline.
 * Admin-edited values stored in DB are merged on top via i18next.addResourceBundle.
 */
import i18n from "i18next";
import { supabase } from "@/integrations/supabase/client";

export type UiLang = "en" | "ja" | "zh-CN" | "yue";
export const UI_LANGS: UiLang[] = ["en", "ja", "zh-CN", "yue"];

/**
 * Flatten a nested object into dot-separated keys.
 * { common: { save: "Save" } } -> { "common.save": "Save" }
 */
export function flattenKeys(obj: any, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const newKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenKeys(v, newKey));
    } else if (typeof v === "string") {
      out[newKey] = v;
    }
  }
  return out;
}

/**
 * Take a flat dot-key object and merge it into an i18next resource bundle
 * for the given language. Existing nested structure is preserved by i18next.
 */
function flatToNested(flat: Record<string, string>): Record<string, any> {
  const nested: Record<string, any> = {};
  for (const k of Object.keys(flat)) {
    const parts = k.split(".");
    let cur = nested;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = flat[k];
  }
  return nested;
}

/**
 * Fetch all DB overrides and merge into i18next.
 */
export async function loadUiOverrides(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("ui_translations" as any)
      .select("key, language_code, value");
    if (error || !data) return;

    const byLang: Record<string, Record<string, string>> = {};
    for (const row of data as any[]) {
      const lc = row.language_code as string;
      if (!UI_LANGS.includes(lc as UiLang)) continue;
      (byLang[lc] ||= {})[row.key] = row.value;
    }

    for (const lc of Object.keys(byLang)) {
      const nested = flatToNested(byLang[lc]);
      // deepMerge=true so we only override the touched keys
      i18n.addResourceBundle(lc, "translation", nested, true, true);
    }
  } catch (e) {
    // Silent fail — fall back to static JSON
    // eslint-disable-next-line no-console
    console.warn("[i18n] failed to load UI overrides", e);
  }
}
