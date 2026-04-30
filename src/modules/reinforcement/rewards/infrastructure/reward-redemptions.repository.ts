import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  Prisma,
  RewardCatalogItemStatus,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
  StudentEnrollmentStatus,
  UserType,
} from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  RewardInvalidStatusTransitionException,
  RewardOutOfStockException,
  RewardRedemptionNotApprovedException,
  RewardRedemptionNotRequestedException,
  assertRewardStillRequestableForApproval,
  buildApprovalEligibilitySnapshot,
} from '../domain/reward-redemptions-domain';

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

const REDEMPTION_CATALOG_ITEM_SELECT = {
  id: true,
  schoolId: true,
  academicYearId: true,
  termId: true,
  titleEn: true,
  titleAr: true,
  type: true,
  status: true,
  minTotalXp: true,
  isUnlimited: true,
  stockQuantity: true,
  stockRemaining: true,
  imageFileId: true,
  deletedAt: true,
} satisfies Prisma.RewardCatalogItemSelect;

const STUDENT_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
  deletedAt: true,
} satisfies Prisma.StudentSelect;

const ENROLLMENT_SUMMARY_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      status: true,
      enrolledAt: true,
      deletedAt: true,
      classroom: {
        select: {
          id: true,
          sectionId: true,
          section: {
            select: {
              id: true,
              gradeId: true,
              grade: {
                select: {
                  id: true,
                  stageId: true,
                },
              },
            },
          },
        },
      },
    },
  });

const REWARD_REDEMPTION_ARGS =
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
      requestedById: true,
      reviewedById: true,
      fulfilledById: true,
      cancelledById: true,
      requestedAt: true,
      reviewedAt: true,
      fulfilledAt: true,
      cancelledAt: true,
      requestNoteEn: true,
      requestNoteAr: true,
      reviewNoteEn: true,
      reviewNoteAr: true,
      fulfillmentNoteEn: true,
      fulfillmentNoteAr: true,
      cancellationReasonEn: true,
      cancellationReasonAr: true,
      eligibilitySnapshot: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      catalogItem: {
        select: REDEMPTION_CATALOG_ITEM_SELECT,
      },
      student: {
        select: STUDENT_SUMMARY_SELECT,
      },
      enrollment: ENROLLMENT_SUMMARY_ARGS,
      academicYear: {
        select: ACADEMIC_YEAR_SUMMARY_SELECT,
      },
      term: {
        select: TERM_SUMMARY_SELECT,
      },
    },
  });

export type RewardRedemptionRecord = Prisma.RewardRedemptionGetPayload<
  typeof REWARD_REDEMPTION_ARGS
>;
export type RewardRedemptionCatalogItemRecord =
  Prisma.RewardCatalogItemGetPayload<{
    select: typeof REDEMPTION_CATALOG_ITEM_SELECT;
  }>;
export type RewardRedemptionStudentRecord = Prisma.StudentGetPayload<{
  select: typeof STUDENT_SUMMARY_SELECT;
}>;
export type RewardRedemptionEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof ENROLLMENT_SUMMARY_ARGS
>;
export type RewardRedemptionAcademicYearRecord = Prisma.AcademicYearGetPayload<{
  select: typeof ACADEMIC_YEAR_SUMMARY_SELECT;
}>;
export type RewardRedemptionTermRecord = Prisma.TermGetPayload<{
  select: typeof TERM_SUMMARY_SELECT;
}>;

