import { Prisma } from '@prisma/client';

/** Progress is additive only for opted-in questions; mutation validation rechecks full evidence. */
export const GRADE_ANSWER_MEDIA_SELECT = {
  where: {
    deletedAt: null,
    file: { deletedAt: null, visibility: 'PRIVATE' },
    mediaClaim: {
      is: {
        intent: {
          upload: {
            status: 'READY',
            verificationVersion: 'assessment-media-attested-v1',
          },
        },
      },
    },
  },
  select: { file: { select: { mimeType: true } } },
} satisfies Prisma.GradeSubmissionAnswerAssetFindManyArgs;

export const MEANINGFUL_GRADE_ANSWER_WHERE = {
  OR: [
    { question: { responseConfig: { equals: Prisma.DbNull } } },
    { answerText: { not: null } },
    { assets: { some: GRADE_ANSWER_MEDIA_SELECT.where } },
  ],
} satisfies Prisma.GradeSubmissionAnswerWhereInput;
