import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  SchoolLoginSettings,
  SchoolLoginSettingsStatus,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { SettingsLoginDomainInvalidException } from '../domain/login-identity.exceptions';
import {
  DEFAULT_ALLOWED_CHARACTERS,
  DEFAULT_USERNAME_MAX_LENGTH,
  DEFAULT_USERNAME_MIN_LENGTH,
  normalizeUsername,
  parseReservedUsernames,
  validateLoginDomain,
} from '../domain/login-identity.policy';
import {
  LoginIdentitySettingsResponseDto,
  UpdateLoginIdentitySettingsDto,
} from '../dto/login-identity.dto';
import { LoginIdentityRepository } from '../infrastructure/login-identity.repository';
import { presentLoginIdentitySettings } from '../presenters/login-identity.presenter';

function presentStatus(
  status: SchoolLoginSettingsStatus,
): 'active' | 'disabled' {
  return status === SchoolLoginSettingsStatus.ACTIVE ? 'active' : 'disabled';
}

function summarizeSettings(settings: SchoolLoginSettings | null | undefined) {
  if (!settings) return undefined;

  return {
    loginDomain: settings.loginDomain,
    usernameMinLength: settings.usernameMinLength,
    usernameMaxLength: settings.usernameMaxLength,
    allowedCharacters: settings.allowedCharacters ?? DEFAULT_ALLOWED_CHARACTERS,
    reservedUsernames: settings.reservedUsernames,
    status: presentStatus(settings.status),
  };
}

@Injectable()
export class UpdateLoginIdentitySettingsUseCase {
  constructor(
    private readonly loginIdentityRepository: LoginIdentityRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: UpdateLoginIdentitySettingsDto,
  ): Promise<LoginIdentitySettingsResponseDto> {
    const scope = requireSettingsScope();
    const current = await this.loginIdentityRepository.findCurrentSettings();

    const domainResult = validateLoginDomain(command.loginDomain);
    if (!domainResult.valid) {
      throw new SettingsLoginDomainInvalidException(
        domainResult.reason ?? 'login_domain_invalid_format',
        domainResult.loginDomain,
      );
    }

    const usernameMinLength =
      command.usernameMinLength ??
      current?.usernameMinLength ??
      DEFAULT_USERNAME_MIN_LENGTH;
    const usernameMaxLength =
      command.usernameMaxLength ??
      current?.usernameMaxLength ??
      DEFAULT_USERNAME_MAX_LENGTH;

    if (usernameMinLength > usernameMaxLength) {
      throw new ValidationDomainException(
        'Username min length exceeds max length',
        {
          usernameMinLength,
          usernameMaxLength,
        },
      );
    }

    const status =
      command.status === undefined
        ? current?.status ?? SchoolLoginSettingsStatus.ACTIVE
        : command.status === 'disabled'
          ? SchoolLoginSettingsStatus.DISABLED
          : SchoolLoginSettingsStatus.ACTIVE;

    const updated = await this.loginIdentityRepository.saveCurrentSettings(
      scope.schoolId,
      {
        loginDomain: domainResult.loginDomain,
        usernameMinLength,
        usernameMaxLength,
        allowedCharacters:
          command.allowedCharacters ??
          current?.allowedCharacters ??
          DEFAULT_ALLOWED_CHARACTERS,
        reservedUsernames:
          command.reservedUsernames !== undefined
            ? command.reservedUsernames.map((username) =>
                normalizeUsername(username),
              )
            : parseReservedUsernames(current?.reservedUsernames),
        status,
      },
    );

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'settings',
      action: 'settings.login_identity.change',
      resourceType: 'school_login_settings',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      before: summarizeSettings(current),
      after: summarizeSettings(updated),
    });

    return presentLoginIdentitySettings(updated);
  }
}
