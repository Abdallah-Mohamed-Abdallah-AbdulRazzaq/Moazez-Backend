import { Injectable } from '@nestjs/common';
import {
  CredentialStatusQueryDto,
  CredentialStatusListResponseDto,
} from '../dto/credential.dto';
import { UserCredentialsRepository } from '../infrastructure/user-credentials.repository';
import { presentCredentialStatusList } from '../presenters/credentials.presenter';

@Injectable()
export class ListCredentialStatusUseCase {
  constructor(
    private readonly credentialsRepository: UserCredentialsRepository,
  ) {}

  async execute(
    query: CredentialStatusQueryDto,
  ): Promise<CredentialStatusListResponseDto> {
    const result = await this.credentialsRepository.listCredentialStatus({
      roleKey: query.roleKey,
      userType: query.userType,
      credentialStatus: query.credentialStatus,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    return presentCredentialStatusList({
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total,
    });
  }
}
