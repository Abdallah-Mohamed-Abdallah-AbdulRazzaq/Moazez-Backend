import { Injectable } from '@nestjs/common';
import { requireSettingsScope } from '../../settings-context';
import { LoginIdentitySettingsResponseDto } from '../dto/login-identity.dto';
import { LoginIdentityRepository } from '../infrastructure/login-identity.repository';
import { presentLoginIdentitySettings } from '../presenters/login-identity.presenter';

@Injectable()
export class GetLoginIdentitySettingsUseCase {
  constructor(
    private readonly loginIdentityRepository: LoginIdentityRepository,
  ) {}

  async execute(): Promise<LoginIdentitySettingsResponseDto> {
    requireSettingsScope();
    const settings = await this.loginIdentityRepository.findCurrentSettings();

    return presentLoginIdentitySettings(settings);
  }
}
