import { Injectable } from '@nestjs/common';
import {
  BulkCredentialSelectionDto,
  BulkCredentialPreviewResponseDto,
} from '../dto/credential.dto';
import { UserCredentialsRepository } from '../infrastructure/user-credentials.repository';
import { presentBulkCredentialPreview } from '../presenters/credentials.presenter';
import { partitionCredentialTargets } from './credential-targeting';

@Injectable()
export class BulkCredentialPreviewUseCase {
  constructor(
    private readonly credentialsRepository: UserCredentialsRepository,
  ) {}

  async execute(
    command: BulkCredentialSelectionDto,
  ): Promise<BulkCredentialPreviewResponseDto> {
    const targets = await this.credentialsRepository.listCredentialTargets({
      scope: command.scope,
      userIds: command.userIds,
      roleKeys: command.roleKeys,
      userTypes: command.userTypes,
    });

    const partition = partitionCredentialTargets(targets, command);

    return presentBulkCredentialPreview(partition);
  }
}
