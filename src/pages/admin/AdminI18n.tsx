import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Languages, Wand2, RefreshCw } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { translateKoTo, type TargetLang } from "@/lib/translate";
import { toast } from "sonner";

type Category = "course" | "content" | "assessment" | "announcement" | "board" | "category" | "assignment" | "survey" | "survey_question" | "track" | "track_stage";

const TARGET_LANGS: TargetLang[] = ["en", "zh-CN", "ja"];
const LANG_LABELS: Record<TargetLang, string> = { en: "EN", "zh-CN": "ZH", ja: "JA" };

type LangStatus = "missing" | "untranslated" | "partial" | "complete";

interface LangCell {
  title: string | null;
  body: string | null;
  status: LangStatus;
}

interface Row {
  id: string;
  category: Category;
  ko_title: string;
  ko_body: string;
  langs: Record<TargetLang, LangCell>;
}

const CATEGORY_LABELS: Record<Category, string> = {
  course: "강의",
  content: "차시",
  assessment: "평가",
  announcement: "공지",
  board: "게시판",
  category: "분류",
  assignment: "과제",
  survey: "설문",
  survey_question: "설문 문항",
  track: "트랙",
  track_stage: "트랙 단계",
};

function computeStatus(koTitle: string, koBody: string, tTitle: string | null, tBody: string | null): LangStatus {
  const hasTitle = !!tTitle?.trim();
  const hasBody = !!tBody?.trim() || !koBody.trim();
  if (!hasTitle && !tBody?.trim()) return "missing";
  // Untranslated: target text equals Korean source (just copied)
  const titleSame = hasTitle && tTitle!.trim() === koTitle.trim() && !!koTitle.trim();
  const bodySame = !!tBody?.trim() && tBody!.trim() === koBody.trim() && !!koBody.trim();
  if ((titleSame && (bodySame || !koBody.trim())) || (titleSame && !tBody?.trim() && !!koBody.trim())) {
    return "untranslated";
  }
  if (hasTitle && hasBody) return "complete";
  return "partial";
}

