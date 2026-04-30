import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  ReinforcementScope,
  requireReinforcementScope,
} from '../../reinforcement-context';
import {
  RewardDuplicateRedemptionException,
  assertRedemptionApprovable,
  assertRedemptionCancellable,
  assertRedemptionFulfillable,
  assertRedemptionRejectable,
  assertRedemptionRequestedDateRange,
  assertRewardEligibility,
  assertRewardRequestable,
  assertRewardStillRequestableForApproval,
  assertRewardStockAvailableForRequest,
  buildEligibilitySnapshot,
  deriveStockAfterApproval,
  isUniqueConstraintError,
  normalizeNullableText,
  normalizeRewardRedemptionRequestSource,
  normalizeRewardRedemptionStatus,
} from '../domain/reward-redemptions-domain';
import {
  ApproveRewardRedemptionDto,
  CancelRewardRedemptionDto,
  CreateRewardRedemptionDto,
  FulfillRewardRedemptionDto,
  ListRewardRedemptionsQueryDto,
  RejectRewardRedemptionDto,
} from '../dto/reward-redemptions.dto';
import {
  ListRewardRedemptionsFilters,
  RewardAuditLogInput,
  RewardRedemptionCatalogItemRecord,
  RewardRedemptionEnrollmentRecord,
  RewardRedemptionRecord,
  RewardRedemptionsRepository,
} from '../infrastructure/reward-redemptions.repository';
import {
  presentRewardRedemptionDetail,
  presentRewardRedemptionList,
} from '../presenters/reward-redemptions.presenter';

@Injectable()
export class ListRewardRedemptionsUseCase {
  constructor(
    private readonly rewardRedemptionsRepository: RewardRedemptionsRepository,
  ) {}

  async execute(query: ListRewardRedemptionsQueryDto) {
    requireReinforcementScope();
    const filters = normalizeRedemptionListFilters(query);
    await validateRedemptionListReferences({
      repository: this.rewardRedemptionsRepository,
      filters,
    });

    const result =
      await this.rewardRedemptionsRepository.listRedemptions(filters);
    return presentRewardRedemptionList({
      ...result,
      limit: filters.limit ?? null,
      offset: filters.offset ?? null,
    });
  }
}

@Injectable()
export class GetRewardRedemptionUseCase {
  constructor(
    private readonly rewardRedemptionsRepository: RewardRedemptionsRepository,
  ) {}

  async execute(redemptionId: string) {
    requireReinforcementScope();
    const redemption =
      await this.rewardRedemptionsRepository.findRedemptionById(redemptionId);
    if (!redemption) {
      throw new NotFoundDomainException('Reward redemption not found', {
        redemptionId,
      });
    }

    return presentRewardRedemptionDetail(redemption);
  }
}

@Injectable()
export class CreateRewardRedemptionUseCase {
  constructor(
    private readonly rewardRedemptionsRepository: RewardRedemptionsRepository,
  ) {}

