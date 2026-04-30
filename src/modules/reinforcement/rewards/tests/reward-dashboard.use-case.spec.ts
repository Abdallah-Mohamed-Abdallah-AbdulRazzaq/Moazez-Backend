import {
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  GetRewardCatalogSummaryUseCase,
  GetRewardsOverviewUseCase,
  GetStudentRewardsSummaryUseCase,
} from '../application/reward-dashboard.use-cases';
import { RewardDashboardRepository } from '../infrastructure/reward-dashboard.repository';

const SCHOOL_ID = 'school-1';
const ORG_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STUDENT_ID = 'student-1';
const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Reward dashboard use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ACTOR_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: ORG_ID,
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [
          'reinforcement.rewards.view',
          'reinforcement.rewards.redemptions.view',
        ],
      });

      return fn();
    });
  }

  it('overview use-case validates academicYear and term ownership', async () => {
    const repository = baseRepository({
      findTerm: jest.fn().mockResolvedValue({
        id: TERM_ID,
        academicYearId: 'other-year',
        nameAr: 'Term AR',
        nameEn: 'Term',
        isActive: true,
      }),
    });

    await expect(
      withScope(() =>
        new GetRewardsOverviewUseCase(repository).execute({
          academicYearId: YEAR_ID,
          termId: TERM_ID,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.loadRewardsOverviewData).not.toHaveBeenCalled();
  });

  it('overview use-case returns combined catalog/redemption/xp/top/recent/stock summary', async () => {
    const repository = baseRepository();

    const result = await withScope(() =>
      new GetRewardsOverviewUseCase(repository).execute({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        status: 'requested',
        type: 'physical',
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30',
      }),
    );

    expect(repository.loadRewardsOverviewData).toHaveBeenCalledWith(
      expect.objectContaining({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        status: RewardRedemptionStatus.REQUESTED,
        type: RewardCatalogItemType.PHYSICAL,
        includeArchived: false,
        dateFrom: new Date('2026-04-01T00:00:00.000Z'),
        dateTo: new Date('2026-04-30T23:59:59.999Z'),
      }),
    );
    expect(result.catalog).toMatchObject({
      total: 2,
      published: 2,
      physical: 2,
      available: 2,
      lowStock: 1,
    });
    expect(result.redemptions).toMatchObject({
      total: 2,
      requested: 1,
      fulfilled: 1,
      open: 1,
      terminal: 1,
    });
    expect(result.fulfillment.fulfillmentRate).toBe(0.5);
    expect(result.xp).toEqual({
      totalEarnedXp: 150,
      studentsWithXp: 2,
      averageEarnedXp: 75,
    });
    expect(result.topRequestedRewards[0]).toMatchObject({
      catalogItemId: 'reward-1',
      totalRequests: 2,
    });
    expect(result.recentRedemptions).toHaveLength(1);
    expect(result.lowStockRewards).toHaveLength(1);
  });

  it('student summary validates student ownership', async () => {
    const repository = baseRepository({
      loadStudentRewardsSummaryData: jest.fn().mockResolvedValue(null),
    });

    await expect(
      withScope(() =>
        new GetStudentRewardsSummaryUseCase(repository).execute(STUDENT_ID, {}),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('student summary aggregates XP and redemption history', async () => {
    const repository = baseRepository();

    const result = await withScope(() =>
      new GetStudentRewardsSummaryUseCase(repository).execute(STUDENT_ID, {
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        includeCatalogEligibility: true,
        includeHistory: true,
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30',
      }),
    );

    expect(repository.loadStudentRewardsSummaryData).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: STUDENT_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        includeCatalogEligibility: true,
        dateFrom: new Date('2026-04-01T00:00:00.000Z'),
        dateTo: new Date('2026-04-30T23:59:59.999Z'),
      }),
    );
    expect(result.xp.totalEarnedXp).toBe(100);
    expect(result.redemptionsSummary).toMatchObject({
      total: 2,
      requested: 1,
      fulfilled: 1,
    });
    expect(result.history).toHaveLength(2);
    expect(result.eligibility[0]).toMatchObject({
      catalogItemId: 'reward-1',
      isEligible: false,
      hasOpenRedemption: true,
      openRedemptionId: 'redemption-1',
    });
  });

  it('catalog summary validates filters and returns per-item counters', async () => {
    const repository = baseRepository();

    const result = await withScope(() =>
      new GetRewardCatalogSummaryUseCase(repository).execute({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        status: 'published',
        type: 'physical',
        includeArchived: false,
        includeDeleted: false,
        onlyAvailable: true,
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30',
      }),
    );

    expect(repository.loadRewardCatalogSummaryData).toHaveBeenCalledWith(
      expect.objectContaining({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        status: RewardCatalogItemStatus.PUBLISHED,
        type: RewardCatalogItemType.PHYSICAL,
        includeArchived: false,
        includeDeleted: false,
        onlyAvailable: true,
        dateFrom: new Date('2026-04-01T00:00:00.000Z'),
        dateTo: new Date('2026-04-30T23:59:59.999Z'),
      }),
    );
    expect(result.summary).toMatchObject({
      total: 2,
      published: 2,
      available: 2,
      lowStock: 1,
    });
    expect(result.items[0].redemptions).toMatchObject({
      total: 2,
      requested: 1,
      fulfilled: 1,
    });
  });

  it('reads are not audited and repository write methods are not called', async () => {
    const repository = baseRepository();

    await withScope(() => new GetRewardsOverviewUseCase(repository).execute({}));
    await withScope(() =>
      new GetStudentRewardsSummaryUseCase(repository).execute(STUDENT_ID, {}),
    );
    await withScope(() =>
      new GetRewardCatalogSummaryUseCase(repository).execute({}),
    );

    expect(repository.createAuditLog).not.toHaveBeenCalled();
    expect(repository.createCatalogItem).not.toHaveBeenCalled();
    expect(repository.updateCatalogItem).not.toHaveBeenCalled();
    expect(repository.createRedemption).not.toHaveBeenCalled();
    expect(repository.approveRedemptionWithStockDecrement).not.toHaveBeenCalled();
  });

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const repository = {
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
      findStudent: jest.fn().mockResolvedValue(student()),
      loadRewardsOverviewData: jest.fn().mockResolvedValue({
        catalogItems: [
          catalogItem({ id: 'reward-1' }),
          catalogItem({
            id: 'reward-low',
            isUnlimited: false,
            stockQuantity: 20,
            stockRemaining: 4,
          }),
        ],
        redemptions: [
          redemption({ id: 'redemption-1' }),
          redemption({
            id: 'redemption-2',
            status: RewardRedemptionStatus.FULFILLED,
          }),
        ],
        xpStudentTotals: [
          { studentId: 'student-1', totalEarnedXp: 100 },
          { studentId: 'student-2', totalEarnedXp: 50 },
        ],
        recentRedemptions: [redemption({ id: 'redemption-recent' })],
        lowStockCandidates: [
          catalogItem({
            id: 'reward-low',
            isUnlimited: false,
            stockQuantity: 20,
            stockRemaining: 4,
          }),
        ],
      }),
      loadStudentRewardsSummaryData: jest.fn().mockResolvedValue({
        student: student(),
        redemptions: [
          redemption({ id: 'redemption-1' }),
          redemption({
            id: 'redemption-2',
            status: RewardRedemptionStatus.FULFILLED,
          }),
        ],
        catalogItems: [catalogItem({ id: 'reward-1' })],
        openRedemptions: [redemption({ id: 'redemption-1' })],
        totalEarnedXp: 100,
      }),
      loadRewardCatalogSummaryData: jest.fn().mockResolvedValue({
        catalogItems: [
          catalogItem({ id: 'reward-1' }),
          catalogItem({
            id: 'reward-low',
            isUnlimited: false,
            stockQuantity: 20,
            stockRemaining: 4,
          }),
        ],
        redemptions: [
          redemption({ id: 'redemption-1', catalogItemId: 'reward-1' }),
          redemption({
            id: 'redemption-2',
            catalogItemId: 'reward-1',
            status: RewardRedemptionStatus.FULFILLED,
          }),
        ],
      }),
      createAuditLog: jest.fn(),
      createCatalogItem: jest.fn(),
      updateCatalogItem: jest.fn(),
      createRedemption: jest.fn(),
      approveRedemptionWithStockDecrement: jest.fn(),
      ...overrides,
    };

    return repository as unknown as jest.Mocked<RewardDashboardRepository> & {
      createAuditLog: jest.Mock;
      createCatalogItem: jest.Mock;
      updateCatalogItem: jest.Mock;
      createRedemption: jest.Mock;
      approveRedemptionWithStockDecrement: jest.Mock;
    };
  }

  function catalogItem(overrides?: any) {
    return {
      id: overrides?.id ?? 'reward-1',
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
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
      imageFileId: null,
      sortOrder: 0,
      publishedAt: NOW,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    } as never;
  }

  function redemption(overrides?: any) {
    return {
      id: overrides?.id ?? 'redemption-1',
      schoolId: SCHOOL_ID,
      catalogItemId: overrides?.catalogItemId ?? 'reward-1',
      studentId: STUDENT_ID,
      enrollmentId: 'enrollment-1',
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      status: overrides?.status ?? RewardRedemptionStatus.REQUESTED,
      requestSource: RewardRedemptionRequestSource.DASHBOARD,
      requestedAt: NOW,
      reviewedAt: null,
      fulfilledAt: null,
      cancelledAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      catalogItem: catalogItem({ id: overrides?.catalogItemId ?? 'reward-1' }),
      student: student(),
    } as never;
  }

  function student(overrides?: any) {
    return {
      id: overrides?.id ?? STUDENT_ID,
      firstName: 'Mona',
      lastName: 'Salem',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
    } as never;
  }
});
