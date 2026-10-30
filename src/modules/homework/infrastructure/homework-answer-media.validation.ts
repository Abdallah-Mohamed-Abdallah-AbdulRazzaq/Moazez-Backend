import type { Prisma } from '@prisma/client';
import { assertResponseModalities } from '../../../common/assessment-answer/response-config';
import type { AnswerMediaRegistry } from '../../files/assessment-media/infrastructure/answer-media-registry';
import { effectiveAssessmentMediaPolicy } from '../../files/assessment-media/domain/assessment-media.policy';
import { homeworkResponseConfig } from '../domain/homework-response-config';
import { HomeworkAnswerInvalidPayloadException } from '../domain/homework-answer.exceptions';

export async function validateHomeworkAnswerMedia(
  tx: Prisma.TransactionClient,
  registry: AnswerMediaRegistry | undefined,
  question: {
    id: string;
    schoolId: string;
    type: string;
    responseConfig?: unknown;
    isRequired: boolean;
  },
  submissionId: string,
  phase: 'draft' | 'final',
  requireContent = false,
) {
  const config = homeworkResponseConfig(question.type, question.responseConfig);
  if (!config) return false;
  const rows = await tx.homeworkSubmissionAnswer.findMany({
    where: {
      schoolId: question.schoolId,
      homeworkSubmissionId: submissionId,
      homeworkQuestionId: question.id,
      deletedAt: null,
    },
    include: {
      assets: {
        where: { deletedAt: null },
        include: { mediaClaim: { include: { intent: true } } },
      },
    },
  });
  const invalid = () =>
    new HomeworkAnswerInvalidPayloadException({
      reason: 'invalid_response_modalities',
    });
  if (rows.length > 1) throw invalid();
  const answer = rows[0];
  if (
    answer &&
    ((Array.isArray(answer.selectedOptionIds) &&
      answer.selectedOptionIds.length) ||
      answer.answerJson !== null ||
      (answer.textAnswer &&
        Array.from(answer.textAnswer).length >
          (question.type === 'SHORT_TEXT' ? 1000 : 10000)))
  )
    throw invalid();
  const policy = effectiveAssessmentMediaPolicy(
    await tx.schoolAssessmentMediaPolicy.findFirst({
      where: { schoolId: question.schoolId },
    }),
  );
  const files: Array<{ mimeType: string }> = [];
  for (const asset of answer?.assets ?? []) {
    const intent = asset.mediaClaim?.intent;
    if (
      !registry ||
      !intent ||
      intent.contextId !== answer.homeworkTargetId ||
      intent.questionId !== question.id
    )
      throw invalid();
    const file = await registry.verifyRead(tx, {
      fileId: asset.fileId,
      uploadId: intent.uploadId,
      contextId: answer.homeworkTargetId,
      questionId: question.id,
      creatorId: intent.actorId,
      purpose: 'HOMEWORK_SUBMISSION_MEDIA',
    });
    if (
      !policy.allowedMimeTypes.includes(file.mimeType) ||
      file.sizeBytes > policy.maximumFileSizeBytes
    )
      throw invalid();
    files.push(file);
  }
  try {
    assertResponseModalities({
      config,
      hasText: !!answer?.textAnswer?.trim(),
      assets: files,
      required: requireContent || question.isRequired,
      phase,
    });
  } catch {
    throw invalid();
  }
  return true;
}
