import { Injectable } from '@nestjs/common';
import { SchoolLoginSettingsStatus } from '@prisma/client';
import { requireSettingsScope } from '../../settings-context';
import {
  buildLoginEmail,
  normalizeUsername,
  validateUsername,
} from '../domain/login-identity.policy';
import {
  UsernameAvailabilityQueryDto,
  UsernameAvailabilityResponseDto,
} from '../dto/login-identity.dto';
import { LoginIdentityRepository } from '../infrastructure/login-identity.repository';

@Injectable()
export class CheckUsernameAvailabilityUseCase {
  constructor(
    private readonly loginIdentityRepository: LoginIdentityRepository,
  ) {}

  async execute(
    query: UsernameAvailabilityQueryDto,
  ): Promise<UsernameAvailabilityResponseDto> {
    requireSettingsScope();
    const normalizedUsername = normalizeUsername(query.username);
    const settings = await this.loginIdentityRepository.findCurrentSettings();

    if (!settings || settings.status !== SchoolLoginSettingsStatus.ACTIVE) {
      return {
        username: normalizedUsername,
        loginEmail: null,
        available: false,
        reason: 'login_domain_missing',
      };
    }

    const usernameResult = validateUsername(query.username, settings);
    if (!usernameResult.valid) {
      return {
        username: usernameResult.username,
        loginEmail: null,
        available: false,
        reason:
          usernameResult.reason === 'reserved_username'
            ? 'reserved_username'
            : 'username_invalid',
      };
    }

    const loginEmail = buildLoginEmail(
      usernameResult.username,
      settings.loginDomain,
    );
    const existing =
      await this.loginIdentityRepository.findUserByLoginEmail(loginEmail);

    return {
      username: usernameResult.username,
      loginEmail,
      available: !existing,
      reason: existing ? 'login_email_taken' : null,
    };
  }
}
