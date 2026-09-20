import { useMemo, useState } from "react";
import { Settings, Bell, Shield, Building2, Plus, Pencil, Trash2, Users, Eye, DatabaseBackup, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSystemSettings, type MenuVisibilityMap } from "@/hooks/useSystemSettings";

// Menu catalog mirrors the items defined in DashboardLayout.
// Items marked `protected` cannot be hidden from the sidebar.
type MenuRole = "student" | "teacher" | "admin";
const MENU_CATALOG: Record<MenuRole, { groupLabel?: string; items: { key: string; label: string; protected?: boolean }[] }[]> = {
  student: [
    {
      items: [
        { key: "dashboard", label: "대시보드", protected: true },
        { key: "catalog", label: "강의 카탈로그" },
        { key: "myCourses", label: "내 강의" },
        { key: "myTracks", label: "내 학습 트랙" },
        { key: "assignments", label: "과제" },
        { key: "achievements", label: "성취" },
        { key: "announcements", label: "공지사항" },
        { key: "board", label: "게시판" },
        { key: "myPage", label: "마이페이지", protected: true },
      ],
    },
  ],
  teacher: [
    {
      items: [
        { key: "dashboard", label: "대시보드", protected: true },
        { key: "courseManagement", label: "강의 관리" },
        { key: "assignmentManagement", label: "과제 관리" },
        { key: "studentManagement", label: "학습자 관리" },
        { key: "notificationManagement", label: "알림 관리" },
        { key: "announcementManagement", label: "공지사항 관리" },
        { key: "boardManagement", label: "게시판 관리" },
        { key: "attendanceManagement", label: "출석 관리" },
      ],
    },
  ],
  admin: [
    { groupLabel: "인사이트", items: [
      { key: "dashboard", label: "대시보드", protected: true },
      { key: "trafficMonitoring", label: "통계 현황" },
    ]},
    { groupLabel: "회원·조직", items: [
      { key: "userManagement", label: "사용자 관리" },
      { key: "branchManagement", label: "조직 관리" },
    ]},
    { groupLabel: "콘텐츠", items: [
      { key: "courseManagement", label: "강의 관리" },
      { key: "trackManagement", label: "학습 트랙 관리" },
      { key: "videoManagement", label: "동영상 관리" },
      { key: "videoHealthCheck", label: "영상 자동 점검" },
      { key: "videoMobileCheck", label: "모바일 영상 점검" },
      { key: "i18nManagement", label: "다국어 관리" },
    ]},
    { groupLabel: "학습 운영", items: [
      { key: "enrollmentManagement", label: "수강 신청 관리" },
      { key: "learningManagement", label: "학습 관리" },
      { key: "attendanceManagement", label: "출석 관리" },
      { key: "completionManagement", label: "수료 관리" },
      { key: "surveyManagement", label: "설문 관리" },
    ]},
    { groupLabel: "커뮤니케이션", items: [
      { key: "notificationManagement", label: "알림 관리" },
      { key: "announcementManagement", label: "공지사항 관리" },
      { key: "boardManagement", label: "게시판 관리" },
    ]},
    { groupLabel: "시스템", items: [
      { key: "settings", label: "시스템 설정", protected: true },
      { key: "systemInfo", label: "시스템 정보" },
    ]},
  ],
};

const ROLE_TABS: { value: MenuRole; label: string }[] = [
  { value: "student", label: "학습자" },
  { value: "teacher", label: "강사" },
  { value: "admin", label: "관리자" },
];

const BACKUP_TABLE_LABELS: Record<string, { ko: string; en: string }> = {
  profiles: { ko: "회원 정보", en: "Members" },
  enrollments: { ko: "수강 기록", en: "Enrollments" },
  content_progress: { ko: "차시 진도", en: "Content progress" },
};


