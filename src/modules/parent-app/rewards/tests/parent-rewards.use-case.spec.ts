import { RewardRedemptionStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { GetParentChildRewardRedemptionUseCase } from '../application/get-parent-child-reward-redemption.use-case';
import { GetParentChildRewardUseCase } from '../application/get-parent-child-reward.use-case';
import { ListParentChildRewardRedemptionsUseCase } from '../application/list-parent-child-reward-redemptions.use-case';
import { ListParentChildRewardsUseCase } from '../application/list-parent-child-rewards.use-case';
import { ParentRewardsReadAdapter } from '../infrastructure/parent-rewards-read.adapter';

describe('Parent Rewards use-cases', () => {
  it('rejects non-parent actors through ParentAppAccessService before reading rewards', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(listUseCase.execute('student-1')).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.listRewards).not.toHaveBeenCalled();
  });

  it('validates child ownership before listing rewards', async () => {
    const { listUseCase, accessService, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.listRewards.mockResolvedValue({
      child: childFixture(),
      rewards: [],
      total: 0,
      page: 1,
      limit: 50,
      totalEarnedXp: 25,
    });

    const result = await listUseCase.execute('student-1', {
      type: 'privilege',
    });

    expect(accessService.assertParentOwnsStudent).toHaveBeenCalledWith(
      'student-1',
    );
    expect(readAdapter.listRewards).toHaveBeenCalledWith(childFixture(), {
      type: 'privilege',
    });
    expect(result.child.studentId).toBe('student-1');
  });

  it('returns safe not found for reward or redemption outside the linked child scope', async () => {
    const { getRewardUseCase, getRedemptionUseCase, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.findReward.mockResolvedValue(null);
    readAdapter.findRedemption.mockResolvedValue(null);

    await expect(
      getRewardUseCase.execute('student-1', 'reward-1'),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      getRedemptionUseCase.execute('student-1', 'redemption-1'),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('keeps parent rewards read use-cases mutation-free', async () => {
    const { redemptionsUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listRedemptions.mockResolvedValue({
      child: childFixture(),
      redemptions: [],
      statusCounts: { [RewardRedemptionStatus.REQUESTED]: 0 },
      totalEarnedXp: 25,
    });

    const result = await redemptionsUseCase.execute('student-1');

    expect(readAdapter.listRedemptions).toHaveBeenCalledWith(childFixture());
    expect(result.summary.total).toBe(0);
  });
});

function createUseCases() {
  const accessService = {
    assertParentOwnsStudent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    listRewards: jest.fn(),
    findReward: jest.fn(),
    listRedemptions: jest.fn(),
    findRedemption: jest.fn(),
  } as unknown as jest.Mocked<ParentRewardsReadAdapter>;

  return {
    listUseCase: new ListParentChildRewardsUseCase(
      accessService,
      readAdapter,
    ),
    getRewardUseCase: new GetParentChildRewardUseCase(
      accessService,
      readAdapter,
    ),
    redemptionsUseCase: new ListParentChildRewardRedemptionsUseCase(
      accessService,
      readAdapter,
    ),
    getRedemptionUseCase: new GetParentChildRewardRedemptionUseCase(
      accessService,
      readAdapter,
    ),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.assertParentOwnsStudent.mockResolvedValue(
    childFixture(),
  );
  return created;
}

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}
