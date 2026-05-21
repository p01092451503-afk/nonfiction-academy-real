import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SRV, { auth: { persistSession: false } });

const TARGETS = ["en", "zh-CN", "ja"] as const;
type Lang = typeof TARGETS[number];
const HANGUL_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const hasHangul = (s: string) => HANGUL_RE.test(s || "");

async function translate(texts: string[], targetLang: Lang): Promise<string[]> {
  const filtered = texts.map((t) => (t ?? "").toString());
  if (filtered.every((t) => !t.trim())) return filtered.map(() => "");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/translate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SRV}`,
      apikey: SRV,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ texts: filtered, targetLang }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`translate ${targetLang} failed: ${res.status} ${t}`);
  }
  const j = await res.json();
  return j.translations || filtered.map(() => "");
}

// Decide if a given (title, body) target needs (re)translation
function needsTranslate(koTitle: string, koBody: string, tTitle: string | null, tBody: string | null): boolean {
  const koT = (koTitle || "").trim();
  const koB = (koBody || "").trim();
  const tT = (tTitle || "").trim();
  const tB = (tBody || "").trim();
  // Missing
  if (koT && !tT) return true;
  if (koB && !tB) return true;
  // Untranslated (same as KO and KO has Hangul)
  if (koT && tT === koT && hasHangul(koT)) return true;
  if (koB && tB === koB && hasHangul(koB)) return true;
  return false;
}

let processed = 0, failed = 0;

async function processI18nTable(opts: {
  label: string;
  sourceTable: string;
  sourceSelect: string;
  titleField: string;
  bodyField: string | null;
  i18nTable: string;
  fk: string;
  i18nTitleField: string;
  i18nBodyField: string | null;
  onConflict: string;
}) {
  console.log(`\n=== ${opts.label} ===`);
  const { data: src, error: e1 } = await sb.from(opts.sourceTable).select(opts.sourceSelect);
  if (e1) { console.error(e1); return; }
  const ids = (src || []).map((r: any) => r.id);
  if (ids.length === 0) return;
  const { data: i18n, error: e2 } = await sb.from(opts.i18nTable).select("*").in(opts.fk, ids).in("language_code", TARGETS as any);
  if (e2) { console.error(e2); return; }
  const map = new Map<string, Record<Lang, any>>();
  (i18n || []).forEach((r: any) => {
    if (!map.has(r[opts.fk])) map.set(r[opts.fk], {} as any);
    map.get(r[opts.fk])![r.language_code as Lang] = r;
  });

  for (const row of src as any[]) {
    const koTitle = row[opts.titleField] ?? "";
    const koBody = opts.bodyField ? (row[opts.bodyField] ?? "") : "";
    if (!koTitle.trim() && !koBody.trim()) continue;
    const perLang = map.get(row.id) || ({} as any);
    for (const lang of TARGETS) {
      const existing = perLang[lang];
      const tTitle = existing?.[opts.i18nTitleField] ?? null;
      const tBody = opts.i18nBodyField ? (existing?.[opts.i18nBodyField] ?? null) : null;
      if (!needsTranslate(koTitle, koBody, tTitle, tBody)) continue;
      try {
        const inputs: string[] = [koTitle];
        if (opts.i18nBodyField) inputs.push(koBody);
        const out = await translate(inputs, lang);
        const newTitle = out[0]?.trim() || koTitle;
        const newBody = opts.i18nBodyField ? (out[1]?.trim() || koBody) : null;
        const payload: any = { [opts.fk]: row.id, language_code: lang, [opts.i18nTitleField]: newTitle };
        if (opts.i18nBodyField) payload[opts.i18nBodyField] = newBody;
        const { error } = await sb.from(opts.i18nTable).upsert(payload, { onConflict: opts.onConflict });
        if (error) { failed++; console.error(`  ✗ ${opts.label} ${row.id} ${lang}:`, error.message); }
        else { processed++; console.log(`  ✓ ${opts.label} ${row.id} ${lang}`); }
      } catch (err: any) {
        failed++; console.error(`  ✗ ${opts.label} ${row.id} ${lang}:`, err.message);
      }
    }
  }
}

async function processEnColumn(opts: {
  label: string;
  table: string;
  select: string;
  titleField: string;
  bodyField: string | null;
  titleEnField: string;
  bodyEnField: string | null;
}) {
  console.log(`\n=== ${opts.label} (EN column) ===`);
  const { data, error } = await sb.from(opts.table).select(opts.select);
  if (error) { console.error(error); return; }
  for (const row of (data || []) as any[]) {
    const koTitle = row[opts.titleField] ?? "";
    const koBody = opts.bodyField ? (row[opts.bodyField] ?? "") : "";
    if (!koTitle.trim() && !koBody.trim()) continue;
    const tTitle = row[opts.titleEnField] ?? null;
    const tBody = opts.bodyEnField ? (row[opts.bodyEnField] ?? null) : null;
    if (!needsTranslate(koTitle, koBody, tTitle, tBody)) continue;
    try {
      const inputs: string[] = [koTitle];
      if (opts.bodyEnField) inputs.push(koBody);
      const out = await translate(inputs, "en");
      const newTitle = out[0]?.trim() || koTitle;
      const update: any = { [opts.titleEnField]: newTitle };
      if (opts.bodyEnField) update[opts.bodyEnField] = out[1]?.trim() || koBody;
      const { error: ue } = await sb.from(opts.table).update(update).eq("id", row.id);
      if (ue) { failed++; console.error(`  ✗ ${opts.label} ${row.id}:`, ue.message); }
      else { processed++; console.log(`  ✓ ${opts.label} ${row.id} en`); }
    } catch (err: any) {
      failed++; console.error(`  ✗ ${opts.label} ${row.id}:`, err.message);
    }
  }
}

async function main() {
  await processI18nTable({
    label: "courses", sourceTable: "courses", sourceSelect: "id,title,description",
    titleField: "title", bodyField: "description",
    i18nTable: "course_i18n", fk: "course_id",
    i18nTitleField: "title", i18nBodyField: "description",
    onConflict: "course_id,language_code",
  });
  await processI18nTable({
    label: "course_contents", sourceTable: "course_contents", sourceSelect: "id,title,description",
    titleField: "title", bodyField: "description",
    i18nTable: "course_content_i18n", fk: "content_id",
    i18nTitleField: "title", i18nBodyField: "description",
    onConflict: "content_id,language_code",
  });
  await processI18nTable({
    label: "assessments", sourceTable: "assessments", sourceSelect: "id,title,description",
    titleField: "title", bodyField: "description",
    i18nTable: "assessment_i18n", fk: "assessment_id",
    i18nTitleField: "title", i18nBodyField: "description",
    onConflict: "assessment_id,language_code",
  });
  await processI18nTable({
    label: "announcements", sourceTable: "announcements", sourceSelect: "id,title,content",
    titleField: "title", bodyField: "content",
    i18nTable: "announcement_i18n", fk: "announcement_id",
    i18nTitleField: "title", i18nBodyField: "content",
    onConflict: "announcement_id,language_code",
  });
  await processI18nTable({
    label: "board_posts", sourceTable: "board_posts", sourceSelect: "id,title,content",
    titleField: "title", bodyField: "content",
    i18nTable: "board_post_i18n", fk: "post_id",
    i18nTitleField: "title", i18nBodyField: "content",
    onConflict: "post_id,language_code",
  });
  await processI18nTable({
    label: "learning_tracks", sourceTable: "learning_tracks", sourceSelect: "id,title,description",
    titleField: "title", bodyField: "description",
    i18nTable: "learning_tracks_i18n", fk: "track_id",
    i18nTitleField: "title", i18nBodyField: "description",
    onConflict: "track_id,language_code",
  });
  // track_stages -> i18n uses name field
  try {
    await processI18nTable({
      label: "track_stages", sourceTable: "track_stages", sourceSelect: "id,name,description",
      titleField: "name", bodyField: "description",
      i18nTable: "track_stages_i18n", fk: "stage_id",
      i18nTitleField: "name", i18nBodyField: "description",
      onConflict: "stage_id,language_code",
    });
  } catch (e) { console.warn("track_stages skipped", e); }

  // EN-only column tables
  await processEnColumn({
    label: "categories", table: "categories", select: "id,name,name_en",
    titleField: "name", bodyField: null,
    titleEnField: "name_en", bodyEnField: null,
  });
  await processEnColumn({
    label: "assignments", table: "assignments", select: "id,title,title_en,instructions,instructions_en",
    titleField: "title", bodyField: "instructions",
    titleEnField: "title_en", bodyEnField: "instructions_en",
  });
  try {
    await processEnColumn({
      label: "surveys", table: "surveys", select: "id,title,title_en,description,description_en",
      titleField: "title", bodyField: "description",
      titleEnField: "title_en", bodyEnField: "description_en",
    });
  } catch (e) { console.warn("surveys skipped", e); }
  try {
    await processEnColumn({
      label: "survey_questions", table: "survey_questions", select: "id,question_text,question_text_en",
      titleField: "question_text", bodyField: null,
      titleEnField: "question_text_en", bodyEnField: null,
    });
  } catch (e) { console.warn("survey_questions skipped", e); }

  console.log(`\n===== DONE  processed=${processed}  failed=${failed} =====`);
}

main().catch((e) => { console.error(e); process.exit(1); });
