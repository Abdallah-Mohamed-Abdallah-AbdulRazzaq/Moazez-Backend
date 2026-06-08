import { Injectable } from '@nestjs/common';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { PasswordService } from '../../iam/auth/domain/password.service';
import { UsernameInvalidException } from '../../settings/login-identity/domain/login-identity.exceptions';
import {
  buildLoginEmail,
  normalizeContactEmail,
  validateLoginDomain,
  validateUsername,
} from '../../settings/login-identity/domain/login-identity.policy';
import { generateTemporaryPassword } from '../../settings/users/credentials/domain/credential-password.policy';
import {
  PlatformSchoolProvisioningCredentialDeliveryMode,
  PlatformSchoolProvisioningCredentialStatus,
  PlatformSchoolProvisioningResponseDto,
  ProvisionPlatformSchoolDto,
} from '../dto/platform-admin-school-provisioning.dto';
import {
  PlatformOrganizationNotFoundException,
  PlatformOrganizationSlugTakenException,
  PlatformSchoolProvisioningInvalidOrganizationModeException,
  PlatformSchoolProvisioningLoginDomainInvalidException,
  PlatformSchoolProvisioningLoginDomainTakenException,
  PlatformSchoolProvisioningOrganizationRequiredException,
  PlatformSchoolProvisioningPrimaryAdminLoginTakenException,
  PlatformSchoolProvisioningSchoolAdminRoleMissingException,
  PlatformSchoolSlugTakenException,
} from '../domain/platform-admin-errors';
import {
  assertOrganizationCanReceiveSchool,
  normalizePlatformName,
  normalizePlatformSlug,
} from '../domain/platform-admin-inputs';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformSchoolProvisioning } from '../presenters/platform-admin.presenter';

const PRIMARY_ADMIN_RESERVED_USERNAME_EXCEPTIONS = new Set(['admin']);

