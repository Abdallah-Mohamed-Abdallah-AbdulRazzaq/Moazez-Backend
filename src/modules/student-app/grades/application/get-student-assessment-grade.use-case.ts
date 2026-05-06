import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAssessmentGradeDetailResponseDto } from '../dto/student-grades.dto';
import { StudentGradesReadAdapter } from '../infrastructure/student-grades-read.adapter';
import { StudentGradesPresenter } from '../presenters/student-grades.presenter';

@Injectable()
export class GetStudentAssessmentGradeUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentGradesReadAdapter,
  ) {}

  async execute(
    assessmentId: string,
  ): Promise<StudentAssessmentGradeDetailResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.findAssessmentGrade({
      context,
      assessmentId,
    });

    if (!result) {
      throw new NotFoundDomainException('Student App assessment not found', {
        assessmentId,
      });
    }

    return StudentGradesPresenter.presentAssessmentGradeDetail(result);
  }
}
