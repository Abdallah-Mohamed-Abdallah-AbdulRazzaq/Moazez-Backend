import { Injectable } from '@nestjs/common';
import { SchoolLoginSettingsStatus } from '@prisma/client';
import { requireSettingsScope } from '../../settings-context';
import {
  LoginDomainMissingException,
  UsernameInvalidException,
} from '../domain/login-identity.exceptions';
import {
  buildLoginEmail,
  validateUsername,
} from '../domain/login-identity.policy';
import {
  LoginIdentityPreviewQueryDto,
  LoginIdentityPreviewResponseDto,
} from '../dto/login-identity.dto';
import { LoginIdentityRepository } from '../infrastructure/login-identity.repository';

@Injectable()
export class PreviewLoginIdentityUseCase {
  constructor(
    private readonly loginIdentityRepository: LoginIdentityRepository,
  ) {}

  async execute(
    query: LoginIdentityPreviewQueryDto,
  ): Promise<LoginIdentityPreviewResponseDto> {
    requireSettingsScope();
    const settings = await this.loginIdentityRepository.findCurrentSettings();

    if (!settings || settings.status !== SchoolLoginSettingsStatus.ACTIVE) {
      throw new LoginDomainMissingException();
    }

    const usernameResult = validateUsername(query.username, settings);
    if (!usernameResult.valid) {
      throw new UsernameInvalidException(
        usernameResult.reason ?? 'username_required',
        usernameResult.username,
      );
    }

    return {
      username: usernameResult.username,
      loginEmail: buildLoginEmail(
        usernameResult.username,
        settings.loginDomain,
      ),
    };
  }
}