  async execute(command: CreateRewardRedemptionDto) {
    const scope = requireReinforcementScope();
    const catalogItem = await this.requireCatalogItem(command.catalogItemId);

    assertRewardRequestable(catalogItem);
    assertRewardStockAvailableForRequest(catalogItem);

    const student = await this.rewardRedemptionsRepository.findStudent(
      command.studentId,
    );
    if (!student) {
      throw new NotFoundDomainException('Student not found', {
        studentId: command.studentId,
      });
    }

    const resolved = await this.resolveCreateContext({
      command,
      catalogItem,
    });

    const totalEarnedXp =
      await this.rewardRedemptionsRepository.calculateStudentTotalEarnedXp(
        command.studentId,
      );
    assertRewardEligibility({
      catalogItemId: catalogItem.id,
      studentId: command.studentId,
      minTotalXp: catalogItem.minTotalXp,
      totalEarnedXp,
    });

    const openRedemption =
      await this.rewardRedemptionsRepository.findOpenRedemption({
        catalogItemId: catalogItem.id,
        studentId: command.studentId,
      });
    if (openRedemption) {
      throw new RewardDuplicateRedemptionException({
        catalogItemId: catalogItem.id,
        studentId: command.studentId,
        existingRedemptionId: openRedemption.id,
      });
    }

    const now = new Date();
    const requestSource = normalizeRewardRedemptionRequestSource(
      command.requestSource,
      RewardRedemptionRequestSource.DASHBOARD,
    );
    const eligibilitySnapshot = buildEligibilitySnapshot({
      catalogItemStatus: catalogItem.status,
      minTotalXp: catalogItem.minTotalXp,
      totalEarnedXp,
      isUnlimited: catalogItem.isUnlimited,
      stockRemaining: catalogItem.stockRemaining,
    });

    try {
      const redemption =
        await this.rewardRedemptionsRepository.createRedemption({
          schoolId: scope.schoolId,
          data: {
            catalogItemId: catalogItem.id,
            studentId: command.studentId,
            enrollmentId: resolved.enrollment?.id ?? null,
            academicYearId: resolved.academicYearId,
            termId: resolved.termId,
            status: RewardRedemptionStatus.REQUESTED,
            requestSource,
            requestedById: scope.actorId,
            requestedAt: now,
            requestNoteEn: normalizeNullableText(command.requestNoteEn),
            requestNoteAr: normalizeNullableText(command.requestNoteAr),
            eligibilitySnapshot,
            metadata: command.metadata,
          },
          audit: buildRewardRedemptionRequestAuditEntry({
            scope,
            catalogItem,
            studentId: command.studentId,
            enrollmentId: resolved.enrollment?.id ?? null,
            requestSource,
            eligibilitySnapshot,
          }),
        });

      return presentRewardRedemptionDetail(redemption);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new RewardDuplicateRedemptionException({
          catalogItemId: catalogItem.id,
          studentId: command.studentId,
        });
      }

      throw error;
    }
  }

  private async requireCatalogItem(
    catalogItemId: string,
  ): Promise<RewardRedemptionCatalogItemRecord> {
    const catalogItem =
      await this.rewardRedemptionsRepository.findCatalogItemForRedemption(
        catalogItemId,
      );
    if (!catalogItem) {
      throw new NotFoundDomainException('Reward catalog item not found', {
        catalogItemId,
      });
    }

    return catalogItem;
  }

  private async resolveCreateContext(params: {
    command: CreateRewardRedemptionDto;
    catalogItem: RewardRedemptionCatalogItemRecord;
  }): Promise<{
    enrollment: RewardRedemptionEnrollmentRecord | null;
    academicYearId: string | null;
    termId: string | null;
  }> {
    let academicYearId =
      params.command.academicYearId ??
      params.catalogItem.academicYearId ??
      null;
    let termId = params.command.termId ?? params.catalogItem.termId ?? null;

    const enrollment = params.command.enrollmentId
      ? await this.rewardRedemptionsRepository.findEnrollmentForStudent({
          enrollmentId: params.command.enrollmentId,
          studentId: params.command.studentId,
        })
      : await this.rewardRedemptionsRepository.resolveActiveEnrollmentForStudent(
          {
            studentId: params.command.studentId,
            academicYearId,
            termId,
          },
        );

    if (params.command.enrollmentId && !enrollment) {
      throw new NotFoundDomainException('Enrollment not found', {
        enrollmentId: params.command.enrollmentId,
        studentId: params.command.studentId,
      });
    }

    if (enrollment) {
      if (academicYearId && enrollment.academicYearId !== academicYearId) {
        throw new NotFoundDomainException('Enrollment not found', {
          enrollmentId: enrollment.id,
          academicYearId,
        });
      }
      if (termId && enrollment.termId !== termId) {
        throw new NotFoundDomainException('Enrollment not found', {
          enrollmentId: enrollment.id,
          termId,
        });
      }

      academicYearId ??= enrollment.academicYearId;
      termId ??= enrollment.termId;
    }

    const validated = await validateAcademicContext({
      repository: this.rewardRedemptionsRepository,
      academicYearId,
      termId,
    });
    academicYearId = validated.academicYearId;
    termId = validated.termId;

    if (
      params.catalogItem.academicYearId &&
      params.catalogItem.academicYearId !== academicYearId
    ) {
      throw new NotFoundDomainException('Reward catalog item not found', {
        catalogItemId: params.catalogItem.id,
        academicYearId,
      });
    }

    if (params.catalogItem.termId && params.catalogItem.termId !== termId) {
      throw new NotFoundDomainException('Reward catalog item not found', {
        catalogItemId: params.catalogItem.id,
        termId,
      });
    }

    return { enrollment, academicYearId, termId };
  }
}

