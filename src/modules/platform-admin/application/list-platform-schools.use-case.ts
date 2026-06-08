import { Injectable } from '@nestjs/common';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import {
  ListPlatformSchoolsQueryDto,
  PlatformSchoolsListResponseDto,
} from '../dto/platform-admin-school.dto';
import {
  normalizePlatformLimit,
  normalizePlatformSearch,
} from '../domain/platform-admin-inputs';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformSchoolsList } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class ListPlatformSchoolsUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
  ) {}

  async execute(
    query: ListPlatformSchoolsQueryDto = new ListPlatformSchoolsQueryDto(),
  ): Promise<PlatformSchoolsListResponseDto> {
    requirePlatformAdminScope();

    const filters = {
      organizationId: query.organizationId,
      status: query.status,
      search: normalizePlatformSearch(query.search),
      limit: normalizePlatformLimit(query.limit),
      cursor: query.cursor,
    };
    const result = await this.platformAdminRepository.listSchools(filters);

    return presentPlatformSchoolsList({
      generatedAt: new Date(),
      result,
      filters,
    });
  }
}