@Injectable()
@PlatformScope()
export class ProvisionPlatformSchoolUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(
    command: ProvisionPlatformSchoolDto,
  ): Promise<PlatformSchoolProvisioningResponseDto> {
    const scope = requirePlatformAdminScope();
    const organization = await this.resolveOrganization(command);
    const school = await this.resolveSchool(
      command,
      organization.mode === 'existing'
        ? organization.organizationId
        : undefined,
    );
    const loginIdentity = await this.resolveLoginIdentity(command);
    const primaryAdmin = await this.resolvePrimaryAdmin(command, loginIdentity);
    const credentials = await this.resolveCredentials(command);

    const schoolAdminRole =
      await this.platformAdminRepository.findSystemRoleByKey('school_admin');
    if (!schoolAdminRole) {
      throw new PlatformSchoolProvisioningSchoolAdminRoleMissingException();
    }

    const record = await this.platformAdminRepository.provisionSchool({
      actor: {
        actorId: scope.actorId,
        userType: scope.userType,
      },
      organization,
      school,
      loginIdentity,
      primaryAdmin: {
        ...primaryAdmin,
        passwordHash: credentials.passwordHash,
        mustChangePassword: true,
        passwordProvisionedAt: credentials.passwordProvisionedAt,
        credentialVersion: credentials.credentialVersion,
      },
      credentials: {
        deliveryMode: credentials.deliveryMode,
        status: credentials.status,
      },
      schoolAdminRoleId: schoolAdminRole.id,
    });

    return presentPlatformSchoolProvisioning({
      record,
      temporaryPassword: credentials.temporaryPassword,
    });
  }

  private async resolveOrganization(
    command: ProvisionPlatformSchoolDto,
  ): Promise<
    | { mode: 'create'; name: string; slug: string }
    | { mode: 'existing'; organizationId: string }
  > {
    const organization = command.organization;
    if (!organization) {
      throw new PlatformSchoolProvisioningOrganizationRequiredException([
        'organization',
      ]);
    }

    if (organization.mode === 'existing') {
      if (!organization.organizationId) {
        throw new PlatformSchoolProvisioningOrganizationRequiredException([
          'organizationId',
        ]);
      }

      const existing = await this.platformAdminRepository.findOrganizationById(
        organization.organizationId,
      );
      if (!existing) {
        throw new PlatformOrganizationNotFoundException(
          organization.organizationId,
        );
      }

      assertOrganizationCanReceiveSchool({
        organizationId: existing.id,
        status: existing.status,
      });

      return {
        mode: 'existing',
        organizationId: existing.id,
      };
    }

    if (organization.mode === 'create') {
      const missingFields = [
        organization.name ? null : 'name',
        organization.slug ? null : 'slug',
      ].filter((field): field is string => Boolean(field));
      if (missingFields.length > 0) {
        throw new PlatformSchoolProvisioningOrganizationRequiredException(
          missingFields,
        );
      }

      const name = normalizePlatformName(
        organization.name ?? '',
        'organization.name',
      );
      const slug = normalizePlatformSlug(
        organization.slug ?? '',
        'organization.slug',
      );
      const existing =
        await this.platformAdminRepository.findOrganizationBySlug(slug);
      if (existing) {
        throw new PlatformOrganizationSlugTakenException(slug);
      }

      return { mode: 'create', name, slug };
    }

    throw new PlatformSchoolProvisioningInvalidOrganizationModeException(
      organization.mode,
    );
  }

  private async resolveSchool(
    command: ProvisionPlatformSchoolDto,
    organizationId?: string,
  ): Promise<{ name: string; slug: string }> {
    const name = normalizePlatformName(command.school.name, 'school.name');
    const slug = normalizePlatformSlug(command.school.slug, 'school.slug');

    if (organizationId) {
      const existing = await this.platformAdminRepository.findSchoolBySlug({
        organizationId,
        slug,
      });
      if (existing) {
        throw new PlatformSchoolSlugTakenException(organizationId, slug);
      }
    }

    return { name, slug };
  }

  private async resolveLoginIdentity(
    command: ProvisionPlatformSchoolDto,
  ): Promise<{ loginDomain: string }> {
    const domainResult = validateLoginDomain(command.loginIdentity.loginDomain);
    if (!domainResult.valid) {
      throw new PlatformSchoolProvisioningLoginDomainInvalidException(
        domainResult.reason ?? 'login_domain_invalid_format',
        domainResult.loginDomain,
      );
    }

    const existing =
      await this.platformAdminRepository.findLoginSettingsByDomain(
        domainResult.loginDomain,
      );
    if (existing) {
      throw new PlatformSchoolProvisioningLoginDomainTakenException(
        domainResult.loginDomain,
      );
    }

    return { loginDomain: domainResult.loginDomain };
  }

  private async resolvePrimaryAdmin(
    command: ProvisionPlatformSchoolDto,
    loginIdentity: { loginDomain: string },
  ): Promise<{
    firstName: string;
    lastName: string;
    username: string;
    loginEmail: string;
    contactEmail: string;
    phone: string | null;
  }> {
    const usernameResult = validateUsername(command.primaryAdmin.username);
    if (
      !usernameResult.valid &&
      !(
        usernameResult.reason === 'reserved_username' &&
        PRIMARY_ADMIN_RESERVED_USERNAME_EXCEPTIONS.has(usernameResult.username)
      )
    ) {
      throw new UsernameInvalidException(
        usernameResult.reason ?? 'username_required',
        usernameResult.username,
      );
    }

    const loginEmail = buildLoginEmail(
      usernameResult.username,
      loginIdentity.loginDomain,
    );
    const existingUser =
      await this.platformAdminRepository.findUserByLoginEmail(loginEmail);
    if (existingUser) {
      throw new PlatformSchoolProvisioningPrimaryAdminLoginTakenException(
        loginEmail,
      );
    }

    return {
      firstName: normalizePlatformName(
        command.primaryAdmin.firstName,
        'primaryAdmin.firstName',
      ),
      lastName: normalizePlatformName(
        command.primaryAdmin.lastName,
        'primaryAdmin.lastName',
      ),
      username: usernameResult.username,
      loginEmail,
      contactEmail: normalizeContactEmail(command.primaryAdmin.contactEmail),
      phone: normalizeOptionalPhone(command.primaryAdmin.phone),
    };
  }

  private async resolveCredentials(
    command: ProvisionPlatformSchoolDto,
  ): Promise<{
    deliveryMode: PlatformSchoolProvisioningCredentialDeliveryMode;
    status: PlatformSchoolProvisioningCredentialStatus;
    passwordHash: string | null;
    temporaryPassword: string | null;
    passwordProvisionedAt: Date | null;
    credentialVersion: number;
  }> {
    const deliveryMode = command.credentials?.deliveryMode ?? 'activation_link';

    if (deliveryMode === 'temporary_password') {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await this.passwordService.hash(temporaryPassword);

      return {
        deliveryMode,
        status: 'temporary_password_ready',
        passwordHash,
        temporaryPassword,
        passwordProvisionedAt: new Date(),
        credentialVersion: 1,
      };
    }

    if (deliveryMode === 'manual') {
      return {
        deliveryMode,
        status: 'manual_pending',
        passwordHash: null,
        temporaryPassword: null,
        passwordProvisionedAt: null,
        credentialVersion: 0,
      };
    }

    if (deliveryMode === 'activation_link') {
      return {
        deliveryMode,
        status: 'activation_link_deferred',
        passwordHash: null,
        temporaryPassword: null,
        passwordProvisionedAt: null,
        credentialVersion: 0,
      };
    }

    return {
      deliveryMode: 'manual',
      status: 'manual_pending',
      passwordHash: null,
      temporaryPassword: null,
      passwordProvisionedAt: null,
      credentialVersion: 0,
    };
  }
}

function normalizeOptionalPhone(phone?: string): string | null {
  const normalized = phone?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}