@Injectable()
export class ApproveRewardRedemptionUseCase {
  constructor(
    private readonly rewardRedemptionsRepository: RewardRedemptionsRepository,
  ) {}

  async execute(redemptionId: string, command: ApproveRewardRedemptionDto) {
    const scope = requireReinforcementScope();
    const existing =
      await this.rewardRedemptionsRepository.findRedemptionById(redemptionId);
    if (!existing) {
      throw new NotFoundDomainException('Reward redemption not found', {
        redemptionId,
      });
    }

    assertRedemptionApprovable({
      id: existing.id,
      status: existing.status,
    });

    const catalogItem =
      await this.rewardRedemptionsRepository.findCatalogItemForReview(
        existing.catalogItemId,
      );
    if (!catalogItem) {
      throw new NotFoundDomainException('Reward catalog item not found', {
        catalogItemId: existing.catalogItemId,
      });
    }

    assertRewardStillRequestableForApproval(catalogItem);

    const totalEarnedXp =
      await this.rewardRedemptionsRepository.calculateStudentTotalEarnedXp(
        existing.studentId,
      );
    assertRewardEligibility({
      catalogItemId: catalogItem.id,
      studentId: existing.studentId,
      minTotalXp: catalogItem.minTotalXp,
      totalEarnedXp,
    });

    const reviewedAt = new Date();
    const reviewNoteEn = normalizeNullableText(command.reviewNoteEn);
    const reviewNoteAr = normalizeNullableText(command.reviewNoteAr);
    const stockRemainingAfterApproval = deriveStockAfterApproval({
      isUnlimited: catalogItem.isUnlimited,
      stockRemaining: catalogItem.stockRemaining,
    });

    const redemption =
      await this.rewardRedemptionsRepository.approveRedemptionWithStockDecrement(
        {
          schoolId: scope.schoolId,
          redemptionId: existing.id,
          catalogItemId: catalogItem.id,
          reviewedById: scope.actorId,
          reviewedAt,
          reviewNoteEn,
          reviewNoteAr,
          metadata: command.metadata,
          previousEligibilitySnapshot: readSnapshotRecord(existing),
          totalEarnedXp,
          audit: buildRewardRedemptionApproveAuditEntry({
            scope,
            existing,
            catalogItem,
            totalEarnedXp,
            reviewedById: scope.actorId,
            reviewedAt,
            reviewNoteEn,
            reviewNoteAr,
            stockRemainingAfterApproval,
          }),
        },
      );

    return presentRewardRedemptionDetail(redemption);
  }
}

@Injectable()
export class RejectRewardRedemptionUseCase {
  constructor(
    private readonly rewardRedemptionsRepository: RewardRedemptionsRepository,
  ) {}

