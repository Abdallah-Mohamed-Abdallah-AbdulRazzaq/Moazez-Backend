import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { UpdateGradeAssessmentDto } from '../dto/grade-assessment.dto';
import {
  assertAssessmentMutableForCrud,
  assertDateInsideTerm,
  assertTermWritableForAssessment,
  validateAssessmentMaxScore,
  validateAssessmentWeight,
} from '../domain/grade-assessment-domain';
import { GradesAssessmentsRepository } from '../infrastructure/grades-assessments.repository';
import { presentGradeAssessment } from '../presenters/grade-assessment.presenter';
import {
  assertAssessmentWeightBudget,
  assertProtectedChangesAllowed,
  buildAssessmentAuditEntry,
  buildUpdateAssessmentData,
  decimalToNumber,
  detectProtectedAssessmentChanges,
  existingAssessmentScope,
  hasScopePatch,
  parseAssessmentDate,
  resolveAssessmentScopeForWrite,
  resolveNextAssessmentScopeInput,
  shouldValidateWeightBudget,
  validateAssessmentAcademicContext,
  validateAssessmentSubject,
} from './grade-assessment-use-case.helpers';

@Injectable()
export class UpdateGradeAssessmentUseCase {
  constructor(
    private readonly gradesAssessmentsRepository: GradesAssessmentsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(assessmentId: string, command: UpdateGradeAssessmentDto) {
    const scope = requireGradesScope();
    const existing =
      await this.gradesAssessmentsRepository.findAssessmentById(assessmentId);

    if (!existing) {
      throw new NotFoundDomainException('Grade assessment not found', {
        assessmentId,
      });
    }

    assertAssessmentMutableForCrud(existing);

    const { term } = await validateAssessmentAcademicContext(
      this.gradesAssessmentsRepository,
      existing.academicYearId,
      existing.termId,
    );
    assertTermWritableForAssessment(term);

    const nextSubjectId = command.subjectId ?? existing.subjectId;
    if (nextSubjectId !== existing.subjectId) {
      await validateAssessmentSubject(
        this.gradesAssessmentsRepository,
        nextSubjectId,
      );
    }

    const nextScope = hasScopePatch(command)
      ? await resolveAssessmentScopeForWrite(
          this.gradesAssessmentsRepository,
          resolveNextAssessmentScopeInput({ existing, command }),
        )
      : existingAssessmentScope(existing);

    const nextDate = command.date
      ? parseAssessmentDate(command.date, 'date')
      : existing.date;
    const nextWeight =
      command.weight === undefined
        ? decimalToNumber(existing.weight)
        : validateAssessmentWeight(command.weight);
    const nextMaxScore =
      command.maxScore === undefined
        ? decimalToNumber(existing.maxScore)
        : validateAssessmentMaxScore(command.maxScore);

    assertDateInsideTerm(nextDate, term);

    const gradeItemCount =
      await this.gradesAssessmentsRepository.countGradeItemsForAssessment(
        existing.id,
      );
    assertProtectedChangesAllowed({
      gradeItemCount,
      changedFields: detectProtectedAssessmentChanges({
        existing,
        nextSubjectId,
        nextScope,
        nextMaxScore,
      }),
    });

    if (
      shouldValidateWeightBudget({
        existing,
        nextSubjectId,
        nextScope,
        nextWeight,
      })
    ) {
      await assertAssessmentWeightBudget({
        repository: this.gradesAssessmentsRepository,
        academicYearId: existing.academicYearId,
        termId: existing.termId,
        subjectId: nextSubjectId,
        assessmentScope: nextScope,
        nextWeight,
        excludeAssessmentId: existing.id,
      });
    }

    const data = buildUpdateAssessmentData({
      command,
      assessmentScope: hasScopePatch(command) ? nextScope : undefined,
    });

    if (Object.keys(data).length === 0) {
      return presentGradeAssessment(existing);
    }

    const updated = await this.gradesAssessmentsRepository.updateAssessment(
      existing.id,
      data,
    );

    await this.authRepository.createAuditLog(
      buildAssessmentAuditEntry({
        scope,
        action: 'grades.assessment.update',
        assessment: updated,
        before: existing,
      }),
    );

    return presentGradeAssessment(updated);
  }
}
