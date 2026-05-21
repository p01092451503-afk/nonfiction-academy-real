#!/usr/bin/env node
/**
 * Fill missing i18n keys in en/ja/zh-CN by translating from KO via the `translate` edge function.
 * Reads /tmp/i18n-missing.json (run i18n-missing-report.mjs first).
 */
import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SRV) { console.error("Missing env"); process.exit(1); }

const LOCALES_DIR = path.resolve("src/i18n/locales");
const ko = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "ko.json"), "utf8"));
const report = JSON.parse(fs.readFileSync("/tmp/i18n-missing.json", "utf8"));

function getByPath(obj, p) {
  return p.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setByPath(obj, p, val) {
  const parts = p.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
}

async function translate(texts, targetLang) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/translate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SRV}`, apikey: SRV, "Content-Type": "application/json" },
    body: JSON.stringify({ texts, targetLang }),
  });
  if (!res.ok) throw new Error(`translate ${targetLang} ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.translations || texts.map(() => "");
}

const LANG_MAP = { en: "en", ja: "ja", "zh-CN": "zh-CN" };
const BATCH = 30;

for (const [locale, info] of Object.entries(report.locales)) {
  const lang = LANG_MAP[locale];
  if (!lang) continue;
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const target = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const keys = [];
  for (const arr of Object.values(info.byNamespace)) for (const k of arr) keys.push(k);
  // include empty-string keys too (already listed via byNamespace)
  const uniqueKeys = Array.from(new Set(keys));
  console.log(`\n[${locale}] filling ${uniqueKeys.length} keys`);

  let filled = 0;
  for (let i = 0; i < uniqueKeys.length; i += BATCH) {
    const slice = uniqueKeys.slice(i, i + BATCH);
    const sources = slice.map((k) => {
      const v = getByPath(ko, k);
      return typeof v === "string" ? v : "";
    });
    const idx = sources.map((s, j) => (s ? j : -1)).filter((j) => j >= 0);
    if (idx.length === 0) continue;
    const inputs = idx.map((j) => sources[j]);
    const out = await translate(inputs, lang);
    idx.forEach((j, k2) => {
      const val = (out[k2] || "").trim();
      if (val) { setByPath(target, slice[j], val); filled++; }
    });
    process.stdout.write(".");
  }
  fs.writeFileSync(filePath, JSON.stringify(target, null, 2) + "\n", "utf8");
  console.log(`\n[${locale}] wrote ${filled} keys -> ${filePath}`);
}
console.log("\nDone.");
