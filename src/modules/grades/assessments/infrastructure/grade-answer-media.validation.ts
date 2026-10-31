import type { Prisma } from '@prisma/client';
import { assertResponseModalities } from '../../../../common/assessment-answer/response-config';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import type { AnswerMediaRegistry } from '../../../files/assessment-media/infrastructure/answer-media-registry';
import { effectiveAssessmentMediaPolicy } from '../../../files/assessment-media/domain/assessment-media.policy';
import { gradeResponseConfig } from '../domain/grade-response-config';

export async function validateGradeAnswerMedia(
  tx: Prisma.TransactionClient,
  registry: AnswerMediaRegistry | undefined,
  question: {
    id: string;
    schoolId: string;
    type: string;
    responseConfig?: unknown;
    required: boolean;
  },
  submissionId: string,
  phase: 'draft' | 'final',
  requireContent = false,
) {
  const config = gradeResponseConfig(question.type, question.responseConfig);
  if (!config) return false;
  const answer = await tx.gradeSubmissionAnswer.findFirst({
    where: {
      schoolId: question.schoolId,
      submissionId,
      questionId: question.id,
    },
    include: {
      assets: {
        where: { deletedAt: null },
        include: { mediaClaim: { include: { intent: true } } },
      },
      selectedOptions: true,
    },
  });
  const invalid = () =>
    new ValidationDomainException('Invalid answer response modalities');
  if (answer) {
    const [fact] = await tx.$queryRaw<
      Array<{ sqlNull: boolean }>
    >`SELECT answer_json IS NULL AS "sqlNull" FROM grade_submission_answers WHERE id=${answer.id}::uuid AND school_id=${question.schoolId}::uuid`;
    if (!fact?.sqlNull) throw invalid();
  }
  if (
    answer &&
    (answer.answerJson !== null ||
      answer.selectedOptions.length ||
      (answer.answerText &&
        Array.from(answer.answerText).length >
          (question.type === 'SHORT_ANSWER' ? 1000 : 10000)))
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
      intent.contextId !== submissionId ||
      intent.questionId !== question.id
    )
      throw invalid();
    const file = await registry.verifyRead(tx, {
      fileId: asset.fileId,
      uploadId: intent.uploadId,
      contextId: submissionId,
      questionId: question.id,
      creatorId: intent.actorId,
      purpose: 'GRADE_SUBMISSION_MEDIA',
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
      hasText: !!answer?.answerText?.trim(),
      assets: files,
      required: requireContent || question.required,
      phase,
    });
  } catch {
    throw invalid();
  }
  return true;
}
