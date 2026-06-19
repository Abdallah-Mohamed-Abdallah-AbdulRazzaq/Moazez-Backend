import {
  HeroMissionObjectiveType,
  HeroMissionProgressStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import {
  CompleteHeroMissionUseCase,
  CompleteHeroObjectiveUseCase,
  StartHeroMissionUseCase,
} from '../../../reinforcement/hero-journey/application/hero-journey-progress.use-cases';
import { CompleteStudentHeroMissionUseCase } from '../application/complete-student-hero-mission.use-case';
import { CompleteStudentHeroObjectiveUseCase } from '../application/complete-student-hero-objective.use-case';
import { GetStudentHeroMissionUseCase } from '../application/get-student-hero-mission.use-case';
import { GetStudentHeroOverviewUseCase } from '../application/get-student-hero-overview.use-case';
import { GetStudentHeroProgressUseCase } from '../application/get-student-hero-progress.use-case';
import { ListStudentHeroBadgesUseCase } from '../application/list-student-hero-badges.use-case';
import { ListStudentHeroMissionsUseCase } from '../application/list-student-hero-missions.use-case';
import { StartStudentHeroMissionUseCase } from '../application/start-student-hero-mission.use-case';
import {
  StudentHeroReadAdapter,
  type StudentHeroMissionDetailReadModel,
  type StudentHeroMissionsReadModel,
  type StudentHeroOverviewReadModel,
  type StudentHeroProgressSummaryReadModel,
} from '../infrastructure/student-hero-read.adapter';

describe('Student Hero use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { overviewUseCase, accessService, readAdapter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(overviewUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.getHeroOverview).not.toHaveBeenCalled();
  });

  it('returns current student hero overview without mutations', async () => {
    const { overviewUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.getHeroOverview.mockResolvedValue(overviewFixture());

    const result = await overviewUseCase.execute();

    expect(readAdapter.getHeroOverview).toHaveBeenCalledWith(contextFixture());
    expect(result.stats).toMatchObject({
      currentXp: 25,
      level: null,
      requiredXp: null,
      badgesCollected: 1,
    });
    expect(result.levels).toEqual([
      expect.objectContaining({
        missionId: 'mission-1',
        status: 'completed',
      }),
    ]);
  });

  it('lists published missions for the current student', async () => {
    const { missionsUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listMissions.mockResolvedValue(missionsFixture());

    const result = await missionsUseCase.execute({ status: 'completed' });

    expect(readAdapter.listMissions).toHaveBeenCalledWith(contextFixture(), {
      status: 'completed',
    });
    expect(result.missions).toEqual([
      expect.objectContaining({
        missionId: 'mission-1',
        status: 'completed',
        rewardXp: 10,
      }),
    ]);
    expect(result.visibility).toEqual({
      missionStatus: 'published',
      reason: 'published_stage_term_missions_only',
    });
  });

  it('returns badges and progress read-only summaries', async () => {
    const { badgesUseCase, progressUseCase, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.listBadges.mockResolvedValue([badgeFixture()]);
    readAdapter.getHeroProgress.mockResolvedValue(progressFixture());

    const badges = await badgesUseCase.execute();
    const progress = await progressUseCase.execute();

    expect(badges.summary.collected).toBe(1);
    expect(progress.summary).toMatchObject({
      total: 1,
      completed: 1,
    });
  });

  it('rejects inaccessible mission details', async () => {
    const { missionUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findMission.mockResolvedValue(null);

    await expect(
      missionUseCase.execute('outside-mission'),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('starts the current student own visible mission through Hero Journey core', async () => {
    const { startMissionUseCase, readAdapter, startHeroMissionUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findMission
      .mockResolvedValueOnce(missionDetailFixture({ progress: null }))
      .mockResolvedValueOnce(
        missionDetailFixture({
          progress: progressRecordFixture({
            status: HeroMissionProgressStatus.IN_PROGRESS,
            progressPercent: 0,
            completedAt: null,
            objectiveProgress: [],
          }),
        }),
      );
    startHeroMissionUseCase.execute.mockResolvedValue({} as never);

    const result = await startMissionUseCase.execute('mission-1');

    expect(startHeroMissionUseCase.execute).toHaveBeenCalledWith(
      'student-1',
      'mission-1',
      { enrollmentId: 'enrollment-1' },
    );
    expect(result).toMatchObject({
      missionId: 'mission-1',
      progressStatus: 'in_progress',
      progress: {
        progressId: 'progress-1',
        progressPercent: 0,
        completedAt: null,
      },
    });
    assertNoForbiddenHeroFields(result);
  });

  it('completes the current student own started mission through Hero Journey core', async () => {
    const { completeMissionUseCase, readAdapter, completeHeroMissionUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findMission
      .mockResolvedValueOnce(
        missionDetailFixture({
          progress: progressRecordFixture({
            status: HeroMissionProgressStatus.IN_PROGRESS,
            progressPercent: 100,
            completedAt: null,
          }),
        }),
      )
      .mockResolvedValueOnce(missionDetailFixture());
    completeHeroMissionUseCase.execute.mockResolvedValue({} as never);

    const result = await completeMissionUseCase.execute('mission-1');

    expect(completeHeroMissionUseCase.execute).toHaveBeenCalledWith(
      'progress-1',
      {},
    );
    expect(result).toMatchObject({
      missionId: 'mission-1',
      progressStatus: 'completed',
      progress: {
        progressId: 'progress-1',
        progressPercent: 100,
      },
    });
    assertNoForbiddenHeroFields(result);
  });

  it('completes the current student own mission objective through Hero Journey core', async () => {
    const {
      completeObjectiveUseCase,
      readAdapter,
      completeHeroObjectiveUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findMission
      .mockResolvedValueOnce(
        missionDetailFixture({
          progress: progressRecordFixture({
            status: HeroMissionProgressStatus.IN_PROGRESS,
            progressPercent: 0,
            completedAt: null,
            objectiveProgress: [],
          }),
        }),
      )
      .mockResolvedValueOnce(
        missionDetailFixture({
          progress: progressRecordFixture({
            status: HeroMissionProgressStatus.IN_PROGRESS,
            progressPercent: 100,
            completedAt: null,
          }),
        }),
      );
    completeHeroObjectiveUseCase.execute.mockResolvedValue({} as never);

    const result = await completeObjectiveUseCase.execute({
      missionId: 'mission-1',
      objectiveId: 'objective-1',
    });

    expect(completeHeroObjectiveUseCase.execute).toHaveBeenCalledWith(
      'progress-1',
      'objective-1',
      {},
    );
    expect(result.objectives).toEqual([
      expect.objectContaining({
        id: 'objective-1',
        isCompleted: true,
      }),
    ]);
    assertNoForbiddenHeroFields(result);
  });

  it('does not delegate start when the mission is not visible to the current student', async () => {
    const { startMissionUseCase, readAdapter, startHeroMissionUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findMission.mockResolvedValue(null);

    await expect(startMissionUseCase.execute('outside-mission')).rejects.toMatchObject(
      { httpStatus: 404 },
    );
    expect(startHeroMissionUseCase.execute).not.toHaveBeenCalled();
  });

  it('does not delegate mission completion without current student progress', async () => {
    const { completeMissionUseCase, readAdapter, completeHeroMissionUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findMission.mockResolvedValue(
      missionDetailFixture({ progress: null }),
    );

    await expect(
      completeMissionUseCase.execute('mission-1'),
    ).rejects.toMatchObject({ httpStatus: 404 });
    expect(completeHeroMissionUseCase.execute).not.toHaveBeenCalled();
  });

  it('does not delegate objective completion for objectives outside the mission', async () => {
    const {
      completeObjectiveUseCase,
      readAdapter,
      completeHeroObjectiveUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findMission.mockResolvedValue(missionDetailFixture());

    await expect(
      completeObjectiveUseCase.execute({
        missionId: 'mission-1',
        objectiveId: 'outside-objective',
      }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    expect(completeHeroObjectiveUseCase.execute).not.toHaveBeenCalled();
  });
});

function createUseCases(): {
  overviewUseCase: GetStudentHeroOverviewUseCase;
  progressUseCase: GetStudentHeroProgressUseCase;
  badgesUseCase: ListStudentHeroBadgesUseCase;
  missionsUseCase: ListStudentHeroMissionsUseCase;
  missionUseCase: GetStudentHeroMissionUseCase;
  startMissionUseCase: StartStudentHeroMissionUseCase;
  completeMissionUseCase: CompleteStudentHeroMissionUseCase;
  completeObjectiveUseCase: CompleteStudentHeroObjectiveUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentHeroReadAdapter>;
  startHeroMissionUseCase: jest.Mocked<StartHeroMissionUseCase>;
  completeHeroMissionUseCase: jest.Mocked<CompleteHeroMissionUseCase>;
  completeHeroObjectiveUseCase: jest.Mocked<CompleteHeroObjectiveUseCase>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    getHeroOverview: jest.fn(),
    getHeroProgress: jest.fn(),
    listBadges: jest.fn(),
    listMissions: jest.fn(),
    findMission: jest.fn(),
  } as unknown as jest.Mocked<StudentHeroReadAdapter>;
  const startHeroMissionUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<StartHeroMissionUseCase>;
  const completeHeroMissionUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<CompleteHeroMissionUseCase>;
  const completeHeroObjectiveUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<CompleteHeroObjectiveUseCase>;

  return {
    overviewUseCase: new GetStudentHeroOverviewUseCase(
      accessService,
      readAdapter,
    ),
    progressUseCase: new GetStudentHeroProgressUseCase(
      accessService,
      readAdapter,
    ),
    badgesUseCase: new ListStudentHeroBadgesUseCase(accessService, readAdapter),
    missionsUseCase: new ListStudentHeroMissionsUseCase(
      accessService,
      readAdapter,
    ),
    missionUseCase: new GetStudentHeroMissionUseCase(
      accessService,
      readAdapter,
    ),
    startMissionUseCase: new StartStudentHeroMissionUseCase(
      accessService,
      readAdapter,
      startHeroMissionUseCase,
    ),
    completeMissionUseCase: new CompleteStudentHeroMissionUseCase(
      accessService,
      readAdapter,
      completeHeroMissionUseCase,
    ),
    completeObjectiveUseCase: new CompleteStudentHeroObjectiveUseCase(
      accessService,
      readAdapter,
      completeHeroObjectiveUseCase,
    ),
    accessService,
    readAdapter,
    startHeroMissionUseCase,
    completeHeroMissionUseCase,
    completeHeroObjectiveUseCase,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
    currentStudentFixture(),
  );
  return created;
}

function currentStudentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: contextFixture(),
    student: {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: 'student-user-1',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
      user: {
        id: 'student-user-1',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
    enrollment: {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
    },
  };
}

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function overviewFixture(): StudentHeroOverviewReadModel {
  return {
    currentXp: 25,
    badges: [badgeFixture()],
    missions: missionsFixture().missions,
    rewardsSummary: {
      totalHeroXp: 10,
      completedMissions: 1,
      rewardRedemptions: { requested: 0, approved: 0, fulfilled: 0 },
    },
  };
}

function progressFixture(): StudentHeroProgressSummaryReadModel {
  return { missions: missionsFixture().missions };
}

function missionsFixture(): StudentHeroMissionsReadModel {
  return {
    missions: [
      {
        mission: missionFixture(),
        progress: progressRecordFixture(),
      },
    ],
    page: 1,
    limit: 50,
    total: 1,
  };
}

function missionDetailFixture(
  overrides: Partial<StudentHeroMissionDetailReadModel> = {},
): StudentHeroMissionDetailReadModel {
  return {
    mission: overrides.mission ?? missionFixture(),
    progress:
      Object.prototype.hasOwnProperty.call(overrides, 'progress')
        ? (overrides.progress ?? null)
        : progressRecordFixture(),
  };
}

function missionFixture() {
  return {
    id: 'mission-1',
    subjectId: 'subject-1',
    titleEn: 'Hero Mission',
    titleAr: null,
    briefEn: 'Read-only mission brief',
    briefAr: null,
    requiredLevel: 1,
    rewardXp: 10,
    positionX: 10,
    positionY: 20,
    sortOrder: 1,
    badgeReward: {
      id: 'badge-1',
      slug: 'brave-reader',
      nameEn: 'Brave Reader',
      nameAr: null,
      descriptionEn: 'Hidden from reward summary',
      descriptionAr: null,
    },
    objectives: [
      {
        id: 'objective-1',
        type: HeroMissionObjectiveType.QUIZ,
        titleEn: 'Finish the quiz',
        titleAr: null,
        subtitleEn: 'Chapter 1',
        subtitleAr: null,
        sortOrder: 1,
        isRequired: true,
      },
    ],
  };
}

function progressRecordFixture(
  overrides: Partial<NonNullable<StudentHeroMissionDetailReadModel['progress']>> = {},
) {
  const base = {
    id: 'progress-1',
    missionId: 'mission-1',
    status: HeroMissionProgressStatus.COMPLETED,
    progressPercent: 100,
    startedAt: new Date('2026-10-01T08:00:00.000Z'),
    completedAt: new Date('2026-10-02T08:00:00.000Z'),
    lastActivityAt: new Date('2026-10-02T08:00:00.000Z'),
    objectiveProgress: [
      {
        objectiveId: 'objective-1',
        completedAt: new Date('2026-10-02T08:00:00.000Z'),
      },
    ],
  };
  return {
    ...base,
    ...overrides,
    objectiveProgress: overrides.objectiveProgress ?? base.objectiveProgress,
  };
}

function badgeFixture() {
  return {
    id: 'student-badge-1',
    badgeId: 'badge-1',
    missionId: 'mission-1',
    earnedAt: new Date('2026-10-02T08:00:00.000Z'),
    badge: {
      id: 'badge-1',
      slug: 'brave-reader',
      nameEn: 'Brave Reader',
      nameAr: null,
      descriptionEn: 'Completed a mission',
      descriptionAr: null,
    },
  };
}

function assertNoForbiddenHeroFields(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'deletedAt',
    'enrollmentId',
    'studentId',
    'awardedById',
    'createdById',
    'updatedById',
    'xpLedger',
    'RewardRedemption',
    'BehaviorPointLedger',
    'bucket',
    'objectKey',
    'signedUrl',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
