import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getTeacherSubtype } from "@/lib/teacherSubtype";

export type StaffRole = "admin" | "teacher" | "student" | "super_admin";
export type AssignableStaffRole = Exclude<StaffRole, "super_admin">;

export interface StaffEditDraft {
  userId: string;
  name: string;
  roles: AssignableStaffRole[];
  departmentId: string;
  branchId: string;
  position: string;
  roleLocked: boolean;
}

interface DepartmentOption {
  id: string;
  name: string;
  name_en: string | null;
  parent_department_id?: string | null;
}

interface StaffEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: StaffEditDraft | null;
  onDraftChange: (draft: StaffEditDraft | null) => void;
  departments: DepartmentOption[];
  isEn: boolean;
  onSave: () => void;
  saving: boolean;
}

const StaffEditDialog = ({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  departments,
  isEn,
  onSave,
  saving,
}: StaffEditDialogProps) => {
  const { t } = useTranslation();

  const branches = useMemo(() => departments.filter((d) => !d.parent_department_id), [departments]);

  const teams = useMemo(() => {
    if (!draft?.branchId || draft.branchId === "__none__") return [];
    return departments.filter((d) => d.parent_department_id === draft.branchId);
  }, [departments, draft?.branchId]);

  if (!draft) return null;

  const getDeptLabel = (d: DepartmentOption) => (isEn ? d.name_en || d.name : d.name);

  const selectedBranch = branches.find((b) => b.id === draft.branchId);

  const toggleRole = (role: AssignableStaffRole, checked: boolean) => {
    const current = new Set(draft.roles);
    if (checked) current.add(role);
    else current.delete(role);
    // Always keep at least one role; default back to student if empty
    const next = current.size === 0 ? (["student"] as AssignableStaffRole[]) : Array.from(current);
    onDraftChange({ ...draft, roles: next });
  };

  const toggleTeacherSubtype = (subtype: "leader" | "manager", checked: boolean) => {
    if (draft.roleLocked) return;
    const current = new Set(draft.roles);
    if (checked) {
      current.add("teacher");
      onDraftChange({
        ...draft,
        roles: Array.from(current),
        position: subtype === "manager" ? "러닝매니저" : "러닝리더",
      });
    } else {
      current.delete("teacher");
      onDraftChange({
        ...draft,
        roles: Array.from(current),
        position: "",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.editStaff")}</DialogTitle>
          <DialogDescription>{t("admin.editStaffDesc", { name: draft.name })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("branch.branchTitle")}</Label>
            <Select
              value={draft.branchId}
              onValueChange={(branchId) => onDraftChange({ ...draft, branchId, departmentId: "__none__" })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("branch.branchTitle")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">-</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {getDeptLabel(branch)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("admin.departmentColumn")}</Label>
            <Select
              value={draft.departmentId}
              onValueChange={(departmentId) => onDraftChange({ ...draft, departmentId })}
              disabled={!draft.branchId || draft.branchId === "__none__"}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("admin.selectDept")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {selectedBranch ? `${getDeptLabel(selectedBranch)} (${t("branch.branchTitle")})` : "-"}
                </SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {getDeptLabel(team)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("admin.roleColumn")}</Label>
              <span className="text-xs text-muted-foreground">{t("admin.rolesMultiHint", "여러 역할을 동시에 지정할 수 있습니다")}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-md border border-border p-3">
              <label
                className={`flex items-center gap-2 text-sm ${draft.roleLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <Checkbox
                  checked={draft.roles.includes("student")}
                  disabled={draft.roleLocked}
                  onCheckedChange={(v) => toggleRole("student", v === true)}
                />
                <span>{t("roles.studentLabel", "학습자")}</span>
              </label>

              <label
                className={`flex items-center gap-2 text-sm ${draft.roleLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <Checkbox
                  checked={draft.roles.includes("teacher") && getTeacherSubtype(draft.position) === "leader"}
                  disabled={draft.roleLocked}
                  onCheckedChange={(v) => toggleTeacherSubtype("leader", v === true)}
                />
                <span>{t("roles.learningLeader", "러닝 리더")}</span>
              </label>

              <label
                className={`flex items-center gap-2 text-sm ${draft.roleLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <Checkbox
                  checked={draft.roles.includes("teacher") && getTeacherSubtype(draft.position) === "manager"}
                  disabled={draft.roleLocked}
                  onCheckedChange={(v) => toggleTeacherSubtype("manager", v === true)}
                />
                <span>{t("roles.learningManager", "러닝 매니저")}</span>
              </label>

              <label
                className={`flex items-center gap-2 text-sm ${draft.roleLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <Checkbox
                  checked={draft.roles.includes("admin")}
                  disabled={draft.roleLocked}
                  onCheckedChange={(v) => toggleRole("admin", v === true)}
                />
                <span>{t("roles.adminLabel", "관리자")}</span>
              </label>
            </div>
            {draft.roleLocked && <p className="text-xs text-muted-foreground">{t("admin.roleLockedHint")}</p>}
          </div>

          <div className="space-y-2">
            <Label>{t("admin.positionColumn")}</Label>
            <Input
              value={draft.position}
              onChange={(event) => onDraftChange({ ...draft, position: event.target.value })}
              placeholder={t("admin.positionColumn")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={onSave} disabled={saving || draft.roles.length === 0}>
            {saving ? t("common.processing") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StaffEditDialog;