async function fetchAllRows(): Promise<Row[]> {
  const rows: Row[] = [];

  const buildLangMap = (
    items: Array<{ id: string; ko_title: string; ko_body: string; perLang: Record<TargetLang, { title: string | null; body: string | null }> }>,
    category: Category,
  ) => {
    items.forEach((it) => {
      const langs = {} as Record<TargetLang, LangCell>;
      TARGET_LANGS.forEach((lc) => {
        const v = it.perLang[lc] ?? { title: null, body: null };
        langs[lc] = { title: v.title, body: v.body, status: computeStatus(it.ko_title, it.ko_body, v.title, v.body) };
      });
      rows.push({ id: it.id, category, ko_title: it.ko_title, ko_body: it.ko_body, langs });
    });
  };

  // Helper to fetch i18n rows for all target languages and group
  const groupI18n = <T extends Record<string, any>>(
    data: T[] | null | undefined,
    keyField: string,
    titleField: string,
    bodyField: string,
  ) => {
    const map = new Map<string, Record<TargetLang, { title: string | null; body: string | null }>>();
    (data ?? []).forEach((r) => {
      const id = r[keyField] as string;
      const lc = r.language_code as TargetLang;
      if (!TARGET_LANGS.includes(lc)) return;
      if (!map.has(id)) {
        map.set(id, { en: { title: null, body: null }, "zh-CN": { title: null, body: null }, ja: { title: null, body: null } });
      }
      map.get(id)![lc] = { title: r[titleField] ?? null, body: r[bodyField] ?? null };
    });
    return map;
  };

  const emptyPerLang = (): Record<TargetLang, { title: string | null; body: string | null }> =>
    ({ en: { title: null, body: null }, "zh-CN": { title: null, body: null }, ja: { title: null, body: null } });

  // 1) Courses
  const { data: coursesData } = await supabase.from("courses").select("id, title, description").order("created_at", { ascending: false });
  const courses = (coursesData ?? []) as Array<{ id: string; title: string | null; description: string | null }>;
  const courseIds = courses.map((c) => c.id);
  const { data: courseI18n } = courseIds.length
    ? await supabase.from("course_i18n" as any).select("course_id, language_code, title, description").in("course_id", courseIds).in("language_code", TARGET_LANGS)
    : { data: [] as any[] };
  const courseMap = groupI18n(courseI18n as any[], "course_id", "title", "description");
  buildLangMap(
    courses.map((c) => ({ id: c.id, ko_title: c.title ?? "", ko_body: c.description ?? "", perLang: courseMap.get(c.id) ?? emptyPerLang() })),
    "course",
  );

  // 2) Course contents
  const { data: contentsData } = await supabase.from("course_contents" as any).select("id, title, description").order("created_at", { ascending: false });
  const contents = ((contentsData as unknown) ?? []) as Array<{ id: string; title: string | null; description: string | null }>;
  const contentIds = contents.map((c) => c.id);
  const { data: contentI18n } = contentIds.length
    ? await supabase.from("course_content_i18n" as any).select("content_id, language_code, title, description").in("content_id", contentIds).in("language_code", TARGET_LANGS)
    : { data: [] as any[] };
  const contentMap = groupI18n(contentI18n as any[], "content_id", "title", "description");
  buildLangMap(
    contents.map((c) => ({ id: c.id, ko_title: c.title ?? "", ko_body: c.description ?? "", perLang: contentMap.get(c.id) ?? emptyPerLang() })),
    "content",
  );

  // 3) Assessments
  const { data: assessmentsData } = await supabase.from("assessments").select("id, title, description").order("created_at", { ascending: false });
  const assessments = (assessmentsData ?? []) as Array<{ id: string; title: string | null; description: string | null }>;
  const assIds = assessments.map((a) => a.id);
  const { data: assI18n } = assIds.length
    ? await supabase.from("assessment_i18n" as any).select("assessment_id, language_code, title, description").in("assessment_id", assIds).in("language_code", TARGET_LANGS)
    : { data: [] as any[] };
  const assMap = groupI18n(assI18n as any[], "assessment_id", "title", "description");
  buildLangMap(
    assessments.map((a) => ({ id: a.id, ko_title: a.title ?? "", ko_body: a.description ?? "", perLang: assMap.get(a.id) ?? emptyPerLang() })),
    "assessment",
  );

  // 4) Announcements
  const { data: annsData } = await supabase.from("announcements").select("id, title, content").order("created_at", { ascending: false });
  const anns = (annsData ?? []) as Array<{ id: string; title: string | null; content: string | null }>;
  const annIds = anns.map((a) => a.id);
  const { data: annI18n } = annIds.length
    ? await supabase.from("announcement_i18n" as any).select("announcement_id, language_code, title, content").in("announcement_id", annIds).in("language_code", TARGET_LANGS)
    : { data: [] as any[] };
  const annMap = groupI18n(annI18n as any[], "announcement_id", "title", "content");
  buildLangMap(
    anns.map((a) => ({ id: a.id, ko_title: a.title ?? "", ko_body: a.content ?? "", perLang: annMap.get(a.id) ?? emptyPerLang() })),
    "announcement",
  );

  // 5) Board posts
  const { data: postsData } = await supabase.from("board_posts").select("id, title, content").order("created_at", { ascending: false });
  const posts = (postsData ?? []) as Array<{ id: string; title: string | null; content: string | null }>;
  const postIds = posts.map((p) => p.id);
  const { data: postI18n } = postIds.length
    ? await supabase.from("board_post_i18n" as any).select("post_id, language_code, title, content").in("post_id", postIds).in("language_code", TARGET_LANGS)
    : { data: [] as any[] };
  const postMap = groupI18n(postI18n as any[], "post_id", "title", "content");
  buildLangMap(
    posts.map((p) => ({ id: p.id, ko_title: p.title ?? "", ko_body: p.content ?? "", perLang: postMap.get(p.id) ?? emptyPerLang() })),
    "board",
  );

  // 6) Categories — only EN column exists in schema; treat zh/ja as N/A (complete)
  const { data: catsData } = await supabase.from("categories").select("id, name, name_en").order("display_order", { ascending: true });
  (catsData ?? []).forEach((c: any) => {
    const langs = {} as Record<TargetLang, LangCell>;
    TARGET_LANGS.forEach((lc) => {
      if (lc === "en") {
        langs[lc] = { title: c.name_en ?? null, body: null, status: computeStatus(c.name ?? "", "", c.name_en ?? null, null) };
      } else {
        langs[lc] = { title: null, body: null, status: "complete" }; // not stored, skip
      }
    });
    rows.push({ id: c.id, category: "category", ko_title: c.name ?? "", ko_body: "", langs });
  });

  // 7) Assignments — only EN columns exist
  const { data: asgData } = await supabase.from("assignments").select("id, title, title_en, instructions, instructions_en").order("created_at", { ascending: false });
  (asgData ?? []).forEach((a: any) => {
    const langs = {} as Record<TargetLang, LangCell>;
    TARGET_LANGS.forEach((lc) => {
      if (lc === "en") {
        langs[lc] = { title: a.title_en ?? null, body: a.instructions_en ?? null, status: computeStatus(a.title ?? "", a.instructions ?? "", a.title_en ?? null, a.instructions_en ?? null) };
      } else {
        langs[lc] = { title: null, body: null, status: "complete" };
      }
    });
    rows.push({ id: a.id, category: "assignment", ko_title: a.title ?? "", ko_body: a.instructions ?? "", langs });
  });

  // 8) Surveys — only EN columns exist
  const { data: surveysData } = await supabase.from("surveys").select("id, title, description, title_en, description_en").order("created_at", { ascending: false });
  (surveysData ?? []).forEach((s: any) => {
    const langs = {} as Record<TargetLang, LangCell>;
    TARGET_LANGS.forEach((lc) => {
      if (lc === "en") {
        langs[lc] = { title: s.title_en ?? null, body: s.description_en ?? null, status: computeStatus(s.title ?? "", s.description ?? "", s.title_en ?? null, s.description_en ?? null) };
      } else {
        langs[lc] = { title: null, body: null, status: "complete" };
      }
    });
    rows.push({ id: s.id, category: "survey", ko_title: s.title ?? "", ko_body: s.description ?? "", langs });
  });

  // 9) Survey questions — only EN columns exist
  const { data: sqData } = await supabase.from("survey_questions").select("id, question_text, question_text_en, options, options_en").order("created_at", { ascending: false });
  (sqData ?? []).forEach((q: any) => {
    const koBody = Array.isArray(q.options) ? JSON.stringify(q.options) : "";
    const enBody = Array.isArray(q.options_en) ? JSON.stringify(q.options_en) : null;
    const langs = {} as Record<TargetLang, LangCell>;
    TARGET_LANGS.forEach((lc) => {
      if (lc === "en") {
        langs[lc] = { title: q.question_text_en ?? null, body: enBody, status: computeStatus(q.question_text ?? "", koBody, q.question_text_en ?? null, enBody) };
      } else {
        langs[lc] = { title: null, body: null, status: "complete" };
      }
    });
    rows.push({ id: q.id, category: "survey_question", ko_title: q.question_text ?? "", ko_body: koBody, langs });
  });

  // 10) Learning tracks
  const { data: tracksData } = await supabase.from("learning_tracks" as any).select("id, title, description").order("created_at", { ascending: false });
  const tracks = ((tracksData as unknown) ?? []) as Array<{ id: string; title: string | null; description: string | null }>;
  const trackIds = tracks.map((t) => t.id);
  const { data: trackI18n } = trackIds.length
    ? await supabase.from("learning_tracks_i18n" as any).select("track_id, language_code, title, description").in("track_id", trackIds).in("language_code", TARGET_LANGS)
    : { data: [] as any[] };
  const trackMap = groupI18n(trackI18n as any[], "track_id", "title", "description");
  buildLangMap(
    tracks.map((t) => ({ id: t.id, ko_title: t.title ?? "", ko_body: t.description ?? "", perLang: trackMap.get(t.id) ?? emptyPerLang() })),
    "track",
  );

  // 11) Track stages
  const { data: stagesData } = await supabase.from("track_stages" as any).select("id, name, description").order("order_index", { ascending: true });
  const stages = ((stagesData as unknown) ?? []) as Array<{ id: string; name: string | null; description: string | null }>;
  const stageIds = stages.map((s) => s.id);
  const { data: stageI18n } = stageIds.length
    ? await supabase.from("track_stages_i18n" as any).select("stage_id, language_code, name, description").in("stage_id", stageIds).in("language_code", TARGET_LANGS)
    : { data: [] as any[] };
  const stageMap = groupI18n(stageI18n as any[], "stage_id", "name", "description");
  buildLangMap(
    stages.map((s) => ({ id: s.id, ko_title: s.name ?? "", ko_body: s.description ?? "", perLang: stageMap.get(s.id) ?? emptyPerLang() })),
    "track_stage",
  );

  return rows;
}

