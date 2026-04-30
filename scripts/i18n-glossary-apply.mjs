#!/usr/bin/env node
/**
 * i18n Glossary Applier
 *
 * Enforces canonical company/product terminology across locale files
 * by replacing alias terms with the canonical term defined in
 * scripts/i18n-glossary.json.
 *
 * Modes:
 *   --check   Report inconsistencies only, no file changes (default)
 *   --apply   Rewrite locale files with canonical terms
 *   --locale  Limit to one locale (en | ja | zh-CN)
 *   --json    Machine-readable output
 *
 * Examples:
 *   node scripts/i18n-glossary-apply.mjs                 # check all locales
 *   node scripts/i18n-glossary-apply.mjs --apply         # apply replacements
 *   node scripts/i18n-glossary-apply.mjs --locale ja --apply
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../src/i18n/locales");
const GLOSSARY_PATH = path.resolve(__dirname, "i18n-glossary.json");
const TARGET_LOCALES = ["en", "ja", "zh-CN"];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const asJson = args.includes("--json");
const localeFilter = (() => {
  const i = args.indexOf("--locale");
  return i >= 0 ? args[i + 1] : null;
})();

const glossary = JSON.parse(fs.readFileSync(GLOSSARY_PATH, "utf8"));

// Build per-locale rule list: [{ alias, canonical, term, caseSensitive }]
function buildRules(locale) {
  const rules = [];
  for (const [koTerm, entry] of Object.entries(glossary.terms)) {
    const canonical = entry[locale];
    if (!canonical) continue;
    const aliases = (entry.aliases && entry.aliases[locale]) || [];
    for (const alias of aliases) {
      if (alias === canonical) continue;
      rules.push({ koTerm, alias, canonical });
    }
  }
  // Sort by alias length DESC so longer aliases are replaced first (avoid partial replacements)
  rules.sort((a, b) => b.alias.length - a.alias.length);
  return rules;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}

function setByPath(obj, key, val) {
  const parts = key.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = val;
}

function applyRulesToString(str, rules) {
  let out = str;
  const hits = [];
  for (const r of rules) {
    const re = new RegExp(escapeRegex(r.alias), "g");
    if (re.test(out)) {
      const before = out;
      out = out.replace(re, r.canonical);
      if (before !== out) {
        hits.push({ alias: r.alias, canonical: r.canonical, koTerm: r.koTerm });
      }
    }
  }
  return { result: out, hits };
}

const report = {};
let totalChanges = 0;

for (const locale of localeFilter ? [localeFilter] : TARGET_LOCALES) {
  const file = path.join(LOCALES_DIR, `${locale}.json`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const flat = flatten(raw);
  const rules = buildRules(locale);

  const changes = [];
  for (const [key, value] of Object.entries(flat)) {
    const { result, hits } = applyRulesToString(value, rules);
    if (hits.length) {
      changes.push({ key, before: value, after: result, hits });
      if (apply) setByPath(raw, key, result);
    }
  }

  report[locale] = {
    rulesCount: rules.length,
    changedKeys: changes.length,
    totalReplacements: changes.reduce((n, c) => n + c.hits.length, 0),
    aliasFrequency: changes.reduce((acc, c) => {
      for (const h of c.hits) {
        const k = `${h.alias} → ${h.canonical}`;
        acc[k] = (acc[k] || 0) + 1;
      }
      return acc;
    }, {}),
    samples: changes.slice(0, 15),
  };
  totalChanges += changes.length;

  if (apply && changes.length) {
    fs.writeFileSync(file, JSON.stringify(raw, null, 2) + "\n", "utf8");
  }
}

if (asJson) {
  process.stdout.write(JSON.stringify(report, null, 2));
  process.exit(0);
}

const COL = { hdr: "\x1b[1m", grn: "\x1b[32m", ylw: "\x1b[33m", rst: "\x1b[0m" };
console.log(`Mode: ${apply ? "APPLY (writing files)" : "CHECK (read-only)"}`);
for (const [locale, data] of Object.entries(report)) {
  console.log(`\n${COL.hdr}=== ${locale.toUpperCase()} ===${COL.rst}`);
  console.log(`Rules: ${data.rulesCount} | Keys with hits: ${data.changedKeys} | Replacements: ${data.totalReplacements}`);
  if (Object.keys(data.aliasFrequency).length) {
    console.log(`\nAlias frequency:`);
    Object.entries(data.aliasFrequency)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${v.toString().padStart(4)}  ${k}`));
  }
  if (data.samples.length) {
    console.log(`\nSamples (first ${data.samples.length}):`);
    for (const s of data.samples) {
      console.log(`  ${COL.ylw}${s.key}${COL.rst}`);
      console.log(`    - ${truncate(s.before, 110)}`);
      console.log(`    + ${COL.grn}${truncate(s.after, 110)}${COL.rst}`);
    }
  }
}

console.log(
  `\n${apply ? "Applied" : "Would apply"} ${totalChanges} key change(s) across ${Object.keys(report).length} locale(s).`,
);
if (!apply && totalChanges > 0) {
  console.log(`Run with --apply to write changes to locale files.`);
}
process.exit(apply ? 0 : totalChanges > 0 ? 1 : 0);

function truncate(s, n) {
  s = String(s).replace(/\s+/g, " ");
  return s.length > n ? s.slice(0, n) + "…" : s;
}