  async execute(redemptionId: string, command: RejectRewardRedemptionDto) {
    const scope = requireReinforcementScope();
    const existing =
      await this.rewardRedemptionsRepository.findRedemptionById(redemptionId);
    if (!existing) {
      throw new NotFoundDomainException('Reward redemption not found', {
        redemptionId,
      });
    }

    assertRedemptionRejectable({
      id: existing.id,
      status: existing.status,
    });

    const reviewedAt = new Date();
    const reviewNoteEn = normalizeNullableText(command.reviewNoteEn);
    const reviewNoteAr = normalizeNullableText(command.reviewNoteAr);
    const redemption = await this.rewardRedemptionsRepository.rejectRedemption({
      schoolId: scope.schoolId,
      redemptionId: existing.id,
      reviewedById: scope.actorId,
      reviewedAt,
      reviewNoteEn,
      reviewNoteAr,
      metadata: command.metadata,
      audit: buildRewardRedemptionRejectAuditEntry({
        scope,
        existing,
        reviewedById: scope.actorId,
        reviewedAt,
        reviewNoteEn,
        reviewNoteAr,
      }),
    });

    return presentRewardRedemptionDetail(redemption);
  }
}

@Injectable()
export class FulfillRewardRedemptionUseCase {
  constructor(
    private readonly rewardRedemptionsRepository: RewardRedemptionsRepository,
  ) {}

  async execute(redemptionId: string, command: FulfillRewardRedemptionDto) {
    const scope = requireReinforcementScope();
    const existing =
      await this.rewardRedemptionsRepository.findRedemptionById(redemptionId);
    if (!existing) {
      throw new NotFoundDomainException('Reward redemption not found', {
        redemptionId,
      });
    }

    assertRedemptionFulfillable({
      id: existing.id,
      status: existing.status,
    });

    const fulfilledAt = new Date();
    const fulfillmentNoteEn = normalizeNullableText(command.fulfillmentNoteEn);
    const fulfillmentNoteAr = normalizeNullableText(command.fulfillmentNoteAr);
    const redemption = await this.rewardRedemptionsRepository.fulfillRedemption(
      {
        schoolId: scope.schoolId,
        redemptionId: existing.id,
        fulfilledById: scope.actorId,
        fulfilledAt,
        fulfillmentNoteEn,
        fulfillmentNoteAr,
        metadata: command.metadata,
        audit: buildRewardRedemptionFulfillAuditEntry({
          scope,
          existing,
          fulfilledById: scope.actorId,
          fulfilledAt,
          fulfillmentNoteEn,
          fulfillmentNoteAr,
        }),
      },
    );

    return presentRewardRedemptionDetail(redemption);
  }
}

@Injectable()
export class CancelRewardRedemptionUseCase {
  constructor(
    private readonly rewardRedemptionsRepository: RewardRedemptionsRepository,
  ) {}

  async execute(redemptionId: string, command: CancelRewardRedemptionDto) {
    const scope = requireReinforcementScope();
    const existing =
      await this.rewardRedemptionsRepository.findRedemptionById(redemptionId);
    if (!existing) {
      throw new NotFoundDomainException('Reward redemption not found', {
        redemptionId,
      });
    }

    assertRedemptionCancellable({
      id: existing.id,
      status: existing.status,
    });

    const cancelledAt = new Date();
    const redemption = await this.rewardRedemptionsRepository.cancelRedemption({
      schoolId: scope.schoolId,
      redemptionId: existing.id,
      cancelledById: scope.actorId,
      cancelledAt,
      cancellationReasonEn: normalizeNullableText(command.cancellationReasonEn),
      cancellationReasonAr: normalizeNullableText(command.cancellationReasonAr),
      metadata: command.metadata,
      audit: buildRewardRedemptionCancelAuditEntry({
        scope,
        existing,
        cancelledById: scope.actorId,
        cancelledAt,
      }),
    });

    return presentRewardRedemptionDetail(redemption);
  }
}