export interface ListRewardRedemptionsFilters {
  status?: RewardRedemptionStatus;
  catalogItemId?: string;
  studentId?: string;
  academicYearId?: string;
  termId?: string;
  requestSource?: RewardRedemptionRequestSource;
  requestedFrom?: Date;
  requestedTo?: Date;
  includeTerminal?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface RewardAuditLogInput {
  actorId?: string | null;
  userType?: UserType | null;
  organizationId?: string | null;
  schoolId?: string | null;
  module: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface CreateRewardRedemptionInput {
  schoolId: string;
  data: {
    catalogItemId: string;
    studentId: string;
    enrollmentId?: string | null;
    academicYearId?: string | null;
    termId?: string | null;
    status: RewardRedemptionStatus;
    requestSource: RewardRedemptionRequestSource;
    requestedById: string;
    requestedAt: Date;
    requestNoteEn?: string | null;
    requestNoteAr?: string | null;
    eligibilitySnapshot: Record<string, unknown>;
    metadata?: Record<string, unknown> | null;
  };
  audit: RewardAuditLogInput;
}

export interface CancelRewardRedemptionInput {
  schoolId: string;
  redemptionId: string;
  cancelledById: string;
  cancelledAt: Date;
  cancellationReasonEn?: string | null;
  cancellationReasonAr?: string | null;
  metadata?: Record<string, unknown> | null;
  audit: RewardAuditLogInput;
}

export interface ApproveRewardRedemptionInput {
  schoolId: string;
  redemptionId: string;
  catalogItemId: string;
  reviewedById: string;
  reviewedAt: Date;
  reviewNoteEn?: string | null;
  reviewNoteAr?: string | null;
  metadata?: Record<string, unknown> | null;
  previousEligibilitySnapshot?: Record<string, unknown> | null;
  totalEarnedXp: number;
  audit: RewardAuditLogInput;
}

export interface RejectRewardRedemptionInput {
  schoolId: string;
  redemptionId: string;
  reviewedById: string;
  reviewedAt: Date;
  reviewNoteEn?: string | null;
  reviewNoteAr?: string | null;
  metadata?: Record<string, unknown> | null;
  audit: RewardAuditLogInput;
}

export interface FulfillRewardRedemptionInput {
  schoolId: string;
  redemptionId: string;
  fulfilledById: string;
  fulfilledAt: Date;
  fulfillmentNoteEn?: string | null;
  fulfillmentNoteAr?: string | null;
  metadata?: Record<string, unknown> | null;
  audit: RewardAuditLogInput;
}

@Injectable()
export class RewardRedemptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listRedemptions(filters: ListRewardRedemptionsFilters): Promise<{
    items: RewardRedemptionRecord[];
    total: number;
    statusCounts: Partial<Record<RewardRedemptionStatus, number>>;
  }> {
    const where = this.buildListWhere(filters);
    const [items, total, statusGroups] = await Promise.all([
      this.scopedPrisma.rewardRedemption.findMany({
        where,
        orderBy: [
          { requestedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        ...(filters.limit !== undefined ? { take: filters.limit } : {}),
        ...(filters.offset !== undefined ? { skip: filters.offset } : {}),
        ...REWARD_REDEMPTION_ARGS,
      }),
      this.scopedPrisma.rewardRedemption.count({ where }),
      this.scopedPrisma.rewardRedemption.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
    ]);

    return {
      items,
      total,
      statusCounts: Object.fromEntries(
        statusGroups.map((group) => [group.status, group._count._all]),
      ),
    };
  }

  findRedemptionById(
    redemptionId: string,
  ): Promise<RewardRedemptionRecord | null> {
    return this.scopedPrisma.rewardRedemption.findFirst({
      where: { id: redemptionId },
      ...REWARD_REDEMPTION_ARGS,
    });
  }

  findCatalogItemForRedemption(
    catalogItemId: string,
  ): Promise<RewardRedemptionCatalogItemRecord | null> {
    return this.scopedPrisma.rewardCatalogItem.findFirst({
      where: { id: catalogItemId },
      select: REDEMPTION_CATALOG_ITEM_SELECT,
    });
  }

  findCatalogItemForReview(
    catalogItemId: string,
  ): Promise<RewardRedemptionCatalogItemRecord | null> {
    const query = () =>
      this.scopedPrisma.rewardCatalogItem.findFirst({
        where: { id: catalogItemId },
        select: REDEMPTION_CATALOG_ITEM_SELECT,
      });

    return withSoftDeleted(query);
  }

  findStudent(
    studentId: string,
  ): Promise<RewardRedemptionStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      select: STUDENT_SUMMARY_SELECT,
    });
  }

