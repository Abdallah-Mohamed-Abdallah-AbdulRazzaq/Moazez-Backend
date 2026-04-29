import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireReinforcementScope } from '../../reinforcement-context';
import { GetStudentReinforcementProgressQueryDto } from '../dto/reinforcement-overview.dto';
import { ReinforcementOverviewRepository } from '../infrastructure/reinforcement-overview.repository';
import { presentStudentReinforcementProgress } from '../presenters/reinforcement-overview.presenter';
import { buildStudentProgressReadFilters } from './reinforcement-overview-use-case.helpers';

@Injectable()
export class GetStudentReinforcementProgressUseCase {
  constructor(
    private readonly reinforcementOverviewRepository: ReinforcementOverviewRepository,
  ) {}

  async execute(
    studentId: string,
    query: GetStudentReinforcementProgressQueryDto,
  ) {
    const scopeContext = requireReinforcementScope();
    const { filters } = await buildStudentProgressReadFilters({
      repository: this.reinforcementOverviewRepository,
      schoolId: scopeContext.schoolId,
      studentId,
      query,
    });
    const dataset =
      await this.reinforcementOverviewRepository.loadStudentProgressData(
        filters,
      );

    if (!dataset) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    return presentStudentReinforcementProgress(dataset);
  }
}
