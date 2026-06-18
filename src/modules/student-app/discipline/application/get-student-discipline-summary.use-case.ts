import { Injectable } from '@nestjs/common';
import { DisciplineDerivedReadService } from '../../../discipline/application/discipline-derived-read.service';
import {
  DisciplineDerivedQueryDto,
  DisciplineSummaryResponseDto,
} from '../../../discipline/dto/discipline-derived.dto';
import { DisciplineDerivedPresenter } from '../../../discipline/presenters/discipline-derived.presenter';
import { StudentAppAccessService } from '../../access/student-app-access.service';

@Injectable()
export class GetStudentDisciplineSummaryUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly disciplineReadService: DisciplineDerivedReadService,
  ) {}

  async execute(
    query?: DisciplineDerivedQueryDto,
  ): Promise<DisciplineSummaryResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const summary = await this.disciplineReadService.getSummary({
      scope: {
        studentId: context.studentId,
        enrollmentId: context.enrollmentId,
        academicYearId: context.academicYearId,
        termId: context.termId,
      },
      query,
    });

    return DisciplineDerivedPresenter.presentSummary(summary);
  }
}
