import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, X, Check, ChevronDown, ChevronUp, Timer, ClipboardCheck, Lightbulb, Trophy, RotateCcw, Eye, Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import PageSkeleton from "@/components/PageSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

type QuestionType = "multiple_choice_4" | "multiple_choice_5" | "short_answer" | "essay" | "ox";

const HANGUL_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

const hasHangulValue = (value: unknown): boolean => {
  if (typeof value === "string") return HANGUL_RE.test(value);
  if (Array.isArray(value)) return value.some((item) => hasHangulValue(item));
  if (value && typeof value === "object") return Object.values(value).some((item) => hasHangulValue(item));
  return false;
};

const isChoiceQuestion = (questionType?: string) => ["multiple_choice_4", "multiple_choice_5", "ox"].includes(questionType || "");

const parseOptionIndexAnswer = (value?: string | null): number | null => {
  if (!value || !/^\d+$/.test(value)) return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
};

type AssessmentLang = "en" | "ja" | "zh-CN" | "yue";

// 응시 전 언어 선택 옵션 (ko = 원본 한국어)
const ASSESSMENT_LANG_OPTIONS: { value: string; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "zh-CN", label: "中文(简体)" },
  { value: "yue", label: "廣東話" },
];


const questionNeedsTranslationRepair = (question: any, translation: any, targetLang: AssessmentLang | null): boolean => {
  if (!targetLang || !question?.id) return false;
  if (!translation) return true;
  const isChoice = isChoiceQuestion(question.question_type);
  if (hasHangulValue([translation.question_text, translation.options, translation.hint, translation.explanation])) return true;
  if (!isChoice && hasHangulValue(translation.correct_answer)) return true;
  if (isChoice && Array.isArray(question.options)) {
    return !Array.isArray(translation.options) || translation.options.length !== question.options.length;
  }
  return false;
};

const shouldAutoRepairQuestionTranslation = (question: any, translation: any, targetLang: AssessmentLang | null): boolean =>
  questionNeedsTranslationRepair(question, translation, targetLang);

// UI blocking must be stricter than background repair. A translated MCQ can have
// stale Korean in hidden fields such as correct_answer/explanation while the
// visible question/options are already clean. Blocking the whole quiz for those
// hidden fields caused iOS users to see an endless "翻訳中..." card.
const questionHasCoreDisplayTranslationIssue = (question: any, translation: any, targetLang: AssessmentLang | null): boolean => {
  if (!targetLang || !question?.id) return false;
  if (!translation) return true;
  if (hasHangulValue([translation.question_text, translation.options])) return true;
  if (isChoiceQuestion(question.question_type) && Array.isArray(question.options)) {
    return !Array.isArray(translation.options) || translation.options.length !== question.options.length;
  }
  return false;
};

const repairKeyFor = (questionId: string, targetLang: AssessmentLang) => `${questionId}:${targetLang}`;

const getTakingQuestionTextParts = (question: any) => [
  question?.question_text,
  question?.options,
  question?.hint,
];

const getReviewQuestionTextParts = (question: any) => [
  question?.question_text,
  question?.options,
  question?.hint,
  question?.explanation,
  !isChoiceQuestion(question?.question_type) ? question?.correct_answer : null,
];

const QUESTION_TRANSLATION_TIMEOUT_MS = 15_000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const invokeQuestionTranslation = async (questionId: string, targetLang: AssessmentLang) => {
  const { data, error } = await withTimeout(
    supabase.functions.invoke("translate-question-now", {
      body: { question_id: questionId, target_lang: targetLang },
    }),
    QUESTION_TRANSLATION_TIMEOUT_MS,
    "Translation request timed out. Please try again.",
  );
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
};

const LANG_NATIVE: Record<string, string> = {
  en: "English",
  ja: "日本語",
  "zh-CN": "中文",
  yue: "廣東話",
};

const countryToAssessmentLang = (country?: string | null): AssessmentLang | null => {
  const normalized = (country || "").toUpperCase();
  if (normalized === "JP") return "ja";
  if (normalized === "US") return "en";
  if (normalized === "HK") return "yue";
  if (["CN", "TW"].includes(normalized)) return "zh-CN";
  return null;
};

// Localized labels for the translate button per target language
const TRANSLATE_LABELS: Record<string, { idle: string; loading: string; doneTitle: string; failTitle: string; failDesc: string; repairingNotice: string; fallbackNotice: string }> = {
  en: {
    idle: "Translate to English",
    loading: "Translating...",
    doneTitle: "Translated",
    failTitle: "Translation failed",
    failDesc: "Please try again in a moment.",
    repairingNotice: "Preparing the translated question...",
    fallbackNotice: "Automatic translation did not complete. You can continue, or tap the translate button to update this question.",
  },
  ja: {
    idle: "日本語に翻訳する",
    loading: "翻訳中...",
    doneTitle: "翻訳完了",
    failTitle: "翻訳に失敗しました",
    failDesc: "しばらくしてからもう一度お試しください。",
    repairingNotice: "翻訳済みの問題を準備しています...",
    fallbackNotice: "自動翻訳が完了しませんでした。翻訳ボタンを押すか、このまま進めます。",
  },
  "zh-CN": {
    idle: "翻译成中文",
    loading: "翻译中...",
    doneTitle: "翻译完成",
    failTitle: "翻译失败",
    failDesc: "请稍后重试。",
    repairingNotice: "正在准备翻译后的题目...",
    fallbackNotice: "自动翻译未完成。你可以继续，或点击翻译按钮更新此题。",
  },
  yue: {
    idle: "翻譯成廣東話",
    loading: "翻譯中...",
    doneTitle: "翻譯完成",
    failTitle: "翻譯失敗",
    failDesc: "請稍後再試。",
    repairingNotice: "正在準備翻譯後的題目...",
    fallbackNotice: "自動翻譯未完成，請按翻譯按鈕更新此題。",
  },
};

// Button shown next to a question when the displayed text still contains Korean
// even though the user picked another language. Calls an edge function that
// translates the question via Lovable AI and stores it in assessment_question_i18n
// so every user benefits afterward.
function TranslateQuestionButton({
  questionId, questionText, targetLang, onDone, hasKorean,
}: {
  questionId: string;
  questionText: string;
  targetLang: AssessmentLang | null;
  onDone: () => void | Promise<void>;
  hasKorean?: boolean;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!targetLang) return null;
  if (!(hasKorean ?? HANGUL_RE.test(questionText || ""))) return null;
  if (done) return null;

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await invokeQuestionTranslation(questionId, targetLang);
      const labels = TRANSLATE_LABELS[targetLang];
      toast({ title: "✓", description: labels.doneTitle });
      await onDone();
      setDone(true);
    } catch (e: any) {
      const labels = TRANSLATE_LABELS[targetLang];
      toast({
        title: labels.failTitle,
        description: e?.message || labels.failDesc,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const labels = TRANSLATE_LABELS[targetLang];
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void handleClick()}
      disabled={loading}
      className="mt-2 h-7 touch-manipulation rounded-full bg-secondary/40 px-2.5 text-xs text-muted-foreground"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
      {loading ? labels.loading : labels.idle}
    </Button>
  );
}

