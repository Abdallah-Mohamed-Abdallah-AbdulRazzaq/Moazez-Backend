import { Injectable } from '@nestjs/common';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import {
  ListPlatformOrganizationsQueryDto,
  PlatformOrganizationsListResponseDto,
} from '../dto/platform-admin-organization.dto';
import {
  normalizePlatformLimit,
  normalizePlatformSearch,
} from '../domain/platform-admin-inputs';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformOrganizationsList } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class ListPlatformOrganizationsUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
  ) {}

  async execute(
    query: ListPlatformOrganizationsQueryDto = new ListPlatformOrganizationsQueryDto(),
  ): Promise<PlatformOrganizationsListResponseDto> {
    requirePlatformAdminScope();

    const filters = {
      status: query.status,
      search: normalizePlatformSearch(query.search),
      limit: normalizePlatformLimit(query.limit),
      cursor: query.cursor,
    };
    const result = await this.platformAdminRepository.listOrganizations(filters);

    return presentPlatformOrganizationsList({
      generatedAt: new Date(),
      result,
      filters,
    });
  }
}
