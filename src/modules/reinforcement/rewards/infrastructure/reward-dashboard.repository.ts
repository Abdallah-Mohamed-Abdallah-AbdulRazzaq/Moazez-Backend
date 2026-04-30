import { Injectable } from '@nestjs/common';
import {
  Prisma,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionStatus,
  XpSourceType,
} from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const XP_EARNED_SOURCE_TYPES = [
  XpSourceType.REINFORCEMENT_TASK,
  XpSourceType.MANUAL_BONUS,
  XpSourceType.HERO_MISSION,
];

const ACADEMIC_YEAR_SUMMARY_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  isActive: true,
} satisfies Prisma.AcademicYearSelect;

const TERM_SUMMARY_SELECT = {
  id: true,
  academicYearId: true,
  nameAr: true,
  nameEn: true,
  isActive: true,
} satisfies Prisma.TermSelect;

const STUDENT_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
  deletedAt: true,
} satisfies Prisma.StudentSelect;

const REWARD_DASHBOARD_CATALOG_ITEM_ARGS =
  Prisma.validator<Prisma.RewardCatalogItemDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      titleEn: true,
      titleAr: true,
      type: true,
      status: true,
      minTotalXp: true,
      stockQuantity: true,
      stockRemaining: true,
      isUnlimited: true,
      imageFileId: true,
      sortOrder: true,
      publishedAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });

const REWARD_DASHBOARD_REDEMPTION_ARGS =
  Prisma.validator<Prisma.RewardRedemptionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      catalogItemId: true,
      studentId: true,
      enrollmentId: true,
      academicYearId: true,
      termId: true,
      status: true,
      requestSource: true,
      requestedAt: true,
      reviewedAt: true,
      fulfilledAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
      catalogItem: REWARD_DASHBOARD_CATALOG_ITEM_ARGS,
      student: {
        select: STUDENT_SUMMARY_SELECT,
      },
    },
  });

export type RewardDashboardAcademicYearRecord =
  Prisma.AcademicYearGetPayload<{
    select: typeof ACADEMIC_YEAR_SUMMARY_SELECT;
  }>;
export type RewardDashboardTermRecord = Prisma.TermGetPayload<{
  select: typeof TERM_SUMMARY_SELECT;
}>;
export type RewardDashboardStudentRecord = Prisma.StudentGetPayload<{
  select: typeof STUDENT_SUMMARY_SELECT;
}>;
export type RewardDashboardCatalogItemRecord =
  Prisma.RewardCatalogItemGetPayload<
    typeof REWARD_DASHBOARD_CATALOG_ITEM_ARGS
  >;
export type RewardDashboardRedemptionRecord =
  Prisma.RewardRedemptionGetPayload<typeof REWARD_DASHBOARD_REDEMPTION_ARGS>;

export interface RewardDashboardXpStudentTotal {
  studentId: string;
  totalEarnedXp: number;
}

export interface RewardDashboardDateFilters {
  dateFrom?: Date;
  dateTo?: Date;
}

export interface RewardDashboardCatalogFilters {
  academicYearId?: string | null;
  termId?: string | null;
  status?: RewardCatalogItemStatus | null;
  type?: RewardCatalogItemType | null;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  onlyAvailable?: boolean;
}

export interface RewardDashboardRedemptionFilters
  extends RewardDashboardDateFilters {
  academicYearId?: string | null;
  termId?: string | null;
  studentId?: string | null;
  status?: RewardRedemptionStatus | null;
  type?: RewardCatalogItemType | null;
  catalogItemIds?: string[];
  includeArchived?: boolean;
}

export interface RewardDashboardXpFilters extends RewardDashboardDateFilters {
  academicYearId?: string | null;
  termId?: string | null;
  studentId?: string | null;
}

export interface RewardsOverviewReadFilters
  extends RewardDashboardRedemptionFilters,
    RewardDashboardXpFilters {
  includeArchived?: boolean;
}

export interface RewardsOverviewDataset {
  catalogItems: RewardDashboardCatalogItemRecord[];
  redemptions: RewardDashboardRedemptionRecord[];
  xpStudentTotals: RewardDashboardXpStudentTotal[];
  recentRedemptions: RewardDashboardRedemptionRecord[];
  lowStockCandidates: RewardDashboardCatalogItemRecord[];
}

export interface StudentRewardsSummaryDataset {
  student: RewardDashboardStudentRecord;
  redemptions: RewardDashboardRedemptionRecord[];
  catalogItems: RewardDashboardCatalogItemRecord[];
  openRedemptions: RewardDashboardRedemptionRecord[];
  totalEarnedXp: number;
}

