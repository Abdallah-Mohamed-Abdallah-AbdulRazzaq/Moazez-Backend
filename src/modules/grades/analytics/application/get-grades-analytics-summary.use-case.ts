import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import { buildGradesGradebookModel } from '../../shared/application/grades-read-model.builder';
import { GradesReadModelRepository } from '../../shared/infrastructure/grades-read-model.repository';
import {
  GetGradesAnalyticsQueryDto,
  GradesAnalyticsSummaryResponseDto,
} from '../dto/grades-analytics-query.dto';
import { presentGradesAnalyticsSummary } from '../presenters/grades-analytics.presenter';

@Injectable()
export class GetGradesAnalyticsSummaryUseCase {
  constructor(
    private readonly gradesReadModelRepository: GradesReadModelRepository,
  ) {}

  async execute(
    query: GetGradesAnalyticsQueryDto,
  ): Promise<GradesAnalyticsSummaryResponseDto> {
    const scope = requireGradesScope();
    const gradebook = await buildGradesGradebookModel({
      repository: this.gradesReadModelRepository,
      schoolId: scope.schoolId,
      query,
      includeVirtualMissing: true,
    });

    return presentGradesAnalyticsSummary(gradebook);
  }
}
