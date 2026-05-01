import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { useLanguageSwitching } from "./useLanguageSwitching";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: "ko",
    fallbackLng: "ko",
    supportedLngs: ["ko", "en", "ja", "zh-CN"],
    load: "currentOnly",
    resources: {
      ko: { translation: {} },
      en: { translation: {} },
      ja: { translation: {} },
      "zh-CN": { translation: {} },
    },
    interpolation: { escapeValue: false },
  });
}

describe("useLanguageSwitching", () => {
  it("flips to true on each rapid KO→EN→JA→ZH-CN switch and clears after holdMs", async () => {
    vi.useFakeTimers();
    await i18n.changeLanguage("ko");

    const { result } = renderHook(() => useLanguageSwitching(200));
    expect(result.current).toBe(false);

    for (const lang of ["en", "ja", "zh-CN"] as const) {
      await act(async () => {
        await i18n.changeLanguage(lang);
      });
      // Switching flag must immediately turn on so the skeleton covers the
      // window where stale-language data could otherwise flash.
      expect(result.current).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current).toBe(false);
    }

    vi.useRealTimers();
  });
});