export interface RewardCatalogSummaryDataset {
  catalogItems: RewardDashboardCatalogItemRecord[];
  redemptions: RewardDashboardRedemptionRecord[];
}

@Injectable()
export class RewardDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<RewardDashboardAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      select: ACADEMIC_YEAR_SUMMARY_SELECT,
    });
  }

  findTerm(termId: string): Promise<RewardDashboardTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      select: TERM_SUMMARY_SELECT,
    });
  }

  findStudent(
    studentId: string,
  ): Promise<RewardDashboardStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      select: STUDENT_SUMMARY_SELECT,
    });
  }

  async loadRewardsOverviewData(
    filters: RewardsOverviewReadFilters,
  ): Promise<RewardsOverviewDataset> {
    const [
      catalogItems,
      redemptions,
      xpStudentTotals,
      recentRedemptions,
      lowStockCandidates,
    ] = await Promise.all([
      this.loadCatalogItemsForScope({
        academicYearId: filters.academicYearId,
        termId: filters.termId,
        type: filters.type,
        includeArchived: filters.includeArchived,
      }),
      this.loadRedemptionsForScope(filters),
      this.loadStudentXpTotals(filters),
      this.loadRecentRedemptions(filters, 15),
      this.loadLowStockRewards(
        {
          academicYearId: filters.academicYearId,
          termId: filters.termId,
          type: filters.type,
        },
        20,
      ),
    ]);

    return {
      catalogItems,
      redemptions,
      xpStudentTotals,
      recentRedemptions,
      lowStockCandidates,
    };
  }

  async loadStudentRewardsSummaryData(params: {
    studentId: string;
    academicYearId?: string | null;
    termId?: string | null;
    dateFrom?: Date;
    dateTo?: Date;
    includeCatalogEligibility?: boolean;
  }): Promise<StudentRewardsSummaryDataset | null> {
    const student = await this.findStudent(params.studentId);
    if (!student) return null;

    const [redemptions, catalogItems, openRedemptions, totalEarnedXp] =
      await Promise.all([
        this.loadRedemptionsForScope({
          studentId: params.studentId,
          academicYearId: params.academicYearId,
          termId: params.termId,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
          includeArchived: true,
        }),
        params.includeCatalogEligibility === false
          ? Promise.resolve([])
          : this.loadCatalogItemsForScope({
              academicYearId: params.academicYearId,
              termId: params.termId,
              status: RewardCatalogItemStatus.PUBLISHED,
              includeArchived: false,
              onlyAvailable: false,
            }),
        this.loadOpenRedemptionsByStudent(params.studentId),
        this.loadStudentTotalEarnedXp({
          studentId: params.studentId,
          academicYearId: params.academicYearId,
          termId: params.termId,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
        }),
      ]);

    return {
      student,
      redemptions,
      catalogItems,
      openRedemptions,
      totalEarnedXp,
    };
  }

  async loadRewardCatalogSummaryData(
    filters: RewardDashboardCatalogFilters & RewardDashboardDateFilters,
  ): Promise<RewardCatalogSummaryDataset> {
    const catalogItems = await this.loadCatalogItemsForScope(filters);
    if (catalogItems.length === 0) {
      return { catalogItems, redemptions: [] };
    }

    const redemptions = await this.loadRedemptionsForScope({
      academicYearId: filters.academicYearId,
      termId: filters.termId,
      catalogItemIds: catalogItems.map((item) => item.id),
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      includeArchived: true,
    });

    return { catalogItems, redemptions };
  }

  async loadStudentTotalEarnedXp(
    filters: RewardDashboardXpFilters & { studentId: string },
  ): Promise<number> {
    const result = await this.scopedPrisma.xpLedger.aggregate({
      where: this.buildXpWhere(filters),
      _sum: { amount: true },
    });

    return Math.max(0, result._sum.amount ?? 0);
  }

  async loadStudentXpEntries(
    filters: RewardDashboardXpFilters & { studentId: string },
  ) {
    return this.scopedPrisma.xpLedger.findMany({
      where: this.buildXpWhere(filters),
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        studentId: true,
        academicYearId: true,
        termId: true,
        sourceType: true,
        sourceId: true,
        amount: true,
        occurredAt: true,
      },
    });
  }

  async loadStudentXpTotals(
    filters: RewardDashboardXpFilters,
  ): Promise<RewardDashboardXpStudentTotal[]> {
    const groups = await this.scopedPrisma.xpLedger.groupBy({
      by: ['studentId'],
      where: this.buildXpWhere(filters),
      _sum: { amount: true },
    });

    return groups.map((group) => ({
      studentId: group.studentId,
      totalEarnedXp: Math.max(0, group._sum.amount ?? 0),
    }));
  }

  loadRedemptionsForScope(
    filters: RewardDashboardRedemptionFilters,
  ): Promise<RewardDashboardRedemptionRecord[]> {
    if (filters.catalogItemIds && filters.catalogItemIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.scopedPrisma.rewardRedemption.findMany({
      where: this.buildRedemptionWhere(filters),
      orderBy: [{ requestedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...REWARD_DASHBOARD_REDEMPTION_ARGS,
    });
  }

  loadCatalogItemsForScope(
    filters: RewardDashboardCatalogFilters,
  ): Promise<RewardDashboardCatalogItemRecord[]> {
    const query = () =>
      this.scopedPrisma.rewardCatalogItem.findMany({
        where: this.buildCatalogWhere(filters),
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        ...REWARD_DASHBOARD_CATALOG_ITEM_ARGS,
      });

    return filters.includeDeleted ? withSoftDeleted(query) : query();
  }

  loadOpenRedemptionsByStudent(
    studentId: string,
  ): Promise<RewardDashboardRedemptionRecord[]> {
    return this.scopedPrisma.rewardRedemption.findMany({
      where: {
        studentId,
        status: {
          in: [
            RewardRedemptionStatus.REQUESTED,
            RewardRedemptionStatus.APPROVED,
          ],
        },
      },
      orderBy: [{ requestedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...REWARD_DASHBOARD_REDEMPTION_ARGS,
    });
  }

  loadRecentRedemptions(
    filters: RewardDashboardRedemptionFilters,
    limit = 15,
  ): Promise<RewardDashboardRedemptionRecord[]> {
    return this.scopedPrisma.rewardRedemption.findMany({
      where: this.buildRedemptionWhere(filters),
      orderBy: [{ requestedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
      ...REWARD_DASHBOARD_REDEMPTION_ARGS,
    });
  }

  loadLowStockRewards(
    filters: RewardDashboardCatalogFilters,
    limit = 20,
  ): Promise<RewardDashboardCatalogItemRecord[]> {
    return this.scopedPrisma.rewardCatalogItem.findMany({
      where: {
        ...this.buildCatalogWhere({
          academicYearId: filters.academicYearId,
          termId: filters.termId,
          type: filters.type,
          status: RewardCatalogItemStatus.PUBLISHED,
          includeArchived: false,
          onlyAvailable: false,
        }),
        isUnlimited: false,
        stockRemaining: { gt: 0 },
      },
      orderBy: [{ stockRemaining: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      take: limit,
      ...REWARD_DASHBOARD_CATALOG_ITEM_ARGS,
    });
  }

  private buildCatalogWhere(
    filters: RewardDashboardCatalogFilters,
  ): Prisma.RewardCatalogItemWhereInput {
    const and: Prisma.RewardCatalogItemWhereInput[] = [];

    if (!filters.status && !filters.includeArchived) {
      and.push({ status: { not: RewardCatalogItemStatus.ARCHIVED } });
    }

    if (filters.onlyAvailable) {
      and.push({
        status: RewardCatalogItemStatus.PUBLISHED,
        deletedAt: null,
        OR: [{ isUnlimited: true }, { stockRemaining: { gt: 0 } }],
      });
    }

    return {
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildRedemptionWhere(
    filters: RewardDashboardRedemptionFilters,
  ): Prisma.RewardRedemptionWhereInput {
    const and: Prisma.RewardRedemptionWhereInput[] = [];

    if (filters.dateFrom || filters.dateTo) {
      and.push({
        requestedAt: {
          ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
          ...(filters.dateTo ? { lte: filters.dateTo } : {}),
        },
      });
    }

    if (filters.type || filters.includeArchived === false) {
      and.push({
        catalogItem: {
          ...(filters.type ? { type: filters.type } : {}),
          ...(filters.includeArchived === false
            ? {
                status: { not: RewardCatalogItemStatus.ARCHIVED },
                deletedAt: null,
              }
            : {}),
        },
      });
    }

    return {
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.catalogItemIds
        ? { catalogItemId: { in: filters.catalogItemIds } }
        : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildXpWhere(
    filters: RewardDashboardXpFilters,
  ): Prisma.XpLedgerWhereInput {
    return {
      amount: { gt: 0 },
      sourceType: { in: XP_EARNED_SOURCE_TYPES },
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            occurredAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
    };
  }
}
