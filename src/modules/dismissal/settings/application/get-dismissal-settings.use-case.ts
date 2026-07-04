import { Injectable } from '@nestjs/common';
import { DismissalSettingsResponseDto } from '../dto/dismissal-settings.dto';
import { DismissalSettingsRepository } from '../infrastructure/dismissal-settings.repository';
import { presentDismissalSettings } from '../presenter/dismissal-settings.presenter';

@Injectable()
export class GetDismissalSettingsUseCase {
  constructor(
    private readonly dismissalSettingsRepository: DismissalSettingsRepository,
  ) {}

  async execute(): Promise<DismissalSettingsResponseDto> {
    const [settings, profile] = await Promise.all([
      this.dismissalSettingsRepository.findSettings(),
      this.dismissalSettingsRepository.findSchoolProfileLocation(),
    ]);

    return presentDismissalSettings(settings, profile);
  }
}
