/**
 * Browser-native Translator API wrapper (Chrome 138+).
 * Free, on-device translation. Falls back gracefully when unavailable.
 *
 * Spec: https://developer.chrome.com/docs/ai/translator-api
 */

type TargetLang = "ko" | "en" | "ja" | "zh-CN";

// In-memory translator instance cache, keyed by `${source}->${target}`
const translatorCache = new Map<string, any>();
// Detector instance is reusable
let detectorPromise: Promise<any> | null = null;

const getTranslatorAPI = (): any => {
  if (typeof window === "undefined") return null;
  // Standardized location is `self.Translator` (Chrome 138+).
  // Older origin-trial builds exposed it under `window.translation`.
  return (window as any).Translator ?? (window as any).translation ?? null;
};

const getDetectorAPI = (): any => {
  if (typeof window === "undefined") return null;
  return (window as any).LanguageDetector ?? (window as any).translation ?? null;
};

/** Returns true if the browser exposes the Translator API at all. */
export const isBrowserTranslatorSupported = (): boolean => !!getTranslatorAPI();

const detectLanguage = async (text: string): Promise<string | null> => {
  const api = getDetectorAPI();
  if (!api?.create && !api?.createDetector) return null;
  try {
    if (!detectorPromise) {
      detectorPromise = api.create
        ? api.create()
        : api.createDetector();
    }
    const detector = await detectorPromise;
    const results = await detector.detect(text);
    const top = results?.[0];
    return top?.detectedLanguage || null;
  } catch (e) {
    console.warn("[browserTranslator] detect failed:", e);
    return null;
  }
};

const normalizeLang = (code: string | null | undefined): string => {
  if (!code) return "";
  const lower = code.toLowerCase();
  if (lower.startsWith("zh")) return "zh"; // Translator API uses bare 'zh'
  return lower.split("-")[0];
};

const targetForAPI = (target: TargetLang): string => {
  // Translator API expects 'zh' (or 'zh-Hans') instead of 'zh-CN'
  if (target === "zh-CN") return "zh-Hans";
  return target;
};

const getOrCreateTranslator = async (
  source: string,
  target: TargetLang
): Promise<any | null> => {
  const api = getTranslatorAPI();
  if (!api) return null;
  const sourceNorm = normalizeLang(source);
  const targetNorm = targetForAPI(target);
  if (!sourceNorm || sourceNorm === normalizeLang(target)) return null;

  const key = `${sourceNorm}->${targetNorm}`;
  if (translatorCache.has(key)) return translatorCache.get(key);

  try {
    // Check availability — may need to download a model
    if (typeof api.availability === "function") {
      const status = await api.availability({
        sourceLanguage: sourceNorm,
        targetLanguage: targetNorm,
      });
      if (status === "unavailable") return null;
    }
    const translator = await api.create({
      sourceLanguage: sourceNorm,
      targetLanguage: targetNorm,
    });
    translatorCache.set(key, translator);
    return translator;
  } catch (e) {
    console.warn(`[browserTranslator] create(${key}) failed:`, e);
    return null;
  }
};

/**
 * Try to translate text using the browser's built-in Translator API.
 * Returns the translated string on success, or `null` if unsupported / failed.
 * Caller should fall back to server-side AI translation when null is returned.
 */
export const tryBrowserTranslate = async (
  text: string,
  target: TargetLang,
  sourceHint?: string | null
): Promise<string | null> => {
  if (!isBrowserTranslatorSupported() || !text.trim()) return null;

  // Determine source language: trust the hint if provided, otherwise detect
  let source = sourceHint && sourceHint !== "auto" ? sourceHint : "";
  if (!source) {
    source = (await detectLanguage(text)) || "";
  }
  if (!source) return null;
  if (normalizeLang(source) === normalizeLang(target)) return null;

  const translator = await getOrCreateTranslator(source, target);
  if (!translator) return null;

  try {
    const out = await translator.translate(text);
    return typeof out === "string" && out.trim() ? out : null;
  } catch (e) {
    console.warn("[browserTranslator] translate failed:", e);
    return null;
  }
};
