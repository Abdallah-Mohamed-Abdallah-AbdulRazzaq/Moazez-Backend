import { Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import {
  CredentialDeliveryModeValue,
  EmailRecipientScopeDto,
  EmailUserTypeApiValue,
} from '../dto/email-delivery.dto';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_TARGET_MEMBERSHIP_ARGS =
  Prisma.validator<Prisma.MembershipDefaultArgs>()({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          contactEmail: true,
          passwordHash: true,
          firstName: true,
          lastName: true,
          userType: true,
          status: true,
          mustChangePassword: true,
          passwordProvisionedAt: true,
          credentialVersion: true,
          deletedAt: true,
        },
      },
      role: {
        select: {
          key: true,
          name: true,
        },
      },
    },
  });

type EmailTargetMembership = Prisma.MembershipGetPayload<
  typeof EMAIL_TARGET_MEMBERSHIP_ARGS
>;

export interface EmailRecipientTargetOptions {
  recipientScope: EmailRecipientScopeDto;
  customEmails?: string[];
  includeUsersWithPassword?: boolean;
  includeDisabledUsers?: boolean;
  requireContactEmail?: boolean;
  allowLoginEmailFallback?: boolean;
  credentialMode?: CredentialDeliveryModeValue;
  sampleLimit?: number;
}

export interface ResolvedEmailRecipient {
  recipientType: 'USER' | 'CUSTOM_EMAIL';
  userId: string | null;
  toEmail: string;
  displayName: string | null;
  username: string | null;
  loginEmail: string | null;
  contactEmail: string | null;
  userType: EmailUserTypeApiValue | null;
  roleKey: string | null;
  hasPassword: boolean | null;
  mustChangePassword: boolean | null;
  credentialVersion: number | null;
}

export interface SkippedEmailRecipient extends ResolvedEmailRecipient {
  reason: string;
}

export interface RecipientTargetPartition {
  totalMatched: number;
  eligible: ResolvedEmailRecipient[];
  skipped: SkippedEmailRecipient[];
  skippedReasons: Record<string, number>;
  sampleLimit: number;
}

@Injectable()
export class EmailRecipientTargetingService {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async resolveTargets(
    options: EmailRecipientTargetOptions,
  ): Promise<RecipientTargetPartition> {
    const memberships = await this.listMembershipTargets(options.recipientScope);
    const sampleLimit = options.sampleLimit ?? 100;
    const eligible: ResolvedEmailRecipient[] = [];
    const skipped: SkippedEmailRecipient[] = [];
    const skippedReasons: Record<string, number> = {};
    const seenEmails = new Set<string>();

    for (const membership of memberships) {
      const recipient = this.membershipToRecipient(membership, options);
      const reason = this.skipReasonForMembership(
        membership,
        recipient,
        options,
        seenEmails,
      );

      if (reason) {
        skipped.push({ ...recipient, reason });
        skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
        continue;
      }

      seenEmails.add(normalizeEmail(recipient.toEmail));
      eligible.push(recipient);
    }

    for (const customEmail of options.customEmails ?? []) {
      const normalized = normalizeEmail(customEmail);
      const recipient: ResolvedEmailRecipient = {
        recipientType: 'CUSTOM_EMAIL',
        userId: null,
        toEmail: normalized,
        displayName: null,
        username: null,
        loginEmail: null,
        contactEmail: normalized,
        userType: null,
        roleKey: null,
        hasPassword: null,
        mustChangePassword: null,
        credentialVersion: null,
      };

      const reason = this.skipReasonForEmail(normalized, seenEmails);
      if (reason) {
        skipped.push({ ...recipient, reason });
        skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
        continue;
      }

      seenEmails.add(normalized);
      eligible.push(recipient);
    }

    return {
      totalMatched: memberships.length + (options.customEmails?.length ?? 0),
      eligible,
      skipped,
      skippedReasons,
      sampleLimit,
    };
  }

