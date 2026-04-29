import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireReinforcementScope } from '../../reinforcement-context';
import { GetClassroomReinforcementSummaryQueryDto } from '../dto/reinforcement-overview.dto';
import { ReinforcementOverviewRepository } from '../infrastructure/reinforcement-overview.repository';
import { presentClassroomReinforcementSummary } from '../presenters/reinforcement-overview.presenter';
import { buildClassroomSummaryReadFilters } from './reinforcement-overview-use-case.helpers';

@Injectable()
export class GetClassroomReinforcementSummaryUseCase {
  constructor(
    private readonly reinforcementOverviewRepository: ReinforcementOverviewRepository,
  ) {}

  async execute(
    classroomId: string,
    query: GetClassroomReinforcementSummaryQueryDto,
  ) {
    const scopeContext = requireReinforcementScope();
    const filters = await buildClassroomSummaryReadFilters({
      repository: this.reinforcementOverviewRepository,
      schoolId: scopeContext.schoolId,
      classroomId,
      query,
    });
    const dataset =
      await this.reinforcementOverviewRepository.loadClassroomSummaryData(
        filters,
      );

    if (!dataset) {
      throw new NotFoundDomainException('Classroom not found', { classroomId });
    }

    return presentClassroomReinforcementSummary(dataset);
  }
}
