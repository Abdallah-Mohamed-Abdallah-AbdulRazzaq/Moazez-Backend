import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { GradebookNoEnrollmentException } from '../domain/grade-item-entry-domain';
import { assertSubmissionAssessmentAcceptsDrafts } from '../domain/grade-submission-domain';
import { ResolveGradeSubmissionDto } from '../dto/grade-submission.dto';
import { GradesSubmissionsRepository } from '../infrastructure/grades-submissions.repository';
import { presentGradeSubmissionDetail } from '../presenters/grade-submission.presenter';
import {
  assertResolvedEnrollmentMatchesAssessment,
  buildSubmissionAuditEntry,
  findSubmissionAssessmentOrThrow,
  listQuestionsForSubmissionOrThrow,
} from './grade-submission-use-case.helpers';

@Injectable()
export class ResolveGradeSubmissionUseCase {
  constructor(
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(assessmentId: string, command: ResolveGradeSubmissionDto) {
    const scope = requireGradesScope();
    const assessment = await findSubmissionAssessmentOrThrow(
      this.gradesSubmissionsRepository,
      assessmentId,
    );
    assertSubmissionAssessmentAcceptsDrafts(assessment, assessment.term);

    const student =
      await this.gradesSubmissionsRepository.findStudentForSubmission(
        command.studentId,
      );
    if (!student) {
      throw new NotFoundDomainException('Student not found', {
        studentId: command.studentId,
      });
    }

    const enrollment =
      await this.gradesSubmissionsRepository.findEnrollmentForSubmission({
        assessment,
        studentId: student.id,
        enrollmentId: command.enrollmentId,
      });
    if (!enrollment) {
      if (command.enrollmentId) {
        throw new NotFoundDomainException('Enrollment not found', {
          enrollmentId: command.enrollmentId,
          studentId: student.id,
        });
      }

      throw new GradebookNoEnrollmentException({
        assessmentId: assessment.id,
        studentId: student.id,
      });
    }

    assertResolvedEnrollmentMatchesAssessment({ assessment, enrollment });

    const existing =
      await this.gradesSubmissionsRepository.findExistingSubmission({
        assessmentId: assessment.id,
        studentId: student.id,
      });
    const questions = await listQuestionsForSubmissionOrThrow(
      this.gradesSubmissionsRepository,
      assessment.id,
    );

    if (existing) {
      return presentGradeSubmissionDetail({ submission: existing, questions });
    }

    const submission = await this.gradesSubmissionsRepository.createSubmission({
      schoolId: scope.schoolId,
      assessmentId: assessment.id,
      termId: assessment.termId,
      studentId: student.id,
      enrollmentId: enrollment.id,
      maxScore: new Prisma.Decimal(assessment.maxScore),
    });

    await this.authRepository.createAuditLog(
      buildSubmissionAuditEntry({
        scope,
        action: 'grades.submission.create',
        submission,
      }),
    );

    return presentGradeSubmissionDetail({ submission, questions });
  }
}