  findEnrollmentForStudent(params: {
    enrollmentId: string;
    studentId: string;
  }): Promise<RewardRedemptionEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        id: params.enrollmentId,
        studentId: params.studentId,
      },
      ...ENROLLMENT_SUMMARY_ARGS,
    });
  }

  resolveActiveEnrollmentForStudent(params: {
    studentId: string;
    academicYearId?: string | null;
    termId?: string | null;
  }): Promise<RewardRedemptionEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        studentId: params.studentId,
        status: StudentEnrollmentStatus.ACTIVE,
        ...(params.academicYearId
          ? { academicYearId: params.academicYearId }
          : {}),
        ...(params.termId ? { termId: params.termId } : {}),
      },
      orderBy: [{ enrolledAt: 'desc' }, { id: 'asc' }],
      ...ENROLLMENT_SUMMARY_ARGS,
    });
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<RewardRedemptionAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      select: ACADEMIC_YEAR_SUMMARY_SELECT,
    });
  }

  findTerm(termId: string): Promise<RewardRedemptionTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      select: TERM_SUMMARY_SELECT,
    });
  }

  findOpenRedemption(params: {
    catalogItemId: string;
    studentId: string;
  }): Promise<RewardRedemptionRecord | null> {
    return this.scopedPrisma.rewardRedemption.findFirst({
      where: {
        catalogItemId: params.catalogItemId,
        studentId: params.studentId,
        status: {
          in: [
            RewardRedemptionStatus.REQUESTED,
            RewardRedemptionStatus.APPROVED,
          ],
        },
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      ...REWARD_REDEMPTION_ARGS,
    });
  }

  async calculateStudentTotalEarnedXp(studentId: string): Promise<number> {
    const result = await this.scopedPrisma.xpLedger.aggregate({
      where: {
        studentId,
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    });

    return Math.max(0, result._sum.amount ?? 0);
  }

  async createRedemption(
    input: CreateRewardRedemptionInput,
  ): Promise<RewardRedemptionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const redemption = await tx.rewardRedemption.create({
        data: {
          schoolId: input.schoolId,
          catalogItemId: input.data.catalogItemId,
          studentId: input.data.studentId,
          enrollmentId: input.data.enrollmentId ?? null,
          academicYearId: input.data.academicYearId ?? null,
          termId: input.data.termId ?? null,
          status: input.data.status,
          requestSource: input.data.requestSource,
          requestedById: input.data.requestedById,
          requestedAt: input.data.requestedAt,
          requestNoteEn: input.data.requestNoteEn ?? null,
          requestNoteAr: input.data.requestNoteAr ?? null,
          eligibilitySnapshot: input.data
            .eligibilitySnapshot as Prisma.InputJsonValue,
          metadata: toNullableJson(input.data.metadata),
        },
        select: { id: true },
      });

      await this.createAuditLogInTransaction(tx, {
        ...input.audit,
        resourceId: redemption.id,
      });

      return this.findRedemptionInTransaction(
        tx,
        input.schoolId,
        redemption.id,
      );
    });
  }

  async cancelRedemption(
    input: CancelRewardRedemptionInput,
  ): Promise<RewardRedemptionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.rewardRedemption.updateMany({
        where: {
          id: input.redemptionId,
          schoolId: input.schoolId,
          status: RewardRedemptionStatus.REQUESTED,
        },
        data: {
          status: RewardRedemptionStatus.CANCELLED,
          cancelledAt: input.cancelledAt,
          cancelledById: input.cancelledById,
          cancellationReasonEn: input.cancellationReasonEn ?? null,
          cancellationReasonAr: input.cancellationReasonAr ?? null,
          ...(input.metadata !== undefined
            ? { metadata: toNullableJson(input.metadata) }
            : {}),
        },
      });

      if (result.count === 0) {
        throw new RewardRedemptionNotRequestedException({
          redemptionId: input.redemptionId,
        });
      }

      await this.createAuditLogInTransaction(tx, input.audit);

      return this.findRedemptionInTransaction(
        tx,
        input.schoolId,
        input.redemptionId,
      );
    });
  }

  async approveRedemptionWithStockDecrement(
    input: ApproveRewardRedemptionInput,
  ): Promise<RewardRedemptionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const catalogItem = await tx.rewardCatalogItem.findFirst({
        where: {
          id: input.catalogItemId,
          schoolId: input.schoolId,
        },
        select: REDEMPTION_CATALOG_ITEM_SELECT,
      });
      if (!catalogItem) {
        throw new RewardInvalidStatusTransitionException({
          redemptionId: input.redemptionId,
          catalogItemId: input.catalogItemId,
        });
      }

      assertRewardStillRequestableForApproval(catalogItem);

      let stockRemainingBeforeApproval = catalogItem.stockRemaining ?? null;
      let stockRemainingAfterApproval = catalogItem.stockRemaining ?? null;

      if (!catalogItem.isUnlimited) {
        const stockResult = await tx.rewardCatalogItem.updateMany({
          where: {
            id: catalogItem.id,
            schoolId: input.schoolId,
            status: RewardCatalogItemStatus.PUBLISHED,
            deletedAt: null,
            isUnlimited: false,
            stockRemaining: { gt: 0 },
          },
          data: {
            stockRemaining: { decrement: 1 },
          },
        });

        if (stockResult.count === 0) {
          throw new RewardOutOfStockException({
            catalogItemId: catalogItem.id,
            stockRemaining: stockRemainingBeforeApproval,
          });
        }

        const updatedCatalogItem = await tx.rewardCatalogItem.findFirst({
          where: {
            id: catalogItem.id,
            schoolId: input.schoolId,
          },
          select: { stockRemaining: true },
        });
        stockRemainingAfterApproval =
          updatedCatalogItem?.stockRemaining ?? null;
      }

      const eligibilitySnapshot = buildApprovalEligibilitySnapshot({
        previousSnapshot: input.previousEligibilitySnapshot,
        catalogItemStatus: catalogItem.status,
        minTotalXp: catalogItem.minTotalXp,
        totalEarnedXp: input.totalEarnedXp,
        isUnlimited: catalogItem.isUnlimited,
        stockRemainingBeforeApproval,
        stockRemainingAfterApproval,
        approvedAt: input.reviewedAt,
      });

      const result = await tx.rewardRedemption.updateMany({
        where: {
          id: input.redemptionId,
          schoolId: input.schoolId,
          status: RewardRedemptionStatus.REQUESTED,
        },
        data: {
          status: RewardRedemptionStatus.APPROVED,
          reviewedAt: input.reviewedAt,
          reviewedById: input.reviewedById,
          reviewNoteEn: input.reviewNoteEn ?? null,
          reviewNoteAr: input.reviewNoteAr ?? null,
          eligibilitySnapshot: eligibilitySnapshot as Prisma.InputJsonValue,
          ...(input.metadata !== undefined
            ? { metadata: toNullableJson(input.metadata) }
            : {}),
        },
      });

      if (result.count === 0) {
        throw new RewardInvalidStatusTransitionException({
          redemptionId: input.redemptionId,
          expectedStatus: RewardRedemptionStatus.REQUESTED,
        });
      }

      await this.createAuditLogInTransaction(tx, {
        ...input.audit,
        after: {
          ...(input.audit.after ?? {}),
          minTotalXp: eligibilitySnapshot.minTotalXp,
          totalEarnedXp: eligibilitySnapshot.totalEarnedXp,
          stockRemainingBeforeApproval,
          stockRemainingAfterApproval,
          isUnlimited: catalogItem.isUnlimited,
        },
      });

      return this.findRedemptionInTransaction(
        tx,
        input.schoolId,
        input.redemptionId,
      );
    });
  }

  async rejectRedemption(
    input: RejectRewardRedemptionInput,
  ): Promise<RewardRedemptionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.rewardRedemption.updateMany({
        where: {
          id: input.redemptionId,
          schoolId: input.schoolId,
          status: RewardRedemptionStatus.REQUESTED,
        },
        data: {
          status: RewardRedemptionStatus.REJECTED,
          reviewedAt: input.reviewedAt,
          reviewedById: input.reviewedById,
          reviewNoteEn: input.reviewNoteEn ?? null,
          reviewNoteAr: input.reviewNoteAr ?? null,
          ...(input.metadata !== undefined
            ? { metadata: toNullableJson(input.metadata) }
            : {}),
        },
      });

      if (result.count === 0) {
        throw new RewardInvalidStatusTransitionException({
          redemptionId: input.redemptionId,
          expectedStatus: RewardRedemptionStatus.REQUESTED,
        });
      }

      await this.createAuditLogInTransaction(tx, input.audit);

      return this.findRedemptionInTransaction(
        tx,
        input.schoolId,
        input.redemptionId,
      );
    });
  }

  async fulfillRedemption(
    input: FulfillRewardRedemptionInput,
  ): Promise<RewardRedemptionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.rewardRedemption.updateMany({
        where: {
          id: input.redemptionId,
          schoolId: input.schoolId,
          status: RewardRedemptionStatus.APPROVED,
        },
        data: {
          status: RewardRedemptionStatus.FULFILLED,
          fulfilledAt: input.fulfilledAt,
          fulfilledById: input.fulfilledById,
          fulfillmentNoteEn: input.fulfillmentNoteEn ?? null,
          fulfillmentNoteAr: input.fulfillmentNoteAr ?? null,
          ...(input.metadata !== undefined
            ? { metadata: toNullableJson(input.metadata) }
            : {}),
        },
      });

      if (result.count === 0) {
        throw new RewardRedemptionNotApprovedException({
          redemptionId: input.redemptionId,
        });
      }

      await this.createAuditLogInTransaction(tx, input.audit);

      return this.findRedemptionInTransaction(
        tx,
        input.schoolId,
        input.redemptionId,
      );
    });
  }

  private buildListWhere(
    filters: ListRewardRedemptionsFilters,
  ): Prisma.RewardRedemptionWhereInput {
    const and: Prisma.RewardRedemptionWhereInput[] = [];
    const search = filters.search?.trim();

    if (filters.includeTerminal === false) {
      and.push({
        status: {
          in: [
            RewardRedemptionStatus.REQUESTED,
            RewardRedemptionStatus.APPROVED,
          ],
        },
      });
    }

    if (filters.requestedFrom || filters.requestedTo) {
      and.push({
        requestedAt: {
          ...(filters.requestedFrom ? { gte: filters.requestedFrom } : {}),
          ...(filters.requestedTo ? { lte: filters.requestedTo } : {}),
        },
      });
    }

    if (search) {
      const searchOr: Prisma.RewardRedemptionWhereInput[] = [
        { catalogItem: { titleEn: { contains: search, mode: 'insensitive' } } },
        { catalogItem: { titleAr: { contains: search, mode: 'insensitive' } } },
        { student: { firstName: { contains: search, mode: 'insensitive' } } },
        { student: { lastName: { contains: search, mode: 'insensitive' } } },
      ];

      if (isUuid(search)) {
        searchOr.unshift({ id: search });
      }

      and.push({ OR: searchOr });
    }

    return {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.catalogItemId
        ? { catalogItemId: filters.catalogItemId }
        : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.requestSource
        ? { requestSource: filters.requestSource }
        : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private async findRedemptionInTransaction(
    tx: Prisma.TransactionClient,
    schoolId: string,
    redemptionId: string,
  ): Promise<RewardRedemptionRecord> {
    const redemption = await tx.rewardRedemption.findFirst({
      where: {
        id: redemptionId,
        schoolId,
      },
      ...REWARD_REDEMPTION_ARGS,
    });

    if (!redemption) {
      throw new Error('Reward redemption mutation result was not found');
    }

    return redemption;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: RewardAuditLogInput,
  ): Promise<unknown> {
    return tx.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        userType: entry.userType ?? null,
        organizationId: entry.organizationId ?? null,
        schoolId: entry.schoolId ?? null,
        module: entry.module,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        outcome: entry.outcome,
        before: entry.before
          ? (entry.before as Prisma.InputJsonValue)
          : undefined,
        after: entry.after ? (entry.after as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}

function toNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value,
  );
}
