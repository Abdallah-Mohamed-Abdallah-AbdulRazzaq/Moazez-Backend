import { Injectable } from '@nestjs/common';
import { GradeAssessmentApprovalStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import {
  assertApprovableAssessment,
  assertWorkflowTermWritable,
} from '../domain/grade-assessment-domain';
import { GradesAssessmentsRepository } from '../infrastructure/grades-assessments.repository';
import { presentGradeAssessment } from '../presenters/grade-assessment.presenter';
import {
  buildAssessmentAuditEntry,
  validateAssessmentAcademicContext,
} from './grade-assessment-use-case.helpers';

@Injectable()
export class ApproveGradeAssessmentUseCase {
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

    assertApprovableAssessment(existing);

    const { term } = await validateAssessmentAcademicContext(
      this.gradesAssessmentsRepository,
      existing.academicYearId,
      existing.termId,
    );
    assertWorkflowTermWritable(term);

    const updated = await this.gradesAssessmentsRepository.approveAssessment(
      existing.id,
      {
        approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: scope.actorId,
      },
    );

    await this.authRepository.createAuditLog(
      buildAssessmentAuditEntry({
        scope,
        action: 'grades.assessment.approve',
        assessment: updated,
        before: existing,
      }),
    );

    return presentGradeAssessment(updated);
  }
}
