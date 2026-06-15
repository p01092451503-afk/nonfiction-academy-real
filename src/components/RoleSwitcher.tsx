import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Shield, GraduationCap, Users, ArrowLeftRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { getTeacherRoleLabelKey } from "@/lib/teacherSubtype";

const roleConfig = {
  admin: { icon: Shield, path: "/admin", labelKey: "roles.admin" },
  teacher: { icon: Users, path: "/teacher", labelKey: "roles.teacher" },
  student: { icon: GraduationCap, path: "/student", labelKey: "roles.student" },
} as const;

const RoleSwitcher = () => {
  const { roles, primaryRole, isAdmin, isTeacher, isStudent } = useUserRole();
  const { profile } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { teacherRoleEnabled } = useSystemSettings();

  const teacherLabelKey = getTeacherRoleLabelKey(profile?.position);

  // Map roles to switchable dashboard roles (super_admin → admin)
  const switchableRoles = (Array.from(
    new Set(roles.map((r) => (r === "super_admin" ? "admin" : r)))
  ).filter((r) => r in roleConfig) as Array<keyof typeof roleConfig>)
    .filter((r) => (r === "teacher" ? teacherRoleEnabled : true));

  if (switchableRoles.length <= 1) return null;

  // Trigger button: shield + arrows + "역할 전환"
  const Trigger = (
    <Button
      variant="outline"
      size="sm"
      className="h-9 gap-1.5 rounded-full px-3 text-xs font-medium"
      aria-label={t("roles.switchRole", "역할 전환")}
    >
      <Shield className="h-3.5 w-3.5" aria-hidden="true" />
      <ArrowLeftRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      <span>{t("roles.switchRole", "역할 전환")}</span>
    </Button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{Trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {switchableRoles.map((role) => {
          const config = roleConfig[role];
          if (!config) return null;
          const Icon = config.icon;
          const labelKey = role === "teacher" ? teacherLabelKey : config.labelKey;
          return (
            <DropdownMenuItem
              key={role}
              onClick={() => navigate(config.path)}
              className="text-xs gap-2"
            >
              <Icon className="h-3.5 w-3.5" />
              {t(labelKey)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RoleSwitcher;
