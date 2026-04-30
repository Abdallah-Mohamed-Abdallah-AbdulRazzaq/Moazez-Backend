import {
  FileVisibility,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
} from '@prisma/client';
import { presentRewardCatalogItem } from '../presenters/reward-catalog.presenter';

const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Reward catalog presenter', () => {
  it('maps enum values to lowercase and hides internal schoolId', () => {
    const result = presentRewardCatalogItem(rewardRecord());

    expect(result).toMatchObject({
      id: 'reward-1',
      type: 'physical',
      status: 'published',
      isAvailable: true,
      publishedAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
      academicYear: {
        id: 'year-1',
        nameEn: '2026/2027',
      },
      term: {
        id: 'term-1',
        academicYearId: 'year-1',
      },
      imageFile: {
        id: 'file-1',
        originalName: 'reward.png',
        sizeBytes: '2048',
        visibility: 'private',
      },
    });
    expect(result).not.toHaveProperty('schoolId');
    expect(result).not.toHaveProperty('metadata');
  });

  function rewardRecord() {
    return {
      id: 'reward-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      titleEn: 'Reward',
      titleAr: null,
      descriptionEn: null,
      descriptionAr: null,
      type: RewardCatalogItemType.PHYSICAL,
      status: RewardCatalogItemStatus.PUBLISHED,
      minTotalXp: 100,
      stockQuantity: 10,
      stockRemaining: 2,
      isUnlimited: false,
      imageFileId: 'file-1',
      sortOrder: 1,
      publishedAt: NOW,
      publishedById: 'publisher-1',
      archivedAt: null,
      archivedById: null,
      createdById: 'creator-1',
      metadata: { internal: true },
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      academicYear: {
        id: 'year-1',
        nameAr: '2026/2027 AR',
        nameEn: '2026/2027',
        isActive: true,
      },
      term: {
        id: 'term-1',
        academicYearId: 'year-1',
        nameAr: 'Term AR',
        nameEn: 'Term',
        isActive: true,
      },
      imageFile: {
        id: 'file-1',
        originalName: 'reward.png',
        mimeType: 'image/png',
        sizeBytes: BigInt(2048),
        visibility: FileVisibility.PRIVATE,
        createdAt: NOW,
      },
    } as never;
  }
});
