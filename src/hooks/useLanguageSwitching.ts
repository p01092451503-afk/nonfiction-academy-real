import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Returns `true` for a brief moment whenever the active i18n language changes.
 * Use this to keep skeletons visible while language-scoped queries are
 * invalidated and refetched, preventing a flash of stale/wrong-language data.
 *
 * @param holdMs Minimum time the switching flag stays true (ms). Default 400.
 */
export function useLanguageSwitching(holdMs: number = 400): boolean {
  const { i18n } = useTranslation();
  const [switching, setSwitching] = useState(false);
  const prevLang = useRef(i18n.language);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevLang.current === i18n.language) return;
    prevLang.current = i18n.language;
    setSwitching(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSwitching(false), holdMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [i18n.language, holdMs]);

  return switching;
}
