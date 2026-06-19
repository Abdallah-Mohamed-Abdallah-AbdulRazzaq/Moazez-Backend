import {
  FileVisibility,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateRewardRedemptionUseCase } from '../../../reinforcement/rewards/application/reward-redemptions.use-cases';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { GetStudentRewardRedemptionUseCase } from '../application/get-student-reward-redemption.use-case';
import { GetStudentRewardUseCase } from '../application/get-student-reward.use-case';
import { ListStudentRewardRedemptionsUseCase } from '../application/list-student-reward-redemptions.use-case';
import { ListStudentRewardsUseCase } from '../application/list-student-rewards.use-case';
import { RedeemStudentRewardUseCase } from '../application/redeem-student-reward.use-case';
import { StudentRewardsReadAdapter } from '../infrastructure/student-rewards-read.adapter';
import type {
  StudentRewardCatalogReadModel,
  StudentRewardRedemptionReadModel,
} from '../infrastructure/student-rewards-read.adapter';

describe('Student Rewards use cases', () => {
  let accessService: jest.Mocked<StudentAppAccessService>;
  let readAdapter: jest.Mocked<StudentRewardsReadAdapter>;
  let createRewardRedemptionUseCase: jest.Mocked<CreateRewardRedemptionUseCase>;

  beforeEach(() => {
    accessService = {
      getCurrentStudentWithEnrollment: jest
        .fn()
        .mockResolvedValue({ context: contextFixture() }),
    } as unknown as jest.Mocked<StudentAppAccessService>;

    readAdapter = {
      listRewards: jest.fn(),
      findReward: jest.fn(),
      listRedemptions: jest.fn(),
      findRedemption: jest.fn(),
    } as unknown as jest.Mocked<StudentRewardsReadAdapter>;

    createRewardRedemptionUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateRewardRedemptionUseCase>;
  });

  it('lists visible rewards for the current student context', async () => {
    readAdapter.listRewards.mockResolvedValue({
      rewards: [rewardFixture()],
      total: 1,
      page: 1,
      limit: 50,
      totalEarnedXp: 25,
    });

    const result = await new ListStudentRewardsUseCase(
      accessService,
      readAdapter,
    ).execute({ type: 'privilege' });

    expect(readAdapter.listRewards).toHaveBeenCalledWith(contextFixture(), {
      type: 'privilege',
    });
    expect(result.rewards).toHaveLength(1);
    expect(result.xp).toEqual({ totalEarnedXp: 25 });
  });

  it('hides reward detail when the reward is outside the current student scope', async () => {
    readAdapter.findReward.mockResolvedValue(null);

    await expect(
      new GetStudentRewardUseCase(accessService, readAdapter).execute(
        'hidden-reward',
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(readAdapter.findReward).toHaveBeenCalledWith({
      context: contextFixture(),
      rewardId: 'hidden-reward',
    });
  });

  it('lists only current-student redemptions through the read adapter', async () => {
    readAdapter.listRedemptions.mockResolvedValue({
      redemptions: [redemptionFixture()],
      statusCounts: { [RewardRedemptionStatus.REQUESTED]: 1 },
      totalEarnedXp: 25,
    });

    const result = await new ListStudentRewardRedemptionsUseCase(
      accessService,
      readAdapter,
    ).execute();

    expect(readAdapter.listRedemptions).toHaveBeenCalledWith(contextFixture());
    expect(result.redemptions).toEqual([
      expect.objectContaining({ redemptionId: 'redemption-1' }),
    ]);
  });

  it('hides redemption detail when it is not owned by the current student', async () => {
    readAdapter.findRedemption.mockResolvedValue(null);

    await expect(
      new GetStudentRewardRedemptionUseCase(
        accessService,
        readAdapter,
      ).execute('other-redemption'),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(readAdapter.findRedemption).toHaveBeenCalledWith({
      context: contextFixture(),
      redemptionId: 'other-redemption',
    });
  });

  it('redeems by delegating to Rewards core with server-derived current-student identity', async () => {
    readAdapter.findReward.mockResolvedValue({
      reward: rewardFixture(),
      totalEarnedXp: 25,
    });
    createRewardRedemptionUseCase.execute.mockResolvedValue({
      id: 'redemption-created',
      studentId: 'hidden-core-student',
      requestedById: 'hidden-core-actor',
    });
    readAdapter.findRedemption.mockResolvedValue({
      redemption: redemptionFixture({ id: 'redemption-created' }),
      totalEarnedXp: 25,
    });

    const result = await new RedeemStudentRewardUseCase(
      accessService,
      readAdapter,
      createRewardRedemptionUseCase,
    ).execute({
      rewardId: 'reward-1',
      dto: { note: '  Please approve  ' },
    });

    expect(createRewardRedemptionUseCase.execute).toHaveBeenCalledWith({
      catalogItemId: 'reward-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      requestSource: 'student_app',
      requestNoteEn: 'Please approve',
    });
    expect(readAdapter.findRedemption).toHaveBeenCalledWith({
      context: contextFixture(),
      redemptionId: 'redemption-created',
    });
    expect(JSON.stringify(result)).not.toContain('hidden-core-student');
    expect(JSON.stringify(result)).not.toContain('requestedById');
    expect(result.redemption).toMatchObject({
      redemptionId: 'redemption-created',
      status: 'requested',
    });
  });

  it('does not call Rewards core when the reward is not visible to the current student', async () => {
    readAdapter.findReward.mockResolvedValue(null);

    await expect(
      new RedeemStudentRewardUseCase(
        accessService,
        readAdapter,
        createRewardRedemptionUseCase,
      ).execute({ rewardId: 'hidden-reward', dto: {} }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(createRewardRedemptionUseCase.execute).not.toHaveBeenCalled();
  });
});

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function rewardFixture(
  overrides: Partial<StudentRewardCatalogReadModel> = {},
): StudentRewardCatalogReadModel {
  return {
    id: 'reward-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    titleEn: 'Reward',
    titleAr: null,
    descriptionEn: 'Visible reward',
    descriptionAr: null,
    type: RewardCatalogItemType.PRIVILEGE,
    status: RewardCatalogItemStatus.PUBLISHED,
    minTotalXp: 10,
    stockRemaining: null,
    isUnlimited: true,
    imageFileId: 'file-1',
    publishedAt: new Date('2026-01-01T08:00:00.000Z'),
    imageFile: {
      id: 'file-1',
      originalName: 'reward.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      visibility: FileVisibility.PRIVATE,
      createdAt: new Date('2026-01-01T07:00:00.000Z'),
    },
    ...overrides,
  } as StudentRewardCatalogReadModel;
}

function redemptionFixture(
  overrides: Partial<StudentRewardRedemptionReadModel> = {},
): StudentRewardRedemptionReadModel {
  return {
    id: 'redemption-1',
    catalogItemId: 'reward-1',
    status: RewardRedemptionStatus.REQUESTED,
    requestSource: RewardRedemptionRequestSource.STUDENT_APP,
    requestedAt: new Date('2026-01-02T08:00:00.000Z'),
    reviewedAt: null,
    fulfilledAt: null,
    cancelledAt: null,
    requestNoteEn: 'Student note',
    requestNoteAr: null,
    catalogItem: rewardFixture(),
    ...overrides,
  } as StudentRewardRedemptionReadModel;
}
