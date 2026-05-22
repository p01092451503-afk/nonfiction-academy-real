import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Building2, Plus, Upload, Download, Pencil, Trash2, Users, Search } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const AdminBranches = () => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Branch dialog state
  const [branchDialog, setBranchDialog] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [branchForm, setBranchForm] = useState({ name: "", name_en: "", code: "", country: "" });

  // Team dialog state
  const [teamDialog, setTeamDialog] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [teamForm, setTeamForm] = useState({ name: "", name_en: "", code: "", parent_department_id: "" });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: "branch" | "team" } | null>(null);

  // Staff state
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [staffSearch, setStaffSearch] = useState("");
  const [uploadBranch, setUploadBranch] = useState<string>("__csv__");
  const [editStaffDialog, setEditStaffDialog] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [staffForm, setStaffForm] = useState<{ department_id: string; position: string; roles: ("student" | "teacher" | "admin")[] }>({ department_id: "__none__", position: "", roles: ["student"] });

  // Fetch all departments
  const { data: allDepts = [] } = useQuery({
    queryKey: ["admin-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("display_order").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Separate branches (no parent) and teams (has parent)
  const branches = allDepts.filter((d: any) => !d.parent_department_id);
  const teams = allDepts.filter((d: any) => !!d.parent_department_id);

  // Fetch staff
  const { data: allProfiles = [] } = useQuery({
    queryKey: ["admin-branch-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name, department_id, position, employee_id, phone_number, created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["admin-branch-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data;
    },
  });

  // ── Branch CRUD ──
  const saveBranchMutation = useMutation({
    mutationFn: async () => {
      if (branchForm.code) {
        const existing = allDepts.find((d: any) => d.code === branchForm.code && d.id !== editingBranch?.id);
        if (existing) {
          throw new Error(`조직 코드 "${branchForm.code}"는 이미 "${existing.name}"에서 사용 중입니다.`);
        }
      }
      const payload: any = {
        name: branchForm.name,
        name_en: branchForm.name_en || null,
        code: branchForm.code || null,
        country: branchForm.country?.trim().toUpperCase() || null,
        parent_department_id: null,
      };
      if (editingBranch) {
        const { error } = await supabase.from("departments").update(payload).eq("id", editingBranch.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      toast({ title: editingBranch ? t("admin.deptUpdated") : t("admin.deptCreated") });
      setBranchDialog(false);
      setEditingBranch(null);
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // ── Team CRUD ──
  const saveTeamMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: teamForm.name,
        name_en: teamForm.name_en || null,
        code: null,
        parent_department_id: teamForm.parent_department_id || null,
      };
      if (editingTeam) {
        const { error } = await supabase.from("departments").update(payload).eq("id", editingTeam.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      toast({ title: editingTeam ? t("admin.deptUpdated") : t("admin.deptCreated") });
      setTeamDialog(false);
      setEditingTeam(null);
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // ── Delete ──
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branch-profiles"] });
      toast({ title: t("admin.deptDeleted") });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // ── Helpers ──
  const openAddBranch = () => {
    setEditingBranch(null);
    setBranchForm({ name: "", name_en: "", code: "", country: "" });
    setBranchDialog(true);
  };
  const openEditBranch = (b: any) => {
    setEditingBranch(b);
    setBranchForm({ name: b.name, name_en: b.name_en || "", code: b.code || "", country: b.country || "" });
    setBranchDialog(true);
  };
  const openAddTeam = () => {
    setEditingTeam(null);
    setTeamForm({ name: "", name_en: "", code: "", parent_department_id: branches[0]?.id || "" });
    setTeamDialog(true);
  };
  const openEditTeam = (t: any) => {
    setEditingTeam(t);
    setTeamForm({ name: t.name, name_en: t.name_en || "", code: t.code || "", parent_department_id: t.parent_department_id || "" });
    setTeamDialog(true);
  };

  const getBranchName = (deptId: string | null) => {
    if (!deptId) return "-";
    const d = allDepts.find((b: any) => b.id === deptId);
    return d ? (isEn ? d.name_en || d.name : d.name) : "-";
  };

  const deptStaffCount = (id: string) => allProfiles.filter((p: any) => p.department_id === id).length;

  // ── Staff ──
  const filteredProfiles = allProfiles.filter((p: any) => {
    if (selectedBranch !== "all" && p.department_id !== selectedBranch) return false;
    if (staffSearch && !p.full_name?.toLowerCase().includes(staffSearch.toLowerCase())) return false;
    return true;
  });

  const getRoleBadge = (userId: string) => {
    const role = userRoles.find((r: any) => r.user_id === userId);
    if (!role) return null;
    const variants: Record<string, string> = { admin: "destructive", super_admin: "destructive", teacher: "secondary", student: "outline" };
    const labelMap: Record<string, string> = { super_admin: "superAdminLabel", admin: "adminLabel", teacher: "teacherLabel", student: "studentLabel" };
    const labelKey = labelMap[role.role] || `${role.role}Label`;
    return <Badge variant={variants[role.role] as any || "outline"}>{t(`roles.${labelKey}`)}</Badge>;
  };

  const openEditStaff = (p: any) => {
    setEditingStaff(p);
    const myRoles = userRoles
      .filter((r: any) => r.user_id === p.user_id)
      .map((r: any) => r.role)
      .filter((r: string) => r === "student" || r === "teacher" || r === "admin") as ("student" | "teacher" | "admin")[];
    setStaffForm({
      department_id: p.department_id || "__none__",
      position: p.position || "",
      roles: myRoles.length ? myRoles : ["student"],
    });
    setEditStaffDialog(true);
  };

  const updateStaffMutation = useMutation({
    mutationFn: async () => {
      if (!editingStaff) return;
      const deptId = staffForm.department_id === "__none__" ? null : staffForm.department_id;
      const { error: pErr } = await supabase.from("profiles").update({ department_id: deptId, position: staffForm.position || null }).eq("user_id", editingStaff.user_id);
      if (pErr) throw pErr;
      // Replace non-super_admin role rows with the chosen multi-role set.
      const { error: deleteRoleError } = await supabase.from("user_roles").delete().eq("user_id", editingStaff.user_id).neq("role", "super_admin");
      if (deleteRoleError) throw deleteRoleError;
      const rolesToInsert = (staffForm.roles.length ? staffForm.roles : ["student"]).map((role) => ({ user_id: editingStaff.user_id, role: role as any }));
      const { error: insertRoleError } = await supabase.from("user_roles").insert(rolesToInsert);
      if (insertRoleError) throw insertRoleError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branch-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branch-roles"] });
      toast({ title: t("admin.staffUpdated") });
      setEditStaffDialog(false);
      setEditingStaff(null);
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // ── CSV Upload ──
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      toast({ title: t("common.error"), description: "CSV 파일에 데이터가 없습니다.", variant: "destructive" });
      return;
    }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes("name") || h.includes("이름"));
    const emailIdx = headers.findIndex(h => h.includes("email") || h.includes("이메일"));
    const posIdx = headers.findIndex(h => h.includes("position") || h.includes("직급"));
    const branchIdx = headers.findIndex(h => h.includes("branch") || h.includes("조직"));
    if (emailIdx === -1 || nameIdx === -1) {
      toast({ title: t("common.error"), description: "CSV에 이름(name)과 이메일(email) 열이 필요합니다.", variant: "destructive" });
      return;
    }
    let successCount = 0, errorCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim());
      const name = cols[nameIdx], email = cols[emailIdx];
      if (!name || !email) continue;
      let deptId = uploadBranch === "__csv__" ? null : uploadBranch || null;
      if (branchIdx !== -1 && cols[branchIdx]) {
        const found = allDepts.find((b: any) => b.name === cols[branchIdx] || b.name_en === cols[branchIdx] || b.code === cols[branchIdx]);
        if (found) deptId = found.id;
      }
      const tempPassword = `Nf${Math.random().toString(36).slice(2, 10)}!`;
      try {
        const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password: tempPassword, options: { data: { name, department_id: deptId } } });
        if (authErr) throw authErr;
        if (posIdx !== -1 && cols[posIdx] && authData.user) {
          await supabase.from("profiles").update({ position: cols[posIdx] }).eq("user_id", authData.user.id);
        }
        successCount++;
      } catch { errorCount++; }
    }
    toast({ title: t("branches.uploadComplete"), description: `${successCount}${t("branches.uploadSuccess")} / ${errorCount}${t("branches.uploadFailed")}` });
    queryClient.invalidateQueries({ queryKey: ["admin-branch-profiles"] });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadTemplate = () => {
    const csv = "이름,이메일,직급,조직\n홍길동,hong@example.com,사원,서울본사\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "staff_template.csv"; a.click();
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 sm:h-6 sm:w-6" />
            {t("branches.title")}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("branches.subtitle")}</p>
        </div>

        <Tabs defaultValue="branches">
          <TabsList>
            <TabsTrigger value="branches">{t("branches.branchList")}</TabsTrigger>
            
            <TabsTrigger value="staff">{t("branches.staffManagement")}</TabsTrigger>
            <TabsTrigger value="upload">{t("branches.bulkUpload")}</TabsTrigger>
          </TabsList>

          {/* ── Branches Tab ── */}
          <TabsContent value="branches" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={openAddBranch} size="sm"><Plus className="h-4 w-4 mr-1" /> {t("branches.addBranch")}</Button>
            </div>
            <div className="stat-card !p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("branches.branchName")}</TableHead>
                    <TableHead>{t("branches.branchNameEn")}</TableHead>
                    <TableHead>{t("admin.deptCode")}</TableHead>
                    <TableHead className="text-center">{t("branches.staffCount")}</TableHead>
                    <TableHead className="text-right">{t("common.manage")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("branches.noBranches")}</TableCell></TableRow>
                  ) : branches.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-muted-foreground">{b.name_en || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{b.code || "-"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary"><Users className="h-3 w-3 mr-1" />{deptStaffCount(b.id)}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditBranch(b)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget({ id: b.id, name: b.name, type: "branch" })}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>


          {/* ── Staff Tab ── */}
          <TabsContent value="staff" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder={t("branches.allBranches")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("branches.allBranches")}</SelectItem>
                  {allDepts.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.parent_department_id ? `  └ ${b.name}` : b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t("admin.searchUser")} value={staffSearch} onChange={e => setStaffSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="stat-card !p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.nameColumn")}</TableHead>
                    <TableHead>{t("branches.branch")}</TableHead>
                    <TableHead>{t("admin.positionColumn")}</TableHead>
                    <TableHead>{t("admin.roleColumn")}</TableHead>
                    <TableHead className="text-right">{t("common.manage")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("admin.noUsers")}</TableCell></TableRow>
                  ) : filteredProfiles.map((p: any) => (
                    <TableRow key={p.user_id}>
                      <TableCell className="font-medium">{p.full_name || "-"}</TableCell>
                      <TableCell>{getBranchName(p.department_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{p.position || "-"}</TableCell>
                      <TableCell>{getRoleBadge(p.user_id)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEditStaff(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Bulk Upload Tab ── */}
          <TabsContent value="upload" className="space-y-6">
            <div className="stat-card space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">{t("branches.bulkUploadTitle")}</h3>
                <p className="text-xs text-muted-foreground">{t("branches.bulkUploadDesc")}</p>
              </div>
              <Select value={uploadBranch} onValueChange={setUploadBranch}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder={t("branches.selectUploadBranch")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__csv__">{t("branches.useCSVColumn")}</SelectItem>
                  {allDepts.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="h-4 w-4 mr-1" /> {t("branches.downloadTemplate")}</Button>
                <Button size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4 mr-1" /> {t("branches.uploadCSV")}</Button>
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
              </div>
              <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{t("branches.csvFormat")}</p>
                <p>이름, 이메일, 직급, 조직</p>
                <p>홍길동, hong@example.com, 사원, 서울본사</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Branch Add/Edit Dialog ── */}
      <Dialog open={branchDialog} onOpenChange={setBranchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBranch ? t("branches.editBranch") : t("branches.addBranch")}</DialogTitle>
            <DialogDescription>{t("branches.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("branches.branchName")}</label>
              <Input value={branchForm.name} onChange={e => setBranchForm(f => ({ ...f, name: e.target.value }))} placeholder="예: 본사, 영등포조직" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("branches.branchNameEn")}</label>
              <Input value={branchForm.name_en} onChange={e => setBranchForm(f => ({ ...f, name_en: e.target.value }))} placeholder="e.g. HQ, Yeongdeungpo Branch" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("admin.deptCode")}</label>
              <Input value={branchForm.code} onChange={e => setBranchForm(f => ({ ...f, code: e.target.value }))} placeholder="HQ, YDP, JJU" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">국가 코드 (선택)</label>
              <Input
                value={branchForm.country}
                onChange={e => setBranchForm(f => ({ ...f, country: e.target.value.toUpperCase() }))}
                placeholder="예: KR, JP, US"
                maxLength={5}
                className="uppercase"
              />
              <p className="text-[11px] text-muted-foreground">국가별 게시판/공지 타겟팅에 사용됩니다.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => saveBranchMutation.mutate()} disabled={!branchForm.name || saveBranchMutation.isPending}>
              {saveBranchMutation.isPending ? t("common.processing") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Team Add/Edit Dialog ── */}
      <Dialog open={teamDialog} onOpenChange={setTeamDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTeam ? t("branches.editTeam") : t("branches.addTeam")}</DialogTitle>
            <DialogDescription>{t("branches.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("branches.belongsToBranch")}</label>
              <Select value={teamForm.parent_department_id} onValueChange={v => setTeamForm(f => ({ ...f, parent_department_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t("branches.selectBranch")} /></SelectTrigger>
                <SelectContent>
                  {branches.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{isEn ? b.name_en || b.name : b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("branches.teamName")}</label>
              <Input value={teamForm.name} onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} placeholder="예: 마케팅팀, 교육팀" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("branches.teamNameEn")}</label>
              <Input value={teamForm.name_en} onChange={e => setTeamForm(f => ({ ...f, name_en: e.target.value }))} placeholder="e.g. Marketing Team" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => saveTeamMutation.mutate()} disabled={!teamForm.name || !teamForm.parent_department_id || saveTeamMutation.isPending}>
              {saveTeamMutation.isPending ? t("common.processing") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === "branch" ? t("branches.deleteBranch") : t("branches.deleteTeam")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "branch"
                ? t("branches.deleteBranchConfirm", { name: deleteTarget?.name })
                : t("branches.deleteTeamConfirm", { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Staff Dialog ── */}
      <Dialog open={editStaffDialog} onOpenChange={setEditStaffDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.editStaff")} - {editingStaff?.full_name}</DialogTitle>
            <DialogDescription>{t("branches.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("branches.branch")}</label>
              <Select value={staffForm.department_id} onValueChange={v => setStaffForm(f => ({ ...f, department_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-</SelectItem>
                  {allDepts.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.parent_department_id ? `  └ ${b.name}` : b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("admin.positionColumn")}</label>
              <Input value={staffForm.position} onChange={e => setStaffForm(f => ({ ...f, position: e.target.value }))} placeholder={t("admin.positionColumn")} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t("admin.roleColumn")}</label>
                <span className="text-xs text-muted-foreground">
                  {t("admin.rolesMultiHint", "여러 역할을 동시에 지정할 수 있습니다")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["student", "teacher", "admin"] as const).map((r) => {
                  const checked = staffForm.roles.includes(r);
                  return (
                    <button
                      type="button"
                      key={r}
                      onClick={() => {
                        setStaffForm((f) => {
                          const has = f.roles.includes(r);
                          const next = has ? f.roles.filter((x) => x !== r) : [...f.roles, r];
                          return { ...f, roles: next.length ? next : ["student"] };
                        });
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
              <p className="text-xs text-muted-foreground">
                {t("admin.branchLeaderMultiHint", "한 지점에 러닝 리더(강사)를 여러 명 지정할 수 있습니다.")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStaffDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => updateStaffMutation.mutate()} disabled={updateStaffMutation.isPending}>
              {updateStaffMutation.isPending ? t("common.processing") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminBranches;
