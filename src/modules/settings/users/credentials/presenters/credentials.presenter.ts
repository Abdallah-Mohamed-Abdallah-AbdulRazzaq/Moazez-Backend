import { UserStatus, UserType } from '@prisma/client';
import {
  BulkCredentialPreviewResponseDto,
  BulkGenerateCredentialsResponseDto,
  CredentialStatusListResponseDto,
  CredentialStatusValue,
  CredentialUserSummaryDto,
  GeneratedCredentialResponseDto,
  SetCredentialResponseDto,
  UserTypeApiValue,
} from '../dto/credential.dto';
import { CredentialMembershipRecord } from '../infrastructure/user-credentials.repository';

export function presentCredentialStatus(
  membership: CredentialMembershipRecord,
): CredentialStatusValue {
  if (!membership.user.passwordHash) {
    return 'missing';
  }

  if (membership.user.mustChangePassword) {
    return membership.user.passwordProvisionedAt &&
      !membership.user.passwordChangedAt
      ? 'temporary_or_must_change'
      : 'must_change';
  }

  return 'set';
}

export function presentCredentialUser(
  membership: CredentialMembershipRecord,
): CredentialUserSummaryDto {
  return {
    userId: membership.user.id,
    fullName: `${membership.user.firstName} ${membership.user.lastName}`.trim(),
    username: membership.user.username ?? null,
    loginEmail: membership.user.email,
    contactEmail: membership.user.contactEmail ?? null,
    userType: presentUserType(membership.user.userType),
    roleId: membership.roleId,
    roleKey: membership.role.key,
    roleName: membership.role.name,
    status: presentCredentialStatus(membership),
    hasPassword: Boolean(membership.user.passwordHash),
    mustChangePassword: membership.user.mustChangePassword,
    passwordChangedAt: membership.user.passwordChangedAt?.toISOString() ?? null,
    passwordProvisionedAt:
      membership.user.passwordProvisionedAt?.toISOString() ?? null,
    credentialVersion: membership.user.credentialVersion,
    lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
    createdAt: membership.user.createdAt.toISOString(),
  };
}

export function presentCredentialStatusList(args: {
  items: CredentialMembershipRecord[];
  page: number;
  limit: number;
  total: number;
}): CredentialStatusListResponseDto {
  return {
    items: args.items.map(presentCredentialUser),
    pagination: {
      page: args.page,
      limit: args.limit,
      total: args.total,
    },
  };
}

export function presentGeneratedCredential(args: {
  membership: CredentialMembershipRecord;
  temporaryPassword: string;
  generatedAt: Date;
}): GeneratedCredentialResponseDto {
  return {
    user: presentCredentialUser(args.membership),
    temporaryPassword: args.temporaryPassword,
    mustChangePassword: true,
    generatedAt: args.generatedAt.toISOString(),
    credentialVersion: args.membership.user.credentialVersion,
  };
}

export function presentSetCredential(args: {
  membership: CredentialMembershipRecord;
  updatedAt: Date;
}): SetCredentialResponseDto {
  return {
    user: presentCredentialUser(args.membership),
    mustChangePassword: args.membership.user.mustChangePassword,
    updatedAt: args.updatedAt.toISOString(),
    credentialVersion: args.membership.user.credentialVersion,
  };
}

export function presentBulkCredentialPreview(args: {
  totalMatched: number;
  eligible: CredentialMembershipRecord[];
  skipped: Array<{ membership: CredentialMembershipRecord; reason: string }>;
  skippedReasons: Record<string, number>;
}): BulkCredentialPreviewResponseDto {
  return {
    totalMatched: args.totalMatched,
    eligible: args.eligible.length,
    skipped: args.skipped.length,
    skippedReasons: args.skippedReasons,
    sample: {
      eligible: args.eligible.slice(0, 10).map(presentCredentialUser),
      skipped: args.skipped.slice(0, 10).map((item) => ({
        user: presentCredentialUser(item.membership),
        reason: item.reason,
      })),
    },
  };
}

export function presentBulkGeneratedCredentials(args: {
  generatedAt: Date;
  totalMatched: number;
  generated: Array<{
    membership: CredentialMembershipRecord;
    temporaryPassword: string;
  }>;
  skipped: Array<{ membership: CredentialMembershipRecord; reason: string }>;
  skippedReasons: Record<string, number>;
}): BulkGenerateCredentialsResponseDto {
  return {
    generatedAt: args.generatedAt.toISOString(),
    totalMatched: args.totalMatched,
    generated: args.generated.length,
    skipped: args.skipped.length,
    skippedReasons: args.skippedReasons,
    items: args.generated.map((item) => ({
      user: presentCredentialUser(item.membership),
      temporaryPassword: item.temporaryPassword,
    })),
  };
}

export function presentUserType(userType: UserType): UserTypeApiValue {
  return userType.toLowerCase() as UserTypeApiValue;
}

export function isCredentialManageableStatus(status: UserStatus): boolean {
  return status === UserStatus.ACTIVE || status === UserStatus.INVITED;
}
