import { Injectable } from '@nestjs/common';
import { DisciplineDerivedQueryDto } from '../dto/discipline-derived.dto';
import {
  DisciplineDerivedRepository,
  DisciplineSubjectScope,
  DisciplineSummaryReadModel,
  DisciplineTimelineListReadModel,
} from '../infrastructure/discipline-derived.repository';

@Injectable()
export class DisciplineDerivedReadService {
  constructor(private readonly repository: DisciplineDerivedRepository) {}

  listTimeline(params: {
    scope: DisciplineSubjectScope;
    query?: DisciplineDerivedQueryDto;
  }): Promise<DisciplineTimelineListReadModel> {
    return this.repository.listTimeline(params);
  }

  getSummary(params: {
    scope: DisciplineSubjectScope;
    query?: DisciplineDerivedQueryDto;
  }): Promise<DisciplineSummaryReadModel> {
    return this.repository.getSummary(params);
  }
}
