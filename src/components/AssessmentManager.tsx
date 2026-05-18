import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye, EyeOff, ClipboardCheck, Users, Languages, FileSpreadsheet } from "lucide-react";
import AssessmentResults from "@/components/AssessmentResults";
import BulkQuestionUploadDialog from "@/components/BulkQuestionUploadDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { translateKoTo, type TargetLang } from "@/lib/translate";

type QuestionType = "multiple_choice_4" | "multiple_choice_5" | "short_answer" | "essay" | "ox";

// Supported non-Korean languages for assessment translations
const I18N_LANGS: TargetLang[] = ["en", "ja", "zh-CN"];
const LANG_LABELS: Record<TargetLang, string> = {
  en: "English",
  ja: "日本語",
  "zh-CN": "简体中文",
};

interface AssessmentI18nForm {
  title: string;
  description: string;
}

interface QuestionI18nForm {
  question_text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  hint: string;
}

interface QuestionForm {
  question_type: QuestionType;
  question_text: string;
  options: string[];
  correct_answer: string;
  points: number;
  explanation: string;
  hint: string;
}

const emptyQuestion: QuestionForm = {
  question_type: "multiple_choice_4",
  question_text: "",
  options: ["", "", "", ""],
  correct_answer: "",
  points: 10,
  explanation: "",
  hint: "",
};

const emptyAssessmentI18n = (): Record<TargetLang, AssessmentI18nForm> => ({
  en: { title: "", description: "" },
  ja: { title: "", description: "" },
  "zh-CN": { title: "", description: "" },
});

const emptyQuestionI18n = (optCount: number): Record<TargetLang, QuestionI18nForm> => ({
  en: { question_text: "", options: Array(optCount).fill(""), correct_answer: "", explanation: "", hint: "" },
  ja: { question_text: "", options: Array(optCount).fill(""), correct_answer: "", explanation: "", hint: "" },
  "zh-CN": { question_text: "", options: Array(optCount).fill(""), correct_answer: "", explanation: "", hint: "" },
});

const emptyManualFlags = (): Record<TargetLang, { title: boolean; description: boolean }> => ({
  en: { title: false, description: false },
  ja: { title: false, description: false },
  "zh-CN": { title: false, description: false },
});

const emptyQuestionManualFlags = (): Record<TargetLang, { question_text: boolean; options: boolean; correct_answer: boolean; explanation: boolean; hint: boolean }> => ({
  en: { question_text: false, options: false, correct_answer: false, explanation: false, hint: false },
  ja: { question_text: false, options: false, correct_answer: false, explanation: false, hint: false },
  "zh-CN": { question_text: false, options: false, correct_answer: false, explanation: false, hint: false },
});

const questionTypeLabels: Record<QuestionType, { ko: string; en: string }> = {
  multiple_choice_4: { ko: "4지선다", en: "4 Choices" },
  multiple_choice_5: { ko: "5지선다", en: "5 Choices" },
  short_answer: { ko: "단답형", en: "Short Answer" },
  essay: { ko: "서술형", en: "Essay" },
  ox: { ko: "OX", en: "True/False" },
};

