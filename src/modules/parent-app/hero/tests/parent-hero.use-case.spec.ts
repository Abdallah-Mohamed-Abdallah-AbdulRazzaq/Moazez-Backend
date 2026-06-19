import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { GetParentChildHeroMissionUseCase } from '../application/get-parent-child-hero-mission.use-case';
import { GetParentChildHeroOverviewUseCase } from '../application/get-parent-child-hero-overview.use-case';
import { GetParentChildHeroProgressUseCase } from '../application/get-parent-child-hero-progress.use-case';
import { ListParentChildHeroBadgesUseCase } from '../application/list-parent-child-hero-badges.use-case';
import { ListParentChildHeroMissionsUseCase } from '../application/list-parent-child-hero-missions.use-case';
import { ParentHeroReadAdapter } from '../infrastructure/parent-hero-read.adapter';

describe('Parent Hero use-cases', () => {
  it('rejects non-parent actors through ParentAppAccessService before reading hero data', async () => {
    const { overviewUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(overviewUseCase.execute('student-1')).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.getHeroOverview).not.toHaveBeenCalled();
  });

  it('validates child ownership before listing child hero missions', async () => {
    const { missionsUseCase, accessService, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.listMissions.mockResolvedValue({
      child: childFixture(),
      missions: [],
      page: 1,
      limit: 50,
      total: 0,
    });

    const result = await missionsUseCase.execute('student-1', {
      status: 'in_progress',
    });

    expect(accessService.assertParentOwnsStudent).toHaveBeenCalledWith(
      'student-1',
    );
    expect(readAdapter.listMissions).toHaveBeenCalledWith(childFixture(), {
      status: 'in_progress',
    });
    expect(result.child.studentId).toBe('student-1');
  });

  it('returns safe not found when a mission is not visible for the linked child', async () => {
    const { missionUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findMission.mockResolvedValue(null);

    await expect(
      missionUseCase.execute('student-1', 'mission-1'),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('keeps parent hero read use-cases mutation-free', async () => {
    const { progressUseCase, badgesUseCase, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.getHeroProgress.mockResolvedValue({
      child: childFixture(),
      missions: [],
    });
    readAdapter.listBadges.mockResolvedValue([]);

    await progressUseCase.execute('student-1');
    await badgesUseCase.execute('student-1');

    expect(readAdapter.getHeroProgress).toHaveBeenCalledWith(childFixture());
    expect(readAdapter.listBadges).toHaveBeenCalledWith(childFixture());
  });
});

function createUseCases() {
  const accessService = {
    assertParentOwnsStudent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    getHeroOverview: jest.fn(),
    getHeroProgress: jest.fn(),
    listBadges: jest.fn(),
    listMissions: jest.fn(),
    findMission: jest.fn(),
  } as unknown as jest.Mocked<ParentHeroReadAdapter>;

  return {
    overviewUseCase: new GetParentChildHeroOverviewUseCase(
      accessService,
      readAdapter,
    ),
    progressUseCase: new GetParentChildHeroProgressUseCase(
      accessService,
      readAdapter,
    ),
    badgesUseCase: new ListParentChildHeroBadgesUseCase(
      accessService,
      readAdapter,
    ),
    missionsUseCase: new ListParentChildHeroMissionsUseCase(
      accessService,
      readAdapter,
    ),
    missionUseCase: new GetParentChildHeroMissionUseCase(
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
