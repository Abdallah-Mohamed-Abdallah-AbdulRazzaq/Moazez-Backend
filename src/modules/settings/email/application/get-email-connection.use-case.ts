import { Injectable } from '@nestjs/common';
import { SchoolEmailConnectionResponseDto } from '../dto/email-connection.dto';
import { EmailSettingsRepository } from '../infrastructure/email-settings.repository';
import { presentEmailConnection } from '../presenters/email-connection.presenter';

@Injectable()
export class GetEmailConnectionUseCase {
  constructor(
    private readonly emailSettingsRepository: EmailSettingsRepository,
  ) {}

  async execute(): Promise<SchoolEmailConnectionResponseDto> {
    const connection = await this.emailSettingsRepository.findConnection();
    return presentEmailConnection(connection);
  }
}
