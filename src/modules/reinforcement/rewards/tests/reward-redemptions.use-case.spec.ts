import {
  AuditOutcome,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  RewardArchivedForRequestException,
  RewardDuplicateRedemptionException,
  RewardInsufficientXpException,
  RewardNotPublishedException,
  RewardOutOfStockException,
  RewardRedemptionTerminalException,
} from '../domain/reward-redemptions-domain';
import {
  CancelRewardRedemptionUseCase,
  CreateRewardRedemptionUseCase,
  GetRewardRedemptionUseCase,
  ListRewardRedemptionsUseCase,
} from '../application/reward-redemptions.use-cases';
import { RewardRedemptionsRepository } from '../infrastructure/reward-redemptions.repository';

const SCHOOL_ID = 'school-1';
const ORG_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const REWARD_ID = 'reward-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const REDEMPTION_ID = 'redemption-1';
const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Reward redemption use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ACTOR_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: ORG_ID,
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [
          'reinforcement.rewards.redemptions.view',
          'reinforcement.rewards.redemptions.request',
        ],
      });

      return fn();
    });
  }

  it('request rejects non-published rewards', async () => {
    const repository = baseRepository({
      findCatalogItemForRedemption: jest.fn().mockResolvedValue(
        rewardRecord({
          status: RewardCatalogItemStatus.DRAFT,
        }),
      ),
    });

    await expect(
      withScope(() => createUseCase(repository).execute(createCommand())),
    ).rejects.toBeInstanceOf(RewardNotPublishedException);
    expect(repository.createRedemption).not.toHaveBeenCalled();
  });

  it('request rejects archived rewards', async () => {
    const repository = baseRepository({
      findCatalogItemForRedemption: jest.fn().mockResolvedValue(
        rewardRecord({
          status: RewardCatalogItemStatus.ARCHIVED,
        }),
      ),
    });

    await expect(
      withScope(() => createUseCase(repository).execute(createCommand())),
    ).rejects.toBeInstanceOf(RewardArchivedForRequestException);
    expect(repository.createRedemption).not.toHaveBeenCalled();
  });

  it('request rejects out-of-stock limited rewards', async () => {
    const repository = baseRepository({
      findCatalogItemForRedemption: jest.fn().mockResolvedValue(
        rewardRecord({
          isUnlimited: false,
          stockQuantity: 1,
          stockRemaining: 0,
        }),
      ),
    });

    await expect(
      withScope(() => createUseCase(repository).execute(createCommand())),
    ).rejects.toBeInstanceOf(RewardOutOfStockException);
    expect(repository.createRedemption).not.toHaveBeenCalled();
  });

  it('request allows unlimited rewards without stock remaining', async () => {
    const repository = baseRepository({
      findCatalogItemForRedemption: jest.fn().mockResolvedValue(
        rewardRecord({
          isUnlimited: true,
          stockQuantity: null,
          stockRemaining: null,
          minTotalXp: 10,
        }),
      ),
      calculateStudentTotalEarnedXp: jest.fn().mockResolvedValue(10),
    });

    const result = await withScope(() =>
      createUseCase(repository).execute(createCommand()),
    );

    expect(result).toMatchObject({
      status: 'requested',
      eligibilitySnapshot: {
        isUnlimited: true,
        stockRemaining: null,
      },
    });
    expect(repository.createRedemption).toHaveBeenCalled();
  });

  it('request rejects insufficient XP', async () => {
    const repository = baseRepository({
      findCatalogItemForRedemption: jest
        .fn()
        .mockResolvedValue(rewardRecord({ minTotalXp: 50 })),
      calculateStudentTotalEarnedXp: jest.fn().mockResolvedValue(49),
    });

    await expect(
      withScope(() => createUseCase(repository).execute(createCommand())),
    ).rejects.toBeInstanceOf(RewardInsufficientXpException);
    expect(repository.createRedemption).not.toHaveBeenCalled();
  });

  it('request accepts eligible students based on total earned XP', async () => {
    const repository = baseRepository({
      findCatalogItemForRedemption: jest
        .fn()
        .mockResolvedValue(rewardRecord({ minTotalXp: 50 })),
      calculateStudentTotalEarnedXp: jest.fn().mockResolvedValue(75),
    });

    const result = await withScope(() =>
      createUseCase(repository).execute(createCommand()),
    );

    expect(result).toMatchObject({
      status: 'requested',
      eligibilitySnapshot: {
        minTotalXp: 50,
        totalEarnedXp: 75,
        eligible: true,
      },
    });
  });

  it('request writes an eligibility snapshot', async () => {
    const repository = baseRepository({
      calculateStudentTotalEarnedXp: jest.fn().mockResolvedValue(100),
    });

    await withScope(() => createUseCase(repository).execute(createCommand()));

    expect(repository.createRedemption).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eligibilitySnapshot: expect.objectContaining({
            minTotalXp: 10,
            totalEarnedXp: 100,
            eligible: true,
            stockAvailable: true,
            isUnlimited: false,
            stockRemaining: 3,
            catalogItemStatus: 'published',
          }),
        }),
      }),
    );
  });

  it('request rejects duplicate open redemptions before writing', async () => {
    const repository = baseRepository({
      findOpenRedemption: jest.fn().mockResolvedValue(redemptionRecord()),
    });

    await expect(
      withScope(() => createUseCase(repository).execute(createCommand())),
    ).rejects.toBeInstanceOf(RewardDuplicateRedemptionException);
    expect(repository.createRedemption).not.toHaveBeenCalled();
  });

  it('request translates DB duplicate unique conflicts', async () => {
    const repository = baseRepository({
      createRedemption: jest.fn().mockRejectedValue({ code: 'P2002' }),
    });

    await expect(
      withScope(() => createUseCase(repository).execute(createCommand())),
    ).rejects.toBeInstanceOf(RewardDuplicateRedemptionException);
  });

  it('request does not decrement stock or write XP ledger rows', async () => {
    const repository = baseRepository({
      findCatalogItemForRedemption: jest.fn().mockResolvedValue(
        rewardRecord({
          isUnlimited: false,
          stockQuantity: 3,
          stockRemaining: 3,
        }),
      ),
    });

    const result = await withScope(() =>
      createUseCase(repository).execute(createCommand()),
    );

    expect(result.catalogItem.stockRemaining).toBe(3);
    expect(repository.decrementRewardStock).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
  });

  it('request audits the mutation through the transactional repository call', async () => {
    const repository = baseRepository();

    await withScope(() => createUseCase(repository).execute(createCommand()));

    expect(repository.createRedemption).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          action: 'reinforcement.reward.redemption.request',
          module: 'reinforcement.rewards',
          resourceType: 'reward_redemption',
          outcome: AuditOutcome.SUCCESS,
          after: expect.objectContaining({
            catalogItemId: REWARD_ID,
            studentId: STUDENT_ID,
            requestSource: RewardRedemptionRequestSource.DASHBOARD,
            totalEarnedXp: 100,
            eligible: true,
          }),
        }),
      }),
    );
  });

  it('list and detail reads do not audit', async () => {
    const repository = baseRepository();

    await withScope(() =>
      new ListRewardRedemptionsUseCase(repository).execute({
        search: 'Reward',
      }),
    );
    await withScope(() =>
      new GetRewardRedemptionUseCase(repository).execute(REDEMPTION_ID),
    );

    expect(repository.createAuditLog).not.toHaveBeenCalled();
    expect(repository.createRedemption).not.toHaveBeenCalled();
    expect(repository.cancelRedemption).not.toHaveBeenCalled();
  });

  it('cancel allows REQUESTED redemptions and audits the mutation', async () => {
    const repository = baseRepository({
      findRedemptionById: jest
        .fn()
        .mockResolvedValue(
          redemptionRecord({ status: RewardRedemptionStatus.REQUESTED }),
        ),
    });

    const result = await withScope(() =>
      cancelUseCase(repository).execute(REDEMPTION_ID, {
        cancellationReasonEn: 'Student changed mind',
      }),
    );

    expect(result.status).toBe('cancelled');
    expect(repository.cancelRedemption).toHaveBeenCalledWith(
      expect.objectContaining({
        redemptionId: REDEMPTION_ID,
        cancelledById: ACTOR_ID,
        cancellationReasonEn: 'Student changed mind',
        audit: expect.objectContaining({
          action: 'reinforcement.reward.redemption.cancel',
          before: expect.objectContaining({
            status: RewardRedemptionStatus.REQUESTED,
          }),
          after: expect.objectContaining({
            beforeStatus: RewardRedemptionStatus.REQUESTED,
            afterStatus: RewardRedemptionStatus.CANCELLED,
          }),
        }),
      }),
    );
  });

  it('cancel allows APPROVED redemptions', async () => {
    const repository = baseRepository({
      findRedemptionById: jest
        .fn()
        .mockResolvedValue(
          redemptionRecord({ status: RewardRedemptionStatus.APPROVED }),
        ),
    });

    const result = await withScope(() =>
      cancelUseCase(repository).execute(REDEMPTION_ID, {}),
    );

    expect(result.status).toBe('cancelled');
    expect(repository.cancelRedemption).toHaveBeenCalled();
  });

  it.each([
    RewardRedemptionStatus.REJECTED,
    RewardRedemptionStatus.FULFILLED,
    RewardRedemptionStatus.CANCELLED,
  ])('cancel rejects terminal %s redemptions', async (status) => {
    const repository = baseRepository({
      findRedemptionById: jest
        .fn()
        .mockResolvedValue(redemptionRecord({ status })),
    });

    await expect(
      withScope(() => cancelUseCase(repository).execute(REDEMPTION_ID, {})),
    ).rejects.toBeInstanceOf(RewardRedemptionTerminalException);
    expect(repository.cancelRedemption).not.toHaveBeenCalled();
  });

  it('cancel does not restock or write XP ledger rows', async () => {
    const repository = baseRepository();

    await withScope(() =>
      cancelUseCase(repository).execute(REDEMPTION_ID, {
        metadata: { operatorNote: 'cancel only' },
      }),
    );

    expect(repository.restockReward).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
  });

  function createUseCase(repository = baseRepository()) {
    return new CreateRewardRedemptionUseCase(repository);
  }

  function cancelUseCase(repository = baseRepository()) {
    return new CancelRewardRedemptionUseCase(repository);
  }

  function createCommand(
    overrides?: Partial<
      Parameters<CreateRewardRedemptionUseCase['execute']>[0]
    >,
  ) {
    return {
      catalogItemId: REWARD_ID,
      studentId: STUDENT_ID,
      requestSource: 'dashboard',
      ...overrides,
    };
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const repository = {
      listRedemptions: jest.fn().mockResolvedValue({
        items: [redemptionRecord()],
        total: 1,
        statusCounts: { REQUESTED: 1 },
      }),
      findRedemptionById: jest.fn().mockResolvedValue(redemptionRecord()),
      findCatalogItemForRedemption: jest.fn().mockResolvedValue(rewardRecord()),
      findStudent: jest.fn().mockResolvedValue(studentRecord()),
      findEnrollmentForStudent: jest.fn().mockResolvedValue(enrollmentRecord()),
      resolveActiveEnrollmentForStudent: jest
        .fn()
        .mockResolvedValue(enrollmentRecord()),
      findAcademicYear: jest.fn().mockResolvedValue({
        id: YEAR_ID,
        nameAr: 'Year AR',
        nameEn: 'Year',
        isActive: true,
      }),
      findTerm: jest.fn().mockResolvedValue({
        id: TERM_ID,
        academicYearId: YEAR_ID,
        nameAr: 'Term AR',
        nameEn: 'Term',
        isActive: true,
      }),
      findOpenRedemption: jest.fn().mockResolvedValue(null),
      calculateStudentTotalEarnedXp: jest.fn().mockResolvedValue(100),
      createRedemption: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          redemptionRecord({
            catalogItemId: input.data.catalogItemId,
            studentId: input.data.studentId,
            enrollmentId: input.data.enrollmentId,
            academicYearId: input.data.academicYearId,
            termId: input.data.termId,
            status: input.data.status,
            requestSource: input.data.requestSource,
            requestedById: input.data.requestedById,
            requestedAt: input.data.requestedAt,
            requestNoteEn: input.data.requestNoteEn,
            requestNoteAr: input.data.requestNoteAr,
            eligibilitySnapshot: input.data.eligibilitySnapshot,
          }),
        ),
      ),
      cancelRedemption: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          redemptionRecord({
            status: RewardRedemptionStatus.CANCELLED,
            cancelledAt: input.cancelledAt,
            cancelledById: input.cancelledById,
            cancellationReasonEn: input.cancellationReasonEn,
            cancellationReasonAr: input.cancellationReasonAr,
          }),
        ),
      ),
      decrementRewardStock: jest.fn(),
      restockReward: jest.fn(),
      createXpLedger: jest.fn(),
      createAuditLog: jest.fn(),
      ...overrides,
    };

    return repository as unknown as jest.Mocked<RewardRedemptionsRepository> & {
      decrementRewardStock: jest.Mock;
      restockReward: jest.Mock;
      createXpLedger: jest.Mock;
      createAuditLog: jest.Mock;
    };
  }

  function rewardRecord(overrides?: any) {
    return {
      id: overrides?.id ?? REWARD_ID,
      schoolId: overrides?.schoolId ?? SCHOOL_ID,
      academicYearId: overrides?.academicYearId ?? YEAR_ID,
      termId: overrides?.termId ?? TERM_ID,
      titleEn: overrides?.titleEn ?? 'Reward',
      titleAr: overrides?.titleAr ?? null,
      type: overrides?.type ?? RewardCatalogItemType.PHYSICAL,
      status: overrides?.status ?? RewardCatalogItemStatus.PUBLISHED,
      minTotalXp: hasOverride(overrides, 'minTotalXp')
        ? overrides.minTotalXp
        : 10,
      isUnlimited: overrides?.isUnlimited ?? false,
      stockQuantity: hasOverride(overrides, 'stockQuantity')
        ? overrides.stockQuantity
        : 3,
      stockRemaining: hasOverride(overrides, 'stockRemaining')
        ? overrides.stockRemaining
        : 3,
      imageFileId: overrides?.imageFileId ?? null,
      deletedAt: overrides?.deletedAt ?? null,
    } as never;
  }

  function hasOverride(overrides: any, key: string): boolean {
    return Boolean(
      overrides && Object.prototype.hasOwnProperty.call(overrides, key),
    );
  }

  function redemptionRecord(overrides?: any) {
    return {
      id: overrides?.id ?? REDEMPTION_ID,
      schoolId: overrides?.schoolId ?? SCHOOL_ID,
      catalogItemId: overrides?.catalogItemId ?? REWARD_ID,
      studentId: overrides?.studentId ?? STUDENT_ID,
      enrollmentId: overrides?.enrollmentId ?? ENROLLMENT_ID,
      academicYearId: overrides?.academicYearId ?? YEAR_ID,
      termId: overrides?.termId ?? TERM_ID,
      status: overrides?.status ?? RewardRedemptionStatus.REQUESTED,
      requestSource:
        overrides?.requestSource ?? RewardRedemptionRequestSource.DASHBOARD,
      requestedById: overrides?.requestedById ?? ACTOR_ID,
      reviewedById: overrides?.reviewedById ?? null,
      fulfilledById: overrides?.fulfilledById ?? null,
      cancelledById: overrides?.cancelledById ?? null,
      requestedAt: overrides?.requestedAt ?? NOW,
      reviewedAt: overrides?.reviewedAt ?? null,
      fulfilledAt: overrides?.fulfilledAt ?? null,
      cancelledAt: overrides?.cancelledAt ?? null,
      requestNoteEn: overrides?.requestNoteEn ?? null,
      requestNoteAr: overrides?.requestNoteAr ?? null,
      reviewNoteEn: overrides?.reviewNoteEn ?? null,
      reviewNoteAr: overrides?.reviewNoteAr ?? null,
      fulfillmentNoteEn: overrides?.fulfillmentNoteEn ?? null,
      fulfillmentNoteAr: overrides?.fulfillmentNoteAr ?? null,
      cancellationReasonEn: overrides?.cancellationReasonEn ?? null,
      cancellationReasonAr: overrides?.cancellationReasonAr ?? null,
      eligibilitySnapshot:
        overrides?.eligibilitySnapshot ??
        ({
          minTotalXp: 10,
          totalEarnedXp: 100,
          eligible: true,
          stockAvailable: true,
          isUnlimited: false,
          stockRemaining: 3,
          catalogItemStatus: 'published',
        } as Record<string, unknown>),
      metadata: overrides?.metadata ?? null,
      createdAt: overrides?.createdAt ?? NOW,
      updatedAt: overrides?.updatedAt ?? NOW,
      catalogItem: rewardRecord({
        id: overrides?.catalogItemId ?? REWARD_ID,
        status: RewardCatalogItemStatus.PUBLISHED,
        isUnlimited: false,
        stockRemaining: 3,
      }),
      student: studentRecord(),
      enrollment:
        overrides?.enrollment === null
          ? null
          : enrollmentRecord({ id: overrides?.enrollmentId ?? ENROLLMENT_ID }),
      academicYear: {
        id: YEAR_ID,
        nameAr: 'Year AR',
        nameEn: 'Year',
        isActive: true,
      },
      term: {
        id: TERM_ID,
        academicYearId: YEAR_ID,
        nameAr: 'Term AR',
        nameEn: 'Term',
        isActive: true,
      },
    } as never;
  }

  function studentRecord(overrides?: any) {
    return {
      id: overrides?.id ?? STUDENT_ID,
      firstName: overrides?.firstName ?? 'Mona',
      lastName: overrides?.lastName ?? 'Salem',
      status: overrides?.status ?? StudentStatus.ACTIVE,
      deletedAt: overrides?.deletedAt ?? null,
    } as never;
  }

  function enrollmentRecord(overrides?: any) {
    return {
      id: overrides?.id ?? ENROLLMENT_ID,
      studentId: overrides?.studentId ?? STUDENT_ID,
      academicYearId: overrides?.academicYearId ?? YEAR_ID,
      termId: overrides?.termId ?? TERM_ID,
      classroomId: overrides?.classroomId ?? 'classroom-1',
      status: overrides?.status ?? StudentEnrollmentStatus.ACTIVE,
      enrolledAt: overrides?.enrolledAt ?? NOW,
      deletedAt: overrides?.deletedAt ?? null,
      classroom: {
        id: 'classroom-1',
        sectionId: 'section-1',
        section: {
          id: 'section-1',
          gradeId: 'grade-1',
          grade: {
            id: 'grade-1',
            stageId: 'stage-1',
          },
        },
      },
    } as never;
  }
});
