import {
  buildTopRequestedRewards,
  calculateAverageEarnedXp,
  calculateRewardFulfillmentRate,
  deriveCatalogItemAvailability,
  deriveStudentRewardEligibility,
  sortLowStockRewards,
  summarizeRedemptionStatuses,
  summarizeRewardAvailability,
  summarizeRewardCatalogStatuses,
  summarizeRewardCatalogTypes,
  summarizeStudentRedemptions,
} from '../domain/reward-dashboard-domain';
import {
  RewardCatalogSummaryDataset,
  RewardDashboardCatalogItemRecord,
  RewardDashboardRedemptionRecord,
  RewardsOverviewDataset,
  StudentRewardsSummaryDataset,
} from '../infrastructure/reward-dashboard.repository';

export interface RewardDashboardResponseScope {
  academicYearId: string | null;
  termId: string | null;
  studentId?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
}

export function presentRewardsOverview(params: {
  scope: RewardDashboardResponseScope;
  dataset: RewardsOverviewDataset;
}) {
  const catalogStatuses = summarizeRewardCatalogStatuses(
    params.dataset.catalogItems,
  );
  const catalogTypes = summarizeRewardCatalogTypes(params.dataset.catalogItems);
  const catalogAvailability = summarizeRewardAvailability(
    params.dataset.catalogItems,
  );
  const redemptions = summarizeRedemptionStatuses(params.dataset.redemptions);
  const totalEarnedXp = params.dataset.xpStudentTotals.reduce(
    (sum, row) => sum + row.totalEarnedXp,
    0,
  );
  const studentsWithXp = params.dataset.xpStudentTotals.length;

  return {
    scope: presentScope(params.scope),
    catalog: {
      ...catalogStatuses,
      ...catalogTypes,
      ...catalogAvailability,
    },
    redemptions,
    fulfillment: {
      fulfillmentRate: calculateRewardFulfillmentRate(
        redemptions.fulfilled,
        redemptions.total,
      ),
      pendingReview: redemptions.requested,
      pendingFulfillment: redemptions.approved,
    },
    xp: {
      totalEarnedXp,
      studentsWithXp,
      averageEarnedXp: calculateAverageEarnedXp(
        totalEarnedXp,
        studentsWithXp,
      ),
    },
    topRequestedRewards: buildTopRequestedRewards(
      params.dataset.redemptions,
      10,
    ).map((row) => ({
      ...row,
      type: presentEnum(row.type),
      status: presentEnum(row.status),
    })),
    recentRedemptions: params.dataset.recentRedemptions.map((redemption) =>
      presentCompactRedemption(redemption),
    ),
    lowStockRewards: sortLowStockRewards(
      params.dataset.lowStockCandidates.filter(
        (item) => deriveCatalogItemAvailability(item).isLowStock,
      ),
    )
      .slice(0, 15)
      .map((item) => presentCompactCatalogItem(item)),
  };
}

export function presentStudentRewardsSummary(params: {
  scope: RewardDashboardResponseScope;
  dataset: StudentRewardsSummaryDataset;
  includeCatalogEligibility: boolean;
  includeHistory: boolean;
}) {
  const redemptionsByCatalogItem = groupBy(
    params.dataset.redemptions,
    (redemption) => redemption.catalogItemId,
  );
  const openRedemptionByCatalogItem = new Map(
    params.dataset.openRedemptions.map((redemption) => [
      redemption.catalogItemId,
      redemption,
    ]),
  );

  return {
    student: presentStudent(params.dataset.student),
    scope: presentScope(params.scope),
    xp: {
      totalEarnedXp: params.dataset.totalEarnedXp,
    },
    redemptionsSummary: summarizeStudentRedemptions(
      params.dataset.redemptions,
    ),
    history: params.includeHistory
      ? params.dataset.redemptions.map((redemption) =>
          presentCompactRedemption(redemption),
        )
      : [],
    eligibility: params.includeCatalogEligibility
      ? params.dataset.catalogItems.map((item) => {
          const itemRedemptions = redemptionsByCatalogItem.get(item.id) ?? [];
          const latestRedemption = itemRedemptions[0] ?? null;
          const openRedemption = openRedemptionByCatalogItem.get(item.id) ?? null;
          const eligibility = deriveStudentRewardEligibility({
            item,
            totalEarnedXp: params.dataset.totalEarnedXp,
            openRedemption,
            lastRedemption: latestRedemption,
          });

          return {
            ...eligibility,
            type: presentEnum(eligibility.type),
          };
        })
      : [],
  };
}

