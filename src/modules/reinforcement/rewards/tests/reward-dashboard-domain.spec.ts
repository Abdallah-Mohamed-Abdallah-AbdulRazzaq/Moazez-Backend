import {
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionStatus,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  assertValidRewardDashboardDateRange,
  buildTopRequestedRewards,
  calculateAverageEarnedXp,
  calculateRewardFulfillmentRate,
  deriveCatalogItemAvailability,
  deriveStudentRewardEligibility,
  sortTopRequestedRewards,
  summarizeRedemptionStatuses,
  summarizeRewardAvailability,
  summarizeRewardCatalogStatuses,
  summarizeRewardCatalogTypes,
} from '../domain/reward-dashboard-domain';

describe('Reward dashboard domain helpers', () => {
  it('catalog status summary maps counts correctly', () => {
    expect(
      summarizeRewardCatalogStatuses([
        catalogItem({ status: RewardCatalogItemStatus.DRAFT }),
        catalogItem({ status: RewardCatalogItemStatus.PUBLISHED }),
        catalogItem({ status: RewardCatalogItemStatus.PUBLISHED }),
        catalogItem({ status: RewardCatalogItemStatus.ARCHIVED }),
      ]),
    ).toEqual({
      total: 4,
      draft: 1,
      published: 2,
      archived: 1,
    });
  });

  it('catalog type summary maps counts correctly', () => {
    expect(
      summarizeRewardCatalogTypes([
        catalogItem({ type: RewardCatalogItemType.PHYSICAL }),
        catalogItem({ type: RewardCatalogItemType.DIGITAL }),
        catalogItem({ type: RewardCatalogItemType.PRIVILEGE }),
        catalogItem({ type: RewardCatalogItemType.CERTIFICATE }),
        catalogItem({ type: RewardCatalogItemType.OTHER }),
        catalogItem({ type: RewardCatalogItemType.OTHER }),
      ]),
    ).toEqual({
      physical: 1,
      digital: 1,
      privilege: 1,
      certificate: 1,
      other: 2,
    });
  });

  it('availability summary handles unlimited rewards', () => {
    const state = deriveCatalogItemAvailability(
      catalogItem({
        status: RewardCatalogItemStatus.PUBLISHED,
        isUnlimited: true,
        stockQuantity: null,
        stockRemaining: null,
      }),
    );

    expect(state).toMatchObject({
      isAvailable: true,
      isUnlimited: true,
      isLowStock: false,
      isOutOfStock: false,
    });
  });

  it('availability summary handles limited in-stock rewards', () => {
    const state = deriveCatalogItemAvailability(
      catalogItem({
        status: RewardCatalogItemStatus.PUBLISHED,
        isUnlimited: false,
        stockQuantity: 20,
        stockRemaining: 8,
      }),
    );

    expect(state).toMatchObject({
      isAvailable: true,
      isLowStock: false,
      isOutOfStock: false,
    });
  });

  it('availability summary handles limited out-of-stock rewards', () => {
    const state = deriveCatalogItemAvailability(
      catalogItem({
        status: RewardCatalogItemStatus.PUBLISHED,
        isUnlimited: false,
        stockQuantity: 20,
        stockRemaining: 0,
      }),
    );

    expect(state).toMatchObject({
      isAvailable: false,
      isLowStock: false,
      isOutOfStock: true,
    });
  });

  it('low stock rule is deterministic', () => {
    expect(
      deriveCatalogItemAvailability(
        catalogItem({
          isUnlimited: false,
          stockQuantity: 100,
          stockRemaining: 20,
        }),
      ).isLowStock,
    ).toBe(true);
    expect(
      deriveCatalogItemAvailability(
        catalogItem({
          isUnlimited: false,
          stockQuantity: 100,
          stockRemaining: 21,
        }),
      ).isLowStock,
    ).toBe(false);
    expect(
      deriveCatalogItemAvailability(
        catalogItem({
          isUnlimited: false,
          stockQuantity: 50,
          stockRemaining: 5,
        }),
      ).isLowStock,
    ).toBe(true);
  });

  it('availability summary aggregates stock states', () => {
    expect(
      summarizeRewardAvailability([
        catalogItem({ isUnlimited: true }),
        catalogItem({
          isUnlimited: false,
          stockQuantity: 10,
          stockRemaining: 2,
        }),
        catalogItem({
          isUnlimited: false,
          stockQuantity: 10,
          stockRemaining: 0,
        }),
      ]),
    ).toEqual({
      unlimited: 1,
      limited: 2,
      available: 2,
      outOfStock: 1,
      lowStock: 1,
    });
  });

  it('redemption status summary maps requested/approved/rejected/fulfilled/cancelled', () => {
    const summary = summarizeRedemptionStatuses([
      redemption({ status: RewardRedemptionStatus.REQUESTED }),
      redemption({ status: RewardRedemptionStatus.APPROVED }),
      redemption({ status: RewardRedemptionStatus.REJECTED }),
      redemption({ status: RewardRedemptionStatus.FULFILLED }),
      redemption({ status: RewardRedemptionStatus.CANCELLED }),
      redemption({ status: RewardRedemptionStatus.FULFILLED }),
    ]);

    expect(summary).toMatchObject({
      total: 6,
      requested: 1,
      approved: 1,
      rejected: 1,
      fulfilled: 2,
      cancelled: 1,
    });
  });

  it('open and terminal counts are correct', () => {
    expect(
      summarizeRedemptionStatuses([
        redemption({ status: RewardRedemptionStatus.REQUESTED }),
        redemption({ status: RewardRedemptionStatus.APPROVED }),
        redemption({ status: RewardRedemptionStatus.REJECTED }),
        redemption({ status: RewardRedemptionStatus.FULFILLED }),
        redemption({ status: RewardRedemptionStatus.CANCELLED }),
      ]),
    ).toMatchObject({ open: 2, terminal: 3 });
  });

  it('fulfillment rate returns 0 for zero total', () => {
    expect(calculateRewardFulfillmentRate(0, 0)).toBe(0);
  });

  it('fulfillment rate calculates fulfilled divided by total', () => {
    expect(calculateRewardFulfillmentRate(2, 5)).toBe(0.4);
  });

  it('XP average returns 0 for zero students', () => {
    expect(calculateAverageEarnedXp(100, 0)).toBe(0);
  });

  it('XP average calculates earned XP per student with XP', () => {
    expect(calculateAverageEarnedXp(101, 2)).toBe(50.5);
  });

  it('top requested rewards sorted by total requests then fulfilled then title/id', () => {
    const rows = buildTopRequestedRewards([
      redemption({
        catalogItemId: 'reward-a',
        status: RewardRedemptionStatus.REQUESTED,
        catalogItem: catalogItem({ id: 'reward-a', titleEn: 'Beta' }),
      }),
      redemption({
        catalogItemId: 'reward-a',
        status: RewardRedemptionStatus.REQUESTED,
        catalogItem: catalogItem({ id: 'reward-a', titleEn: 'Beta' }),
      }),
      redemption({
        catalogItemId: 'reward-b',
        status: RewardRedemptionStatus.FULFILLED,
        catalogItem: catalogItem({ id: 'reward-b', titleEn: 'Alpha' }),
      }),
      redemption({
        catalogItemId: 'reward-b',
        status: RewardRedemptionStatus.REQUESTED,
        catalogItem: catalogItem({ id: 'reward-b', titleEn: 'Alpha' }),
      }),
      redemption({
        catalogItemId: 'reward-c',
        status: RewardRedemptionStatus.CANCELLED,
        catalogItem: catalogItem({ id: 'reward-c', titleEn: 'Gamma' }),
      }),
      redemption({
        catalogItemId: 'reward-c',
        status: RewardRedemptionStatus.FULFILLED,
        catalogItem: catalogItem({ id: 'reward-c', titleEn: 'Gamma' }),
      }),
      redemption({
        catalogItemId: 'reward-c',
        status: RewardRedemptionStatus.REQUESTED,
        catalogItem: catalogItem({ id: 'reward-c', titleEn: 'Gamma' }),
      }),
    ]);

    expect(rows.map((row) => row.catalogItemId)).toEqual([
      'reward-c',
      'reward-b',
      'reward-a',
    ]);
  });

  it('sortTopRequestedRewards uses id as final tie breaker', () => {
    expect(
      sortTopRequestedRewards([
        topRow({ catalogItemId: 'reward-b', titleEn: 'Same' }),
        topRow({ catalogItemId: 'reward-a', titleEn: 'Same' }),
      ]).map((row) => row.catalogItemId),
    ).toEqual(['reward-a', 'reward-b']);
  });

  it('student eligibility requires enough XP', () => {
    expect(
      deriveStudentRewardEligibility({
        item: catalogItem({ minTotalXp: 50 }),
        totalEarnedXp: 49,
      }),
    ).toMatchObject({ hasEnoughXp: false, isEligible: false });
  });

  it('student eligibility requires stock available', () => {
    expect(
      deriveStudentRewardEligibility({
        item: catalogItem({
          isUnlimited: false,
          stockQuantity: 3,
          stockRemaining: 0,
        }),
        totalEarnedXp: 100,
      }),
    ).toMatchObject({ stockAvailable: false, isEligible: false });
  });

  it('student eligibility rejects open redemption', () => {
    expect(
      deriveStudentRewardEligibility({
        item: catalogItem(),
        totalEarnedXp: 100,
        openRedemption: { id: 'redemption-open' },
      }),
    ).toMatchObject({
      hasOpenRedemption: true,
      openRedemptionId: 'redemption-open',
      isEligible: false,
    });
  });

  it('student eligibility treats null minTotalXp as 0', () => {
    expect(
      deriveStudentRewardEligibility({
        item: catalogItem({ minTotalXp: null }),
        totalEarnedXp: 0,
      }),
    ).toMatchObject({
      minTotalXp: 0,
      hasEnoughXp: true,
      isEligible: true,
    });
  });

  it('invalid date range rejects', () => {
    expect(() =>
      assertValidRewardDashboardDateRange({
        dateFrom: new Date('2026-05-01T00:00:00.000Z'),
        dateTo: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ).toThrow(ValidationDomainException);
  });

  function catalogItem(overrides?: any) {
    return {
      id: overrides?.id ?? 'reward-1',
      titleEn: overrides?.titleEn ?? 'Reward',
      titleAr: overrides?.titleAr ?? null,
      type: overrides?.type ?? RewardCatalogItemType.PHYSICAL,
      status: overrides?.status ?? RewardCatalogItemStatus.PUBLISHED,
      minTotalXp:
        overrides && Object.prototype.hasOwnProperty.call(overrides, 'minTotalXp')
          ? overrides.minTotalXp
          : 10,
      isUnlimited: overrides?.isUnlimited ?? true,
      stockQuantity:
        overrides && Object.prototype.hasOwnProperty.call(overrides, 'stockQuantity')
          ? overrides.stockQuantity
          : null,
      stockRemaining:
        overrides &&
        Object.prototype.hasOwnProperty.call(overrides, 'stockRemaining')
          ? overrides.stockRemaining
          : null,
      deletedAt: overrides?.deletedAt ?? null,
      archivedAt: overrides?.archivedAt ?? null,
    };
  }

  function redemption(overrides?: any) {
    return {
      id: overrides?.id ?? 'redemption-1',
      catalogItemId: overrides?.catalogItemId ?? 'reward-1',
      studentId: overrides?.studentId ?? 'student-1',
      status: overrides?.status ?? RewardRedemptionStatus.REQUESTED,
      requestedAt: overrides?.requestedAt ?? new Date('2026-04-30T00:00:00.000Z'),
      catalogItem: overrides?.catalogItem ?? catalogItem(),
    };
  }

  function topRow(overrides?: any) {
    return {
      catalogItemId: overrides?.catalogItemId ?? 'reward-1',
      titleEn: overrides?.titleEn ?? 'Reward',
      titleAr: null,
      type: RewardCatalogItemType.PHYSICAL,
      status: RewardCatalogItemStatus.PUBLISHED,
      totalRequests: 1,
      approved: 0,
      fulfilled: 0,
      rejected: 0,
      cancelled: 0,
      ...overrides,
    };
  }
});
