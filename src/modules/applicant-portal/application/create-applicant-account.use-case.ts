import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserType } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { normalizeContactEmail } from '../../settings/login-identity/domain/login-identity.policy';
import { splitFullName } from '../../settings/users/domain/split-full-name';
import { UserEmailTakenException } from '../../settings/users/domain/user.exceptions';
import { CredentialPasswordPolicyFailedException } from '../../settings/users/credentials/domain/credential.exceptions';
import { validateAdminProvidedPassword } from '../../settings/users/credentials/domain/credential-password.policy';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { PasswordService } from '../../iam/auth/domain/password.service';
import { ApplicantProfileResponseDto } from '../dto/applicant-account.dto';
import { normalizeApplicantProfileInput } from '../domain/applicant-profile.inputs';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentApplicantProfile } from '../presenters/applicant-profile.presenter';

export interface CreateApplicantAccountCommand {
  fullName: string;
  email: string;
  password: string;
  phoneNumber?: string | null;
  city?: string | null;
  relationship: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class CreateApplicantAccountUseCase {
  constructor(
    private readonly applicantPortalRepository: ApplicantPortalRepository,
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(
    command: CreateApplicantAccountCommand,
  ): Promise<ApplicantProfileResponseDto> {
    const email = normalizeContactEmail(command.email);
    const existingUser =
      await this.applicantPortalRepository.findUserByEmail(email);
    if (existingUser) {
      throw new UserEmailTakenException(email);
    }

    const passwordPolicy = validateAdminProvidedPassword(command.password);
    if (!passwordPolicy.valid) {
      throw new CredentialPasswordPolicyFailedException(
        passwordPolicy.reasons,
      );
    }

    const profileInput = normalizeApplicantProfileInput(command);
    const { firstName, lastName } = splitFullName(profileInput.fullName);
    const passwordHash = await this.passwordService.hash(command.password);

    try {
      const profile =
        await this.applicantPortalRepository.createApplicantAccount({
          email,
          passwordHash,
          firstName,
          lastName,
          fullName: profileInput.fullName,
          phoneNumber: profileInput.phoneNumber,
          city: profileInput.city,
          relationship: profileInput.relationship,
        });

      await this.authRepository.createAuditLog({
        actorId: profile.userId,
        userType: UserType.APPLICANT,
        organizationId: null,
        schoolId: null,
        module: 'applicant_portal',
        action: 'applicant.account.create',
        resourceType: 'applicant_profile',
        resourceId: profile.id,
        outcome: AuditOutcome.SUCCESS,
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        after: {
          userType: UserType.APPLICANT,
          relationship: profile.relationship,
          hasPhoneNumber: Boolean(profile.phoneNumber),
          cityProvided: Boolean(profile.city),
        },
      });

      return presentApplicantProfile(profile);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new UserEmailTakenException(email);
      }
      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2002';
}