function TranslationRepairNotice({
  targetLang,
  repairing,
  failed,
}: {
  targetLang: AssessmentLang | null;
  repairing?: boolean;
  failed?: boolean;
}) {
  if (!targetLang || (!repairing && !failed)) return null;
  const labels = TRANSLATE_LABELS[targetLang];
  const text = repairing ? labels.repairingNotice : labels.fallbackNotice;
  return (
    <div
      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-2.5 py-1 text-[11px] leading-none text-muted-foreground"
      title={text}
      aria-label={text}
    >
      {repairing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
      <span className="truncate max-w-[220px] sm:max-w-none">{text}</span>
    </div>
  );
}

// ─── Review mode: single question with correct/wrong UI ───
function QuestionReview({
  question, index, total, userAnswer, isCorrect, isEn, onNext, onPrev, t,
  currentLang, onTranslated, questionI18n, sourceQuestion, repairing, repairFailed,
}: {
  question: any; index: number; total: number; userAnswer: string | null; isCorrect: boolean | null;
  isEn: boolean; onNext: () => void; onPrev: () => void; t: any;
   currentLang: AssessmentLang | null; onTranslated: () => void | Promise<void>;
  questionI18n?: any;
  sourceQuestion?: any;
  repairing?: boolean;
  repairFailed?: boolean;
}) {
  const [showHint, setShowHint] = useState(false);
  const isChoice = isChoiceQuestion(question.question_type);
  const options: string[] = (question.options as string[]) || [];
  const repairSource = sourceQuestion || question;
  const needsRepair = questionHasCoreDisplayTranslationIssue(repairSource, questionI18n, currentLang) || hasHangulValue(getReviewQuestionTextParts(question));
  const isRepairing = !!repairing && !repairFailed;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-base sm:text-lg leading-relaxed">
          <span className="font-bold mr-2">{index + 1}.</span>
          {question.question_text}
        </p>
        <TranslateQuestionButton
          questionId={question.id}
          questionText={question.question_text}
          targetLang={currentLang}
          hasKorean={hasHangulValue(getReviewQuestionTextParts(question))}
          onDone={onTranslated}
        />
        <TranslationRepairNotice
          targetLang={currentLang}
          repairing={needsRepair && isRepairing}
          failed={needsRepair && !!repairFailed}
        />
      </div>

      {isChoice && (
        <div className="space-y-3">
          {options.map((opt, i) => {
            const label = String.fromCharCode(65 + i);
            const isUserChoice = userAnswer === opt;
            const isCorrectOption = opt === question.correct_answer;
            const isWrong = isUserChoice && !isCorrectOption;

            let borderClass = "border-border";
            let bgClass = "";
            if (isCorrectOption) { borderClass = "border-green-500 dark:border-green-400"; bgClass = "bg-green-50/50 dark:bg-green-900/10"; }
            else if (isWrong) { borderClass = "border-destructive dark:border-red-400"; bgClass = "bg-red-50/50 dark:bg-red-900/10"; }

            return (
              <div key={i} className={`rounded-xl border-2 ${borderClass} ${bgClass} p-4 sm:p-5 transition-colors`}>
                <div className="flex items-start gap-3">
                  <span className="font-bold text-sm text-muted-foreground mt-0.5">{label}.</span>
                  <div className="flex-1 space-y-2">
                    <span className="text-sm sm:text-base">{opt}</span>
                    {isCorrectOption && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                          <Check className="h-4 w-4" />
                          <span className="text-sm font-bold">{t("assessment.ui.correct")}</span>
                        </div>
                        {question.explanation && (
                          <p className="text-sm text-muted-foreground leading-relaxed pl-6">{question.explanation}</p>
                        )}
                      </div>
                    )}
                    {isWrong && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-destructive dark:text-red-400">
                          <X className="h-4 w-4" />
                          <span className="text-sm font-bold">{t("assessment.ui.wrong")}</span>
                        </div>
                        {question.explanation && (
                          <p className="text-sm text-muted-foreground leading-relaxed pl-6">{question.explanation}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isChoice && (
        <div className="space-y-3">
          <div className={`rounded-xl border-2 p-4 sm:p-5 ${isCorrect ? "border-green-500 dark:border-green-400 bg-green-50/50 dark:bg-green-900/10" : "border-destructive dark:border-red-400 bg-red-50/50 dark:bg-red-900/10"}`}>
            <p className="text-xs text-muted-foreground mb-1">{t("assessment.ui.yourAnswer")}</p>
            <p className="text-sm">{userAnswer || (t("assessment.ui.noAnswer"))}</p>
            <div className="mt-2">
              {isCorrect ? (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm font-bold">
                  <Check className="h-4 w-4" /> {t("assessment.ui.correct")}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-destructive dark:text-red-400 text-sm font-bold">
                  <X className="h-4 w-4" /> {t("assessment.ui.wrong")}
                </span>
              )}
            </div>
          </div>
          {question.correct_answer && question.question_type !== "essay" && (
            <div className="rounded-xl border-2 border-green-500 dark:border-green-400 bg-green-50/50 dark:bg-green-900/10 p-4 sm:p-5">
              <p className="text-xs text-muted-foreground mb-1">{t("assessment.ui.correctAnswerLabel")}</p>
              <p className="text-sm font-medium">{question.correct_answer}</p>
            </div>
          )}
          {question.explanation && (
            <p className="text-sm text-muted-foreground pl-1">{question.explanation}</p>
          )}
        </div>
      )}

      {question.hint && (
        <button
          type="button"
          onClick={() => setShowHint(!showHint)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Lightbulb className="h-4 w-4" />
          {t("assessment.ui.viewHint")}
          {showHint ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}
      {showHint && question.hint && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
          {question.hint}
        </div>
      )}

      <div className="flex justify-between items-center pt-4 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onPrev} disabled={index === 0}>
          {t("assessment.ui.previous")}
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={index === total - 1}>
          {t("assessment.ui.next")}
        </Button>
      </div>
    </div>
  );
}

// ─── Result Summary Page (matches reference design) ───
function ResultSummary({
  assessment, attempt, questions, answerMap, isEn, t,
  onReview, onRetake, onBack, canRetake,
}: {
  assessment: any; attempt: any; questions: any[]; answerMap: Record<string, { user_answer: string | null; is_correct: boolean | null }>;
  isEn: boolean; t: any; onReview: () => void; onRetake: () => void; onBack: () => void; canRetake: boolean;
}) {
  const correctCount = Object.values(answerMap).filter(a => a.is_correct === true).length;
  const wrongCount = Object.values(answerMap).filter(a => a.is_correct === false).length;
  const skippedCount = questions.length - correctCount - wrongCount;
  const score = Number(attempt?.score || 0);
  const totalPoints = Number(attempt?.total_points || 0);
  const passed = attempt?.passed;
  const answeredCount = correctCount + wrongCount;
  const percentage = answeredCount > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

  // Identify strong/weak areas
  const correctQuestions = questions.filter(q => answerMap[q.id]?.is_correct === true);
  const wrongQuestions = questions.filter(q => answerMap[q.id]?.is_correct === false);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">
          {t("assessment.ui.greatJob")}
        </h2>
      </div>

      {/* 3-column stats: Score, Accuracy, Breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-secondary/30 p-4 sm:p-5">
          <p className="text-xs text-muted-foreground mb-2">{t("assessment.ui.score")}</p>
          <p className="text-3xl sm:text-4xl font-bold text-foreground">
            {correctCount}<span className="text-lg text-muted-foreground">/{questions.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 p-4 sm:p-5">
          <p className="text-xs text-muted-foreground mb-2">{t("assessment.ui.accuracy")}</p>
          <p className="text-3xl sm:text-4xl font-bold text-foreground">{percentage}%</p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 p-4 sm:p-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("assessment.ui.correct")}</span>
              <span className="font-semibold text-foreground">{correctCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("assessment.ui.wrong")}</span>
              <span className="font-semibold text-foreground">{wrongCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("assessment.ui.skipped")}</span>
              <span className="font-semibold text-foreground">{skippedCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pass/Fail badge */}
      <div className={`rounded-xl border-2 p-4 flex items-center gap-4 ${passed ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20"}`}>
        {passed ? <Check className="h-7 w-7 text-green-600 dark:text-green-400 shrink-0" /> : <X className="h-7 w-7 text-orange-600 dark:text-orange-400 shrink-0" />}
        <div>
          <p className="font-semibold text-foreground">{passed ? (t("assessment.ui.pass")) : (t("assessment.ui.fail"))}</p>
          <p className="text-sm text-muted-foreground">
            {t("assessment.ui.passInfo", { passingScore: assessment.passing_score, score, total: totalPoints })}
          </p>
        </div>
      </div>

      {/* Highlights & Improvement areas */}
      {(correctQuestions.length > 0 || wrongQuestions.length > 0) && (
        <div className="space-y-4">
          {correctQuestions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">{t("assessment.ui.highlights")}</h3>
              <ul className="space-y-2">
                {correctQuestions.map((q, i) => (
                  <li key={q.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    <span>{q.question_text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {wrongQuestions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">{t("assessment.ui.areasToReview")}</h3>
              <ul className="space-y-2">
                {wrongQuestions.map((q, i) => (
                  <li key={q.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <span>{q.question_text}</span>
                      {q.explanation && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">{q.explanation}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Continue Learning section */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-foreground">{t("assessment.ui.continueLearning")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Review quiz card */}
          <button
            type="button"
            onClick={onReview}
            className="flex items-center gap-4 rounded-xl border border-border bg-secondary/30 p-4 text-left hover:bg-secondary/50 transition-colors"
          >
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Eye className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("assessment.ui.reviewQuiz")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("assessment.ui.reviewQuizDesc")}
              </p>
            </div>
          </button>
          {/* Retake card */}
          {canRetake && (
            <button
              type="button"
              onClick={onRetake}
              className="flex items-center gap-4 rounded-xl border border-border bg-secondary/30 p-4 text-left hover:bg-secondary/50 transition-colors"
            >
              <div className="h-14 w-14 rounded-xl bg-accent flex items-center justify-center shrink-0">
                <RotateCcw className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{t("assessment.ui.retakeQuiz")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("assessment.ui.retakeDesc")}
                </p>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Back button */}
      <div className="pt-2">
        <Button variant="outline" className="w-full" onClick={onBack}>
          {t("assessment.ui.backToCourse")}
        </Button>
      </div>
    </div>
  );
}

export default function AssessmentPage() {
  const { courseId, assessmentId } = useParams<{ courseId: string; assessmentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useUser();
  const { primaryRole } = useUserRole();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en");
  const queryClient = useQueryClient();

  // Map current UI language to assessment_i18n.language_code (null = Korean = base)
  const uiLang: AssessmentLang | null = (() => {
    const lng = (i18n.language || "").toLowerCase();
    if (lng.startsWith("en")) return "en";
    if (lng.startsWith("ja")) return "ja";
    if (lng === "yue" || lng.startsWith("yue-") || lng === "zh-hk") return "yue";
    if (lng.startsWith("zh")) return "zh-CN";
    return null;
  })();

  const isStudentRoute = location.pathname.startsWith("/student");
  const routePrefix = location.pathname.startsWith("/admin") ? "/admin" : location.pathname.startsWith("/teacher") ? "/teacher" : "/student";

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);
  const [showHintMap, setShowHintMap] = useState<Record<string, boolean>>({});
  const [repairingQuestionIds, setRepairingQuestionIds] = useState<Set<string>>(() => new Set());
  const [repairFailedKeys, setRepairFailedKeys] = useState<Set<string>>(() => new Set());
  const [justSubmittedAttempt, setJustSubmittedAttempt] = useState<any | null>(null);
  const repairRequestedRef = useRef<Set<string>>(new Set());

  const { data: branchCountry, isLoading: branchCountryLoading } = useQuery({
    queryKey: ["assessment-branch-country", profile?.department_id],
    queryFn: async () => {
      if (!profile?.department_id) return null;
      const { data, error } = await supabase
        .from("departments")
        .select("country, parent_department_id")
        .eq("id", profile.department_id)
        .maybeSingle();
      if (error) throw error;
      if (data?.country) return data.country as string;
      if (!data?.parent_department_id) return null;
      const { data: parent, error: parentError } = await supabase
        .from("departments")
        .select("country")
        .eq("id", data.parent_department_id)
        .maybeSingle();
      if (parentError) throw parentError;
      return (parent?.country as string | null) || null;
    },
    enabled: isStudentRoute && !!profile?.department_id,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const branchAssessmentLang = isStudentRoute ? countryToAssessmentLang(branchCountry) : null;
  // Student assessments should never fall back to Korean for users in non-KR
  // branches just because their browser has a stale localStorage value. Branch
  // language wins on the assessment page because the quiz content must match
  // the learner's branch language consistently across PC/mobile/PWA caches.
  const autoLang: AssessmentLang | null = branchAssessmentLang || uiLang;

  // 응시 전에 학습자가 직접 퀴즈 언어를 고를 수 있게 한다.
  // 사용자 ID까지 포함해야 공용 PC에서 이전 사용자의 선택(예: 광동어)이
  // 다음 로그인 사용자의 일본어 설정보다 우선되는 계정 간 누수를 막을 수 있다.
  const langStorageKey = `assessment-lang:${user?.id || "anonymous"}:${assessmentId || "default"}`;
  const [langOverride, setLangOverride] = useState<string | null>(() => {
    try {
      return user?.id
        ? localStorage.getItem(`assessment-lang:${user.id}:${assessmentId || "default"}`)
        : null;
    } catch {
      return null;
    }
  });
  const [loadedLangStorageKey, setLoadedLangStorageKey] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) {
      setLangOverride(null);
      setLoadedLangStorageKey(null);
      return;
    }
    try {
      // 2026-08 이전 버전의 계정 비구분 저장값은 더 이상 사용하지 않는다.
      localStorage.removeItem(`assessment-lang:${assessmentId || "default"}`);
      setLangOverride(localStorage.getItem(langStorageKey));
    } catch {
      setLangOverride(null);
    } finally {
      setLoadedLangStorageKey(langStorageKey);
    }
  }, [user?.id, assessmentId, langStorageKey]);
  useEffect(() => {
    if (loadedLangStorageKey !== langStorageKey) return;
    try {
      if (langOverride) localStorage.setItem(langStorageKey, langOverride);
      else localStorage.removeItem(langStorageKey);
    } catch {
      /* storage unavailable */
    }
  }, [langOverride, langStorageKey, loadedLangStorageKey]);

  // 자동 대체(광동어 → 중국어 간체)는 사용자의 명시적 선택이 아니므로
  // localStorage에 저장하지 않고 세션 내 상태로만 유지한다.
  const [autoFallbackLang, setAutoFallbackLang] = useState<AssessmentLang | null>(null);
  useEffect(() => { setAutoFallbackLang(null); }, [assessmentId, user?.id]);

  const currentLang: AssessmentLang | null = langOverride
    ? langOverride === "ko"
      ? null
      : (langOverride as AssessmentLang)
    : (autoFallbackLang || autoLang);
  const selectedLangValue = currentLang ?? "ko";


  // Fetch assessment
  const { data: assessment, isLoading: assessmentLoading } = useQuery({
    queryKey: ["assessment-detail", assessmentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessments").select("*").eq("id", assessmentId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!assessmentId,
  });

  const isTeacherOrAdmin = primaryRole === "admin" || primaryRole === "teacher";

  // Fetch previous attempts (must be before questions queries)
  const { data: attempts = [] } = useQuery({
    queryKey: ["assessment-attempts", assessmentId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_attempts")
        .select("*")
        .eq("assessment_id", assessmentId!)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assessmentId && !!user?.id,
  });

  const latestCompleted = useMemo(() => {
    if (justSubmittedAttempt?.id) {
      return attempts.find((a: any) => a.id === justSubmittedAttempt.id) || justSubmittedAttempt;
    }
    return attempts.find((a: any) => a.completed_at);
  }, [attempts, justSubmittedAttempt]);

  // Fetch questions - students use secure RPC, teachers/admins use direct query
  const { data: rawQuestions = [] } = useQuery({
    queryKey: ["assessment-questions-take", assessmentId, isTeacherOrAdmin],
    queryFn: async () => {
      if (isTeacherOrAdmin) {
        const { data, error } = await supabase
          .from("assessment_questions")
          .select("*")
          .eq("assessment_id", assessmentId!)
          .order("order_index", { ascending: true });
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .rpc("get_assessment_questions_for_student", { p_assessment_id: assessmentId! });
      if (error) throw error;
      return data || [];
    },
    enabled: !!assessmentId,
  });

  // For review mode: fetch questions WITH answers (only available after completing)
  const { data: reviewQuestions = [] } = useQuery({
    queryKey: ["assessment-questions-review", assessmentId, !!latestCompleted],
    queryFn: async () => {
      if (isTeacherOrAdmin) {
        const { data, error } = await supabase
          .from("assessment_questions")
          .select("*")
          .eq("assessment_id", assessmentId!)
          .order("order_index", { ascending: true });
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .rpc("get_assessment_questions_with_answers", { p_assessment_id: assessmentId! });
      if (error) throw error;
      return data || [];
    },
    enabled: !!assessmentId && (isTeacherOrAdmin || !!latestCompleted),
  });

  // i18n: assessment translation for current language
  const { data: assessmentI18nRow } = useQuery({
    queryKey: ["assessment-i18n-view", assessmentId, currentLang],
    queryFn: async () => {
      if (!currentLang) return null;
      const { data, error } = await supabase
        .from("assessment_i18n" as any)
        .select("*")
        .eq("assessment_id", assessmentId!)
        .eq("language_code", currentLang)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!assessmentId && !!currentLang,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: (prev) => prev,
  });


  // Pick the active question source for i18n lookup (prefer rawQuestions; fallback to reviewQuestions)
  const questionIdsForI18n = useMemo(() => {
    const ids = new Set<string>();
    rawQuestions.forEach((q: any) => q?.id && ids.add(q.id));
    reviewQuestions.forEach((q: any) => q?.id && ids.add(q.id));
    return Array.from(ids);
  }, [rawQuestions, reviewQuestions]);

  // Stable key: join sorted IDs so the cache entry is unique per (assessment, lang, exact question set)
  const questionIdsKey = useMemo(
    () => [...questionIdsForI18n].sort().join("|"),
    [questionIdsForI18n]
  );

  const { data: questionI18nRows = [], isFetched: questionI18nFetched, isError: questionI18nError, refetch: refetchQuestionI18n } = useQuery({
    queryKey: ["assessment-question-i18n-view", assessmentId, currentLang, questionIdsKey],
    queryFn: async () => {
      if (!currentLang || questionIdsForI18n.length === 0) return [];
      const { data, error } = await supabase
        .from("assessment_question_i18n" as any)
        .select("*")
        .in("question_id", questionIdsForI18n)
        .eq("language_code", currentLang);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!currentLang && questionIdsForI18n.length > 0,
    staleTime: 0,
    gcTime: 15 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 4000),
  });

  useEffect(() => {
    if (!currentLang || !questionI18nError) return;
    const timer = window.setTimeout(() => void refetchQuestionI18n(), 3000);
    return () => window.clearTimeout(timer);
  }, [currentLang, questionI18nError, refetchQuestionI18n]);

  // 광동어(yue) 번역이 아직 없는 퀴즈는 한국어 대신 중국어(간체)로 자동 대체한다.
  useEffect(() => {
    if (currentLang !== "yue" || langOverride) return;
    if (!questionI18nFetched || questionIdsForI18n.length === 0) return;
    if ((questionI18nRows || []).length > 0) return;
    setLangOverride("zh-CN");
  }, [currentLang, langOverride, questionI18nFetched, questionI18nRows, questionIdsForI18n.length]);




  const questionI18nMap = useMemo(() => {
    const m = new Map<string, any>();
    (questionI18nRows || []).forEach((r: any) => {
      if (!currentLang || r.language_code === currentLang) m.set(r.question_id, r);
    });
    return m;
  }, [questionI18nRows, currentLang]);

  const invalidateQuestionI18n = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["assessment-question-i18n-view", assessmentId, currentLang], refetchType: "active" });
  }, [queryClient, assessmentId, currentLang]);

  const repairQuestionTranslation = useCallback(async (question: any) => {
    if (!currentLang || !question?.id) return;
    const key = repairKeyFor(question.id, currentLang);
    if (repairRequestedRef.current.has(key)) return;
    repairRequestedRef.current.add(key);
    setRepairFailedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setRepairingQuestionIds((prev) => new Set(prev).add(question.id));
    try {
      await invokeQuestionTranslation(question.id, currentLang);
      await invalidateQuestionI18n();
    } catch (error) {
      repairRequestedRef.current.delete(key);
      setRepairFailedKeys((prev) => new Set(prev).add(key));
      console.error("[assessment] question translation repair failed", error);
    } finally {
      setRepairingQuestionIds((prev) => {
        const next = new Set(prev);
        next.delete(question.id);
        return next;
      });
    }
  }, [currentLang, invalidateQuestionI18n]);

  // Apply translation to a question (preserving original correct_answer position for MCQ)
  const localizeQuestion = (q: any) => {
    if (!q) return q;
    const tr = questionI18nMap.get(q.id);
    const hasCoreIssue = questionHasCoreDisplayTranslationIssue(q, tr, currentLang);
    if (currentLang && hasCoreIssue) {
      return {
        ...q,
        question_text: TRANSLATE_LABELS[currentLang].repairingNotice,
        options: isChoiceQuestion(q.question_type) ? [] : q.options,
        hint: null,
        explanation: null,
      };
    }
    if (!tr) return q;
    const isMcq = isChoiceQuestion(q.question_type);
    let options = q.options;
    let correctAnswer = q.correct_answer;
    const hasCleanOptions = Array.isArray(tr.options) && !hasHangulValue(tr.options);
    if (isMcq && Array.isArray(q.options) && hasCleanOptions && tr.options.length === q.options.length) {
      options = tr.options;
      // Map correct_answer index from KO options to translated options
      const idx = q.options.findIndex((o: string) => o === q.correct_answer);
      if (idx >= 0 && tr.options[idx]) correctAnswer = tr.options[idx];
    } else if (!isMcq && tr.correct_answer && !hasHangulValue(tr.correct_answer)) {
      correctAnswer = tr.correct_answer;
    }
    return {
      ...q,
      question_text: tr.question_text && !hasHangulValue(tr.question_text) ? tr.question_text : q.question_text,
      options,
      correct_answer: correctAnswer,
      explanation: tr.explanation && !hasHangulValue(tr.explanation) ? tr.explanation : q.explanation,
      hint: tr.hint && !hasHangulValue(tr.hint) ? tr.hint : q.hint,
    };
  };

  const hasUnresolvedVisibleTranslations = useMemo(() => {
    if (!currentLang || !questionI18nFetched) return false;
    return rawQuestions.some((q: any) =>
      questionHasCoreDisplayTranslationIssue(q, questionI18nMap.get(q.id), currentLang)
    );
  }, [currentLang, questionI18nFetched, rawQuestions, questionI18nMap]);

  // Localized assessment + questions used for rendering
  const assessmentLocalized = useMemo(() => {
    if (!assessment) return assessment;
    if (!assessmentI18nRow) return assessment;
    return {
      ...assessment,
      title: assessmentI18nRow.title || assessment.title,
      description: assessmentI18nRow.description ?? assessment.description,
    };
  }, [assessment, assessmentI18nRow]);

  const localizedRawQuestions = useMemo(
    () => rawQuestions.map(localizeQuestion),
    [rawQuestions, questionI18nMap]
  );
  const localizedReviewQuestions = useMemo(
    () => reviewQuestions.map(localizeQuestion),
    [reviewQuestions, questionI18nMap]
  );

  const questions = useMemo(() => {
    if (!assessment?.randomize_questions) return localizedRawQuestions;
    // Stable shuffle: derive deterministic order from question IDs so the order
    // doesn't change on every render (was causing question flicker).
    const ids = localizedRawQuestions.map((q: any) => q.id).join("|");
    let seed = 0;
    for (let i = 0; i < ids.length; i++) seed = (seed * 31 + ids.charCodeAt(i)) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    const arr = [...localizedRawQuestions];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [localizedRawQuestions, assessment?.randomize_questions]);

  useEffect(() => {
    if (!currentLang || !questionI18nFetched) return;
    const sourceQuestions = rawQuestions.length > 0 ? rawQuestions : reviewQuestions;
    const needsRepair = sourceQuestions.filter((q: any) =>
      shouldAutoRepairQuestionTranslation(q, questionI18nMap.get(q.id), currentLang) &&
      !repairFailedKeys.has(repairKeyFor(q.id, currentLang))
    );
    const visibleQuestion = sourceQuestions[currentQuestionIndex];
    const priorityQuestion = needsRepair.find((q: any) => q.id === visibleQuestion?.id);
    const repairTargets = priorityQuestion ? [priorityQuestion] : needsRepair.slice(0, 1);
    repairTargets.forEach((q: any) => {
      void repairQuestionTranslation(q);
    });
  }, [currentLang, questionI18nFetched, rawQuestions, reviewQuestions, questionI18nMap, repairQuestionTranslation, repairFailedKeys, currentQuestionIndex]);

  const { data: previousAnswers = [] } = useQuery({
    queryKey: ["assessment-answers", latestCompleted?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_answers")
        .select("*")
        .eq("attempt_id", latestCompleted!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!latestCompleted?.id,
  });

  const completedAttempts = attempts.filter((a: any) => a.completed_at);
  const canAttempt = assessment ? completedAttempts.length < assessment.max_attempts : false;
  const bestScore = completedAttempts.length > 0 ? Math.max(...completedAttempts.map((a: any) => Number(a.score) || 0)) : null;
  const passed = bestScore !== null && assessment ? bestScore >= assessment.passing_score : false;

  const answerMap = useMemo(() => {
    const map: Record<string, { user_answer: string | null; is_correct: boolean | null }> = {};
    // Map base (KO) user_answer back to localized option string for display alignment
    const baseById = new Map<string, any>(reviewQuestions.map((q: any) => [q.id, q]));
    for (const a of previousAnswers) {
      let display = a.user_answer as string | null;
      if (currentLang && display) {
        const baseQ = baseById.get(a.question_id);
        const tr = questionI18nMap.get(a.question_id);
        if (baseQ && tr && Array.isArray(baseQ.options) && Array.isArray(tr.options) && tr.options.length === baseQ.options.length) {
          const parsedIndex = parseOptionIndexAnswer(display);
          const idx = parsedIndex !== null ? parsedIndex : baseQ.options.findIndex((o: string) => o === display);
          if (idx >= 0 && tr.options[idx]) display = tr.options[idx];
        }
      }
      map[a.question_id] = { user_answer: display, is_correct: a.is_correct };
    }
    return map;
  }, [previousAnswers, reviewQuestions, questionI18nMap, currentLang]);

  const reviewCorrectCount = previousAnswers.filter((a: any) => a.is_correct === true).length;
  const reviewWrongCount = previousAnswers.filter((a: any) => a.is_correct === false).length;

  // Timer
  useEffect(() => {
    if (!currentAttemptId || !assessment?.time_limit_minutes) return;
    setTimeLeft(assessment.time_limit_minutes * 60);
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentAttemptId, assessment?.time_limit_minutes]);

  // Start attempt
  const startAttemptMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("assessment_attempts").insert({
        assessment_id: assessmentId!,
        user_id: user!.id,
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      setCurrentAttemptId(id);
      setJustSubmittedAttempt(null);
      setAnswers({});
      setShowResults(false);
      setReviewMode(false);
      setCurrentQuestionIndex(0);
      setShowHintMap({});
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // Submit - use server-side grading to avoid exposing correct answers
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!currentAttemptId) return;
      // Map localized answers back to base (KO) for server-side grading consistency
      const rawById = new Map<string, any>(rawQuestions.map((q: any) => [q.id, q]));
      const answerPayloads = questions.map((q: any) => {
        const userAns = answers[q.id] || "";
        const baseQ = rawById.get(q.id);
        const isMcq = ["multiple_choice_4", "multiple_choice_5", "ox"].includes(q.question_type);
        if (!isMcq) return { question_id: q.id, user_answer: userAns };

        let selectedIndex = parseOptionIndexAnswer(userAns);
        if (selectedIndex === null && Array.isArray(q.options)) {
          selectedIndex = q.options.findIndex((o: string) => o === userAns);
        }
        if (selectedIndex !== null && selectedIndex >= 0) {
          const baseAnswer = Array.isArray(baseQ?.options) ? baseQ.options[selectedIndex] : undefined;
          return {
            question_id: q.id,
            user_answer: baseAnswer != null ? String(baseAnswer) : String(selectedIndex),
            selected_index: selectedIndex,
          };
        }
        return { question_id: q.id, user_answer: userAns, selected_index: null };
      });

      const { data, error } = await supabase.rpc("submit_and_grade_assessment", {
        p_attempt_id: currentAttemptId,
        p_answers: answerPayloads,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data: any) => {
      const result = Array.isArray(data) ? data[0] : data;
      setJustSubmittedAttempt({
        id: currentAttemptId,
        assessment_id: assessmentId,
        user_id: user?.id,
        score: result?.score ?? 0,
        total_points: result?.total_points ?? 0,
        passed: !!result?.passed,
        completed_at: new Date().toISOString(),
      });
      setCurrentAttemptId(null);
      setShowResults(true);
      setReviewMode(false);
      setCurrentQuestionIndex(0);

      // 퀴즈 합격 시 강의 이수 처리 (enrollments.completed_at 갱신)
      try {
        const didPass = !!result?.passed;
        if (didPass && user?.id && courseId) {
          const { data: enr } = await supabase
            .from("enrollments")
            .select("id, completed_at")
            .eq("user_id", user.id)
            .eq("course_id", courseId)
            .maybeSingle();
          if (enr && !enr.completed_at) {
            await supabase
              .from("enrollments")
              .update({ progress: 100, completed_at: new Date().toISOString() })
              .eq("id", enr.id);
          }
        }
      } catch (err) {
        console.error("[assessment] enrollment sync failed", err);
      }

      queryClient.invalidateQueries({ queryKey: ["assessment-attempts", assessmentId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["assessment-answers"] });
      queryClient.invalidateQueries({ queryKey: ["assessment-questions-review", assessmentId] });
      toast({ title: t("assessment.submitted") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => submitMutation.mutate();
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const layoutRole = isStudentRoute ? "student" : primaryRole === "admin" ? "admin" : "teacher";

  if (
    assessmentLoading ||
    (isStudentRoute && !!profile?.department_id && branchCountryLoading) ||
    (!!currentLang && questionIdsForI18n.length > 0 && !questionI18nFetched)
  ) {
    return (
      <DashboardLayout role={layoutRole}>
        <PageSkeleton blocks={4} />
      </DashboardLayout>
    );
  }

  if (!assessment) {
    return (
      <DashboardLayout role="student">
        <div className="text-center py-16 space-y-4">
          <p className="text-muted-foreground">{t("assessment.notFound")}</p>
          <Button variant="outline" onClick={() => navigate(-1)}>{t("common.back")}</Button>
        </div>
      </DashboardLayout>
    );
  }

  // ─── RESULT SUMMARY (shown immediately after submission) ───
  if (showResults && !reviewMode && latestCompleted) {
    return (
      <DashboardLayout role={layoutRole}>
        <div className="space-y-4">
          <Card className="border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{assessmentLocalized.title} — {t("assessment.ui.results")}</span>
              </div>
              <button
                type="button"
                onClick={() => navigate(`${routePrefix}/courses/${courseId}${isStudentRoute ? "?view=learn" : ""}`)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <CardContent className="pt-6 pb-8 px-4 sm:px-6">
              <ResultSummary
                assessment={assessmentLocalized}
                attempt={latestCompleted}
                questions={localizedReviewQuestions as any[]}
                answerMap={answerMap}
                isEn={!!isEn}
                t={t}
                onReview={() => { setReviewMode(true); setCurrentQuestionIndex(0); }}
                onRetake={() => { setShowResults(false); startAttemptMutation.mutate(); }}
                onBack={() => navigate(`${routePrefix}/courses/${courseId}${isStudentRoute ? "?view=learn" : ""}`)}
                canRetake={canAttempt}
              />
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ─── REVIEW MODE ───
  if (reviewMode && previousAnswers.length > 0) {
    const rQuestions = localizedReviewQuestions as any[];
    const currentQ = rQuestions[currentQuestionIndex];
    const currentSourceQ = currentQ ? reviewQuestions.find((q: any) => q.id === currentQ.id) : null;
    const ansData = currentQ ? answerMap[currentQ.id] : null;
    const progressPercent = rQuestions.length > 0 ? Math.round(((currentQuestionIndex + 1) / rQuestions.length) * 100) : 0;

    return (
      <DashboardLayout role={layoutRole}>
        <div className="space-y-4">
          <Card className="border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{assessmentLocalized.title}</span>
              </div>
              <button
                type="button"
                onClick={() => { setReviewMode(false); }}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 sm:px-6 pt-3 pb-2 space-y-2">
              <div className="flex items-center gap-3">
                <Progress value={progressPercent} className="h-2 flex-1" />
                <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                   {currentQuestionIndex + 1} / {rQuestions.length}
                </span>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs font-semibold bg-destructive/15 text-destructive rounded-full px-2 py-0.5">
                    <X className="h-3 w-3" /> {reviewWrongCount}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold bg-green-500/15 text-green-600 dark:text-green-400 rounded-full px-2 py-0.5">
                    <Check className="h-3 w-3" /> {reviewCorrectCount}
                  </span>
                </div>
              </div>
            </div>

            <CardContent className="pt-4 pb-6 px-4 sm:px-6">
              {currentQ && (
                <QuestionReview
                  question={currentQ}
                  index={currentQuestionIndex}
                  total={rQuestions.length}
                  userAnswer={ansData?.user_answer ?? null}
                  isCorrect={ansData?.is_correct ?? null}
                  isEn={!!isEn}
                  onNext={() => setCurrentQuestionIndex(i => Math.min(i + 1, rQuestions.length - 1))}
                  onPrev={() => setCurrentQuestionIndex(i => Math.max(i - 1, 0))}
                  t={t}
                  currentLang={currentLang}
                  questionI18n={questionI18nMap.get(currentQ.id)}
                  sourceQuestion={currentSourceQ}
                  repairing={repairingQuestionIds.has(currentQ.id)}
                  repairFailed={!!(currentLang && repairFailedKeys.has(repairKeyFor(currentQ.id, currentLang)))}
                  onTranslated={invalidateQuestionI18n}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ─── TAKING ASSESSMENT (one question per page, full-width) ───
  if (currentAttemptId) {
    const currentQ = questions[currentQuestionIndex];
    const currentSourceQ = currentQ ? rawQuestions.find((q: any) => q.id === currentQ.id) : null;
    const answeredCount = Object.values(answers).filter(a => a.trim()).length;
    const progressPercent = questions.length > 0 ? Math.round(((currentQuestionIndex + 1) / questions.length) * 100) : 0;
    const isLastQuestion = currentQuestionIndex === questions.length - 1;
    const hintVisible = currentQ ? showHintMap[currentQ.id] : false;
    const currentTranslation = currentQ ? questionI18nMap.get(currentQ.id) : null;
    const currentNeedsRepair = !!currentQ && !!currentLang && (
      questionHasCoreDisplayTranslationIssue(currentSourceQ || currentQ, currentTranslation, currentLang) ||
      hasHangulValue(getTakingQuestionTextParts(currentQ))
    );
    const currentRepairFailed = !!(currentQ && currentLang && repairFailedKeys.has(repairKeyFor(currentQ.id, currentLang)));
    const currentRepairing = !!(currentQ && repairingQuestionIds.has(currentQ.id) && !currentRepairFailed);

    return (
      <DashboardLayout role="student">
        <div className="space-y-4">
          <Card className="border-border overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{assessmentLocalized.title}</span>
              </div>
              <div className="flex items-center gap-3">
                {timeLeft !== null && (
                  <div className={`flex items-center gap-1 text-sm font-mono ${timeLeft < 60 ? "text-destructive animate-pulse" : "text-foreground"}`}>
                    <Timer className="h-4 w-4" />
                    {formatTime(timeLeft)}
                  </div>
                )}
                <span className="text-xs text-muted-foreground">
                  {t("assessment.ui.answered", { answered: answeredCount, total: questions.length })}
                </span>
              </div>
            </div>

            {/* Progress */}
            <div className="px-4 sm:px-6 pt-3 pb-2">
              <div className="flex items-center gap-3">
                <Progress value={progressPercent} className="h-2 flex-1" />
                <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                  {currentQuestionIndex + 1} / {questions.length}
                </span>
              </div>
            </div>

            {/* Current question */}
            <CardContent className="pt-4 pb-6 px-4 sm:px-6 space-y-6">
              {currentQ && (
                <>
                  <div>
                    <p className="text-base sm:text-lg leading-relaxed">
                      <span className="font-bold mr-2">{currentQuestionIndex + 1}.</span>
                      {currentQ.question_text}
                    </p>
                    <TranslateQuestionButton
                      questionId={currentQ.id}
                      questionText={currentQ.question_text}
                      targetLang={currentLang}
                       hasKorean={currentNeedsRepair && !currentRepairing}
                      onDone={invalidateQuestionI18n}
                    />
                    <TranslationRepairNotice
                      targetLang={currentLang}
                      repairing={currentNeedsRepair && currentRepairing}
                      failed={currentNeedsRepair && currentRepairFailed}
                    />
                  </div>

                  {/* Multiple choice / OX */}
                  {["multiple_choice_4", "multiple_choice_5", "ox"].includes(currentQ.question_type) && currentQ.options && (
                    <RadioGroup value={answers[currentQ.id] || ""} onValueChange={v => setAnswers(a => ({ ...a, [currentQ.id]: v }))}>
                      <div className="space-y-3">
                        {(currentQ.options as string[]).map((opt: string, i: number) => {
                          const label = String.fromCharCode(65 + i);
                          const optionValue = String(i);
                          const isSelected = answers[currentQ.id] === optionValue;
                          return (
                            <div
                              key={i}
                              className={`flex items-center gap-3 rounded-xl border-2 px-4 sm:px-5 py-3.5 cursor-pointer transition-all ${
                                isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-accent/30"
                              }`}
                              onClick={() => setAnswers(a => ({ ...a, [currentQ.id]: optionValue }))}
                            >
                              <span className="font-bold text-sm text-muted-foreground">{label}.</span>
                              <Label className="text-sm sm:text-base cursor-pointer flex-1">{opt}</Label>
                              <RadioGroupItem value={optionValue} id={`${currentQ.id}-${i}`} className="sr-only" />
                            </div>
                          );
                        })}
                      </div>
                    </RadioGroup>
                  )}

                  {/* Short answer */}
                  {currentQ.question_type === "short_answer" && (
                    <Input
                      className="h-11 text-sm sm:text-base"
                      value={answers[currentQ.id] || ""}
                      onChange={e => setAnswers(a => ({ ...a, [currentQ.id]: e.target.value }))}
                      placeholder={t("assessment.ui.enterAnswer")}
                    />
                  )}

                  {/* Essay */}
                  {currentQ.question_type === "essay" && (
                    <Textarea
                      className="text-sm sm:text-base"
                      value={answers[currentQ.id] || ""}
                      onChange={e => setAnswers(a => ({ ...a, [currentQ.id]: e.target.value }))}
                      rows={6}
                      placeholder={t("assessment.ui.writeAnswer")}
                    />
                  )}

                  {/* Hint toggle */}
                  {currentQ.hint && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowHintMap(m => ({ ...m, [currentQ.id]: !m[currentQ.id] }))}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Lightbulb className="h-4 w-4" />
                        {t("assessment.ui.viewHint")}
                        {hintVisible ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      {hintVisible && (
                        <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
                          {currentQ.hint}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex justify-between items-center pt-4 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentQuestionIndex(i => Math.max(i - 1, 0))}
                      disabled={currentQuestionIndex === 0}
                    >
                      {t("assessment.ui.previous")}
                    </Button>

                    {isLastQuestion ? (
                      <Button size="sm" onClick={handleSubmit} disabled={submitMutation.isPending}>
                        {submitMutation.isPending ? t("common.processing") : t("common.submit")}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentQuestionIndex(i => Math.min(i + 1, questions.length - 1))}
                      >
                        {t("assessment.ui.next")}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ─── OVERVIEW / ENTRY POINT ───
  return (
    <DashboardLayout role={layoutRole}>
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => navigate(`${routePrefix}/courses/${courseId}${isStudentRoute ? "?view=learn" : ""}`)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("course.backToCourse")}
        </button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">{assessmentLocalized.title}</CardTitle>
            </div>
            {assessmentLocalized.description && <p className="text-sm text-muted-foreground">{assessmentLocalized.description}</p>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Languages className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs font-medium text-foreground">
                  {t("assessment.ui.languageSelect", "퀴즈 언어 선택")}
                </span>
              </div>
              <Select value={selectedLangValue} onValueChange={(v) => setLangOverride(v)}>
                <SelectTrigger className="h-9 w-full sm:w-48" aria-label={t("assessment.ui.languageSelect", "퀴즈 언어 선택")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSESSMENT_LANG_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {currentLang && (questionI18nError || hasUnresolvedVisibleTranslations) && (
              <div className="flex flex-col gap-3 border-b-2 border-border/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  {questionI18nError ? (
                    <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                  )}
                  <span>{questionI18nError ? TRANSLATE_LABELS[currentLang].fallbackNotice : TRANSLATE_LABELS[currentLang].repairingNotice}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refetchQuestionI18n()}>
                  <RotateCcw className="h-4 w-4" />
                  {TRANSLATE_LABELS[currentLang].idle}
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-secondary/50 p-3 text-center">
                <p className="text-[10px] text-muted-foreground">{t("assessment.passingScore")}</p>
                <p className="text-lg font-bold">{assessment.passing_score}{t("common.points")}</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-3 text-center">
                <p className="text-[10px] text-muted-foreground">{t("assessment.maxAttempts")}</p>
                <p className="text-lg font-bold">{completedAttempts.length}/{assessment.max_attempts}</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-3 text-center">
                <p className="text-[10px] text-muted-foreground">{t("assessment.questionCount")}</p>
                <p className="text-lg font-bold">{questions.length}</p>
              </div>
              {assessment.time_limit_minutes && (
                <div className="rounded-xl bg-secondary/50 p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">{t("assessment.timeLimit")}</p>
                  <p className="text-lg font-bold">{assessment.time_limit_minutes}{t("common.minutes")}</p>
                </div>
              )}
            </div>

            {bestScore !== null && (
              <div className={`rounded-xl border-2 p-4 flex items-center gap-3 ${passed ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20"}`}>
                {passed ? <Check className="h-6 w-6 text-green-600 dark:text-green-400" /> : <X className="h-6 w-6 text-orange-600 dark:text-orange-400" />}
                <div>
                  <p className="text-sm font-semibold">{passed ? t("assessment.passedResult") : t("assessment.failedResult")}</p>
                  <p className="text-xs text-muted-foreground">{t("assessment.bestScore")}: {bestScore}{t("common.points")}</p>
                </div>
              </div>
            )}

            {completedAttempts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold">{t("assessment.attemptHistory")}</h3>
                {completedAttempts.map((a: any, i: number) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-xs">
                    <span className="font-medium">{t("assessment.ui.attemptLabel", { n: completedAttempts.length - i })}</span>
                    <span className={a.passed ? "text-green-600 dark:text-green-400 font-medium" : "text-orange-600 dark:text-orange-400"}>
                      {Number(a.score)}/{Number(a.total_points)}{t("common.points")} {a.passed ? (t("assessment.ui.passShort")) : (t("assessment.ui.failShort"))}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{new Date(a.completed_at).toLocaleString()}</span>
                      {a.id === latestCompleted?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => { setReviewMode(true); setCurrentQuestionIndex(0); }}
                        >
                          {t("assessment.ui.reviewBtn")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canAttempt && (
              <Button
                className="w-full"
                onClick={() => startAttemptMutation.mutate()}
                disabled={startAttemptMutation.isPending || !!(currentLang && (questionI18nError || hasUnresolvedVisibleTranslations))}
              >
                {startAttemptMutation.isPending ? t("common.processing") : completedAttempts.length === 0 ? t("assessment.startAssessment") : t("assessment.retakeAssessment")}
              </Button>
            )}
            {!canAttempt && completedAttempts.length > 0 && (
              <p className="text-center text-xs text-muted-foreground">{t("assessment.noMoreAttempts")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