async function upsertTranslation(row: Row, lang: TargetLang, tTitle: string, tBody: string) {
  switch (row.category) {
    case "course":
      return supabase.from("course_i18n" as any).upsert({ course_id: row.id, language_code: lang, title: tTitle, description: tBody }, { onConflict: "course_id,language_code" });
    case "content":
      return supabase.from("course_content_i18n" as any).upsert({ content_id: row.id, language_code: lang, title: tTitle, description: tBody }, { onConflict: "content_id,language_code" });
    case "assessment":
      return supabase.from("assessment_i18n" as any).upsert({ assessment_id: row.id, language_code: lang, title: tTitle, description: tBody }, { onConflict: "assessment_id,language_code" });
    case "announcement":
      return supabase.from("announcement_i18n" as any).upsert({ announcement_id: row.id, language_code: lang, title: tTitle, content: tBody }, { onConflict: "announcement_id,language_code" });
    case "board":
      return supabase.from("board_post_i18n" as any).upsert({ post_id: row.id, language_code: lang, title: tTitle, content: tBody }, { onConflict: "post_id,language_code" });
    case "category":
      if (lang !== "en") return { error: null } as any;
      return supabase.from("categories").update({ name_en: tTitle }).eq("id", row.id);
    case "assignment":
      if (lang !== "en") return { error: null } as any;
      return supabase.from("assignments").update({ title_en: tTitle, instructions_en: tBody }).eq("id", row.id);
    case "survey":
      if (lang !== "en") return { error: null } as any;
      return supabase.from("surveys").update({ title_en: tTitle, description_en: tBody }).eq("id", row.id);
    case "survey_question": {
      if (lang !== "en") return { error: null } as any;
      let optionsEn: any = null;
      if (tBody && tBody.trim()) {
        try { optionsEn = JSON.parse(tBody); } catch { optionsEn = null; }
      }
      const update: any = { question_text_en: tTitle };
      if (optionsEn !== null) update.options_en = optionsEn;
      return supabase.from("survey_questions").update(update).eq("id", row.id);
    }
  }
}

