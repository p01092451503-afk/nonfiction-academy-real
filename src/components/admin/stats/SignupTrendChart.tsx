import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from "react-i18next";
import { ChartTooltipContent, chartLineCursor } from "@/components/ui/chart-tooltip";

interface Props {
  period: number;
}

const SignupTrendChart = ({ period }: Props) => {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const fromDate = subDays(new Date(), period).toISOString();

  const signupLabel = t("stats.newSignups");

  const { data: chartData = [] } = useQuery({
    queryKey: ["stat-signup-trend", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("created_at")
        .gte("created_at", fromDate)
        .order("created_at");
      if (error) throw error;

      const dayMap = new Map<string, number>();
      for (let i = period - 1; i >= 0; i--) {
        dayMap.set(format(subDays(new Date(), i), "MM/dd"), 0);
      }
      data.forEach((p: any) => {
        const day = format(new Date(p.created_at), "MM/dd");
        if (dayMap.has(day)) dayMap.set(day, (dayMap.get(day) || 0) + 1);
      });

      return Array.from(dayMap.entries()).map(([date, count]) => ({
        date,
        [signupLabel]: count,
      }));
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="text-sm font-medium">{t("stats.signupTrend", { period })}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="h-[180px] sm:h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={isMobile ? { top: 4, right: 4, left: 0, bottom: 0 } : { top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickMargin={6} minTickGap={isMobile ? 24 : 12} />
              <YAxis tick={{ fontSize: 10 }} width={30} hide={isMobile} />
              <Tooltip cursor={chartLineCursor} content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey={signupLabel} stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default SignupTrendChart;
