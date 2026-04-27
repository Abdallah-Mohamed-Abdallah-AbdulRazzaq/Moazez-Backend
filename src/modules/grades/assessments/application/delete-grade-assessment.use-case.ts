import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { DeleteGradeAssessmentResponseDto } from '../dto/grade-assessment.dto';
import {
  GradeAssessmentInvalidStatusTransitionException,
  assertAssessmentDeletableForCrud,
  assertTermWritableForAssessment,
} from '../domain/grade-assessment-domain';
import { GradesAssessmentsRepository } from '../infrastructure/grades-assessments.repository';
import {
  buildAssessmentAuditEntry,
  validateAssessmentAcademicContext,
} from './grade-assessment-use-case.helpers';

@Injectable()
export class DeleteGradeAssessmentUseCase {
  constructor(
    private readonly gradesAssessmentsRepository: GradesAssessmentsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    assessmentId: string,
  ): Promise<DeleteGradeAssessmentResponseDto> {
    const scope = requireGradesScope();
    const existing =
      await this.gradesAssessmentsRepository.findAssessmentById(assessmentId);

    if (!existing) {
      throw new NotFoundDomainException('Grade assessment not found', {
        assessmentId,
      });
    }

    assertAssessmentDeletableForCrud(existing);

    const { term } = await validateAssessmentAcademicContext(
      this.gradesAssessmentsRepository,
      existing.academicYearId,
      existing.termId,
    );
    assertTermWritableForAssessment(term);

    const gradeItemCount =
      await this.gradesAssessmentsRepository.countGradeItemsForAssessment(
        existing.id,
      );
    if (gradeItemCount > 0) {
      throw new GradeAssessmentInvalidStatusTransitionException({
        reason: 'grade_items_exist',
        gradeItemCount,
      });
    }

    const deleted =
      await this.gradesAssessmentsRepository.softDeleteAssessment(existing.id);

    await this.authRepository.createAuditLog(
      buildAssessmentAuditEntry({
        scope,
        action: 'grades.assessment.delete',
        assessment: deleted,
        before: existing,
      }),
    );

    return { ok: true };
  }
}
