import {
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
} from '@prisma/client';
import { presentReinforcementTaskTemplate } from '../presenters/reinforcement-template.presenter';

describe('Reinforcement template presenter', () => {
  it('maps enums to frontend strings', () => {
    const now = new Date('2026-04-28T10:00:00.000Z');

    const result = presentReinforcementTaskTemplate({
      id: 'template-1',
      schoolId: 'school-1',
      academicYearId: null,
      termId: null,
      nameEn: 'Reading',
      nameAr: null,
      descriptionEn: null,
      descriptionAr: null,
      source: ReinforcementSource.TEACHER,
      rewardType: ReinforcementRewardType.BADGE,
      rewardValue: { toNumber: () => 1 },
      rewardLabelEn: 'Badge',
      rewardLabelAr: null,
      metadata: null,
      createdById: 'user-1',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      stages: [
        {
          id: 'stage-1',
          sortOrder: 1,
          titleEn: 'Upload proof',
          titleAr: null,
          descriptionEn: null,
          descriptionAr: null,
          proofType: ReinforcementProofType.DOCUMENT,
          requiresApproval: true,
          metadata: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ],
    } as never);

    expect(result).toMatchObject({
      id: 'template-1',
      source: 'teacher',
      reward: { type: 'badge', value: 1 },
      stages: [expect.objectContaining({ proofType: 'document' })],
    });
  });
});
