import type { ActiveMembershipDto } from '../dto/me-response.dto';
import type { UserWithActiveMembership } from '../infrastructure/auth.repository';

export function pickActiveMembership(
  user: UserWithActiveMembership,
): ActiveMembershipDto | null {
  const membership = user.memberships[0];
  if (!membership) return null;

  const permissions = membership.role.rolePermissions.map(
    (rp) => rp.permission.code,
  );

  return {
    membershipId: membership.id,
    organizationId: membership.organizationId,
    schoolId: membership.schoolId,
    roleId: membership.roleId,
    roleKey: membership.role.key,
    permissions,
  };
}
