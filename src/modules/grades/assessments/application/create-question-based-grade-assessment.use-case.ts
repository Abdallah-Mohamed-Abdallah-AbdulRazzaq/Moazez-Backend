import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { CreateQuestionBasedGradeAssessmentDto } from '../dto/grade-assessment.dto';
import { GradesAssessmentsRepository } from '../infrastructure/grades-assessments.repository';
import { presentGradeAssessment } from '../presenters/grade-assessment.presenter';
import {
  assertAssessmentWeightBudget,
  buildAssessmentAuditEntry,
  buildCreateQuestionBasedAssessmentData,
  resolveAssessmentAcademicYearId,
  resolveAssessmentScopeForWrite,
  validateAssessmentAcademicContext,
  validateAssessmentSubject,
  validateCreateAssessmentValues,
} from './grade-assessment-use-case.helpers';

@Injectable()
export class CreateQuestionBasedGradeAssessmentUseCase {
  constructor(
    private readonly gradesAssessmentsRepository: GradesAssessmentsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateQuestionBasedGradeAssessmentDto) {
    const scope = requireGradesScope();
    const academicYearId = resolveAssessmentAcademicYearId(command);
    const { term } = await validateAssessmentAcademicContext(
      this.gradesAssessmentsRepository,
      academicYearId,
      command.termId,
    );

    await validateAssessmentSubject(
      this.gradesAssessmentsRepository,
      command.subjectId,
    );

    const assessmentScope = await resolveAssessmentScopeForWrite(
      this.gradesAssessmentsRepository,
      {
        schoolId: scope.schoolId,
        scopeType: command.scopeType,
        scopeId: command.scopeId,
        stageId: command.stageId,
        gradeId: command.gradeId,
        sectionId: command.sectionId,
        classroomId: command.classroomId,
      },
    );

    const { data, normalized } = buildCreateQuestionBasedAssessmentData({
      scope,
      academicYearId,
      command,
      assessmentScope,
    });

    validateCreateAssessmentValues({
      date: normalized.date,
      weight: normalized.weight,
      maxScore: normalized.maxScore,
      term,
    });

    await assertAssessmentWeightBudget({
      repository: this.gradesAssessmentsRepository,
      academicYearId,
      termId: command.termId,
      subjectId: command.subjectId,
      assessmentScope,
      nextWeight: normalized.weight,
    });

    const assessment =
      await this.gradesAssessmentsRepository.createAssessment(data);

    await this.authRepository.createAuditLog(
      buildAssessmentAuditEntry({
        scope,
        action: 'grades.assessment.create',
        assessment,
      }),
    );

    return presentGradeAssessment(assessment);
  }
}
