import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import {
  assertLockableAssessment,
  assertWorkflowTermWritable,
} from '../domain/grade-assessment-domain';
import { GradesAssessmentsRepository } from '../infrastructure/grades-assessments.repository';
import { presentGradeAssessment } from '../presenters/grade-assessment.presenter';
import {
  buildAssessmentAuditEntry,
  validateAssessmentAcademicContext,
} from './grade-assessment-use-case.helpers';

@Injectable()
export class LockGradeAssessmentUseCase {
  constructor(
    private readonly gradesAssessmentsRepository: GradesAssessmentsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(assessmentId: string) {
    const scope = requireGradesScope();
    const existing =
      await this.gradesAssessmentsRepository.findAssessmentById(assessmentId);

    if (!existing) {
      throw new NotFoundDomainException('Grade assessment not found', {
        assessmentId,
      });
    }

    assertLockableAssessment(existing);

    const { term } = await validateAssessmentAcademicContext(
      this.gradesAssessmentsRepository,
      existing.academicYearId,
      existing.termId,
    );
    assertWorkflowTermWritable(term);

    const updated = await this.gradesAssessmentsRepository.lockAssessment(
      existing.id,
      {
        lockedAt: new Date(),
        lockedById: scope.actorId,
      },
    );

    await this.authRepository.createAuditLog(
      buildAssessmentAuditEntry({
        scope,
        action: 'grades.assessment.lock',
        assessment: updated,
        before: existing,
      }),
    );

    return presentGradeAssessment(updated);
  }
}
