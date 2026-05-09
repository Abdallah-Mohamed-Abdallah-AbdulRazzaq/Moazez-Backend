import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAssessmentGradeDetailResponseDto } from '../dto/parent-grades.dto';
import { ParentGradesReadAdapter } from '../infrastructure/parent-grades-read.adapter';
import { ParentGradesPresenter } from '../presenters/parent-grades.presenter';

@Injectable()
export class GetParentChildAssessmentGradeUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentGradesReadAdapter,
  ) {}

  async execute(
    studentId: string,
    assessmentId: string,
  ): Promise<ParentAssessmentGradeDetailResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.findAssessmentGrade({
      child,
      assessmentId,
    });

    if (!result) {
      throw new NotFoundDomainException(
        'Parent App assessment grade not found',
        {
          studentId,
          assessmentId,
        },
      );
    }

    return ParentGradesPresenter.presentAssessmentGradeDetail(result);
  }
}
