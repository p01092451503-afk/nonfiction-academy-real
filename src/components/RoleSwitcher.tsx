import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Shield, GraduationCap, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { useSystemSettings } from "@/hooks/useSystemSettings";

const roleConfig = {
  admin: { icon: Shield, path: "/admin", labelKey: "roles.admin" },
  teacher: { icon: Users, path: "/teacher", labelKey: "roles.teacher" },
  student: { icon: GraduationCap, path: "/student", labelKey: "roles.student" },
} as const;

const RoleSwitcher = () => {
  const { roles, primaryRole, isAdmin, isTeacher, isStudent } = useUserRole();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { teacherRoleEnabled } = useSystemSettings();

  // Special case: user is student + teacher (러닝 리더) but NOT admin.
  // Show a single toggle button between learner version and teacher version.
  if (!isAdmin && isStudent && isTeacher && teacherRoleEnabled) {
    const onTeacher = location.pathname.startsWith("/teacher");
    const target = onTeacher ? "/student" : "/teacher";
    const Icon = onTeacher ? GraduationCap : Users;
    const label = onTeacher
      ? t("roles.learnerVersion", "학습자 버전")
      : t("roles.teacherVersion", "강사 버전");
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 rounded-full text-xs"
        onClick={() => navigate(target)}
        aria-label={label}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </Button>
    );
  }

  // Map roles to switchable dashboard roles (super_admin → admin)
  const switchableRoles = (Array.from(
    new Set(roles.map((r) => (r === "super_admin" ? "admin" : r)))
  ).filter((r) => r in roleConfig) as Array<keyof typeof roleConfig>)
    .filter((r) => (r === "teacher" ? teacherRoleEnabled : true));

  if (switchableRoles.length <= 1) return null;

  const CurrentIcon = roleConfig[primaryRole]?.icon || GraduationCap;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Switch role">
          <CurrentIcon className="h-[18px] w-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {switchableRoles.map((role) => {
          const config = roleConfig[role];
          if (!config) return null;
          const Icon = config.icon;
          return (
            <DropdownMenuItem
              key={role}
              onClick={() => navigate(config.path)}
              className="text-xs gap-2"
            >
              <Icon className="h-3.5 w-3.5" />
              {t(config.labelKey)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RoleSwitcher;
