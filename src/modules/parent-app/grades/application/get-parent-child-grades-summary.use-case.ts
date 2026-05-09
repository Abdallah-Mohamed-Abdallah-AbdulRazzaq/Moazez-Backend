import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentGradesQueryDto,
  ParentGradesSummaryResponseDto,
} from '../dto/parent-grades.dto';
import { ParentGradesReadAdapter } from '../infrastructure/parent-grades-read.adapter';
import { ParentGradesPresenter } from '../presenters/parent-grades.presenter';

@Injectable()
export class GetParentChildGradesSummaryUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentGradesReadAdapter,
  ) {}

  async execute(
    studentId: string,
    query?: ParentGradesQueryDto,
  ): Promise<ParentGradesSummaryResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.listGrades({
      child,
      query,
      paginate: false,
    });

    return ParentGradesPresenter.presentSummary(result);
  }
}
