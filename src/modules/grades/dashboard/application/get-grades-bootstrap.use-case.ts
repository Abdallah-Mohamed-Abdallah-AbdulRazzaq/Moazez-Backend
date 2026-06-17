import { Injectable } from '@nestjs/common';
import { requireGradesScope } from '../../grades-context';
import {
  GetGradesBootstrapQueryDto,
  GradesBootstrapResponseDto,
} from '../dto/grades-bootstrap.dto';
import { GradesDashboardReadRepository } from '../infrastructure/grades-dashboard-read.repository';
import { presentGradesBootstrap } from '../presenters/grades-bootstrap.presenter';

@Injectable()
export class GetGradesBootstrapUseCase {
  constructor(
    private readonly gradesDashboardReadRepository: GradesDashboardReadRepository,
  ) {}

  async execute(
    query: GetGradesBootstrapQueryDto = {},
  ): Promise<GradesBootstrapResponseDto> {
    requireGradesScope();
    const data = await this.gradesDashboardReadRepository.getBootstrapData();

    return presentGradesBootstrap(data, query);
  }
}
