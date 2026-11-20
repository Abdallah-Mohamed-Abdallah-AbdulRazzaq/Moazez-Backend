import type { Prisma } from '@prisma/client';
import { ASSESSMENT_MEDIA_OBJECT_KEY_PREFIX } from '../../../../infrastructure/storage/assessment-media-object-key';
import { ASSESSMENT_MEDIA_PURPOSES } from '../../assessment-media/domain/assessment-media.contract';

/** Generic consumers lack the owning assessment's authorization. */
export const nonAssessmentFileFilter = {
  NOT: [
    { objectKey: { startsWith: ASSESSMENT_MEDIA_OBJECT_KEY_PREFIX } },
    {
      uploadSession: {
        is: { purpose: { in: [...ASSESSMENT_MEDIA_PURPOSES] } },
      },
    },
  ],
} satisfies Prisma.FileWhereInput;
