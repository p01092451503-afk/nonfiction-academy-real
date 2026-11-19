/**
 * The gate opens only for a signed-in user that the server itself confirms is on
 * the protected reviewer registry. The registry can only be written with the
 * service role, so browser settings and existing admin roles never open it.
 */
// My Growth는 승인된 공개 시점까지 모든 역할의 메뉴·화면에서 숨긴다. 공개 시 true로 되돌린다.
export const MY_GROWTH_ENABLED = false;

export function canAccessMyGrowth(input: {
  enabled: boolean;
  verifiedUserId: string | null;
  serverConfirmedReviewer: boolean;
}): boolean {
  return input.enabled && input.verifiedUserId !== null && input.serverConfirmedReviewer === true;
}

export function existingHome(roles: readonly string[]): string {
  if (roles.includes('admin') || roles.includes('super_admin')) return '/admin';
  if (roles.includes('teacher')) return '/teacher';
  return '/student';
}
