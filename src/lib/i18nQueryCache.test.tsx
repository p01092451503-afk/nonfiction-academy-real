import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { ReactNode } from "react";
import {
  I18N_SCOPED_QUERY_PREFIXES,
  invalidateI18nQueries,
  useInvalidateI18nQueriesOnLangChange,
} from "./i18nQueryCache";

// Minimal i18n init for tests (re-uses the real instance so the hook's
// useTranslation() picks up language changes).
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

const makeWrapper = (qc: QueryClient) => ({ children }: { children: ReactNode }) =>
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

describe("i18nQueryCache", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("registers all CourseDetail-critical query prefixes", () => {
    // Guards against accidental removal — CourseDetail relies on these.
    expect(I18N_SCOPED_QUERY_PREFIXES).toEqual(
      expect.arrayContaining(["course-i18n", "course-contents", "content-i18n"])
    );
  });

  it("invalidateI18nQueries() invalidates every registered prefix", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    invalidateI18nQueries(qc);

    // One call per unique prefix
    expect(spy).toHaveBeenCalledTimes(new Set(I18N_SCOPED_QUERY_PREFIXES).size);
    for (const prefix of I18N_SCOPED_QUERY_PREFIXES) {
      expect(spy).toHaveBeenCalledWith({ queryKey: [prefix] });
    }
  });

  it("invalidateI18nQueries() also invalidates page-specific extras", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    invalidateI18nQueries(qc, ["page-extra-key"]);

    expect(spy).toHaveBeenCalledWith({ queryKey: ["page-extra-key"] });
  });

  it("hook re-invalidates on every rapid language switch (KO→EN→JA→ZH-CN)", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useInvalidateI18nQueriesOnLangChange(), {
      wrapper: makeWrapper(qc),
    });

    // Initial mount triggers one invalidation pass.
    const perPass = new Set(I18N_SCOPED_QUERY_PREFIXES).size;
    const initialCalls = spy.mock.calls.length;
    expect(initialCalls).toBe(perPass);

    // Switch through every supported language back-to-back.
    const sequence = ["en", "ja", "zh-CN"] as const;
    for (const lang of sequence) {
      await act(async () => {
        await i18n.changeLanguage(lang);
      });
    }

    // Each language change must trigger a fresh invalidation pass — this is
    // what guarantees CourseDetail never shows stale text from a prior lang.
    expect(spy.mock.calls.length).toBe(initialCalls + sequence.length * perPass);

    // And the keys invalidated are exactly the registered prefixes.
    for (const prefix of I18N_SCOPED_QUERY_PREFIXES) {
      expect(spy).toHaveBeenCalledWith({ queryKey: [prefix] });
    }
  });

  it("invalidating between switches forces course-i18n / content-i18n to refetch", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: 0, retry: false, gcTime: 0 } },
    });

    const courseFetcher = vi.fn(async () => [{ language_code: i18n.language }]);
    const contentFetcher = vi.fn(async () => [{ language_code: i18n.language }]);

    // Seed both queries (mimicking CourseDetail's useQuery calls).
    await qc.fetchQuery({ queryKey: ["course-i18n", "c1"], queryFn: courseFetcher });
    await qc.fetchQuery({ queryKey: ["content-i18n", "c1"], queryFn: contentFetcher });
    expect(courseFetcher).toHaveBeenCalledTimes(1);
    expect(contentFetcher).toHaveBeenCalledTimes(1);

    renderHook(() => useInvalidateI18nQueriesOnLangChange(), {
      wrapper: makeWrapper(qc),
    });

    for (const lang of ["en", "ja", "zh-CN"] as const) {
      await act(async () => {
        await i18n.changeLanguage(lang);
      });
      // After invalidation, fetchQuery refetches because data is marked stale.
      await qc.fetchQuery({ queryKey: ["course-i18n", "c1"], queryFn: courseFetcher });
      await qc.fetchQuery({ queryKey: ["content-i18n", "c1"], queryFn: contentFetcher });
    }

    // Initial + one refetch per language switch = 4 total
    expect(courseFetcher).toHaveBeenCalledTimes(4);
    expect(contentFetcher).toHaveBeenCalledTimes(4);
  });
});
