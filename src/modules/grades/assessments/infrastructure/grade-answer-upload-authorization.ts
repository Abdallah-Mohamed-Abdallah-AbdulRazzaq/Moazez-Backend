import type { Prisma } from '@prisma/client';
import { requireGradesScope } from '../../grades-context';
import { gradeResponseConfig } from '../domain/grade-response-config';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { AssessmentAnswerUploadBinding } from '../../../files/assessment-media/domain/assessment-media.contract';

/** Grades retains ownership of question/assessment identity and response capability. */
export async function gradeAnswerUploadBinding(
  tx: Prisma.TransactionClient,
  submissionId: string,
  questionId: string,
): Promise<AssessmentAnswerUploadBinding> {
  const scope = requireGradesScope();
  const submission = await tx.gradeSubmission.findFirst({
    where: { id: submissionId, schoolId: scope.schoolId },
    select: { studentId: true, assessmentId: true },
  });
  if (!submission) throw new NotFoundDomainException();
  await tx.$queryRaw`SELECT id FROM grade_assessment_questions WHERE id=${questionId}::uuid AND school_id=${scope.schoolId}::uuid AND assessment_id=${submission.assessmentId}::uuid AND deleted_at IS NULL FOR SHARE`;
  const question = await tx.gradeAssessmentQuestion.findFirst({
    where: {
      id: questionId,
      assessmentId: submission.assessmentId,
      schoolId: scope.schoolId,
      deletedAt: null,
    },
    select: { type: true, responseConfig: true },
  });
  if (!question) throw new NotFoundDomainException();
  const responseConfig = gradeResponseConfig(
    question.type,
    question.responseConfig,
  );
  if (!responseConfig || responseConfig.mode === 'TEXT_ONLY')
    throw new NotFoundDomainException();
  return {
    studentId: submission.studentId,
    questionId,
    responseConfig,
    gradeSubmissionId: submissionId,
    gradeQuestionId: questionId,
    gradeAssessmentId: submission.assessmentId,
  };
}