const AdminI18n = () => {
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<Category>("course");
  const [activeLang, setActiveLang] = useState<TargetLang | "all">("all");
  const [filter, setFilter] = useState<"missing" | "all">("missing");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-i18n-rows"],
    queryFn: fetchAllRows,
    staleTime: 60_000,
  });

  const isRowIncomplete = (r: Row) => {
    const langs: TargetLang[] = activeLang === "all" ? TARGET_LANGS : [activeLang];
    return langs.some((lc) => r.langs[lc].status !== "complete");
  };

  const counts = useMemo(() => {
    const c = {} as Record<Category, { total: number; incomplete: number }>;
    (Object.keys(CATEGORY_LABELS) as Category[]).forEach((k) => (c[k] = { total: 0, incomplete: 0 }));
    rows.forEach((r) => {
      c[r.category].total += 1;
      if (isRowIncomplete(r)) c[r.category].incomplete += 1;
    });
    return c;
  }, [rows, activeLang]);

  const visible = useMemo(() => {
    return rows
      .filter((r) => r.category === activeCategory)
      .filter((r) => (filter === "missing" ? isRowIncomplete(r) : true));
  }, [rows, activeCategory, filter, activeLang]);

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allVisibleSelected) visible.forEach((r) => next.delete(r.id));
    else visible.forEach((r) => next.add(r.id));
    setSelected(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const translateRowsForLang = async (targets: Row[], lang: TargetLang) => {
    if (targets.length === 0) return { ok: 0, fail: 0 };
    let ok = 0, fail = 0;
    const chunkSize = 5;
    for (let i = 0; i < targets.length; i += chunkSize) {
      const chunk = targets.slice(i, i + chunkSize);
      const inputs: string[] = [];
      chunk.forEach((r) => { inputs.push(r.ko_title || ""); inputs.push(r.ko_body || ""); });
      try {
        const out = await translateKoTo(lang, inputs);
        for (let j = 0; j < chunk.length; j++) {
          const tTitle = out[j * 2] || chunk[j].ko_title;
          const tBody = out[j * 2 + 1] || chunk[j].ko_body;
          const { error } = await upsertTranslation(chunk[j], lang, tTitle, tBody);
          if (error) fail++; else ok++;
        }
      } catch (e) {
        console.error(e);
        fail += chunk.length;
      }
    }
    return { ok, fail };
  };

  // For each row, only translate for languages that are not complete
  const translateRowsAllLangs = async (targets: Row[]) => {
    let ok = 0, fail = 0;
    const langs: TargetLang[] = activeLang === "all" ? TARGET_LANGS : [activeLang];
    for (const lc of langs) {
      const needs = targets.filter((r) => r.langs[lc].status !== "complete");
      if (needs.length === 0) continue;
      // Skip categories that don't support this language
      const supportsLang = (cat: Category) =>
        ["course", "content", "assessment", "announcement", "board"].includes(cat) || lc === "en";
      const supported = needs.filter((r) => supportsLang(r.category));
      const res = await translateRowsForLang(supported, lc);
      ok += res.ok; fail += res.fail;
    }
    return { ok, fail };
  };

  const handleTranslateOne = async (row: Row) => {
    setRowBusy(row.id);
    try {
      const { ok, fail } = await translateRowsAllLangs([row]);
      if (ok > 0) {
        toast.success(`${ok}건 번역이 완료되었습니다.${fail ? ` (${fail}건 실패)` : ""}`);
        await queryClient.invalidateQueries({ queryKey: ["admin-i18n-rows"] });
      } else {
        toast.error("번역에 실패했습니다.");
      }
    } finally {
      setRowBusy(null);
    }
  };

  const handleBulk = async (mode: "selected" | "all-missing") => {
    let targets: Row[] = [];
    if (mode === "selected") {
      targets = rows.filter((r) => selected.has(r.id));
      if (targets.length === 0) { toast.error("항목을 선택하세요."); return; }
    } else {
      targets = rows.filter((r) => isRowIncomplete(r));
      if (targets.length === 0) { toast.success("번역할 항목이 없습니다."); return; }
    }
    setBulkBusy(true);
    toast.info(`${targets.length}개 항목 번역을 시작합니다…`);
    try {
      const { ok, fail } = await translateRowsAllLangs(targets);
      if (fail === 0) toast.success(`${ok}건이 번역되었습니다.`);
      else toast.warning(`${ok}건 성공, ${fail}건 실패`);
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["admin-i18n-rows"] });
    } finally {
      setBulkBusy(false);
    }
  };

  const totalIncomplete = rows.filter(isRowIncomplete).length;

  const renderLangBadge = (status: LangStatus, lc: TargetLang) => {
    if (status === "complete") return <Badge variant="secondary" className="whitespace-nowrap">{LANG_LABELS[lc]} 완료</Badge>;
    if (status === "untranslated") return <Badge variant="destructive" className="whitespace-nowrap">{LANG_LABELS[lc]} 미번역</Badge>;
    if (status === "partial") return <Badge variant="outline" className="whitespace-nowrap">{LANG_LABELS[lc]} 부분</Badge>;
    return <Badge variant="destructive" className="whitespace-nowrap">{LANG_LABELS[lc]} 누락</Badge>;
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-md bg-muted">
              <Languages className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold">다국어 관리</h1>
              <p className="text-sm text-muted-foreground mt-1">
                한국어 콘텐츠의 영어/중국어/일본어 번역 상태를 한눈에 확인하고 일괄 번역할 수 있습니다.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs value={activeLang} onValueChange={(v) => { setActiveLang(v as any); setSelected(new Set()); }}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs h-6">전체</TabsTrigger>
                <TabsTrigger value="en" className="text-xs h-6">EN</TabsTrigger>
                <TabsTrigger value="zh-CN" className="text-xs h-6">ZH</TabsTrigger>
                <TabsTrigger value="ja" className="text-xs h-6">JA</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className="h-4 w-4 mr-1" />
              새로고침
            </Button>
            <Button size="sm" onClick={() => handleBulk("all-missing")} disabled={bulkBusy || totalIncomplete === 0} className="gap-1">
              <Wand2 className="h-4 w-4" />
              전체 자동 번역 ({totalIncomplete})
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => {
            const c = counts[cat];
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setSelected(new Set()); }}
                className={`text-left rounded-lg border p-4 transition ${isActive ? "border-foreground ring-1 ring-foreground/40" : "border-border hover:border-foreground/40"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{CATEGORY_LABELS[cat]}</span>
                  <span className="text-xs text-muted-foreground">전체 {c.total}</span>
                </div>
                <div className="text-2xl font-semibold mt-2">{c.incomplete}</div>
                <div className="text-[11px] text-muted-foreground mt-1">번역 누락/미번역</div>
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base">{CATEGORY_LABELS[activeCategory]} 상세 목록</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  필요한 항목을 선택하여 한 번에 자동 번역하세요. 번역 결과가 한국어 원문과 동일하면 "미번역"으로 표시됩니다.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="missing" className="text-xs h-6">누락/미번역</TabsTrigger>
                    <TabsTrigger value="all" className="text-xs h-6">전체</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button size="sm" variant="default" onClick={() => handleBulk("selected")} disabled={bulkBusy || selected.size === 0} className="gap-1">
                  <Wand2 className="h-4 w-4" />
                  선택 항목 번역 ({selected.size})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3" role="status" aria-live="polite">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : visible.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">해당 조건의 항목이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-border/80 text-left">
                      <th className="py-2 pr-2 w-8">
                        <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="전체 선택" />
                      </th>
                      <th className="py-2 px-2">한국어 원문</th>
                      <th className="py-2 px-2 w-[28%]">언어별 상태</th>
                      <th className="py-2 pl-2 w-32 text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const visibleLangs: TargetLang[] = activeLang === "all" ? TARGET_LANGS : [activeLang];
                      return (
                        <tr key={`${r.category}-${r.id}`} className="border-b-2 border-border/80 align-top">
                          <td className="py-3 pr-2">
                            <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label="선택" />
                          </td>
                          <td className="py-3 px-2 max-w-md">
                            <div className="font-medium truncate">{r.ko_title || "(제목 없음)"}</div>
                            {r.ko_body && <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{r.ko_body}</div>}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex flex-wrap gap-1">
                              {visibleLangs.map((lc) => <span key={lc}>{renderLangBadge(r.langs[lc].status, lc)}</span>)}
                            </div>
                          </td>
                          <td className="py-3 pl-2 text-right">
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => handleTranslateOne(r)} disabled={rowBusy === r.id || bulkBusy}>
                              <Languages className="h-3 w-3" />
                              번역
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminI18n;
