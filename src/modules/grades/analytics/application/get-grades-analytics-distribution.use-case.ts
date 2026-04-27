import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import { buildGradesGradebookModel } from '../../shared/application/grades-read-model.builder';
import { GradesReadModelRepository } from '../../shared/infrastructure/grades-read-model.repository';
import {
  GetGradesDistributionQueryDto,
  GradesDistributionResponseDto,
} from '../dto/grades-analytics-query.dto';
import { presentGradesDistribution } from '../presenters/grades-analytics.presenter';

@Injectable()
export class GetGradesAnalyticsDistributionUseCase {
  constructor(
    private readonly gradesReadModelRepository: GradesReadModelRepository,
  ) {}

  async execute(
    query: GetGradesDistributionQueryDto,
  ): Promise<GradesDistributionResponseDto> {
    const scope = requireGradesScope();
    const gradebook = await buildGradesGradebookModel({
      repository: this.gradesReadModelRepository,
      schoolId: scope.schoolId,
      query,
      includeVirtualMissing: true,
    });

    return presentGradesDistribution(gradebook, query.bucketSize ?? 10);
  }
}
