// Backfills Cantonese (yue) translations for all i18n tables.
// Reads Korean source rows and inserts yue rows using Lovable AI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TARGET = "yue";
const TARGET_LABEL = "Cantonese (廣東話, Traditional Chinese script, Hong Kong colloquial style)";

async function translateBatch(texts: string[]): Promise<string[]> {
  const items = texts.map((t, i) => [i, t] as const).filter(([, t]) => t && t.trim());
  if (items.length === 0) return texts.map(() => "");
  const keyed = Object.fromEntries(items.map(([i, t]) => [String(i), t]));

  const prompt = `Translate each input text to ${TARGET_LABEL}.
Return ONLY a JSON object whose keys match the input keys and values are translated strings.
Use Traditional Chinese script and Hong Kong Cantonese colloquial style.
Keep official brand/product names and framework acronyms unchanged.

${JSON.stringify(keyed)}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: `You are a professional LMS translator into ${TARGET_LABEL}. Translate Korean/English/mixed input accurately.` },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    console.error("AI error", res.status, await res.text());
    return texts.map(() => "");
  }
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content?.trim() ?? "";
  const cleaned = content.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  const out = texts.map(() => "");
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") {
      for (const [i, t] of items) {
        const v = parsed[String(i)];
        out[i] = typeof v === "string" ? v : "";
      }
    }
  } catch (e) {
    console.error("parse fail", e, content.slice(0, 200));
  }
  return out;
}

async function processTable(cfg: {
  name: string;
  sourceTable: string;
  i18nTable: string;
  fkColumn: string; // e.g. course_id
  fields: string[]; // translatable columns
  optionsField?: string; // jsonb array
}) {
  const { data: existing } = await supabase.from(cfg.i18nTable).select(cfg.fkColumn).eq("language_code", TARGET);
  const existingIds = new Set((existing ?? []).map((r: any) => r[cfg.fkColumn]));

  const selectCols = ["id", ...cfg.fields, ...(cfg.optionsField ? [cfg.optionsField] : [])].join(",");
  const { data: rows, error } = await supabase.from(cfg.sourceTable).select(selectCols);
  if (error) {
    console.error(`fetch ${cfg.sourceTable}`, error);
    return { table: cfg.name, inserted: 0, error: error.message };
  }
  const todo = (rows ?? []).filter((r: any) => !existingIds.has(r.id));
  let inserted = 0;
  const BATCH = 5;
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const flat: string[] = [];
    const spec: Array<{ rowIdx: number; field: string; optIdx?: number }> = [];
    chunk.forEach((row: any, rowIdx) => {
      for (const f of cfg.fields) {
        const v = row[f];
        flat.push(typeof v === "string" ? v : "");
        spec.push({ rowIdx, field: f });
      }
      if (cfg.optionsField && Array.isArray(row[cfg.optionsField])) {
        (row[cfg.optionsField] as any[]).forEach((opt, optIdx) => {
          flat.push(typeof opt === "string" ? opt : "");
          spec.push({ rowIdx, field: cfg.optionsField!, optIdx });
        });
      }
    });
    const translated = await translateBatch(flat);
    const perRow: any[] = chunk.map((row: any) => {
      const rec: any = { [cfg.fkColumn]: row.id, language_code: TARGET };
      for (const f of cfg.fields) rec[f] = "";
      if (cfg.optionsField && Array.isArray(row[cfg.optionsField])) {
        rec[cfg.optionsField] = row[cfg.optionsField].map(() => "");
      }
      return rec;
    });
    spec.forEach((s, k) => {
      const t = translated[k];
      const target = perRow[s.rowIdx];
      if (s.optIdx !== undefined) {
        target[s.field][s.optIdx] = t || (chunk[s.rowIdx] as any)[s.field][s.optIdx];
      } else {
        target[s.field] = t || (chunk[s.rowIdx] as any)[s.field] || "";
      }
    });
    const { error: insErr } = await supabase.from(cfg.i18nTable).upsert(perRow, {
      onConflict: `${cfg.fkColumn},language_code`,
    });
    if (insErr) {
      console.error(`insert ${cfg.i18nTable}`, insErr);
    } else {
      inserted += perRow.length;
    }
  }
  return { table: cfg.name, total: todo.length, inserted };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const results = [];
    results.push(await processTable({ name: "courses", sourceTable: "courses", i18nTable: "course_i18n", fkColumn: "course_id", fields: ["title", "description"] }));
    results.push(await processTable({ name: "contents", sourceTable: "course_contents", i18nTable: "course_content_i18n", fkColumn: "content_id", fields: ["title", "description"] }));
    results.push(await processTable({ name: "assessments", sourceTable: "assessments", i18nTable: "assessment_i18n", fkColumn: "assessment_id", fields: ["title", "description"] }));
    results.push(await processTable({ name: "questions", sourceTable: "assessment_questions", i18nTable: "assessment_question_i18n", fkColumn: "question_id", fields: ["question_text", "correct_answer", "explanation", "hint"], optionsField: "options" }));
    results.push(await processTable({ name: "announcements", sourceTable: "announcements", i18nTable: "announcement_i18n", fkColumn: "announcement_id", fields: ["title", "content"] }));
    results.push(await processTable({ name: "tracks", sourceTable: "learning_tracks", i18nTable: "learning_tracks_i18n", fkColumn: "track_id", fields: ["title", "description"] }));
    results.push(await processTable({ name: "stages", sourceTable: "track_stages", i18nTable: "track_stages_i18n", fkColumn: "stage_id", fields: ["name", "description"] }));
    results.push(await processTable({ name: "board_posts", sourceTable: "board_posts", i18nTable: "board_post_i18n", fkColumn: "post_id", fields: ["title", "content"] }));

    return new Response(JSON.stringify({ ok: true, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