export default function AssessmentManager({ courseId }: { courseId: string }) {
  const { user } = useUser();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en");
  const activeLang: "ko" | "en" | "ja" | "zh-CN" = i18n.language?.startsWith("en")
    ? "en"
    : i18n.language?.startsWith("ja")
    ? "ja"
    : i18n.language?.startsWith("zh")
    ? "zh-CN"
    : "ko";
  const queryClient = useQueryClient();

  const [assessmentDialogOpen, setAssessmentDialogOpen] = useState(false);
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionForm, setQuestionForm] = useState<QuestionForm>(emptyQuestion);
  const [showResults, setShowResults] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [keepDialogOpen, setKeepDialogOpen] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // Assessment base form (Korean)
  const [assessmentForm, setAssessmentForm] = useState({
    title: "",
    description: "",
    passing_score: 60,
    max_attempts: 3,
    time_limit_minutes: null as number | null,
    completion_threshold: 80,
    require_assessment_for_completion: false,
    randomize_questions: true,
    is_published: false,
  });
  // Assessment translations
  const [assessmentI18nForm, setAssessmentI18nForm] = useState<Record<TargetLang, AssessmentI18nForm>>(emptyAssessmentI18n());
  const [assessmentManual, setAssessmentManual] = useState(emptyManualFlags());
  const [translatingAssessment, setTranslatingAssessment] = useState<TargetLang | "all" | null>(null);

  // Question translations
  const [questionI18nForm, setQuestionI18nForm] = useState<Record<TargetLang, QuestionI18nForm>>(emptyQuestionI18n(4));
  const [questionManual, setQuestionManual] = useState(emptyQuestionManualFlags());
  const [translatingQuestion, setTranslatingQuestion] = useState<TargetLang | "all" | null>(null);

  // Auto-sync KO → each language for assessment when not manually edited
  useEffect(() => {
    setAssessmentI18nForm(prev => {
      const next = { ...prev };
      I18N_LANGS.forEach(lc => {
        if (!assessmentManual[lc].title) next[lc] = { ...next[lc], title: assessmentForm.title };
      });
      return next;
    });
  }, [assessmentForm.title]);

  useEffect(() => {
    setAssessmentI18nForm(prev => {
      const next = { ...prev };
      I18N_LANGS.forEach(lc => {
        if (!assessmentManual[lc].description) next[lc] = { ...next[lc], description: assessmentForm.description };
      });
      return next;
    });
  }, [assessmentForm.description]);

  // Auto-sync KO → each language for question fields
  useEffect(() => {
    setQuestionI18nForm(prev => {
      const next = { ...prev };
      I18N_LANGS.forEach(lc => {
        if (!questionManual[lc].question_text) next[lc] = { ...next[lc], question_text: questionForm.question_text };
      });
      return next;
    });
  }, [questionForm.question_text]);

  useEffect(() => {
    setQuestionI18nForm(prev => {
      const next = { ...prev };
      I18N_LANGS.forEach(lc => {
        if (!questionManual[lc].correct_answer) next[lc] = { ...next[lc], correct_answer: questionForm.correct_answer };
      });
      return next;
    });
  }, [questionForm.correct_answer]);

  useEffect(() => {
    setQuestionI18nForm(prev => {
      const next = { ...prev };
      I18N_LANGS.forEach(lc => {
        if (!questionManual[lc].explanation) next[lc] = { ...next[lc], explanation: questionForm.explanation };
      });
      return next;
    });
  }, [questionForm.explanation]);

  useEffect(() => {
    setQuestionI18nForm(prev => {
      const next = { ...prev };
      I18N_LANGS.forEach(lc => {
        if (!questionManual[lc].hint) next[lc] = { ...next[lc], hint: questionForm.hint };
      });
      return next;
    });
  }, [questionForm.hint]);

  useEffect(() => {
    setQuestionI18nForm(prev => {
      const next = { ...prev };
      I18N_LANGS.forEach(lc => {
        if (!questionManual[lc].options) next[lc] = { ...next[lc], options: [...questionForm.options] };
      });
      return next;
    });
  }, [questionForm.options]);

  // Fetch assessment
  const { data: assessment, isLoading } = useQuery({
    queryKey: ["assessment", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select("*")
        .eq("course_id", courseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch questions
  const { data: questions = [] } = useQuery({
    queryKey: ["assessment-questions", assessment?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_questions")
        .select("*")
        .eq("assessment_id", assessment!.id)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!assessment?.id,
  });

  // Fetch ALL assessment i18n rows
  const { data: assessmentI18nRows = [] } = useQuery({
    queryKey: ["assessment-i18n-all", assessment?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_i18n" as any)
        .select("*")
        .eq("assessment_id", assessment!.id);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!assessment?.id,
  });

  // Fetch ALL question i18n rows
  const { data: questionI18nList = [] } = useQuery({
    queryKey: ["assessment-question-i18n-all", assessment?.id],
    queryFn: async () => {
      const qIds = questions.map((q: any) => q.id);
      if (qIds.length === 0) return [];
      const { data, error } = await supabase
        .from("assessment_question_i18n" as any)
        .select("*")
        .in("question_id", qIds);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: questions.length > 0,
  });

  // Index: question_id -> { en: row, ja: row, "zh-CN": row }
  const questionI18nMap = new Map<string, Record<string, any>>();
  (questionI18nList || []).forEach((qi: any) => {
    if (!questionI18nMap.has(qi.question_id)) questionI18nMap.set(qi.question_id, {});
    questionI18nMap.get(qi.question_id)![qi.language_code] = qi;
  });

  // Create/update assessment
  const upsertAssessmentMutation = useMutation({
    mutationFn: async () => {
      let assessmentId = assessment?.id;
      if (assessment) {
        const { error } = await supabase.from("assessments").update({
          ...assessmentForm,
        }).eq("id", assessment.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("assessments").insert({
          ...assessmentForm,
          course_id: courseId,
          created_by: user!.id,
        }).select("id").single();
        if (error) throw error;
        assessmentId = data.id;
      }

      if (!assessmentId) return;

      // Save i18n rows for each language
      const rows = I18N_LANGS.map(lc => ({
        assessment_id: assessmentId,
        language_code: lc,
        title: (assessmentI18nForm[lc].title || assessmentForm.title || "").trim(),
        description: assessmentI18nForm[lc].description?.trim() || null,
      })).filter(r => r.title); // skip empty titles

      if (rows.length) {
        const { error } = await supabase.from("assessment_i18n" as any).upsert(
          rows as any,
          { onConflict: "assessment_id,language_code" }
        );
        if (error) console.error("assessment i18n save error:", error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment", courseId] });
      queryClient.invalidateQueries({ queryKey: ["assessment-i18n-all"] });
      setAssessmentDialogOpen(false);
      toast({ title: t("assessment.saved") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // Add/update question
  const upsertQuestionMutation = useMutation({
    mutationFn: async () => {
      const isMcq = ["multiple_choice_4", "multiple_choice_5", "ox"].includes(questionForm.question_type);
      const payload = {
        assessment_id: assessment!.id,
        question_type: questionForm.question_type,
        question_text: questionForm.question_text,
        options: isMcq ? questionForm.options : null,
        correct_answer: questionForm.correct_answer,
        points: questionForm.points,
        explanation: questionForm.explanation || null,
        hint: questionForm.hint || null,
      };

      let questionId = editingQuestionId;
      if (editingQuestionId) {
        const { error } = await supabase.from("assessment_questions").update(payload).eq("id", editingQuestionId);
        if (error) throw error;
      } else {
        const maxOrder = questions.length > 0 ? Math.max(...questions.map((q: any) => q.order_index ?? 0)) + 1 : 0;
        const { data, error } = await supabase.from("assessment_questions").insert({ ...payload, order_index: maxOrder }).select("id").single();
        if (error) throw error;
        questionId = data.id;
      }

      if (!questionId) return;

      // Save i18n rows for each language
      const rows = I18N_LANGS.map(lc => {
        const f = questionI18nForm[lc];
        return {
          question_id: questionId,
          language_code: lc,
          question_text: (f.question_text || questionForm.question_text || "").trim(),
          options: isMcq ? (f.options.length ? f.options : questionForm.options) : null,
          correct_answer: (f.correct_answer || questionForm.correct_answer || "").trim(),
          explanation: f.explanation?.trim() || null,
          hint: f.hint?.trim() || null,
        };
      }).filter(r => r.question_text);

      if (rows.length) {
        const { error } = await supabase.from("assessment_question_i18n" as any).upsert(
          rows as any,
          { onConflict: "question_id,language_code" }
        );
        if (error) console.error("question i18n save error:", error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment-questions", assessment?.id] });
      queryClient.invalidateQueries({ queryKey: ["assessment-question-i18n-all"] });
      const wasAdding = !editingQuestionId;
      toast({ title: editingQuestionId ? t("assessment.questionUpdated") : t("assessment.questionAdded") });
      if (keepDialogOpen && wasAdding) {
        // Reset form for next question, keep dialog open
        setSavedCount((c) => c + 1);
        setEditingQuestionId(null);
        setQuestionForm(emptyQuestion);
        setQuestionI18nForm(emptyQuestionI18n(4));
        setQuestionManual(emptyQuestionManualFlags());
        setKeepDialogOpen(false);
      } else {
        setQuestionDialogOpen(false);
        setEditingQuestionId(null);
        setQuestionForm(emptyQuestion);
        setQuestionI18nForm(emptyQuestionI18n(4));
        setQuestionManual(emptyQuestionManualFlags());
        setKeepDialogOpen(false);
      }
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assessment_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment-questions", assessment?.id] });
      toast({ title: t("assessment.questionDeleted") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const togglePublishMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("assessments").update({ is_published: !assessment!.is_published }).eq("id", assessment!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment", courseId] });
      toast({ title: assessment?.is_published ? t("assessment.unpublished") : t("assessment.published") });
    },
  });

  const openEditAssessment = () => {
    if (assessment) {
      setAssessmentForm({
        title: assessment.title,
        description: assessment.description || "",
        passing_score: assessment.passing_score,
        max_attempts: assessment.max_attempts,
        time_limit_minutes: assessment.time_limit_minutes,
        completion_threshold: Number(assessment.completion_threshold),
        require_assessment_for_completion: assessment.require_assessment_for_completion,
        randomize_questions: assessment.randomize_questions,
        is_published: assessment.is_published,
      });
      // Load i18n rows
      const next = emptyAssessmentI18n();
      const flags = emptyManualFlags();
      I18N_LANGS.forEach(lc => {
        const row = assessmentI18nRows.find((r: any) => r.language_code === lc);
        if (row) {
          next[lc] = { title: row.title || assessment.title, description: row.description || "" };
          flags[lc] = { title: true, description: true };
        } else {
          next[lc] = { title: assessment.title, description: assessment.description || "" };
        }
      });
      setAssessmentI18nForm(next);
      setAssessmentManual(flags);
    } else {
      setAssessmentForm({
        title: isEn ? "Course Assessment" : "과정 평가",
        description: "",
        passing_score: 60,
        max_attempts: 3,
        time_limit_minutes: null,
        completion_threshold: 80,
        require_assessment_for_completion: false,
        randomize_questions: true,
        is_published: false,
      });
      setAssessmentI18nForm(emptyAssessmentI18n());
      setAssessmentManual(emptyManualFlags());
    }
    setAssessmentDialogOpen(true);
  };

  const openAddQuestion = () => {
    setEditingQuestionId(null);
    setQuestionForm(emptyQuestion);
    setQuestionI18nForm(emptyQuestionI18n(4));
    setQuestionManual(emptyQuestionManualFlags());
    setSavedCount(0);
    setQuestionDialogOpen(true);
  };

  const openEditQuestion = (q: any) => {
    setEditingQuestionId(q.id);
    const opts = q.options || [];
    const optCount = q.question_type === "multiple_choice_5" ? 5 : q.question_type === "multiple_choice_4" ? 4 : q.question_type === "ox" ? 2 : 0;
    const baseOpts = q.question_type === "ox"
      ? ["O", "X"]
      : optCount > 0
      ? [...opts, ...Array(Math.max(0, optCount - opts.length)).fill("")]
      : [];

    setQuestionForm({
      question_type: q.question_type,
      question_text: q.question_text,
      options: baseOpts,
      correct_answer: q.correct_answer,
      points: q.points,
      explanation: q.explanation || "",
      hint: q.hint || "",
    });

    const i18nByLang = questionI18nMap.get(q.id) || {};
    const next = emptyQuestionI18n(optCount);
    const flags = emptyQuestionManualFlags();
    I18N_LANGS.forEach(lc => {
      const row = i18nByLang[lc];
      const enOpts = row?.options || [];
      const langOpts = q.question_type === "ox"
        ? ["O", "X"]
        : optCount > 0
        ? [...enOpts, ...Array(Math.max(0, optCount - enOpts.length)).fill("")]
        : [];
      if (row) {
        next[lc] = {
          question_text: row.question_text || q.question_text,
          options: langOpts,
          correct_answer: row.correct_answer || q.correct_answer,
          explanation: row.explanation || q.explanation || "",
          hint: row.hint || q.hint || "",
        };
        flags[lc] = { question_text: true, options: true, correct_answer: true, explanation: true, hint: true };
      } else {
        next[lc] = {
          question_text: q.question_text,
          options: [...baseOpts],
          correct_answer: q.correct_answer,
          explanation: q.explanation || "",
          hint: q.hint || "",
        };
      }
    });
    setQuestionI18nForm(next);
    setQuestionManual(flags);
    setQuestionDialogOpen(true);
  };

  const handleTypeChange = (type: QuestionType) => {
    let options: string[] = [];
    let optCount = 0;
    if (type === "multiple_choice_4") { options = ["", "", "", ""]; optCount = 4; }
    else if (type === "multiple_choice_5") { options = ["", "", "", "", ""]; optCount = 5; }
    else if (type === "ox") { options = ["O", "X"]; optCount = 2; }
    setQuestionForm(f => ({ ...f, question_type: type, options, correct_answer: "" }));
    setQuestionI18nForm(emptyQuestionI18n(optCount));
    setQuestionManual(emptyQuestionManualFlags());
  };

  // Translate assessment for a specific language
  const handleTranslateAssessment = async (lc: TargetLang) => {
    const texts: string[] = [];
    if (assessmentForm.title) texts.push(assessmentForm.title);
    if (assessmentForm.description) texts.push(assessmentForm.description);
    if (!texts.length) return;
    setTranslatingAssessment(lc);
    try {
      const results = await translateKoTo(lc, texts);
      let idx = 0;
      const tTitle = assessmentForm.title ? (results[idx++] || "") : "";
      const tDesc = assessmentForm.description ? (results[idx++] || "") : "";
      setAssessmentI18nForm(prev => ({
        ...prev,
        [lc]: {
          title: tTitle || prev[lc].title,
          description: tDesc || prev[lc].description,
        },
      }));
      setAssessmentManual(prev => ({ ...prev, [lc]: { title: true, description: true } }));
    } catch { /* silent */ }
    finally { setTranslatingAssessment(null); }
  };

  // Translate question for a specific language
  const handleTranslateQuestion = async (lc: TargetLang) => {
    const texts: string[] = [];
    const fields: string[] = [];
    if (questionForm.question_text) { texts.push(questionForm.question_text); fields.push("question_text"); }
    if (questionForm.correct_answer && questionForm.question_type !== "ox") { texts.push(questionForm.correct_answer); fields.push("correct_answer"); }
    if (questionForm.explanation) { texts.push(questionForm.explanation); fields.push("explanation"); }
    if (questionForm.hint) { texts.push(questionForm.hint); fields.push("hint"); }
    if (["multiple_choice_4", "multiple_choice_5"].includes(questionForm.question_type)) {
      questionForm.options.forEach((opt, i) => {
        if (opt.trim()) { texts.push(opt); fields.push(`option_${i}`); }
      });
    }
    if (!texts.length) return;
    setTranslatingQuestion(lc);
    try {
      const results = await translateKoTo(lc, texts);
      const newOptions = [...questionI18nForm[lc].options];
      const updates: Partial<QuestionI18nForm> = {};
      let idx = 0;
      for (const field of fields) {
        if (field === "question_text") updates.question_text = results[idx];
        else if (field === "correct_answer") updates.correct_answer = results[idx];
        else if (field === "explanation") updates.explanation = results[idx];
        else if (field === "hint") updates.hint = results[idx];
        else if (field.startsWith("option_")) {
          const optIdx = parseInt(field.split("_")[1]);
          newOptions[optIdx] = results[idx] || "";
        }
        idx++;
      }
      updates.options = newOptions;
      setQuestionI18nForm(prev => ({ ...prev, [lc]: { ...prev[lc], ...updates } }));
      setQuestionManual(prev => ({
        ...prev,
        [lc]: { question_text: true, options: true, correct_answer: true, explanation: true, hint: true },
      }));
    } catch { /* silent */ }
    finally { setTranslatingQuestion(null); }
  };

  // Translate assessment for ALL target languages at once
  const handleTranslateAssessmentAll = async () => {
    if (!assessmentForm.title && !assessmentForm.description) return;
    setTranslatingAssessment("all");
    try {
      await Promise.all(I18N_LANGS.map(async (lc) => {
        const texts: string[] = [];
        if (assessmentForm.title) texts.push(assessmentForm.title);
        if (assessmentForm.description) texts.push(assessmentForm.description);
        try {
          const results = await translateKoTo(lc, texts);
          let idx = 0;
          const tTitle = assessmentForm.title ? (results[idx++] || "") : "";
          const tDesc = assessmentForm.description ? (results[idx++] || "") : "";
          setAssessmentI18nForm(prev => ({
            ...prev,
            [lc]: {
              title: tTitle || prev[lc].title,
              description: tDesc || prev[lc].description,
            },
          }));
          setAssessmentManual(prev => ({ ...prev, [lc]: { title: true, description: true } }));
        } catch { /* per-lang silent */ }
      }));
    } finally {
      setTranslatingAssessment(null);
    }
  };

  // Translate question for ALL target languages at once
  const handleTranslateQuestionAll = async () => {
    if (!questionForm.question_text.trim()) return;
    const texts: string[] = [];
    const fields: string[] = [];
    if (questionForm.question_text) { texts.push(questionForm.question_text); fields.push("question_text"); }
    if (questionForm.correct_answer && questionForm.question_type !== "ox") { texts.push(questionForm.correct_answer); fields.push("correct_answer"); }
    if (questionForm.explanation) { texts.push(questionForm.explanation); fields.push("explanation"); }
    if (questionForm.hint) { texts.push(questionForm.hint); fields.push("hint"); }
    if (["multiple_choice_4", "multiple_choice_5"].includes(questionForm.question_type)) {
      questionForm.options.forEach((opt, i) => {
        if (opt.trim()) { texts.push(opt); fields.push(`option_${i}`); }
      });
    }
    if (!texts.length) return;
    setTranslatingQuestion("all");
    try {
      await Promise.all(I18N_LANGS.map(async (lc) => {
        try {
          const results = await translateKoTo(lc, texts);
          const newOptions = [...questionI18nForm[lc].options];
          const updates: Partial<QuestionI18nForm> = {};
          let idx = 0;
          for (const field of fields) {
            if (field === "question_text") updates.question_text = results[idx];
            else if (field === "correct_answer") updates.correct_answer = results[idx];
            else if (field === "explanation") updates.explanation = results[idx];
            else if (field === "hint") updates.hint = results[idx];
            else if (field.startsWith("option_")) {
              const optIdx = parseInt(field.split("_")[1]);
              newOptions[optIdx] = results[idx] || "";
            }
            idx++;
          }
          updates.options = newOptions;
          setQuestionI18nForm(prev => ({ ...prev, [lc]: { ...prev[lc], ...updates } }));
          setQuestionManual(prev => ({
            ...prev,
            [lc]: { question_text: true, options: true, correct_answer: true, explanation: true, hint: true },
          }));
        } catch { /* per-lang silent */ }
      }));
    } finally {
      setTranslatingQuestion(null);
    }
  };

  const updateLangAssessment = (lc: TargetLang, patch: Partial<AssessmentI18nForm>) => {
    setAssessmentI18nForm(prev => ({ ...prev, [lc]: { ...prev[lc], ...patch } }));
    setAssessmentManual(prev => ({
      ...prev,
      [lc]: {
        title: patch.title !== undefined ? true : prev[lc].title,
        description: patch.description !== undefined ? true : prev[lc].description,
      },
    }));
  };

  const updateLangQuestion = (lc: TargetLang, patch: Partial<QuestionI18nForm>) => {
    setQuestionI18nForm(prev => ({ ...prev, [lc]: { ...prev[lc], ...patch } }));
    setQuestionManual(prev => ({
      ...prev,
      [lc]: {
        question_text: patch.question_text !== undefined ? true : prev[lc].question_text,
        options: patch.options !== undefined ? true : prev[lc].options,
        correct_answer: patch.correct_answer !== undefined ? true : prev[lc].correct_answer,
        explanation: patch.explanation !== undefined ? true : prev[lc].explanation,
        hint: patch.hint !== undefined ? true : prev[lc].hint,
      },
    }));
  };

  const totalPoints = questions.reduce((s: number, q: any) => s + (q.points || 0), 0);

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          {t("assessment.title")}
        </h2>
        <div className="flex items-center gap-2">
          {assessment && (
            <>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setShowResults(!showResults)}>
                <Users className="h-3 w-3" />
                {showResults ? (isEn ? "Questions" : "문항 관리") : (isEn ? "Results" : "결과 보기")}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => togglePublishMutation.mutate()}>
                {assessment.is_published ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {assessment.is_published ? t("assessment.unpublishBtn") : t("assessment.publishBtn")}
              </Button>
            </>
          )}
          <Button size="sm" className="h-8 text-xs gap-1" onClick={openEditAssessment}>
            {assessment ? <Pencil className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {assessment ? t("assessment.editSettings") : t("assessment.create")}
          </Button>
        </div>
      </div>

      {/* Assessment content */}
      {!assessment ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center space-y-2">
          <ClipboardCheck className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("assessment.noAssessment")}</p>
          <Button variant="outline" size="sm" onClick={openEditAssessment} className="text-xs">
            {t("assessment.create")}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="bg-secondary/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{assessment.title}</span>
                <Badge variant={assessment.is_published ? "default" : "secondary"} className="text-[10px] h-5">
                  {assessment.is_published ? t("assessment.publishedStatus") : t("assessment.draftStatus")}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("assessment.passingScore")}: {assessment.passing_score}{t("common.points")} | {t("assessment.maxAttempts")}: {assessment.max_attempts}{isEn ? " times" : "회"} | {t("assessment.completionThreshold")}: {Number(assessment.completion_threshold)}% | {t("assessment.questionCount")}: {questions.length}{isEn ? "" : "문항"} ({totalPoints}{t("common.points")})
              </p>
            </div>
            {!showResults && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setBulkUploadOpen(true)}>
                  <FileSpreadsheet className="h-3 w-3" />
                  엑셀 일괄 등록
                </Button>
                <Button size="sm" className="h-8 text-xs gap-1" onClick={openAddQuestion}>
                  <Plus className="h-3 w-3" />
                  {t("assessment.addQuestion")}
                </Button>
              </div>
            )}
          </div>

          {showResults ? (
            <div className="p-4">
              <AssessmentResults courseId={courseId} assessmentId={assessment.id} assessmentTitle={assessment.title} passingScore={assessment.passing_score} />
            </div>
          ) : (
            <>
              {questions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t("assessment.noQuestions")}</div>
              ) : (
                <ol className="divide-y divide-border">
                  {questions.map((q: any, idx: number) => {
                    const tr = activeLang === "ko" ? null : questionI18nMap.get(q.id)?.[activeLang];
                    const displayText = (tr?.question_text as string | undefined)?.trim() || q.question_text;
                    const displayOptions = Array.isArray(tr?.options) && tr.options.length
                      ? (tr.options as string[])
                      : (q.options as string[] | null);
                    return (
                    <li key={q.id} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/20 transition-colors group">
                      <span className="mt-0.5 w-6 shrink-0 text-center font-mono text-xs text-muted-foreground">{idx + 1}</span>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[9px] h-4 shrink-0">
                            {isEn ? questionTypeLabels[q.question_type as QuestionType]?.en : questionTypeLabels[q.question_type as QuestionType]?.ko}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{q.points}{t("common.points")}</span>
                        </div>
                        <p className="text-sm text-foreground line-clamp-2">{displayText}</p>
                        {displayOptions && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {displayOptions.map((opt: string, i: number) => {
                              const koOpt = (q.options as string[] | null)?.[i];
                              const isCorrect = koOpt === q.correct_answer;
                              return (
                              <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${isCorrect ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium" : "bg-muted text-muted-foreground"}`}>
                                {opt || `(${i + 1})`}
                              </span>
                              );
                            })}
                          </div>
                        )}
                        {!displayOptions && q.correct_answer && (
                          <p className="text-[10px] text-green-600 dark:text-green-400">{t("assessment.answer")}: {q.correct_answer}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => openEditQuestion(q)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("assessment.deleteQuestion")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("assessment.deleteQuestionConfirm")}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteQuestionMutation.mutate(q.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                {t("common.delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}

      {/* Assessment Settings Dialog */}
      <Dialog open={assessmentDialogOpen} onOpenChange={setAssessmentDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{assessment ? t("assessment.editSettings") : t("assessment.create")}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="ko" className="w-full">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="ko" className="text-xs">한국어</TabsTrigger>
              {I18N_LANGS.map(lc => (
                <TabsTrigger key={lc} value={lc} className="text-xs">{LANG_LABELS[lc]}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="ko" className="space-y-3 pt-3">
              <div className="flex items-center justify-end">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                  onClick={handleTranslateAssessmentAll}
                  disabled={!!translatingAssessment || (!assessmentForm.title && !assessmentForm.description)}>
                  <Languages className="h-3 w-3" />
                  {translatingAssessment === "all"
                    ? (isEn ? "Translating all…" : "전체 번역 중…")
                    : (isEn ? "Auto-translate all (3 langs)" : "전체 자동 번역 (3개 언어)")}
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("assessment.assessmentTitle")}</Label>
                <Input className="h-9 text-sm" value={assessmentForm.title} onChange={e => setAssessmentForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("assessment.description")}</Label>
                <Textarea className="text-sm" value={assessmentForm.description} onChange={e => setAssessmentForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
            </TabsContent>

            {I18N_LANGS.map(lc => (
              <TabsContent key={lc} value={lc} className="space-y-3 pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">{isEn ? "Falls back to Korean if empty" : "미입력 시 한국어 폴백"}</p>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                    onClick={() => handleTranslateAssessment(lc)}
                    disabled={!!translatingAssessment || (!assessmentForm.title && !assessmentForm.description)}>
                    <Languages className="h-3 w-3" />
                    {translatingAssessment === lc ? (isEn ? "Translating…" : "번역 중…") : t("course.autoTranslate", "자동 번역")}
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("assessment.assessmentTitle")} ({LANG_LABELS[lc]})</Label>
                  <Input className="h-9 text-sm" value={assessmentI18nForm[lc].title}
                    onChange={e => updateLangAssessment(lc, { title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("assessment.description")} ({LANG_LABELS[lc]})</Label>
                  <Textarea className="text-sm" value={assessmentI18nForm[lc].description}
                    onChange={e => updateLangAssessment(lc, { description: e.target.value })} rows={2} />
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <Separator />

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("assessment.passingScore")}</Label>
                <Input className="h-9 text-sm" type="number" value={assessmentForm.passing_score} onChange={e => setAssessmentForm(f => ({ ...f, passing_score: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("assessment.maxAttempts")}</Label>
                <Input className="h-9 text-sm" type="number" value={assessmentForm.max_attempts} onChange={e => setAssessmentForm(f => ({ ...f, max_attempts: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("assessment.timeLimit")}</Label>
                <Input className="h-9 text-sm" type="number" placeholder={isEn ? "No limit" : "제한 없음"} value={assessmentForm.time_limit_minutes ?? ""} onChange={e => setAssessmentForm(f => ({ ...f, time_limit_minutes: e.target.value ? Number(e.target.value) : null }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("assessment.completionThreshold")}</Label>
                <Input className="h-9 text-sm" type="number" value={assessmentForm.completion_threshold} onChange={e => setAssessmentForm(f => ({ ...f, completion_threshold: Number(e.target.value) }))} />
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold">{t("assessment.requireForCompletion")}</Label>
                <p className="text-[10px] text-muted-foreground">{t("assessment.requireForCompletionDesc")}</p>
              </div>
              <Switch checked={assessmentForm.require_assessment_for_completion} onCheckedChange={v => setAssessmentForm(f => ({ ...f, require_assessment_for_completion: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold">{t("assessment.randomize")}</Label>
                <p className="text-[10px] text-muted-foreground">{t("assessment.randomizeDesc")}</p>
              </div>
              <Switch checked={assessmentForm.randomize_questions} onCheckedChange={v => setAssessmentForm(f => ({ ...f, randomize_questions: v }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAssessmentDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={() => upsertAssessmentMutation.mutate()} disabled={!assessmentForm.title.trim() || upsertAssessmentMutation.isPending}>
              {upsertAssessmentMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Question Dialog */}
      <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{editingQuestionId ? t("assessment.editQuestion") : t("assessment.addQuestion")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("assessment.questionType")}</Label>
                <Select value={questionForm.question_type} onValueChange={(v) => handleTypeChange(v as QuestionType)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(questionTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{isEn ? v.en : v.ko}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("assessment.pointsLabel")}</Label>
                <Input className="h-9 text-sm" type="number" value={questionForm.points} onChange={e => setQuestionForm(f => ({ ...f, points: Number(e.target.value) }))} />
              </div>
            </div>

            <Tabs defaultValue="ko" className="w-full">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="ko" className="text-xs">한국어</TabsTrigger>
                {I18N_LANGS.map(lc => (
                  <TabsTrigger key={lc} value={lc} className="text-xs">{LANG_LABELS[lc]}</TabsTrigger>
                ))}
              </TabsList>

              {/* Korean tab */}
              <TabsContent value="ko" className="space-y-3 pt-3">
                <div className="flex items-center justify-end">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                    onClick={handleTranslateQuestionAll}
                    disabled={!!translatingQuestion || !questionForm.question_text.trim()}>
                    <Languages className="h-3 w-3" />
                    {translatingQuestion === "all"
                      ? (isEn ? "Translating all…" : "전체 번역 중…")
                      : (isEn ? "Auto-translate all (3 langs)" : "전체 자동 번역 (3개 언어)")}
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("assessment.questionText")}</Label>
                  <Textarea className="text-sm" value={questionForm.question_text} onChange={e => setQuestionForm(f => ({ ...f, question_text: e.target.value }))} rows={3} />
                </div>

                {["multiple_choice_4", "multiple_choice_5", "ox"].includes(questionForm.question_type) && (
                  <div className="space-y-2">
                    <Label className="text-xs">{t("assessment.options")}</Label>
                    {questionForm.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="radio" name="ko_correct_answer" checked={questionForm.correct_answer === opt && opt !== ""} onChange={() => setQuestionForm(f => ({ ...f, correct_answer: opt }))} className="h-4 w-4 text-primary" />
                        {questionForm.question_type === "ox" ? (
                          <span className="text-sm font-medium">{opt}</span>
                        ) : (
                          <Input className="h-8 text-sm flex-1" value={opt} placeholder={`보기 ${i + 1}`}
                            onChange={e => {
                              const newOpts = [...questionForm.options];
                              const wasSelected = questionForm.correct_answer === newOpts[i];
                              newOpts[i] = e.target.value;
                              setQuestionForm(f => ({ ...f, options: newOpts, correct_answer: wasSelected ? e.target.value : f.correct_answer }));
                            }}
                          />
                        )}
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground">{t("assessment.selectCorrect")}</p>
                  </div>
                )}

                {["short_answer", "essay"].includes(questionForm.question_type) && (
                  <div className="space-y-1">
                    <Label className="text-xs">{t("assessment.correctAnswer")}</Label>
                    {questionForm.question_type === "short_answer" ? (
                      <Input className="h-9 text-sm" value={questionForm.correct_answer} onChange={e => setQuestionForm(f => ({ ...f, correct_answer: e.target.value }))} placeholder="정답 (일치하는 답)" />
                    ) : (
                      <Textarea className="text-sm" value={questionForm.correct_answer} onChange={e => setQuestionForm(f => ({ ...f, correct_answer: e.target.value }))} rows={2} placeholder="모범 답안 / 키워드" />
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">{t("assessment.explanation")}</Label>
                  <Textarea className="text-sm" value={questionForm.explanation} onChange={e => setQuestionForm(f => ({ ...f, explanation: e.target.value }))} rows={2} placeholder="채점 후 표시될 해설 (선택사항)" />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">{isEn ? "Hint" : "힌트"}</Label>
                  <Textarea className="text-sm" value={questionForm.hint} onChange={e => setQuestionForm(f => ({ ...f, hint: e.target.value }))} rows={2} placeholder="시험 중 학생에게 보여줄 힌트 (선택사항)" />
                </div>
              </TabsContent>

              {/* Translation tabs */}
              {I18N_LANGS.map(lc => {
                const f = questionI18nForm[lc];
                const isMcq = ["multiple_choice_4", "multiple_choice_5", "ox"].includes(questionForm.question_type);
                return (
                  <TabsContent key={lc} value={lc} className="space-y-3 pt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">{isEn ? "Falls back to Korean if empty" : "미입력 시 한국어 폴백"}</p>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                        onClick={() => handleTranslateQuestion(lc)}
                        disabled={!!translatingQuestion || !questionForm.question_text.trim()}>
                        <Languages className="h-3 w-3" />
                        {translatingQuestion === lc ? (isEn ? "Translating…" : "번역 중…") : t("course.autoTranslate", "자동 번역")}
                      </Button>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">{t("assessment.questionText")} ({LANG_LABELS[lc]})</Label>
                      <Textarea className="text-sm" value={f.question_text}
                        onChange={e => updateLangQuestion(lc, { question_text: e.target.value })} rows={3} />
                    </div>

                    {isMcq && (
                      <div className="space-y-2">
                        <Label className="text-xs">{t("assessment.options")} ({LANG_LABELS[lc]})</Label>
                        {f.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-4" />
                            {questionForm.question_type === "ox" ? (
                              <span className="text-sm font-medium">{opt}</span>
                            ) : (
                              <Input className="h-8 text-sm flex-1" value={opt} placeholder={`Option ${i + 1}`}
                                onChange={e => {
                                  const newOpts = [...f.options];
                                  newOpts[i] = e.target.value;
                                  updateLangQuestion(lc, { options: newOpts });
                                }} />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {["short_answer", "essay"].includes(questionForm.question_type) && (
                      <div className="space-y-1">
                        <Label className="text-xs">{t("assessment.correctAnswer")} ({LANG_LABELS[lc]})</Label>
                        {questionForm.question_type === "short_answer" ? (
                          <Input className="h-9 text-sm" value={f.correct_answer}
                            onChange={e => updateLangQuestion(lc, { correct_answer: e.target.value })} placeholder="Exact match answer" />
                        ) : (
                          <Textarea className="text-sm" value={f.correct_answer}
                            onChange={e => updateLangQuestion(lc, { correct_answer: e.target.value })} rows={2} placeholder="Model answer / keywords" />
                        )}
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">{t("assessment.explanation")} ({LANG_LABELS[lc]})</Label>
                      <Textarea className="text-sm" value={f.explanation}
                        onChange={e => updateLangQuestion(lc, { explanation: e.target.value })} rows={2} />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">{isEn ? "Hint" : "힌트"} ({LANG_LABELS[lc]})</Label>
                      <Textarea className="text-sm" value={f.hint}
                        onChange={e => updateLangQuestion(lc, { hint: e.target.value })} rows={2} />
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            {!editingQuestionId && savedCount > 0 && (
              <span className="text-[11px] text-muted-foreground mr-auto self-center">
                {isEn ? `${savedCount} added in this session` : `이번 세션에서 ${savedCount}개 추가됨`}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => setQuestionDialogOpen(false)}>{t("common.cancel")}</Button>
            {!editingQuestionId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setKeepDialogOpen(true); upsertQuestionMutation.mutate(); }}
                disabled={!questionForm.question_text.trim() || !questionForm.correct_answer.trim() || upsertQuestionMutation.isPending}
                className="gap-1"
              >
                <Plus className="h-3 w-3" />
                {isEn ? "Save & add another" : "저장 후 계속 추가"}
              </Button>
            )}
            <Button size="sm" onClick={() => { setKeepDialogOpen(false); upsertQuestionMutation.mutate(); }} disabled={!questionForm.question_text.trim() || !questionForm.correct_answer.trim() || upsertQuestionMutation.isPending}>
              {upsertQuestionMutation.isPending ? t("common.saving") : editingQuestionId ? t("common.edit") : t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {assessment && (
        <BulkQuestionUploadDialog
          open={bulkUploadOpen}
          onOpenChange={setBulkUploadOpen}
          assessmentId={assessment.id}
          startOrderIndex={questions.length > 0 ? Math.max(...questions.map((q: any) => q.order_index ?? 0)) + 1 : 0}
        />
      )}
    </section>
  );
}
