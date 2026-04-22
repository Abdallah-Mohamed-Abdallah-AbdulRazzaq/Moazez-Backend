import { UserStatus } from '@prisma/client';
import {
  ResetPasswordResponseDto,
  UserResponseDto,
  UserStatusResponseDto,
  UsersListResponseDto,
} from '../dto/user-response.dto';
import { ScopedMembershipRecord } from '../infrastructure/users.repository';

export function presentSettingsUserStatus(
  status: UserStatus,
): 'active' | 'invited' | 'inactive' {
  switch (status) {
    case UserStatus.ACTIVE:
      return 'active';
    case UserStatus.INVITED:
      return 'invited';
    default:
      return 'inactive';
  }
}

export function presentUser(
  membership: ScopedMembershipRecord,
): UserResponseDto {
  const fullName = `${membership.user.firstName} ${membership.user.lastName}`.trim();
  const status = presentSettingsUserStatus(membership.user.status);

  return {
    id: membership.user.id,
    fullName,
    email: membership.user.email,
    roleId: membership.roleId,
    roleName: membership.role.name,
    status,
    lastActiveAt: membership.user.lastLoginAt
      ? membership.user.lastLoginAt.toISOString()
      : null,
    invitedAt:
      membership.user.status === UserStatus.INVITED
        ? membership.user.createdAt.toISOString()
        : null,
    lastInviteSentAt:
      membership.user.status === UserStatus.INVITED
        ? membership.user.updatedAt.toISOString()
        : null,
  };
}

export function presentUsersList(args: {
  items: ScopedMembershipRecord[];
  page: number;
  limit: number;
  total: number;
}): UsersListResponseDto {
  return {
    items: args.items.map(presentUser),
    pagination: {
      page: args.page,
      limit: args.limit,
      total: args.total,
    },
  };
}

export function presentUserStatus(
  membership: ScopedMembershipRecord,
): UserStatusResponseDto {
  return {
    id: membership.user.id,
    status: presentSettingsUserStatus(membership.user.status),
  };
}

export function presentResetPasswordResponse(
  userId: string,
): ResetPasswordResponseDto {
  return {
    id: userId,
    status: 'queued',
    message: 'Password reset initiated.',
  };
}