function normalizeRedemptionListFilters(
  query: ListRewardRedemptionsQueryDto,
): ListRewardRedemptionsFilters {
  const requestedFrom = parseOptionalIsoDate(
    query.requestedFrom,
    'requestedFrom',
  );
  const requestedTo = parseOptionalIsoDate(query.requestedTo, 'requestedTo');
  assertRedemptionRequestedDateRange({ requestedFrom, requestedTo });

  return {
    ...(query.status
      ? { status: normalizeRewardRedemptionStatus(query.status) }
      : {}),
    ...(query.catalogItemId ? { catalogItemId: query.catalogItemId } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.requestSource
      ? {
          requestSource: normalizeRewardRedemptionRequestSource(
            query.requestSource,
          ),
        }
      : {}),
    ...(requestedFrom ? { requestedFrom } : {}),
    ...(requestedTo ? { requestedTo } : {}),
    includeTerminal: query.includeTerminal ?? true,
    ...(query.search ? { search: query.search } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
    ...(query.offset !== undefined ? { offset: query.offset } : {}),
  };
}

async function validateRedemptionListReferences(params: {
  repository: RewardRedemptionsRepository;
  filters: ListRewardRedemptionsFilters;
}): Promise<void> {
  const [catalogItem, student, academicContext] = await Promise.all([
    params.filters.catalogItemId
      ? params.repository.findCatalogItemForRedemption(
          params.filters.catalogItemId,
        )
      : Promise.resolve(null),
    params.filters.studentId
      ? params.repository.findStudent(params.filters.studentId)
      : Promise.resolve(null),
    validateAcademicContext({
      repository: params.repository,
      academicYearId: params.filters.academicYearId ?? null,
      termId: params.filters.termId ?? null,
    }),
  ]);

  if (params.filters.catalogItemId && !catalogItem) {
    throw new NotFoundDomainException('Reward catalog item not found', {
      catalogItemId: params.filters.catalogItemId,
    });
  }

  if (params.filters.studentId && !student) {
    throw new NotFoundDomainException('Student not found', {
      studentId: params.filters.studentId,
    });
  }

  void academicContext;
}

async function validateAcademicContext(params: {
  repository: RewardRedemptionsRepository;
  academicYearId?: string | null;
  termId?: string | null;
}): Promise<{ academicYearId: string | null; termId: string | null }> {
  const [academicYear, term] = await Promise.all([
    params.academicYearId
      ? params.repository.findAcademicYear(params.academicYearId)
      : Promise.resolve(null),
    params.termId
      ? params.repository.findTerm(params.termId)
      : Promise.resolve(null),
  ]);

  if (params.academicYearId && !academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId: params.academicYearId,
    });
  }

  if (params.termId && !term) {
    throw new NotFoundDomainException('Term not found', {
      termId: params.termId,
    });
  }

  if (
    params.academicYearId &&
    term &&
    term.academicYearId !== params.academicYearId
  ) {
    throw new NotFoundDomainException('Term not found', {
      academicYearId: params.academicYearId,
      termId: params.termId,
    });
  }

  return {
    academicYearId: params.academicYearId ?? term?.academicYearId ?? null,
    termId: params.termId ?? null,
  };
}

function buildRewardRedemptionRequestAuditEntry(params: {
  scope: ReinforcementScope;
  catalogItem: RewardRedemptionCatalogItemRecord;
  studentId: string;
  enrollmentId: string | null;
  requestSource: RewardRedemptionRequestSource;
  eligibilitySnapshot: Record<string, unknown>;
}): RewardAuditLogInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement.rewards',
    action: 'reinforcement.reward.redemption.request',
    resourceType: 'reward_redemption',
    outcome: AuditOutcome.SUCCESS,
    after: {
      catalogItemId: params.catalogItem.id,
      studentId: params.studentId,
      enrollmentId: params.enrollmentId,
      status: RewardRedemptionStatus.REQUESTED,
      requestSource: params.requestSource,
      minTotalXp: params.eligibilitySnapshot.minTotalXp,
      totalEarnedXp: params.eligibilitySnapshot.totalEarnedXp,
      eligible: params.eligibilitySnapshot.eligible,
      isUnlimited: params.eligibilitySnapshot.isUnlimited,
      stockRemaining: params.eligibilitySnapshot.stockRemaining,
    },
  };
}

