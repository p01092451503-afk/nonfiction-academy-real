/** No runtime/browser setting may open this boundary during isolation QA. */
export const MY_GROWTH_ENABLED = false;
const APPROVED_REVIEWER_IDS: readonly string[] = [];

export function canAccessMyGrowth(input: {
  enabled: boolean;
  isolated: boolean;
  verifiedUserId: string | null;
  approvedReviewerIds: readonly string[];
}): boolean {
  return input.enabled && input.isolated && input.verifiedUserId !== null &&
    input.approvedReviewerIds.includes(input.verifiedUserId);
}

export function isMyGrowthReviewer(verifiedUserId: string | null): boolean {
  return canAccessMyGrowth({ enabled: MY_GROWTH_ENABLED, isolated: false,
    verifiedUserId, approvedReviewerIds: APPROVED_REVIEWER_IDS });
}

export function existingHome(roles: readonly string[]): string {
  if (roles.includes('admin') || roles.includes('super_admin')) return '/admin';
  if (roles.includes('teacher')) return '/teacher';
  return '/student';
}