import { Users, Search, UserPlus, Trash2, Pencil, Activity, GraduationCap, Upload, KeyRound } from "lucide-react";
import StaffBulkUploadDialog from "@/components/admin/StaffBulkUploadDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import StaffEditDialog, { type StaffEditDraft, type StaffRole } from "@/components/admin/StaffEditDialog";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import PageSkeleton from "@/components/PageSkeleton";
import StatCard from "@/components/ui/stat-card";
import { useDashboardSparklines, computeDelta } from "@/hooks/useDashboardSparklines";

const ROLE_PRIORITY = ["super_admin", "admin", "teacher", "student"] as const;

const AdminUsers = () => {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ userId: string; name: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [staffEdit, setStaffEdit] = useState<StaffEditDraft | null>(null);
  const [resetTarget, setResetTarget] = useState<{ userId: string; name: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newUser, setNewUser] = useState<{ name: string; email: string; password: string; roles: StaffRole[]; departmentId: string; branchId: string }>({ name: "", email: "", password: "", roles: ["student"], departmentId: "", branchId: "" });
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const isEn = i18n.language?.startsWith("en");

  const roleLabel: Record<(typeof ROLE_PRIORITY)[number], { text: string; className: string }> = {
    super_admin: { text: t("roles.superAdminLabel", "슈퍼관리자"), className: "text-primary bg-primary/10" },
    admin: { text: t("roles.adminLabel", "관리자"), className: "text-destructive bg-destructive/10" },
    teacher: { text: t("roles.teacherLabel", "강사"), className: "text-primary bg-primary/10" },
    student: { text: t("roles.studentLabel", "학습자"), className: "text-foreground bg-secondary" },
  };

  const { data: profiles = [], isPending: profilesPending } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: roles = [], isPending: rolesPending } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const isInitialLoading = profilesPending || rolesPending;

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*").eq("is_active", true).order("display_order");
      return data || [];
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async () => {
      const effectiveDeptId = newUser.departmentId === "__branch__" ? newUser.branchId : newUser.departmentId;
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: newUser.email,
          password: newUser.password,
          fullName: newUser.name,
          roles: newUser.roles,
          departmentId: effectiveDeptId || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success(t("admin.userCreated"), { description: t("admin.userCreatedDesc", { name: newUser.name }) });
      setAddOpen(false);
      setNewUser({ name: "", email: "", password: "", roles: ["student"], departmentId: "", branchId: "" });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success(t("admin.userDeleted"));
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      const message = err?.message || "";

      if (message.includes("Cannot delete yourself")) {
        toast.error(t("admin.cannotDeleteSelf"));
        return;
      }

      if (message.includes("Cannot delete super admin")) {
        toast.error(t("admin.cannotManageSuperAdmin"));
        return;
      }

      if (message.includes("Admin access required")) {
        toast.error(t("admin.adminPermissionRequired"));
        return;
      }

      toast.error(message || t("common.error"));
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { userId, newPassword: password },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success(t("admin.passwordResetSuccess", "비밀번호가 변경되었습니다"));
      setResetTarget(null);
      setNewPassword("");
    },
    onError: (err: any) => {
      toast.error(err?.message || t("common.error"));
    },
  });

  const rolesByUser = useMemo(() => {
    const grouped = new Map<string, StaffRole[]>();

    roles.forEach((roleRow: any) => {
      const current = grouped.get(roleRow.user_id) ?? [];
      const nextRole = roleRow.role as StaffRole;

      if (!current.includes(nextRole)) {
        current.push(nextRole);
      }

      grouped.set(roleRow.user_id, current);
    });

    return grouped;
  }, [roles]);

  const getPrimaryRole = (userId: string) => {
    const assignedRoles = rolesByUser.get(userId) ?? [];
    return ROLE_PRIORITY.find((role) => assignedRoles.includes(role as StaffRole)) ?? "student";
  };

  const hasProtectedRole = (userId: string) => (rolesByUser.get(userId) ?? []).includes("super_admin");

  const getDeptName = (deptId: string | null) => {
    if (!deptId) return "-";
    const dept = departments.find((d: any) => d.id === deptId);
    if (!dept) return "-";
    return isEn ? (dept as any).name_en || (dept as any).name : (dept as any).name;
  };

  const filtered = profiles.filter((profile: any) => {
    const q = search.toLowerCase().trim();
    const searchableValues = [
      profile.full_name || "",
      profile.email || "",
      profile.department || "",
      profile.position || "",
      getDeptName(profile.department_id),
    ];

    const matchesSearch = !q || searchableValues.some((value) => value.toLowerCase().includes(q));
    const matchesDept = deptFilter === "all" || profile.department_id === deptFilter;
    return matchesSearch && matchesDept;
  });

  const teacherCount = profiles.filter((profile: any) => getPrimaryRole(profile.user_id) === "teacher").length;
  const { data: usersSpark } = useDashboardSparklines(14);

  const openStaffEdit = (profile: any) => {
    const primaryRole = getPrimaryRole(profile.user_id);
    const deptId = profile.department_id || "";
    const dept = departments.find((d: any) => d.id === deptId);
    let branchId = "__none__";
    let departmentId = "__none__";
    if (dept) {
      if ((dept as any).parent_department_id) {
        branchId = (dept as any).parent_department_id;
        departmentId = dept.id;
      } else {
        branchId = dept.id;
        departmentId = "__none__";
      }
    }

    const assigned = (rolesByUser.get(profile.user_id) ?? []).filter(
      (r): r is "admin" | "teacher" | "student" => r === "admin" || r === "teacher" || r === "student",
    );
    const initialRoles = assigned.length > 0
      ? assigned
      : [primaryRole === "super_admin" ? "admin" : primaryRole] as ("admin" | "teacher" | "student")[];

    setStaffEdit({
      userId: profile.user_id,
      name: profile.full_name || "-",
      branchId,
      departmentId,
      position: profile.position || "",
      roles: initialRoles,
      roleLocked: hasProtectedRole(profile.user_id) || profile.user_id === user?.id,
    });
  };

  const updateStaffMutation = useMutation({
    mutationFn: async (draft: StaffEditDraft) => {
      const departmentId = draft.departmentId !== "__none__" ? draft.departmentId : (draft.branchId !== "__none__" ? draft.branchId : null);
      const position = draft.position.trim();

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ department_id: departmentId, position: position || null })
        .eq("user_id", draft.userId);
      if (profileError) throw profileError;

      if (draft.roleLocked) return;

      const { data: currentRoles, error: roleReadError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", draft.userId);
      if (roleReadError) throw roleReadError;

      if ((currentRoles ?? []).some((item) => item.role === "super_admin")) {
        throw new Error("Cannot delete super admin");
      }

      const { error: deleteRoleError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", draft.userId)
        .neq("role", "super_admin");
      if (deleteRoleError) throw deleteRoleError;

      const uniqueRoles = Array.from(new Set(draft.roles));
      if (uniqueRoles.length === 0) throw new Error("At least one role is required");
      const { error: insertRoleError } = await supabase
        .from("user_roles")
        .insert(uniqueRoles.map((r) => ({ user_id: draft.userId, role: r as StaffRole })));
      if (insertRoleError) throw insertRoleError;
    },
    onSuccess: () => {
      toast.success(t("admin.staffUpdated"));
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      setStaffEdit(null);
    },
    onError: (err: any) => {
      const message = err?.message || "";

      if (message.includes("Cannot delete super admin")) {
        toast.error(t("admin.cannotManageSuperAdmin"));
        return;
      }

      toast.error(message || t("common.error"));
    },
  });

  return (
    <DashboardLayout role="admin">
      {isInitialLoading ? (
        <PageSkeleton blocks={5} />
      ) : (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2"><Users className="h-6 w-6" aria-hidden="true" />{t("admin.userManagement")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("admin.userManagementDesc")}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button variant="outline" className="rounded-xl gap-2 w-full sm:w-auto" onClick={() => setBulkOpen(true)}>
              <Upload className="h-4 w-4" /> 일괄 업로드
            </Button>
            <Button className="rounded-xl gap-2 w-full sm:w-auto" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" /> {t("admin.addUser")}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label={t("admin.totalUsersCount")}
            value={profiles.length}
            icon={Users}
            tone="primary"
            trend={(usersSpark?.signups ?? []).slice(-7)}
            delta={computeDelta(usersSpark?.signups)}
          />
          <StatCard
            label={t("admin.activeUsers")}
            value={profiles.length}
            icon={Activity}
            tone="success"
            trend={(usersSpark?.sessions ?? []).slice(-7)}
            delta={computeDelta(usersSpark?.sessions)}
          />
          <StatCard
            label={t("admin.teacherCount")}
            value={teacherCount}
            icon={GraduationCap}
            tone="info"
          />
        </div>

        {/* Search + Dept Filter */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("admin.searchUser")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 rounded-xl border-border" />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-28 sm:w-40 rounded-xl">
              <SelectValue placeholder={t("admin.allDepts")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.allDepts")}</SelectItem>
              {departments.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{isEn ? d.name_en || d.name : d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* User Table */}
        <div className="stat-card !p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t("admin.nameColumn")}</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">{t("admin.departmentColumn")}</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t("admin.roleColumn")}</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">{t("admin.positionColumn")}</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((profile: any) => {
                const currentRole = getPrimaryRole(profile.user_id);
                const assignedRoles = (rolesByUser.get(profile.user_id) ?? []) as StaffRole[];
                const displayRoles = ROLE_PRIORITY.filter((r) => assignedRoles.includes(r));
                const rolesToShow = displayRoles.length > 0 ? displayRoles : [currentRole];
                const deleteDisabledReason = profile.user_id === user?.id
                  ? t("admin.cannotDeleteSelf")
                  : hasProtectedRole(profile.user_id)
                    ? t("admin.cannotManageSuperAdmin")
                    : null;

                return (
                  <tr key={profile.user_id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-accent-foreground shrink-0">
                          {(profile.full_name || "?").slice(0, 1)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{profile.full_name || "-"}</p>
                          <p className="text-xs text-muted-foreground">{profile.email || profile.employee_id || "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-sm text-muted-foreground">{getDeptName(profile.department_id)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {rolesToShow.map((r) => {
                          const cfg = roleLabel[r] || roleLabel.student;
                          return (
                            <span key={r} className={`text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap ${cfg.className}`}>
                              {cfg.text}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{profile.position || "-"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full gap-1.5 px-3"
                          onClick={() => openStaffEdit(profile)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{t("common.edit")}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          title={t("admin.resetPassword", "비밀번호 초기화")}
                          aria-label={t("admin.resetPassword", "비밀번호 초기화")}
                          onClick={() => {
                            setNewPassword("");
                            setResetTarget({ userId: profile.user_id, name: profile.full_name || "-", email: profile.email || "" });
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full text-destructive hover:text-destructive"
                          disabled={!!deleteDisabledReason}
                          title={deleteDisabledReason || t("admin.deleteUser")}
                          aria-label={deleteDisabledReason || t("admin.deleteUser")}
                          onClick={() => setDeleteTarget({ userId: profile.user_id, name: profile.full_name || "-" })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">{t("admin.noUsers")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.addUser")}</DialogTitle>
            <DialogDescription>{t("admin.userManagementDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("auth.name")}</Label>
              <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder={t("auth.namePlaceholder")} className="mt-1" />
            </div>
            <div>
              <Label>{t("auth.email")}</Label>
              <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="user@nonfiction.co.kr" className="mt-1" />
            </div>
            <div>
              <Label>{t("admin.tempPassword")}</Label>
              <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="••••••••" className="mt-1" />
            </div>
            <div>
              <Label>{t("branch.branchTitle")}</Label>
              <Select value={newUser.branchId} onValueChange={(v) => setNewUser({ ...newUser, branchId: v, departmentId: "" })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("branch.branchTitle")} /></SelectTrigger>
                <SelectContent>
                  {departments.filter((d: any) => !d.parent_department_id).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{isEn ? d.name_en || d.name : d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("admin.selectDept")}</Label>
              <Select value={newUser.departmentId} onValueChange={(v) => setNewUser({ ...newUser, departmentId: v })} disabled={!newUser.branchId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("admin.selectDept")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__branch__">{departments.find((d: any) => d.id === newUser.branchId) ? (isEn ? (departments.find((d: any) => d.id === newUser.branchId) as any).name_en || (departments.find((d: any) => d.id === newUser.branchId) as any).name : (departments.find((d: any) => d.id === newUser.branchId) as any).name) + ` (${t("branch.branchTitle")})` : "-"}</SelectItem>
                  {departments.filter((d: any) => d.parent_department_id === newUser.branchId).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{isEn ? d.name_en || d.name : d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("admin.selectRole")}</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["student", "teacher", "admin"] as StaffRole[]).map((r) => {
                  const checked = newUser.roles.includes(r);
                  return (
                    <button
                      type="button"
                      key={r}
                      onClick={() => {
                        const next = checked
                          ? newUser.roles.filter((x) => x !== r)
                          : [...newUser.roles, r];
                        setNewUser({ ...newUser, roles: next.length ? next : ["student"] });
                      }}
                      className={`px-3 py-2 rounded-xl border text-sm transition ${
                        checked
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-foreground/40"
                      }`}
                    >
                      {t(`roles.${r}Label`)}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {t("admin.selectRoleMultiHint", "복수 역할 선택 가능 (예: 학습자 + 러닝리더)")}
              </p>
            </div>
            <Button className="w-full rounded-xl" onClick={() => createUserMutation.mutate()} disabled={!newUser.name || !newUser.email || !newUser.password || createUserMutation.isPending}>
              {createUserMutation.isPending ? t("common.processing") : t("admin.addUser")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.deleteUser")}: {deleteTarget?.name}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.deleteUserConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteUserMutation.mutate(deleteTarget.userId)}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? t("common.processing") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StaffEditDialog
        open={!!staffEdit}
        onOpenChange={(open) => !open && setStaffEdit(null)}
        draft={staffEdit}
        onDraftChange={setStaffEdit}
        departments={departments}
        isEn={isEn}
        saving={updateStaffMutation.isPending}
        onSave={() => staffEdit && updateStaffMutation.mutate(staffEdit)}
      />
      <StaffBulkUploadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
          queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
        }}
      />

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); setNewPassword(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.resetPassword", "비밀번호 초기화")}</DialogTitle>
            <DialogDescription>
              {resetTarget?.name} {resetTarget?.email ? `(${resetTarget.email})` : ""} {t("admin.resetPasswordDesc", "님의 새 비밀번호를 입력하세요. 변경 후 사용자에게 안전하게 전달해주세요.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("admin.newPassword", "새 비밀번호")}</Label>
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("admin.newPasswordPlaceholder", "최소 6자 이상")}
                className="mt-1"
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground mt-1.5">{t("admin.newPasswordHint", "최소 6자 이상이어야 합니다.")}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setResetTarget(null); setNewPassword(""); }}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => resetTarget && resetPasswordMutation.mutate({ userId: resetTarget.userId, password: newPassword })}
                disabled={newPassword.length < 6 || resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending ? t("common.processing") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminUsers;