function buildRewardRedemptionCancelAuditEntry(params: {
  scope: ReinforcementScope;
  existing: RewardRedemptionRecord;
  cancelledById: string;
  cancelledAt: Date;
}): RewardAuditLogInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement.rewards',
    action: 'reinforcement.reward.redemption.cancel',
    resourceType: 'reward_redemption',
    resourceId: params.existing.id,
    outcome: AuditOutcome.SUCCESS,
    before: {
      status: params.existing.status,
      cancelledAt: params.existing.cancelledAt?.toISOString() ?? null,
      cancelledById: params.existing.cancelledById,
    },
    after: {
      catalogItemId: params.existing.catalogItemId,
      studentId: params.existing.studentId,
      enrollmentId: params.existing.enrollmentId,
      beforeStatus: params.existing.status,
      afterStatus: RewardRedemptionStatus.CANCELLED,
      cancelledById: params.cancelledById,
      cancelledAt: params.cancelledAt.toISOString(),
      requestSource: params.existing.requestSource,
      minTotalXp: readSnapshotNumber(params.existing, 'minTotalXp'),
      totalEarnedXp: readSnapshotNumber(params.existing, 'totalEarnedXp'),
      eligible: readSnapshotBoolean(params.existing, 'eligible'),
      isUnlimited: readSnapshotBoolean(params.existing, 'isUnlimited'),
      stockRemaining: readSnapshotNumberOrNull(
        params.existing,
        'stockRemaining',
      ),
    },
  };
}

function buildRewardRedemptionApproveAuditEntry(params: {
  scope: ReinforcementScope;
  existing: RewardRedemptionRecord;
  catalogItem: RewardRedemptionCatalogItemRecord;
  totalEarnedXp: number;
  reviewedById: string;
  reviewedAt: Date;
  reviewNoteEn: string | null;
  reviewNoteAr: string | null;
  stockRemainingAfterApproval: number | null;
}): RewardAuditLogInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement.rewards',
    action: 'reinforcement.reward.redemption.approve',
    resourceType: 'reward_redemption',
    resourceId: params.existing.id,
    outcome: AuditOutcome.SUCCESS,
    before: {
      status: params.existing.status,
      reviewedAt: params.existing.reviewedAt?.toISOString() ?? null,
      reviewedById: params.existing.reviewedById,
    },
    after: {
      catalogItemId: params.existing.catalogItemId,
      studentId: params.existing.studentId,
      enrollmentId: params.existing.enrollmentId,
      beforeStatus: params.existing.status,
      afterStatus: RewardRedemptionStatus.APPROVED,
      reviewedById: params.reviewedById,
      reviewedAt: params.reviewedAt.toISOString(),
      catalogItemStatus: params.catalogItem.status,
      minTotalXp: params.catalogItem.minTotalXp ?? null,
      totalEarnedXp: params.totalEarnedXp,
      eligible: true,
      stockRemainingBeforeApproval: params.catalogItem.stockRemaining ?? null,
      stockRemainingAfterApproval: params.stockRemainingAfterApproval,
      isUnlimited: params.catalogItem.isUnlimited,
      reviewNotePresent: Boolean(params.reviewNoteEn || params.reviewNoteAr),
    },
  };
}

