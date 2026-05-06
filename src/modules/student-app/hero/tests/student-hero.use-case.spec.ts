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
import { GetStudentHeroMissionUseCase } from '../application/get-student-hero-mission.use-case';
import { GetStudentHeroOverviewUseCase } from '../application/get-student-hero-overview.use-case';
import { GetStudentHeroProgressUseCase } from '../application/get-student-hero-progress.use-case';
import { ListStudentHeroBadgesUseCase } from '../application/list-student-hero-badges.use-case';
import { ListStudentHeroMissionsUseCase } from '../application/list-student-hero-missions.use-case';
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
});

function createUseCases(): {
  overviewUseCase: GetStudentHeroOverviewUseCase;
  progressUseCase: GetStudentHeroProgressUseCase;
  badgesUseCase: ListStudentHeroBadgesUseCase;
  missionsUseCase: ListStudentHeroMissionsUseCase;
  missionUseCase: GetStudentHeroMissionUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentHeroReadAdapter>;
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
    accessService,
    readAdapter,
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

function missionDetailFixture(): StudentHeroMissionDetailReadModel {
  return {
    mission: missionFixture(),
    progress: progressRecordFixture(),
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

function progressRecordFixture() {
  return {
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
