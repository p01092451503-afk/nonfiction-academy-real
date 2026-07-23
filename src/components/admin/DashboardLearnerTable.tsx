import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, ArrowUp, ArrowDown, Users, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { DashboardFilters } from "./DashboardFilterBar";

type SortKey =
  | "completed_courses"
  | "avg_progress"
  | "learning_minutes"
  | "learning_days"
  | "comment_count"
  | "points_earned"
  | "total_points";

interface DashboardLearnerTableProps {
  filters: DashboardFilters;
  leaderId?: string;
  limit?: number;
}

export const DashboardLearnerTable = ({
  filters,
  leaderId,
  limit = 100,
}: DashboardLearnerTableProps) => {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<SortKey>("completed_courses");

  const { data: learners, isLoading } = useQuery({
    queryKey: ["dashboard-learner-details", filters, leaderId, sortBy, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_learner_details", {
        p_filters: filters as any,
        p_leader_id: leaderId || null,
        p_sort_by: sortBy,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        user_id: string;
        full_name: string;
        email: string;
        department_name: string;
        country: string;
        total_enrollments: number;
        completed_courses: number;
        avg_progress: number;
        learning_minutes: number;
        learning_days: number;
        comment_count: number;
        points_earned: number;
        total_points: number;
        level: number;
        streak_days: number;
      }>;
    },
    staleTime: 60_000,
  });

  const columns: { key: SortKey; label: string; align?: "left" | "right" }[] = [
    { key: "completed_courses", label: t("dashboard.learners.completedCourses", { defaultValue: "완료 강의" }), align: "right" },
    { key: "avg_progress", label: t("dashboard.learners.avgProgress", { defaultValue: "평균 진행률" }), align: "right" },
    { key: "learning_minutes", label: t("dashboard.learners.learningMinutes", { defaultValue: "학습 시간(분)" }), align: "right" },
    { key: "learning_days", label: t("dashboard.learners.learningDays", { defaultValue: "학습일" }), align: "right" },
    { key: "comment_count", label: t("dashboard.learners.comments", { defaultValue: "댓글" }), align: "right" },
    { key: "points_earned", label: t("dashboard.learners.pointsEarned", { defaultValue: "획득 포인트" }), align: "right" },
  ];

  const SortIcon = () => <ArrowUpDown className="h-3 w-3" />;

  const handleDownloadCsv = () => {
    if (!learners || learners.length === 0) {
      toast({ title: t("common.noData") });
      return;
    }
    const headers = [
      t("dashboard.learners.name", { defaultValue: "이름" }),
      "Email",
      t("dashboard.learners.department", { defaultValue: "소속" }),
      t("dashboard.learners.country", { defaultValue: "국가" }),
      t("dashboard.learners.totalEnrollments", { defaultValue: "총 수강" }),
      t("dashboard.learners.completedCourses", { defaultValue: "완료 강의" }),
      t("dashboard.learners.avgProgress", { defaultValue: "평균 진행률(%)" }),
      t("dashboard.learners.learningMinutes", { defaultValue: "학습 시간(분)" }),
      t("dashboard.learners.learningDays", { defaultValue: "학습일" }),
      t("dashboard.learners.comments", { defaultValue: "댓글" }),
      t("dashboard.learners.pointsEarned", { defaultValue: "획득 포인트" }),
      t("dashboard.learners.totalPoints", { defaultValue: "누적 포인트" }),
      "Level",
      t("dashboard.learners.streakDays", { defaultValue: "연속 학습일" }),
    ];
    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = learners.map((l) => [
      l.full_name, l.email, l.department_name, l.country,
      l.total_enrollments, l.completed_courses, l.avg_progress,
      Math.round(l.learning_minutes), l.learning_days, l.comment_count,
      l.points_earned, l.total_points, l.level, l.streak_days,
    ].map(escape).join(","));
    const csv = "\uFEFF" + [headers.map(escape).join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `learner-details-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stat-card !p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          {t("dashboard.learners.title", { defaultValue: "학습자 상세" })}
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadCsv}
          disabled={isLoading || !learners?.length}
          className="h-8 text-xs gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          {t("common.downloadCsv", { defaultValue: "CSV 다운로드" })}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/80">
              <TableHead className="text-xs whitespace-nowrap">
                {t("dashboard.learners.name", { defaultValue: "이름" })}
              </TableHead>
              <TableHead className="text-xs whitespace-nowrap">
                {t("dashboard.learners.department", { defaultValue: "소속" })}
              </TableHead>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-xs whitespace-nowrap ${col.align === "right" ? "text-right" : ""}`}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSortBy(col.key)}
                    className="h-auto px-0 py-0 text-xs font-medium hover:bg-transparent"
                  >
                    {col.label}
                    {sortBy === col.key ? (
                      <ArrowUp className="h-3 w-3 ml-1" />
                    ) : (
                      <ArrowDown className="h-3 w-3 ml-1 opacity-30" />
                    )}
                  </Button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : learners?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                  {t("common.noData")}
                </TableCell>
              </TableRow>
            ) : (
              learners?.map((learner) => (
                <TableRow key={learner.user_id} className="border-b border-border/50">
                  <TableCell className="text-sm font-medium text-foreground whitespace-nowrap">
                    {learner.full_name}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {learner.department_name}
                    {learner.country && (
                      <span className="ml-1 text-[10px] text-muted-foreground/70">
                        ({learner.country})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums">
                    {learner.completed_courses}
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums">
                    {learner.avg_progress}%
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums">
                    {Math.round(learner.learning_minutes).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums">
                    {learner.learning_days}
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums">
                    {learner.comment_count}
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums">
                    {learner.points_earned.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default DashboardLearnerTable;