  private listMembershipTargets(
    scope: EmailRecipientScopeDto,
  ): Promise<EmailTargetMembership[]> {
    return this.scopedPrisma.membership.findMany({
      where: this.buildMembershipWhere(scope),
      orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
      ...EMAIL_TARGET_MEMBERSHIP_ARGS,
    });
  }

  private buildMembershipWhere(
    scope: EmailRecipientScopeDto,
  ): Prisma.MembershipWhereInput {
    const userWhere: Prisma.UserWhereInput = { deletedAt: null };
    const where: Prisma.MembershipWhereInput = {
      status: MembershipStatus.ACTIVE,
      deletedAt: null,
      user: userWhere,
    };

    switch (scope.scope) {
      case 'selected':
        userWhere.id = { in: scope.userIds ?? [] };
        break;
      case 'role':
        where.role = { key: { in: scope.roleKeys ?? [] } };
        break;
      case 'user_type':
        userWhere.userType = {
          in: (scope.userTypes ?? []).map(mapUserTypeFromApi),
        };
        break;
      case 'missing_password':
        userWhere.passwordHash = null;
        break;
      case 'must_change_password':
        userWhere.mustChangePassword = true;
        break;
      case 'with_contact_email':
        userWhere.contactEmail = { not: null };
        break;
      case 'all_school_users':
        break;
    }

    return where;
  }

  private membershipToRecipient(
    membership: EmailTargetMembership,
    options: EmailRecipientTargetOptions,
  ): ResolvedEmailRecipient {
    const contactEmail = normalizeNullableEmail(membership.user.contactEmail);
    const loginEmail = normalizeEmail(membership.user.email);
    const useLoginFallback =
      !contactEmail &&
      options.requireContactEmail === false &&
      options.allowLoginEmailFallback === true;

    return {
      recipientType: 'USER',
      userId: membership.user.id,
      toEmail: contactEmail ?? (useLoginFallback ? loginEmail : ''),
      displayName:
        `${membership.user.firstName} ${membership.user.lastName}`.trim() ||
        null,
      username: membership.user.username ?? null,
      loginEmail,
      contactEmail,
      userType: membership.user.userType.toLowerCase() as EmailUserTypeApiValue,
      roleKey: membership.role.key,
      hasPassword: Boolean(membership.user.passwordHash),
      mustChangePassword: membership.user.mustChangePassword,
      credentialVersion: membership.user.credentialVersion,
    };
  }

  private skipReasonForMembership(
    membership: EmailTargetMembership,
    recipient: ResolvedEmailRecipient,
    options: EmailRecipientTargetOptions,
    seenEmails: Set<string>,
  ): string | null {
    if (
      options.includeDisabledUsers !== true &&
      isDisabledUserStatus(membership.user.status)
    ) {
      return 'disabled_user';
    }

    if (!recipient.toEmail) {
      return options.requireContactEmail === false
        ? 'missing_delivery_email'
        : 'missing_contact_email';
    }

    const emailReason = this.skipReasonForEmail(recipient.toEmail, seenEmails);
    if (emailReason) return emailReason;

    if (
      options.credentialMode === 'GENERATE_TEMPORARY_PASSWORD' &&
      membership.user.passwordHash
    ) {
      return 'already_has_password';
    }

    if (
      options.credentialMode !== 'REGENERATE_TEMPORARY_PASSWORD' &&
      options.includeUsersWithPassword !== true &&
      membership.user.passwordHash
    ) {
      return 'already_has_password';
    }

    return null;
  }

  private skipReasonForEmail(
    email: string,
    seenEmails: Set<string>,
  ): string | null {
    if (!EMAIL_PATTERN.test(email)) return 'invalid_email';
    if (seenEmails.has(normalizeEmail(email))) return 'duplicate_email';
    return null;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeNullableEmail(email: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function mapUserTypeFromApi(userType: EmailUserTypeApiValue): UserType {
  return userType.toUpperCase() as UserType;
}

function isDisabledUserStatus(status: UserStatus): boolean {
  return status === UserStatus.DISABLED || status === UserStatus.SUSPENDED;
}
