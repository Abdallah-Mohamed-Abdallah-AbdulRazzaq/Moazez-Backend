import { AuditOutcome, UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import type {
  GradeSubmissionAnswerRecord,
  GradeSubmissionDetailRecord,
} from '../../../grades/assessments/infrastructure/grades-submissions.repository';
import type { StudentAppContext } from '../../shared/student-app.types';
import type { StudentExamSubmissionStateResponseDto } from '../dto/student-exams.dto';
import { StudentExamsReadAdapter } from '../infrastructure/student-exams-read.adapter';
import { StudentExamsPresenter } from '../presenters/student-exams.presenter';

export async function presentCurrentStudentExamSubmissionState(params: {
  readAdapter: StudentExamsReadAdapter;
  context: StudentAppContext;
  assessmentId: string;
}): Promise<StudentExamSubmissionStateResponseDto> {
  const result = await params.readAdapter.findExamSubmission({
    context: params.context,
    assessmentId: params.assessmentId,
  });

  if (!result) {
    throw new NotFoundDomainException('Student App exam not found', {
      assessmentId: params.assessmentId,
    });
  }

  return StudentExamsPresenter.presentSubmissionState(result);
}

export function recordStudentExamSubmissionAudit(params: {
  authRepository: AuthRepository;
  context: StudentAppContext;
  action: string;
  submission: GradeSubmissionDetailRecord;
  beforeStatus?: string;
  after?: Record<string, unknown>;
}): Promise<unknown> {
  return params.authRepository.createAuditLog({
    ...auditScope(params.context),
    module: 'grades',
    action: params.action,
    resourceType: 'grade_submission',
    resourceId: params.submission.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.beforeStatus ? { status: params.beforeStatus } : undefined,
    after: {
      submissionId: params.submission.id,
      assessmentId: params.submission.assessmentId,
      status: params.submission.status,
      ...(params.after ?? {}),
    },
  });
}

export function recordStudentExamAnswerAudit(params: {
  authRepository: AuthRepository;
  context: StudentAppContext;
  action: string;
  answer: GradeSubmissionAnswerRecord;
  after?: Record<string, unknown>;
}): Promise<unknown> {
  return params.authRepository.createAuditLog({
    ...auditScope(params.context),
    module: 'grades',
    action: params.action,
    resourceType: 'grade_submission_answer',
    resourceId: params.answer.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      answerId: params.answer.id,
      submissionId: params.answer.submissionId,
      assessmentId: params.answer.assessmentId,
      questionId: params.answer.questionId,
      selectedOptionCount: params.answer.selectedOptions.length,
      hasAnswerText: Boolean(params.answer.answerText),
      hasAnswerJson:
        params.answer.answerJson !== null &&
        params.answer.answerJson !== undefined,
      ...(params.after ?? {}),
    },
  });
}

function auditScope(context: StudentAppContext) {
  return {
    actorId: context.studentUserId,
    userType: UserType.STUDENT,
    organizationId: context.organizationId,
    schoolId: context.schoolId,
  };
}