export function presentRewardCatalogSummary(params: {
  scope: RewardDashboardResponseScope;
  dataset: RewardCatalogSummaryDataset;
}) {
  const catalogStatuses = summarizeRewardCatalogStatuses(
    params.dataset.catalogItems,
  );
  const catalogAvailability = summarizeRewardAvailability(
    params.dataset.catalogItems,
  );
  const redemptionsByCatalogItem = groupBy(
    params.dataset.redemptions,
    (redemption) => redemption.catalogItemId,
  );

  return {
    scope: presentScope(params.scope),
    summary: {
      ...catalogStatuses,
      available: catalogAvailability.available,
      outOfStock: catalogAvailability.outOfStock,
      lowStock: catalogAvailability.lowStock,
      unlimited: catalogAvailability.unlimited,
      limited: catalogAvailability.limited,
    },
    items: params.dataset.catalogItems.map((item) => {
      const availability = deriveCatalogItemAvailability(item);
      const redemptions = summarizeRedemptionStatuses(
        redemptionsByCatalogItem.get(item.id) ?? [],
      );

      return {
        id: item.id,
        titleEn: item.titleEn,
        titleAr: item.titleAr,
        type: presentEnum(item.type),
        status: presentEnum(item.status),
        minTotalXp: item.minTotalXp,
        isUnlimited: item.isUnlimited,
        stockQuantity: availability.stockQuantity,
        stockRemaining: availability.stockRemaining,
        isAvailable: availability.isAvailable,
        isLowStock: availability.isLowStock,
        redemptions,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        publishedAt: presentNullableDate(item.publishedAt),
        archivedAt: presentNullableDate(item.archivedAt),
      };
    }),
  };
}

function presentCompactCatalogItem(item: RewardDashboardCatalogItemRecord) {
  const availability = deriveCatalogItemAvailability(item);

  return {
    id: item.id,
    titleEn: item.titleEn,
    titleAr: item.titleAr,
    type: presentEnum(item.type),
    status: presentEnum(item.status),
    minTotalXp: item.minTotalXp,
    isUnlimited: item.isUnlimited,
    stockQuantity: availability.stockQuantity,
    stockRemaining: availability.stockRemaining,
    isAvailable: availability.isAvailable,
    isLowStock: availability.isLowStock,
  };
}

function presentCompactRedemption(redemption: RewardDashboardRedemptionRecord) {
  return {
    id: redemption.id,
    status: presentEnum(redemption.status),
    catalogItemId: redemption.catalogItemId,
    studentId: redemption.studentId,
    requestedAt: redemption.requestedAt.toISOString(),
    reviewedAt: presentNullableDate(redemption.reviewedAt),
    fulfilledAt: presentNullableDate(redemption.fulfilledAt),
    cancelledAt: presentNullableDate(redemption.cancelledAt),
    catalogItem: presentCompactCatalogItem(redemption.catalogItem),
    student: presentStudent(redemption.student),
  };
}

function presentStudent(student: {
  id: string;
  firstName: string;
  lastName: string;
}) {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    nameAr: null,
    code: null,
    admissionNo: null,
  };
}

function presentScope(scope: RewardDashboardResponseScope) {
  return {
    academicYearId: scope.academicYearId ?? null,
    termId: scope.termId ?? null,
    studentId: scope.studentId ?? null,
    dateFrom: presentNullableDate(scope.dateFrom ?? null),
    dateTo: presentNullableDate(scope.dateTo ?? null),
  };
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function groupBy<T>(rows: T[], getKey: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}
