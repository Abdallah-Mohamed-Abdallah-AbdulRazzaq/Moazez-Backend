import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import { buildGradesGradebookModel } from '../../shared/application/grades-read-model.builder';
import { GradesReadModelRepository } from '../../shared/infrastructure/grades-read-model.repository';
import {
  GetGradesOverviewQueryDto,
  GradesOverviewResponseDto,
} from '../dto/grades-overview.dto';
import { GradesDashboardReadRepository } from '../infrastructure/grades-dashboard-read.repository';
import { presentGradesOverview } from '../presenters/grades-overview.presenter';

@Injectable()
export class GetGradesOverviewUseCase {
  constructor(
    private readonly gradesReadModelRepository: GradesReadModelRepository,
    private readonly gradesDashboardReadRepository: GradesDashboardReadRepository,
  ) {}

  async execute(
    query: GetGradesOverviewQueryDto,
  ): Promise<GradesOverviewResponseDto> {
    const scope = requireGradesScope();
    const gradebook = await buildGradesGradebookModel({
      repository: this.gradesReadModelRepository,
      schoolId: scope.schoolId,
      query,
      includeVirtualMissing: query.includeVirtualMissing ?? true,
    });
    const scopeLabel = await this.gradesDashboardReadRepository.findScopeLabel(
      gradebook.scope,
    );

    return presentGradesOverview({ gradebook, scopeLabel });
  }
}
