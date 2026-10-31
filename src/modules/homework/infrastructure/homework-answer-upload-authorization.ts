import type { Prisma } from '@prisma/client';
import { requireHomeworkScope } from '../homework-context';
import { homeworkResponseConfig } from '../domain/homework-response-config';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import type { AssessmentAnswerUploadBinding } from '../../files/assessment-media/domain/assessment-media.contract';

/** Called only after Homework's existing live target/enrollment media authorization. */
export async function homeworkAnswerUploadBinding(
  tx: Prisma.TransactionClient,
  targetId: string,
  questionId: string,
): Promise<AssessmentAnswerUploadBinding> {
  const scope = requireHomeworkScope();
  const target = await tx.homeworkTarget.findFirst({
    where: { id: targetId, schoolId: scope.schoolId },
    select: { studentId: true, homeworkAssignmentId: true },
  });
  if (!target) throw new NotFoundDomainException();
  await tx.$queryRaw`SELECT id FROM homework_submissions WHERE homework_target_id=${targetId}::uuid AND school_id=${scope.schoolId}::uuid ORDER BY id FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM homework_questions WHERE id=${questionId}::uuid AND school_id=${scope.schoolId}::uuid AND homework_assignment_id=${target.homeworkAssignmentId}::uuid AND deleted_at IS NULL FOR SHARE`;
  const question = await tx.homeworkQuestion.findFirst({
    where: {
      id: questionId,
      homeworkAssignmentId: target.homeworkAssignmentId,
      schoolId: scope.schoolId,
      deletedAt: null,
    },
    select: { type: true, responseConfig: true },
  });
  if (!question) throw new NotFoundDomainException();
  const responseConfig = homeworkResponseConfig(
    question.type,
    question.responseConfig,
  );
  if (!responseConfig || responseConfig.mode === 'TEXT_ONLY')
    throw new NotFoundDomainException();
  return {
    studentId: target.studentId,
    questionId,
    responseConfig,
    homeworkTargetId: targetId,
    homeworkQuestionId: questionId,
    homeworkAssignmentId: target.homeworkAssignmentId,
  };
}
