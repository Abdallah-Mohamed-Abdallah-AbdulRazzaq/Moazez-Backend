import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  SchoolEmailConnection,
  SchoolEmailConnectionStatus,
} from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { EmailConnectionMissingException } from '../domain/email.exceptions';
import { SchoolEmailConnectionResponseDto } from '../dto/email-connection.dto';
import { EmailSettingsRepository } from '../infrastructure/email-settings.repository';
import { presentEmailConnection } from '../presenters/email-connection.presenter';

@Injectable()
export class DisableEmailConnectionUseCase {
  constructor(
    private readonly emailSettingsRepository: EmailSettingsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(): Promise<SchoolEmailConnectionResponseDto> {
    const scope = requireSettingsScope();
    const connection = await this.emailSettingsRepository.findConnection();
    if (!connection) throw new EmailConnectionMissingException();

    const updated = await this.emailSettingsRepository.updateConnectionState(
      connection.id,
      {
        status: SchoolEmailConnectionStatus.DISABLED,
        failureReason: null,
      },
    );

    await this.audit(scope, updated);
    return presentEmailConnection(updated);
  }

  private audit(
    scope: ReturnType<typeof requireSettingsScope>,
    connection: SchoolEmailConnection,
  ) {
    return this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'settings',
      action: 'settings.email.connection.disable',
      resourceType: 'school_email_connection',
      resourceId: connection.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        providerType: connection.providerType,
        status: connection.status,
      },
    });
  }
}
