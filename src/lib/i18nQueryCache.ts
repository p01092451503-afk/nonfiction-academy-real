import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

/**
 * Single source of truth for React Query keys whose data is scoped to the
 * active i18n language. Whenever the user switches language, every query
 * whose key starts with one of these prefixes is invalidated so the UI
 * never shows stale text from the previous language.
 *
 * To register a new language-dependent query, add its first key segment
 * here (or in a per-page extras list passed to `useInvalidateI18nQueries`).
 */
export const I18N_SCOPED_QUERY_PREFIXES = [
  // Course detail / content
  "course-i18n",
  "course-contents",
  "content-i18n",
  // Student lists
  "my-enrollments",
  "my-tracks",
  "catalog-courses",
  // Admin / teacher localized lists
  "admin-tracks",
  "admin-tracks-i18n",
  "admin-track-stages-i18n",
] as const;

export type I18nScopedPrefix = (typeof I18N_SCOPED_QUERY_PREFIXES)[number] | string;

/**
 * Imperatively invalidate every language-scoped query in the cache.
 * Use inside mutations or effects when you need a one-shot refresh.
 */
export function invalidateI18nQueries(
  queryClient: QueryClient,
  extras: readonly I18nScopedPrefix[] = []
) {
  const prefixes = new Set<string>([...I18N_SCOPED_QUERY_PREFIXES, ...extras]);
  prefixes.forEach((prefix) => {
    queryClient.invalidateQueries({ queryKey: [prefix] });
  });
}

/**
 * Hook: invalidate all language-scoped queries every time `i18n.language`
 * changes. Pass `extras` to add page-specific prefixes that aren't part
 * of the global registry.
 */
export function useInvalidateI18nQueriesOnLangChange(
  extras: readonly I18nScopedPrefix[] = []
) {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();

  useEffect(() => {
    invalidateI18nQueries(queryClient, extras);
    // We intentionally only re-run when the language identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);
}
