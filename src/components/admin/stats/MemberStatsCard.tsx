import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltipContent } from "@/components/ui/chart-tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
];

const MemberStatsCard = () => {
  const { t } = useTranslation();

  const { data: roleCounts = [] } = useQuery({
    queryKey: ["stat-role-distribution"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((r: any) => {
        counts[r.role] = (counts[r.role] || 0) + 1;
      });
      return Object.entries(counts).map(([role, count]) => ({
        role,
        value: count,
      }));
    },
  });

  const { data: deptCounts = [] } = useQuery({
    queryKey: ["stat-dept-distribution"],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase.from("profiles").select("department_id");
      if (pErr) throw pErr;
      const { data: depts, error: dErr } = await supabase.from("departments").select("id, name").eq("is_active", true);
      if (dErr) throw dErr;
      const deptMap = new Map(depts.map((d: any) => [d.id, d.name]));
      const counts: Record<string, number> = {};
      profiles.forEach((p: any) => {
        const name = p.department_id ? deptMap.get(p.department_id) || t("stats.otherLabel") : t("stats.unassigned");
        counts[name] = (counts[name] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
    },
  });

  const roleLabels: Record<string, string> = {
    student: t("roles.studentLabel"),
    teacher: t("roles.teacherLabel"),
    admin: t("roles.adminLabel"),
    super_admin: t("roles.superAdminLabel"),
  };

  const roleData = roleCounts.map((r) => ({
    name: roleLabels[r.role] || r.role,
    value: r.value,
  }));

  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="text-sm font-medium">{t("stats.memberDist")}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">{t("stats.byRole")}</p>
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={roleData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={30} paddingAngle={2}>
                    {roleData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent hideLabel unit={t("common.people")} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 justify-center">
              {roleData.map((r, i) => (
                <span key={r.name} className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  {r.name} {r.value}{t("common.people")}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">{t("stats.byBranch")}</p>
            <div className="space-y-2">
              {deptCounts.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-muted-foreground truncate">{d.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-foreground shrink-0">{d.value}{t("common.people")}</span>
                </div>
              ))}
              {deptCounts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">{t("common.noData")}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MemberStatsCard;
