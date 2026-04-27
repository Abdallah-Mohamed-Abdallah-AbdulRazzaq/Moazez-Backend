import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireGradesScope } from '../../grades-context';
import { assertScoreOnlyAssessment } from '../domain/grade-assessment-domain';
import { GradesAssessmentsRepository } from '../infrastructure/grades-assessments.repository';
import { presentGradeAssessment } from '../presenters/grade-assessment.presenter';

@Injectable()
export class GetGradeAssessmentUseCase {
  constructor(
    private readonly gradesAssessmentsRepository: GradesAssessmentsRepository,
  ) {}

  async execute(assessmentId: string) {
    requireGradesScope();
    const assessment =
      await this.gradesAssessmentsRepository.findAssessmentById(assessmentId);

    if (!assessment) {
      throw new NotFoundDomainException('Grade assessment not found', {
        assessmentId,
      });
    }

    assertScoreOnlyAssessment(assessment);

    return presentGradeAssessment(assessment);
  }
}
