import { describe, it, expect } from "vitest";
import ko from "./locales/ko.json";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import zhCN from "./locales/zh-CN.json";

type JsonObj = Record<string, unknown>;

function flatten(obj: JsonObj, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v as JsonObj, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

const flatKo = flatten(ko as JsonObj);
const targets: Record<string, Record<string, unknown>> = {
  en: flatten(en as JsonObj),
  ja: flatten(ja as JsonObj),
  "zh-CN": flatten(zhCN as JsonObj),
};

/**
 * Namespaces that MUST stay in perfect parity across all 4 locales.
 * Add new top-level namespaces here as they are fully translated, so any
 * missing key (e.g. a new `track.*` entry added only to ko.json) fails CI.
 *
 * The standalone `npm run i18n:check` script reports every locale gap;
 * this Vitest spec is the fast guard that runs with the normal test suite.
 */
const ENFORCED_NAMESPACES = ["track", "common.save", "common.cancel"];

function keysIn(flat: Record<string, unknown>, ns: string) {
  return Object.keys(flat).filter((k) => k === ns || k.startsWith(`${ns}.`));
}

describe("i18n locale parity (enforced namespaces)", () => {
  for (const ns of ENFORCED_NAMESPACES) {
    const sourceKeys = keysIn(flatKo, ns);

    it(`source (ko) defines keys under "${ns}"`, () => {
      expect(sourceKeys.length, `No source keys found for namespace "${ns}"`).toBeGreaterThan(0);
    });

    for (const [locale, flat] of Object.entries(targets)) {
      it(`${locale} has all "${ns}" keys present and non-empty`, () => {
        const missing = sourceKeys.filter((k) => !(k in flat));
        const empty = sourceKeys.filter(
          (k) => typeof flat[k] === "string" && (flat[k] as string).trim() === "",
        );
        expect(
          { missing, empty },
          `Locale "${locale}" namespace "${ns}":\nMissing: ${missing.join(", ") || "-"}\nEmpty: ${empty.join(", ") || "-"}`,
        ).toEqual({ missing: [], empty: [] });
      });
    }
  }
});