function buildRewardRedemptionRejectAuditEntry(params: {
  scope: ReinforcementScope;
  existing: RewardRedemptionRecord;
  reviewedById: string;
  reviewedAt: Date;
  reviewNoteEn: string | null;
  reviewNoteAr: string | null;
}): RewardAuditLogInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement.rewards',
    action: 'reinforcement.reward.redemption.reject',
    resourceType: 'reward_redemption',
    resourceId: params.existing.id,
    outcome: AuditOutcome.SUCCESS,
    before: {
      status: params.existing.status,
      reviewedAt: params.existing.reviewedAt?.toISOString() ?? null,
      reviewedById: params.existing.reviewedById,
    },
    after: {
      catalogItemId: params.existing.catalogItemId,
      studentId: params.existing.studentId,
      enrollmentId: params.existing.enrollmentId,
      beforeStatus: params.existing.status,
      afterStatus: RewardRedemptionStatus.REJECTED,
      reviewedById: params.reviewedById,
      reviewedAt: params.reviewedAt.toISOString(),
      requestSource: params.existing.requestSource,
      reviewNotePresent: Boolean(params.reviewNoteEn || params.reviewNoteAr),
    },
  };
}

function buildRewardRedemptionFulfillAuditEntry(params: {
  scope: ReinforcementScope;
  existing: RewardRedemptionRecord;
  fulfilledById: string;
  fulfilledAt: Date;
  fulfillmentNoteEn: string | null;
  fulfillmentNoteAr: string | null;
}): RewardAuditLogInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement.rewards',
    action: 'reinforcement.reward.redemption.fulfill',
    resourceType: 'reward_redemption',
    resourceId: params.existing.id,
    outcome: AuditOutcome.SUCCESS,
    before: {
      status: params.existing.status,
      fulfilledAt: params.existing.fulfilledAt?.toISOString() ?? null,
      fulfilledById: params.existing.fulfilledById,
    },
    after: {
      catalogItemId: params.existing.catalogItemId,
      studentId: params.existing.studentId,
      enrollmentId: params.existing.enrollmentId,
      beforeStatus: params.existing.status,
      afterStatus: RewardRedemptionStatus.FULFILLED,
      fulfilledById: params.fulfilledById,
      fulfilledAt: params.fulfilledAt.toISOString(),
      requestSource: params.existing.requestSource,
      minTotalXp: readSnapshotNumber(params.existing, 'minTotalXp'),
      totalEarnedXp: readSnapshotNumber(params.existing, 'totalEarnedXp'),
      stockRemainingBeforeApproval: readSnapshotNumberOrNull(
        params.existing,
        'stockRemainingBeforeApproval',
      ),
      stockRemainingAfterApproval: readSnapshotNumberOrNull(
        params.existing,
        'stockRemainingAfterApproval',
      ),
      isUnlimited: readSnapshotBoolean(params.existing, 'isUnlimited'),
      fulfillmentNotePresent: Boolean(
        params.fulfillmentNoteEn || params.fulfillmentNoteAr,
      ),
    },
  };
}

function parseOptionalIsoDate(
  value: string | undefined,
  field: string,
): Date | undefined {
  if (!value) return undefined;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationDomainException('Date value is invalid', {
      field,
      value,
    });
  }

  return parsed;
}

function readSnapshotRecord(
  redemption: RewardRedemptionRecord,
): Record<string, unknown> {
  return redemption.eligibilitySnapshot &&
    typeof redemption.eligibilitySnapshot === 'object' &&
    !Array.isArray(redemption.eligibilitySnapshot)
    ? (redemption.eligibilitySnapshot as Record<string, unknown>)
    : {};
}

function readSnapshotNumber(
  redemption: RewardRedemptionRecord,
  key: string,
): number | null {
  const value = readSnapshotRecord(redemption)[key];
  return typeof value === 'number' ? value : null;
}

function readSnapshotNumberOrNull(
  redemption: RewardRedemptionRecord,
  key: string,
): number | null {
  return readSnapshotNumber(redemption, key);
}

function readSnapshotBoolean(
  redemption: RewardRedemptionRecord,
  key: string,
): boolean | null {
  const value = readSnapshotRecord(redemption)[key];
  return typeof value === 'boolean' ? value : null;
}
