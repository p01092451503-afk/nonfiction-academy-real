import { useQuery } from "@tanstack/react-query";
import { BookOpen, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import type { DashboardFilters } from "./DashboardFilterBar";

interface DashboardDropoffCoursesProps {
  filters: DashboardFilters;
  leaderId?: string;
  limit?: number;
}

export const DashboardDropoffCourses = ({
  filters,
  leaderId,
  limit = 5,
}: DashboardDropoffCoursesProps) => {
  const { t } = useTranslation();

  const { data: courses, isLoading } = useQuery({
    queryKey: ["dashboard-dropoff-courses", filters, leaderId, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_dropoff_courses", {
        p_filters: filters as any,
        p_leader_id: leaderId || null,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        title: string;
        enrolled: number;
        completed: number;
        in_progress: number;
        dropoff_count: number;
        avg_progress: number;
      }>;
    },
    staleTime: 60_000,
  });

  return (
    <div className="stat-card !p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          {t("dashboard.dropoff.title", { defaultValue: "이탈 강의 TOP 5" })}
        </h3>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t("common.loading")}</p>
      ) : courses?.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t("common.noData")}</p>
      ) : (
        <div className="space-y-4">
          {courses?.map((course, idx) => (
            <div key={course.id} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground mt-0.5">{idx + 1}.</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{course.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("dashboard.dropoff.enrolled", { defaultValue: "등록" })} {course.enrolled}{t("common.people")} ·{" "}
                      {t("dashboard.dropoff.inProgress", { defaultValue: "미완료" })} {course.in_progress}{t("common.people")}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium text-destructive whitespace-nowrap">
                  {course.dropoff_count}{t("common.people")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-destructive rounded-full transition-all"
                    style={{ width: `${Math.min(course.avg_progress, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-10 text-right">{course.avg_progress}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardDropoffCourses;
