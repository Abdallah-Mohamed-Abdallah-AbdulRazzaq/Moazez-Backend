import {
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
  StudentStatus,
} from '@prisma/client';
import {
  presentRewardCatalogSummary,
  presentRewardsOverview,
  presentStudentRewardsSummary,
} from '../presenters/reward-dashboard.presenter';

const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Reward dashboard presenter', () => {
  it('maps enums to lowercase in overview read models', () => {
    const response = presentRewardsOverview({
      scope: {
        academicYearId: 'year-1',
        termId: 'term-1',
        studentId: null,
        dateFrom: null,
        dateTo: null,
      },
      dataset: {
        catalogItems: [catalogItem()],
        redemptions: [redemption()],
        xpStudentTotals: [{ studentId: 'student-1', totalEarnedXp: 25 }],
        recentRedemptions: [redemption()],
        lowStockCandidates: [
          catalogItem({
            id: 'reward-low',
            isUnlimited: false,
            stockQuantity: 20,
            stockRemaining: 4,
          }),
        ],
      },
    });

    expect(response.topRequestedRewards[0]).toMatchObject({
      type: 'physical',
      status: 'published',
    });
    expect(response.recentRedemptions[0]).toMatchObject({
      status: 'requested',
      catalogItem: { type: 'physical', status: 'published' },
    });
    expect(response.lowStockRewards[0]).toMatchObject({
      type: 'physical',
      status: 'published',
      isLowStock: true,
    });
  });

  it('never exposes schoolId', () => {
    const response = presentRewardCatalogSummary({
      scope: {
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      dataset: {
        catalogItems: [catalogItem({ schoolId: 'school-secret' })],
        redemptions: [
          redemption({
            schoolId: 'school-secret',
            catalogItem: catalogItem({ schoolId: 'school-secret' }),
          }),
        ],
      },
    });

    expect(JSON.stringify(response)).not.toContain('schoolId');
    expect(JSON.stringify(response)).not.toContain('school-secret');
  });

  it('shapes student summary with null unavailable student name and code fields', () => {
    const response = presentStudentRewardsSummary({
      scope: {
        academicYearId: 'year-1',
        termId: 'term-1',
        studentId: 'student-1',
      },
      dataset: {
        student: student(),
        redemptions: [redemption()],
        catalogItems: [catalogItem()],
        openRedemptions: [],
        totalEarnedXp: 50,
      },
      includeCatalogEligibility: true,
      includeHistory: true,
    });

    expect(response.student).toEqual({
      id: 'student-1',
      firstName: 'Mona',
      lastName: 'Salem',
      nameAr: null,
      code: null,
      admissionNo: null,
    });
    expect(response.history).toHaveLength(1);
    expect(response.eligibility[0]).toMatchObject({
      catalogItemId: 'reward-1',
      type: 'physical',
      hasEnoughXp: true,
      stockAvailable: true,
      isEligible: true,
      lastRedemptionStatus: 'requested',
    });
  });

  it('shapes catalog summary with per-item redemption counters', () => {
    const response = presentRewardCatalogSummary({
      scope: {
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      dataset: {
        catalogItems: [
          catalogItem({ id: 'reward-1' }),
          catalogItem({
            id: 'reward-2',
            status: RewardCatalogItemStatus.DRAFT,
          }),
        ],
        redemptions: [
          redemption({ catalogItemId: 'reward-1' }),
          redemption({
            catalogItemId: 'reward-1',
            status: RewardRedemptionStatus.FULFILLED,
          }),
        ],
      },
    });

    expect(response.summary).toMatchObject({
      total: 2,
      draft: 1,
      published: 1,
      unlimited: 2,
      available: 1,
    });
    expect(response.items[0].redemptions).toMatchObject({
      total: 2,
      requested: 1,
      fulfilled: 1,
      open: 1,
      terminal: 1,
    });
  });

  it('hides history and eligibility rows when excluded', () => {
    const response = presentStudentRewardsSummary({
      scope: {
        academicYearId: null,
        termId: null,
        studentId: 'student-1',
      },
      dataset: {
        student: student(),
        redemptions: [redemption()],
        catalogItems: [catalogItem()],
        openRedemptions: [redemption()],
        totalEarnedXp: 50,
      },
      includeCatalogEligibility: false,
      includeHistory: false,
    });

    expect(response.history).toEqual([]);
    expect(response.eligibility).toEqual([]);
  });

  function catalogItem(overrides?: any) {
    return {
      id: overrides?.id ?? 'reward-1',
      schoolId: overrides?.schoolId ?? 'school-1',
      academicYearId: overrides?.academicYearId ?? 'year-1',
      termId: overrides?.termId ?? 'term-1',
      titleEn: overrides?.titleEn ?? 'Reward',
      titleAr: overrides?.titleAr ?? null,
      type: overrides?.type ?? RewardCatalogItemType.PHYSICAL,
      status: overrides?.status ?? RewardCatalogItemStatus.PUBLISHED,
      minTotalXp: overrides?.minTotalXp ?? 10,
      stockQuantity:
        overrides && Object.prototype.hasOwnProperty.call(overrides, 'stockQuantity')
          ? overrides.stockQuantity
          : null,
      stockRemaining:
        overrides &&
        Object.prototype.hasOwnProperty.call(overrides, 'stockRemaining')
          ? overrides.stockRemaining
          : null,
      isUnlimited: overrides?.isUnlimited ?? true,
      imageFileId: overrides?.imageFileId ?? null,
      sortOrder: overrides?.sortOrder ?? 0,
      publishedAt: overrides?.publishedAt ?? NOW,
      archivedAt: overrides?.archivedAt ?? null,
      createdAt: overrides?.createdAt ?? NOW,
      updatedAt: overrides?.updatedAt ?? NOW,
      deletedAt: overrides?.deletedAt ?? null,
    } as never;
  }

  function redemption(overrides?: any) {
    return {
      id: overrides?.id ?? 'redemption-1',
      schoolId: overrides?.schoolId ?? 'school-1',
      catalogItemId: overrides?.catalogItemId ?? 'reward-1',
      studentId: overrides?.studentId ?? 'student-1',
      enrollmentId: overrides?.enrollmentId ?? 'enrollment-1',
      academicYearId: overrides?.academicYearId ?? 'year-1',
      termId: overrides?.termId ?? 'term-1',
      status: overrides?.status ?? RewardRedemptionStatus.REQUESTED,
      requestSource:
        overrides?.requestSource ?? RewardRedemptionRequestSource.DASHBOARD,
      requestedAt: overrides?.requestedAt ?? NOW,
      reviewedAt: overrides?.reviewedAt ?? null,
      fulfilledAt: overrides?.fulfilledAt ?? null,
      cancelledAt: overrides?.cancelledAt ?? null,
      createdAt: overrides?.createdAt ?? NOW,
      updatedAt: overrides?.updatedAt ?? NOW,
      catalogItem:
        overrides?.catalogItem ??
        catalogItem({ id: overrides?.catalogItemId ?? 'reward-1' }),
      student: overrides?.student ?? student(),
    } as never;
  }

  function student(overrides?: any) {
    return {
      id: overrides?.id ?? 'student-1',
      firstName: overrides?.firstName ?? 'Mona',
      lastName: overrides?.lastName ?? 'Salem',
      status: overrides?.status ?? StudentStatus.ACTIVE,
      deletedAt: overrides?.deletedAt ?? null,
    } as never;
  }
});
