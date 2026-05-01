#!/usr/bin/env node
/**
 * i18n Key Consistency Check (fast, fail-fast)
 *
 * Compares all locale files against the source locale (ko) and exits with
 * a non-zero code if ANY key is missing or has an empty string value.
 *
 * Designed to be wired into CI / pre-commit / `npm test` so that adding a
 * key like `track.noTracksTitle` to ko.json without adding it to en/ja/zh-CN
 * fails immediately.
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
const SOURCE_LOCALE = "ko";
const TARGET_LOCALES = ["en", "ja", "zh-CN"];

const allowEmpty = process.argv.includes("--allow-empty");

function loadJson(name) {
  const file = path.join(LOCALES_DIR, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

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

const source = flatten(loadJson(SOURCE_LOCALE));
const sourceKeys = Object.keys(source);

const issues = []; // { locale, key, kind: 'missing'|'empty' }

for (const locale of TARGET_LOCALES) {
  const flat = flatten(loadJson(locale));
  for (const key of sourceKeys) {
    if (!(key in flat)) {
      issues.push({ locale, key, kind: "missing" });
    } else if (!allowEmpty && typeof flat[key] === "string" && flat[key].trim() === "") {
      issues.push({ locale, key, kind: "empty" });
    }
  }
}

if (issues.length === 0) {
  console.log(
    `✓ i18n keys OK — ${sourceKeys.length} keys × ${TARGET_LOCALES.length} locales (source: ${SOURCE_LOCALE})`,
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

process.exit(1);
