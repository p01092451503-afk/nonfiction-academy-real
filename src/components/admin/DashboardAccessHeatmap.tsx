import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardFilters } from "./DashboardFilterBar";

interface DashboardAccessHeatmapProps {
  filters: DashboardFilters;
  leaderId?: string;
}

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const DashboardAccessHeatmap = ({ filters, leaderId }: DashboardAccessHeatmapProps) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en");

  const { data: heatmap, isLoading } = useQuery({
    queryKey: ["dashboard-access-heatmap", filters, leaderId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_access_heatmap", {
        p_filters: filters as any,
        p_leader_id: leaderId || null,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ dow: number; hr: number; n: number }>;
    },
    staleTime: 60_000,
  });

  const maxN = Math.max(1, ...(heatmap?.map((h) => h.n) ?? [1]));

  const getCell = (dow: number, hr: number) =>
    heatmap?.find((h) => h.dow === dow && h.hr === hr)?.n ?? 0;

  const intensityClass = (n: number) => {
    const ratio = n / maxN;
    if (ratio === 0) return "bg-muted";
    if (ratio < 0.25) return "bg-chart-3/20";
    if (ratio < 0.5) return "bg-chart-3/40";
    if (ratio < 0.75) return "bg-chart-3/70";
    return "bg-chart-3";
  };

  return (
    <div className="stat-card !p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground">
          {t("dashboard.heatmap.title", { defaultValue: "접속 시간대 분포" })}
        </h3>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t("common.loading")}</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-[40px_repeat(24,1fr)] gap-px bg-border rounded-md overflow-hidden border border-border">
              {/* Header hours */}
              <div className="bg-background p-1"></div>
              {HOURS.map((h) => (
                <div
                  key={`h-${h}`}
                  className="bg-background p-1 text-[10px] text-center text-muted-foreground"
                >
                  {h}
                </div>
              ))}

              {/* Rows */}
              {DAYS.map((day, dow) => (
                <React.Fragment key={day}>
                  <div className="bg-background p-2 text-xs font-medium text-foreground flex items-center justify-center">
                    {day}
                  </div>
                  {HOURS.map((hr) => {
                    const n = getCell(dow, hr);
                    return (
                      <div
                        key={`${dow}-${hr}`}
                        className={`h-6 ${intensityClass(n)} transition-colors`}
                        title={`${day} ${hr}:00 - ${n}${t("common.cases")}`}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 mt-2 text-[10px] text-muted-foreground">
              <span>{isEn ? "Low" : "낮음"}</span>
              <span className="w-3 h-3 bg-muted rounded-sm" />
              <span className="w-3 h-3 bg-chart-3/20 rounded-sm" />
              <span className="w-3 h-3 bg-chart-3/40 rounded-sm" />
              <span className="w-3 h-3 bg-chart-3/70 rounded-sm" />
              <span className="w-3 h-3 bg-chart-3 rounded-sm" />
              <span>{isEn ? "High" : "높음"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardAccessHeatmap;
