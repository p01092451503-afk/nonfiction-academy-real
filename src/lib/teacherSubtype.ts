// Teacher (강사) subtype helpers.
// DB role stays `teacher`; the subtype is stored as free text in profiles.position
// so we can show 러닝리더 vs 러닝매니저 without touching RLS or the role enum.

export type TeacherSubtype = "leader" | "manager";

export const TEACHER_SUBTYPE_VALUES = {
  leader: "러닝리더",
  manager: "러닝매니저",
} as const;

/**
 * Detect the teacher subtype from a free-text position value.
 * Defaults to "leader" (러닝리더) when nothing matches.
 */
export const getTeacherSubtype = (position?: string | null): TeacherSubtype => {
  if (!position) return "leader";
  const p = position.toLowerCase();
  if (p.includes("매니저") || p.includes("manager")) return "manager";
  return "leader";
};

/**
 * i18n key for the teacher label, taking subtype into account.
 */
export const getTeacherRoleLabelKey = (position?: string | null): string => {
  return getTeacherSubtype(position) === "manager"
    ? "roles.learningManager"
    : "roles.learningLeader";
};
