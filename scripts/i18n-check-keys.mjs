#!/usr/bin/env node
/**
 * i18n Key Consistency Check (fast, fail-fast)
 *
 * Compares every locale file in src/i18n/locales against the source locale (ko)
 * and exits with a non-zero code if ANY key is missing or has an empty value.
 * Wired into `npm run build` so a missing translation fails the build/deploy.
 *
 * Intentionally-empty values (e.g. English has no "년"/"월" suffix) can be
 * allowlisted in scripts/i18n-allow-empty.json as "<locale>:<key>" entries.
 *
 * Usage:
 *   node scripts/i18n-check-keys.mjs
 *   node scripts/i18n-check-keys.mjs --allow-empty   # only fail on missing keys
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../src/i18n/locales");
const ALLOW_EMPTY_FILE = path.resolve(__dirname, "i18n-allow-empty.json");
const SOURCE_LOCALE = "ko";

const allowEmpty = process.argv.includes("--allow-empty");

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** All locales present on disk, minus the source locale. */
const TARGET_LOCALES = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .filter((l) => l !== SOURCE_LOCALE)
  .sort();

const allowEmptySet = new Set(
  fs.existsSync(ALLOW_EMPTY_FILE) ? loadJson(ALLOW_EMPTY_FILE).allowEmpty || [] : [],
);

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

const source = flatten(loadJson(path.join(LOCALES_DIR, `${SOURCE_LOCALE}.json`)));
const sourceKeys = Object.keys(source);

const issues = []; // { locale, key, kind: 'missing'|'empty' }

for (const locale of TARGET_LOCALES) {
  const flat = flatten(loadJson(path.join(LOCALES_DIR, `${locale}.json`)));
  for (const key of sourceKeys) {
    if (!(key in flat)) {
      issues.push({ locale, key, kind: "missing" });
    } else if (
      !allowEmpty &&
      typeof flat[key] === "string" &&
      flat[key].trim() === "" &&
      !allowEmptySet.has(`${locale}:${key}`)
    ) {
      issues.push({ locale, key, kind: "empty" });
    }
  }
}

if (issues.length === 0) {
  console.log(
    `✓ i18n keys OK — ${sourceKeys.length} keys × ${TARGET_LOCALES.length} locales (${TARGET_LOCALES.join(", ")}; source: ${SOURCE_LOCALE})`,
  );
  process.exit(0);
}

console.error(
  `✗ i18n key check failed — ${issues.length} issue(s) across ${TARGET_LOCALES.join(", ")}\n`,
);

const byLocale = {};
for (const it of issues) {
  (byLocale[it.locale] ||= []).push(it);
}
for (const [locale, list] of Object.entries(byLocale)) {
  console.error(`[${locale}] ${list.length}`);
  for (const it of list.slice(0, 30)) {
    console.error(`  - ${it.kind.padEnd(7)} ${it.key}`);
  }
  if (list.length > 30) console.error(`  ... and ${list.length - 30} more`);
}
console.error(
  `\n해결: npm run i18n:sync 로 누락 키를 채우거나, 의도적으로 비워야 하는 값은 scripts/i18n-allow-empty.json 에 "<locale>:<key>" 형태로 등록하세요.`,
);

process.exit(1);
