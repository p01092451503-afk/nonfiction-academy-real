/**
 * The gate opens only for a signed-in user that the server itself confirms is on
 * the protected reviewer registry. The registry can only be written with the
 * service role, so browser settings and existing admin roles never open it.
 */
export const MY_GROWTH_ENABLED = true;

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