const AdminSettings = () => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en");
  const queryClient = useQueryClient();
  const { teacherRoleEnabled, menuVisibility } = useSystemSettings();
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<any>(null);
  const [deleteDeptId, setDeleteDeptId] = useState<string | null>(null);
  const [deptForm, setDeptForm] = useState({ name: "", name_en: "", code: "", parent_department_id: "", team_name: "" });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { error } = await supabase
        .from("system_settings" as any)
        .upsert({ key, value }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success(t("admin.settingSaved", "설정이 저장되었습니다."));
    },
    onError: (err: any) => toast.error(err.message),
  });

  const settingSections = [
    {
      title: t("admin.generalSettings"),
      icon: Settings,
      items: [
        { label: t("admin.platformName"), value: "NONFICTION LMS", type: "text" },
        { label: t("admin.defaultLanguage"), value: "한국어", type: "select" },
        { label: t("admin.timezone"), value: "Asia/Seoul (UTC+9)", type: "select" },
      ],
    },
    {
      title: t("admin.notificationSettings"),
      icon: Bell,
      items: [
        { label: t("admin.newSignupNotif"), value: true, type: "toggle" },
        { label: t("admin.assignmentSubmitNotif"), value: true, type: "toggle" },
        { label: t("admin.completionNotif"), value: true, type: "toggle" },
      ],
    },
    {
      title: t("admin.securitySettings"),
      icon: Shield,
      items: [
        { label: t("admin.minPasswordLength"), value: "8", type: "text" },
        { label: t("admin.sessionExpiry"), value: "24h", type: "select" },
        { label: t("admin.twoFactorAuth"), value: false, type: "toggle" },
      ],
    },
  ];

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-all"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*").order("display_order");
      return data || [];
    },
  });

  // Count members per department
  const { data: profiles = [] } = useQuery({
    queryKey: ["dept-member-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("department_id");
      return data || [];
    },
  });

  const memberCounts = new Map<string, number>();
  profiles.forEach((p: any) => {
    if (p.department_id) memberCounts.set(p.department_id, (memberCounts.get(p.department_id) || 0) + 1);
  });

  // 데이터 백업 현황
  const { data: backupSummary = [], isLoading: backupLoading, refetch: refetchBackup } = useQuery({
    queryKey: ["backup-summary"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_backup_summary");
      if (error) throw error;
      return (data || []) as { backup_date: string; source_table: string; row_count: number }[];
    },
  });

  const runBackupMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("trigger_daily_data_backup");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("admin.backupRunSuccess", "백업이 생성되었습니다."));
      refetchBackup();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const [restoreTarget, setRestoreTarget] = useState<{ date: string; table: string; rows: number } | null>(null);

  const restoreBackupMutation = useMutation({
    mutationFn: async (target: { date: string; table: string }) => {
      const { data, error } = await (supabase as any).rpc("restore_data_backup", {
        p_backup_date: target.date,
        p_source_table: target.table,
      });
      if (error) throw error;
      return data as { restored_rows: number };
    },
    onSuccess: (data) => {
      toast.success(
        t("admin.backupRestoreSuccess", "복원이 완료되었습니다.") +
          ` (${Number(data?.restored_rows || 0).toLocaleString()}${isEn ? " rows" : "건"})`,
      );
      setRestoreTarget(null);
      queryClient.invalidateQueries();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const backupByDate = useMemo(() => {
    const map = new Map<string, { source_table: string; row_count: number }[]>();
    backupSummary.forEach((r) => {
      const list = map.get(r.backup_date) || [];
      list.push({ source_table: r.source_table, row_count: Number(r.row_count) });
      map.set(r.backup_date, list);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [backupSummary]);

  const todaySeoul = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const yesterdaySeoul = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const backupDateLabel = (date: string) => {
    const d = new Date(`${date}T00:00:00+09:00`);
    const base = d.toLocaleDateString(isEn ? "en-US" : "ko-KR", { month: "long", day: "numeric", weekday: "short" });
    if (date === todaySeoul) return isEn ? `${base} (Today)` : `${base} (오늘)`;
    if (date === yesterdaySeoul) return isEn ? `${base} (Yesterday)` : `${base} (어제)`;
    return base;
  };
  const backupTableLabel = (table: string) => {
    const label = BACKUP_TABLE_LABELS[table];
    if (!label) return table;
    return isEn ? label.en : label.ko;
  };


  const createDeptMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { name: deptForm.name, name_en: deptForm.name_en || null, code: deptForm.code || null, team_name: deptForm.team_name || null };
      if (deptForm.parent_department_id) payload.parent_department_id = deptForm.parent_department_id;

      if (editingDept) {
        const { error } = await supabase.from("departments").update(payload).eq("id", editingDept.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingDept ? t("admin.deptUpdated") : t("admin.deptCreated"));
      setDeptDialogOpen(false);
      setEditingDept(null);
      setDeptForm({ name: "", name_en: "", code: "", parent_department_id: "", team_name: "" });
      queryClient.invalidateQueries({ queryKey: ["departments-all"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteDeptMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("admin.deptDeleted"));
      setDeleteDeptId(null);
      queryClient.invalidateQueries({ queryKey: ["departments-all"] });
    },
  });

  const openEditDept = (dept: any) => {
    setEditingDept(dept);
    setDeptForm({ name: dept.name, name_en: dept.name_en || "", code: dept.code || "", parent_department_id: dept.parent_department_id || "", team_name: dept.team_name || "" });
    setDeptDialogOpen(true);
  };

  const openAddDept = () => {
    setEditingDept(null);
    setDeptForm({ name: "", name_en: "", code: "", parent_department_id: "", team_name: "" });
    setDeptDialogOpen(true);
  };

  // Build tree structure
  const topLevel = departments.filter((d: any) => !d.parent_department_id);
  const getChildren = (parentId: string) => departments.filter((d: any) => d.parent_department_id === parentId);

  const renderDeptRow = (dept: any, level: number = 0) => {
    const children = getChildren(dept.id);
    const count = memberCounts.get(dept.id) || 0;
    return (
      <div key={dept.id}>
        <div className={`flex items-center justify-between py-3 px-4 hover:bg-accent/30 transition-colors border-b border-border`}>
          <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 24}px` }}>
            {level > 0 && <span className="text-muted-foreground text-xs">└</span>}
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {isEn ? dept.name_en || dept.name : dept.name}
            </span>
            {dept.code && <span className="text-[10px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded">{dept.code}</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{count}{isEn ? "" : "명"}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDept(dept)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteDeptId(dept.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {children.map((c: any) => renderDeptRow(c, level + 1))}
      </div>
    );
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Settings className="h-6 w-6" aria-hidden="true" />{t("admin.settingsTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("admin.settingsDesc")}</p>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">{t("admin.generalSettings")}</TabsTrigger>
            <TabsTrigger value="menus">{t("admin.menuVisibility", "메뉴 표시 설정")}</TabsTrigger>
            <TabsTrigger value="departments">{t("admin.deptManagement")}</TabsTrigger>
            <TabsTrigger value="backup">{t("admin.backupTab", "데이터 백업")}</TabsTrigger>
          </TabsList>

          <TabsContent value="menus" className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t("admin.menuVisibility", "메뉴 표시 설정")}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "admin.menuVisibilityDesc",
                  "역할별로 좌측 사이드바에 노출할 메뉴를 켜거나 끌 수 있습니다. 일부 핵심 메뉴(대시보드, 시스템 설정, 마이페이지)는 항상 노출됩니다.",
                )}
              </p>
            </div>

            <Tabs defaultValue="student" className="space-y-4">
              <TabsList>
                {ROLE_TABS.map((r) => (
                  <TabsTrigger key={r.value} value={r.value}>{r.label}</TabsTrigger>
                ))}
              </TabsList>

              {ROLE_TABS.map((r) => {
                const groups = MENU_CATALOG[r.value];
                const roleMap = (menuVisibility?.[r.value] || {}) as Record<string, boolean>;
                const setItemVisibility = (key: string, visible: boolean) => {
                  const next: MenuVisibilityMap = {
                    ...(menuVisibility || {}),
                    [r.value]: { ...(menuVisibility?.[r.value] || {}), [key]: visible },
                  };
                  updateSettingMutation.mutate({ key: "menu_visibility", value: next });
                };
                return (
                  <TabsContent key={r.value} value={r.value} className="space-y-6">
                    {groups.map((group, gi) => (
                      <div key={gi} className="stat-card !p-0 overflow-hidden">
                        {group.groupLabel && (
                          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-accent/30">
                            <Eye className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-semibold text-foreground">{group.groupLabel}</span>
                          </div>
                        )}
                        {group.items.map((item) => {
                          const visible = item.protected ? true : (roleMap[item.key] !== false);
                          return (
                            <div key={item.key} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
                              <div className="min-w-0">
                                <p className="text-sm text-foreground">{item.label}</p>
                                {item.protected && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {t("admin.menuProtected", "필수 메뉴 (숨길 수 없음)")}
                                  </p>
                                )}
                              </div>
                              <Switch
                                checked={visible}
                                disabled={item.protected || updateSettingMutation.isPending}
                                onCheckedChange={(v) => setItemVisibility(item.key, v)}
                                aria-label={item.label}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </TabsContent>
                );
              })}
            </Tabs>
          </TabsContent>


          <TabsContent value="general" className="space-y-8">
            {/* 역할 표시 설정 */}
            <div className="stat-card space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <Users className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-base font-semibold text-foreground">
                  {t("admin.roleVisibility", "역할 표시 설정")}
                </h2>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t("admin.useTeacherRole", "강사 역할 사용")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(
                      "admin.useTeacherRoleDesc",
                      "비활성화하면 모든 사용자에게 강사 메뉴, 강사 대시보드, 역할 전환의 강사 옵션이 숨겨집니다.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={teacherRoleEnabled}
                  onCheckedChange={(v) =>
                    updateSettingMutation.mutate({ key: "teacher_role_enabled", value: v })
                  }
                  disabled={updateSettingMutation.isPending}
                  aria-label={t("admin.useTeacherRole", "강사 역할 사용")}
                />
              </div>
            </div>

            {settingSections.map((section) => (
              <div key={section.title} className="stat-card space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-border">
                  <section.icon className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
                </div>
                <div className="space-y-4">
                  {section.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <label className="text-sm text-foreground">{item.label}</label>
                      {item.type === "toggle" ? (
                        <button className={`h-6 w-11 rounded-full transition-colors ${item.value ? "bg-foreground" : "bg-border"} relative`}>
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${item.value ? "left-[22px]" : "left-0.5"}`} />
                        </button>
                      ) : (
                        <Input defaultValue={item.value as string} className="w-48 h-9 rounded-xl border-border text-sm text-right" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground text-right">
              {t("admin.autoSavedNotice", "설정은 변경 즉시 자동 저장됩니다.")}
            </p>
          </TabsContent>

          <TabsContent value="departments" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">{t("admin.deptManagement")}</h2>
                <p className="text-xs text-muted-foreground mt-1">{t("admin.deptManagementDesc")}</p>
              </div>
              <Button className="rounded-xl gap-2" onClick={openAddDept}>
                <Plus className="h-4 w-4" /> {t("admin.addDepartment")}
              </Button>
            </div>
            <div className="stat-card !p-0 overflow-hidden">
              {topLevel.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("admin.noDepartments")}</p>
              ) : (
                topLevel.map((d: any) => renderDeptRow(d))
              )}
            </div>
          </TabsContent>

          <TabsContent value="backup" className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">{t("admin.backupTitle", "데이터 백업")}</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(
                    "admin.backupDesc",
                    "회원 정보와 수강·진도 기록을 매일 자정(한국시간)에 자동 백업하며, 7일이 지난 백업은 자동으로 삭제됩니다.",
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-xl gap-2 shrink-0"
                onClick={() => runBackupMutation.mutate()}
                disabled={runBackupMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 ${runBackupMutation.isPending ? "animate-spin" : ""}`} />
                {runBackupMutation.isPending ? t("admin.backupRunning", "백업 중...") : t("admin.backupRunNow", "지금 백업")}
              </Button>
            </div>

            {backupLoading ? (
              <div className="stat-card">
                <p className="text-sm text-muted-foreground text-center py-8">{t("common.loading", "불러오는 중...")}</p>
              </div>
            ) : backupByDate.length === 0 ? (
              <div className="stat-card">
                <p className="text-sm text-muted-foreground text-center py-8">{t("admin.backupEmpty", "아직 백업 기록이 없습니다.")}</p>
              </div>
            ) : (
              backupByDate.map(([date, tables]) => (
                <div key={date} className="stat-card !p-0 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-accent/30">
                    <DatabaseBackup className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">{backupDateLabel(date)}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto">{t("admin.backupAt", "자정 (한국시간) 자동 실행")}</span>
                  </div>
                  {tables.map((row) => (
                    <div key={row.source_table} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
                      <p className="text-sm text-foreground">{backupTableLabel(row.source_table)}</p>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {row.row_count.toLocaleString()}
                        {isEn ? " rows" : "건"}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </TabsContent>

        </Tabs>
      </div>

      {/* Add/Edit Department Dialog */}
      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDept ? t("admin.editDept") : t("admin.addDepartment")}</DialogTitle>
            <DialogDescription>{t("admin.deptManagementDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("admin.deptName")}</Label>
              <Input value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>{t("admin.deptNameEn")}</Label>
              <Input value={deptForm.name_en} onChange={(e) => setDeptForm({ ...deptForm, name_en: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>{t("admin.teamName")}</Label>
              <Input value={deptForm.team_name} onChange={(e) => setDeptForm({ ...deptForm, team_name: e.target.value })} placeholder={t("admin.teamName")} className="mt-1" />
            </div>
            <div>
              <Label>{t("admin.deptCode")}</Label>
              <Input value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} placeholder="MKT" className="mt-1" />
            </div>
            <div>
              <Label>{t("admin.parentDept")}</Label>
              <Select value={deptForm.parent_department_id || "none"} onValueChange={(v) => setDeptForm({ ...deptForm, parent_department_id: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("admin.noParent")}</SelectItem>
                  {departments.filter((d: any) => d.id !== editingDept?.id).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{isEn ? d.name_en || d.name : d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full rounded-xl" onClick={() => createDeptMutation.mutate()} disabled={!deptForm.name || createDeptMutation.isPending}>
              {createDeptMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDeptId} onOpenChange={() => setDeleteDeptId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.deleteDept")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.deleteDeptConfirm", { name: departments.find((d: any) => d.id === deleteDeptId)?.name || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteDeptId && deleteDeptMutation.mutate(deleteDeptId)}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AdminSettings;
