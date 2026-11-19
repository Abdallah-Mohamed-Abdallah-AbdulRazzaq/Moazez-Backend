import type { Prisma } from '@prisma/client';
import { ASSESSMENT_MEDIA_PURPOSES } from '../../assessment-media/domain/assessment-media.contract';

/** Generic consumers lack the owning assessment's authorization. */
export const nonAssessmentFileFilter = {
  NOT: {
    uploadSession: { is: { purpose: { in: [...ASSESSMENT_MEDIA_PURPOSES] } } },
  },
} satisfies Prisma.FileWhereInput;
