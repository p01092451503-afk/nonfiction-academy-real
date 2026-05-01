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

const source = flatten(ko as JsonObj);
const sourceKeys = Object.keys(source);

const targets: Record<string, Record<string, unknown>> = {
  en: flatten(en as JsonObj),
  ja: flatten(ja as JsonObj),
  "zh-CN": flatten(zhCN as JsonObj),
};

describe("i18n locale parity (source: ko)", () => {
  for (const [locale, flat] of Object.entries(targets)) {
    it(`${locale} has no missing keys`, () => {
      const missing = sourceKeys.filter((k) => !(k in flat));
      expect(missing, `Missing in ${locale}:\n${missing.slice(0, 20).join("\n")}`).toEqual([]);
    });

    it(`${locale} has no empty string values`, () => {
      const empty = sourceKeys.filter(
        (k) => typeof flat[k] === "string" && (flat[k] as string).trim() === "",
      );
      expect(empty, `Empty in ${locale}:\n${empty.slice(0, 20).join("\n")}`).toEqual([]);
    });
  }
});
