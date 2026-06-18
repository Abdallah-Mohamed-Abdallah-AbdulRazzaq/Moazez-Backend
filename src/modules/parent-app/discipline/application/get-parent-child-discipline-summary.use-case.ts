import { Injectable } from '@nestjs/common';
import { DisciplineDerivedReadService } from '../../../discipline/application/discipline-derived-read.service';
import {
  DisciplineDerivedQueryDto,
  ParentDisciplineSummaryResponseDto,
} from '../../../discipline/dto/discipline-derived.dto';
import { DisciplineDerivedPresenter } from '../../../discipline/presenters/discipline-derived.presenter';
import { ParentAppAccessService } from '../../access/parent-app-access.service';

@Injectable()
export class GetParentChildDisciplineSummaryUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly disciplineReadService: DisciplineDerivedReadService,
  ) {}

  async execute(
    studentId: string,
    query?: DisciplineDerivedQueryDto,
  ): Promise<ParentDisciplineSummaryResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const summary = await this.disciplineReadService.getSummary({
      scope: {
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
        academicYearId: child.academicYearId,
        termId: child.termId,
      },
      query,
    });

    return DisciplineDerivedPresenter.presentParentSummary({
      child: {
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
        student_id: child.studentId,
        enrollment_id: child.enrollmentId,
      },
      summary,
    });
  }
}
