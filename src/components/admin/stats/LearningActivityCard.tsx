import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RankBar } from "@/components/ui/rank-bar";
import { BookOpen, FileCheck, ClipboardCheck, MessageSquare, ClipboardList, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "info" | "warning" | "neutral";
const TONE: Record<Tone, { text: string; bg: string; ring: string }> = {
  primary: { text: "text-primary", bg: "bg-primary/10", ring: "ring-primary/20" },
  success: { text: "text-chart-2", bg: "bg-chart-2/10", ring: "ring-chart-2/20" },
  info:    { text: "text-chart-3", bg: "bg-chart-3/10", ring: "ring-chart-3/20" },
  warning: { text: "text-chart-4", bg: "bg-chart-4/10", ring: "ring-chart-4/20" },
  neutral: { text: "text-chart-5", bg: "bg-chart-5/10", ring: "ring-chart-5/20" },
};

const LearningActivityCard = () => {
  const { t } = useTranslation();

  const { data } = useQuery({
    queryKey: ["stat-learning-activity"],
    queryFn: async () => {
      const [contentRes, attemptRes, passedRes, subRes, gradedRes, boardRes, surveyRes] = await Promise.all([
        supabase.from("content_progress").select("*", { count: "exact", head: true }).eq("completed", true),
        supabase.from("assessment_attempts").select("*", { count: "exact", head: true }),
        supabase.from("assessment_attempts").select("*", { count: "exact", head: true }).eq("passed", true),
        supabase.from("assignment_submissions").select("*", { count: "exact", head: true }),
        supabase.from("assignment_submissions").select("*", { count: "exact", head: true }).eq("status", "graded"),
        supabase.from("board_posts").select("*", { count: "exact", head: true }),
        supabase.from("survey_responses").select("*", { count: "exact", head: true }),
      ]);
      return {
        contentCompletions: contentRes.count || 0,
        assessmentAttempts: attemptRes.count || 0,
        assessmentPassed: passedRes.count || 0,
        submissionCount: subRes.count || 0,
        gradedCount: gradedRes.count || 0,
        boardPostCount: boardRes.count || 0,
        surveyResponseCount: surveyRes.count || 0,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const stats = data || {
    contentCompletions: 0, assessmentAttempts: 0, assessmentPassed: 0,
    submissionCount: 0, gradedCount: 0, boardPostCount: 0, surveyResponseCount: 0,
  };

  const passRate = stats.assessmentAttempts > 0
    ? Math.round((stats.assessmentPassed / stats.assessmentAttempts) * 100)
    : 0;
  const gradeRate = stats.submissionCount > 0
    ? Math.round((stats.gradedCount / stats.submissionCount) * 100)
    : 0;

  const items: Array<{
    label: string;
    value: number;
    icon: any;
    tone: Tone;
    progress?: { value: number; caption: string };
    sub?: string;
  }> = [
    {
      label: t("stats.lessonCompletion"),
      value: stats.contentCompletions,
      icon: BookOpen,
      tone: "primary",
    },
    {
      label: t("stats.assessmentAttempt"),
      value: stats.assessmentAttempts,
      icon: ClipboardCheck,
      tone: "success",
      progress: { value: passRate, caption: t("stats.passedCount", { count: stats.assessmentPassed }) },
    },
    {
      label: t("stats.assignmentSubmit"),
      value: stats.submissionCount,
      icon: FileCheck,
      tone: "info",
      progress: { value: gradeRate, caption: t("stats.gradedCount", { count: stats.gradedCount }) },
    },
    {
      label: t("stats.boardPosts"),
      value: stats.boardPostCount,
      icon: MessageSquare,
      tone: "warning",
    },
    {
      label: t("stats.surveyResponses"),
      value: stats.surveyResponseCount,
      icon: ClipboardList,
      tone: "neutral",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="rounded-md p-1.5 bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </span>
          <CardTitle className="text-sm font-semibold">{t("stats.learningActivity")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {items.map((item) => {
            const tone = TONE[item.tone];
            return (
              <div
                key={item.label}
                className={cn(
                  "group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4",
                  "transition-all hover:border-foreground/20 hover:shadow-sm",
                )}
              >
                
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className={cn("rounded-lg p-1.5 ring-1", tone.bg, tone.ring)}>
                    <item.icon className={cn("h-4 w-4", tone.text)} />
                  </span>
                  {item.progress && (
                    <span className={cn("text-[10px] font-semibold tabular-nums", tone.text)}>
                      {item.progress.value}%
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mb-1 truncate">{item.label}</p>
                <p className="text-2xl font-bold text-foreground tabular-nums leading-none">
                  {item.value.toLocaleString()}
                </p>
                {item.progress ? (
                  <div className="mt-3 space-y-1.5">
                    <RankBar value={item.progress.value} className="h-1" />
                    <p className="text-[10px] text-muted-foreground">{item.progress.caption}</p>
                  </div>
                ) : (
                  <div className="mt-3 h-1 rounded-full bg-muted/60" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default LearningActivityCard;
