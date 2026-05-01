import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Users, TrendingUp, AlertTriangle, CheckCircle, BarChart3 } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartTooltipContent, chartTooltipDefaults } from "@/components/ui/chart-tooltip";

const DeptAdminDashboard = () => {
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const isEn = i18n.language?.startsWith("en");

  // Get current user's department
  const { data: myDeptRole } = useQuery({
    queryKey: ["my-dept-role", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_department_roles")
        .select("*, departments(*)")
        .eq("user_id", user!.id)
        .in("dept_role", ["dept_admin", "team_admin"])
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const departmentId = myDeptRole?.department_id;
  const deptName = isEn
    ? (myDeptRole?.departments as any)?.name_en || (myDeptRole?.departments as any)?.name
    : (myDeptRole?.departments as any)?.name;

  // Get department members
  const { data: members = [] } = useQuery({
    queryKey: ["dept-members", departmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("department_id", departmentId!);
      return data || [];
    },
    enabled: !!departmentId,
  });

  // Get enrollments for department members
  const memberIds = members.map((m: any) => m.user_id);
  const { data: enrollments = [] } = useQuery({
    queryKey: ["dept-enrollments", memberIds],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data } = await supabase
        .from("enrollments")
        .select("*, courses(*)")
        .in("user_id", memberIds);
      return data || [];
    },
    enabled: memberIds.length > 0,
  });

  // Get mandatory courses
  const { data: mandatoryCourses = [] } = useQuery({
    queryKey: ["mandatory-courses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("*")
        .eq("is_mandatory", true)
        .eq("status", "published");
      return data || [];
    },
  });

  // Calculate stats
  const totalMembers = members.length;
  const avgProgress = enrollments.length > 0
    ? Math.round(enrollments.reduce((sum: number, e: any) => sum + (e.progress || 0), 0) / enrollments.length)
    : 0;

  const mandatoryCompleted = memberIds.filter((uid: string) => {
    return mandatoryCourses.every((mc: any) => {
      const enrollment = enrollments.find((e: any) => e.user_id === uid && e.course_id === mc.id);
      return enrollment && enrollment.completed_at;
    });
  }).length;

  const mandatoryRate = totalMembers > 0 ? Math.round((mandatoryCompleted / totalMembers) * 100) : 0;
  const overdueCount = totalMembers - mandatoryCompleted;

  // Course completion chart data
  const courseChartData = mandatoryCourses.slice(0, 6).map((c: any) => {
    const enrolled = enrollments.filter((e: any) => e.course_id === c.id);
    const completed = enrolled.filter((e: any) => e.completed_at);
    return {
      name: c.title?.slice(0, 10) + (c.title?.length > 10 ? "…" : ""),
      rate: enrolled.length > 0 ? Math.round((completed.length / enrolled.length) * 100) : 0,
    };
  });

  const stats = [
    { label: t("deptAdmin.totalMembers"), value: `${totalMembers}${isEn ? "" : "명"}`, icon: Users, color: "text-primary" },
    { label: t("deptAdmin.avgProgress"), value: `${avgProgress}%`, icon: TrendingUp, color: "text-chart-2" },
    { label: t("deptAdmin.mandatoryRate"), value: `${mandatoryRate}%`, icon: CheckCircle, color: "text-chart-3" },
    { label: t("deptAdmin.overdueCount"), value: `${overdueCount}${isEn ? "" : "명"}`, icon: AlertTriangle, color: "text-destructive" },
  ];

  // Member table with progress
  const memberRows = members.map((m: any) => {
    const userEnrollments = enrollments.filter((e: any) => e.user_id === m.user_id);
    const avgProg = userEnrollments.length > 0
      ? Math.round(userEnrollments.reduce((s: number, e: any) => s + (e.progress || 0), 0) / userEnrollments.length)
      : 0;
    const allMandatoryDone = mandatoryCourses.every((mc: any) => {
      const enr = userEnrollments.find((e: any) => e.course_id === mc.id);
      return enr && enr.completed_at;
    });
    return { ...m, courseCount: userEnrollments.length, avgProgress: avgProg, mandatoryDone: allMandatoryDone };
  });

  return (
    <DashboardLayout role="admin">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6" aria-hidden="true" />{t("deptAdmin.dashboard")} {deptName && `— ${deptName}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("deptAdmin.dashboardDesc")}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="stat-card">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl bg-accent ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Course Completion Chart */}
          {courseChartData.length > 0 && (
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-base font-semibold text-foreground">{t("deptAdmin.completionChart")}</h2>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={courseChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]} />
                  <Tooltip {...chartTooltipDefaults} content={<ChartTooltipContent unit="%" />} />
                  <Bar dataKey="rate" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Mandatory Training Status */}
          <div className="stat-card">
            <h2 className="text-base font-semibold text-foreground mb-1">{t("deptAdmin.mandatoryStatus")}</h2>
            <p className="text-xs text-muted-foreground mb-4">{t("deptAdmin.mandatoryStatusDesc")}</p>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {memberRows.filter((m: any) => !m.mandatoryDone).map((m: any) => (
                <div key={m.user_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-destructive/5 border border-destructive/10">
                  <span className="text-sm font-medium text-foreground">{m.full_name || "-"}</span>
                  <span className="text-xs font-medium text-destructive">{t("deptAdmin.incompleteLabel")}</span>
                </div>
              ))}
              {memberRows.filter((m: any) => !m.mandatoryDone).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">✅ {t("deptAdmin.completedLabel")}</p>
              )}
            </div>
          </div>
        </div>

        {/* Member List */}
        <div className="stat-card !p-0 overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-base font-semibold text-foreground">{t("deptAdmin.memberList")}</h2>
            <p className="text-xs text-muted-foreground mt-1">{t("deptAdmin.memberListDesc")}</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t("deptAdmin.nameColumn")}</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">{t("deptAdmin.positionColumn")}</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">{t("deptAdmin.coursesColumn")}</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">{t("deptAdmin.progressColumn")}</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">{t("deptAdmin.mandatoryColumn")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {memberRows.map((m: any) => (
                <tr key={m.user_id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-accent-foreground shrink-0">
                        {(m.full_name || "?").slice(0, 1)}
                      </div>
                      <span className="text-sm font-medium text-foreground">{m.full_name || "-"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-sm text-muted-foreground">{m.position || "-"}</td>
                  <td className="px-4 py-3 text-center text-sm text-foreground">{m.courseCount}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-medium ${m.avgProgress >= 80 ? "text-chart-3" : m.avgProgress >= 50 ? "text-chart-2" : "text-muted-foreground"}`}>
                      {m.avgProgress}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${m.mandatoryDone ? "text-chart-3 bg-chart-3/10" : "text-destructive bg-destructive/10"}`}>
                      {m.mandatoryDone ? t("deptAdmin.completedLabel") : t("deptAdmin.incompleteLabel")}
                    </span>
                  </td>
                </tr>
              ))}
              {memberRows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">{t("deptAdmin.noMembers")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DeptAdminDashboard;
