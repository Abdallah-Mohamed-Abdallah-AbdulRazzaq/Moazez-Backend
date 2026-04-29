import {
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
  XpSourceType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  GetHeroBadgesSummaryUseCase,
  GetHeroClassroomSummaryUseCase,
  GetHeroMapUseCase,
  GetHeroOverviewUseCase,
  GetHeroStageSummaryUseCase,
} from '../application/hero-journey-dashboard.use-cases';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STAGE_ID = 'stage-1';
const GRADE_ID = 'grade-1';
const SECTION_ID = 'section-1';
const CLASSROOM_ID = 'classroom-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const MISSION_ID = 'mission-1';
const PROGRESS_ID = 'progress-1';
const BADGE_ID = 'badge-1';
const NOW = new Date('2026-04-30T08:00:00.000Z');

describe('Hero Journey dashboard use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ACTOR_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: ORGANIZATION_ID,
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['reinforcement.hero.view', 'reinforcement.hero.badges.view'],
      });

      return fn();
    });
  }

  it('returns a combined overview summary without auditing or write methods', async () => {
    const repository = baseRepository();
    const result = await withScope(() =>
      new GetHeroOverviewUseCase(repository as any).execute({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
      }),
    );

    expect(repository.loadHeroOverviewData).toHaveBeenCalledWith(
      expect.objectContaining({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
      }),
    );
    expect(result.missions.total).toBe(1);
    expect(result.progress.completed).toBe(1);
    expect(result.rewards.totalHeroXp).toBe(10);
    expect(result.events.missionCompleted).toBe(1);
    expect((repository as any).createHeroJourneyEvent).toBeUndefined();
    expect((repository as any).createHeroXpLedgerAndEvent).toBeUndefined();
  });

  it('returns Hero map aggregate mode and student mode', async () => {
    const repository = baseRepository();
    const aggregate = await withScope(() =>
      new GetHeroMapUseCase(repository as any).execute({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
      }),
    );
    expect(aggregate.mode).toBe('aggregate');
    expect(aggregate.missions[0]).toMatchObject({
      missionId: MISSION_ID,
      completedCount: 1,
      startedCount: 1,
    });

    const student = await withScope(() =>
      new GetHeroMapUseCase(repository as any).execute({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        studentId: STUDENT_ID,
      }),
    );
    expect(student.mode).toBe('student');
    expect(student.scope.stageId).toBe(STAGE_ID);
    expect(student.missions[0].studentProgress).toMatchObject({
      progressId: PROGRESS_ID,
      status: 'completed',
      xpGranted: true,
      badgeAwarded: true,
    });
  });

  it('validates stage ownership for stage summary', async () => {
    const repository = baseRepository({ findStage: jest.fn().mockResolvedValue(null) });
    await expect(
      withScope(() =>
        new GetHeroStageSummaryUseCase(repository as any).execute(STAGE_ID, {
          academicYearId: YEAR_ID,
          termId: TERM_ID,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('validates classroom ownership for classroom summary', async () => {
    const repository = baseRepository({
      findClassroom: jest.fn().mockResolvedValue(null),
    });
    await expect(
      withScope(() =>
        new GetHeroClassroomSummaryUseCase(repository as any).execute(
          CLASSROOM_ID,
          {
            academicYearId: YEAR_ID,
            termId: TERM_ID,
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('returns badge summary with student earned state', async () => {
    const repository = baseRepository();
    const result = await withScope(() =>
      new GetHeroBadgesSummaryUseCase(repository as any).execute({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        studentId: STUDENT_ID,
      }),
    );

    expect(repository.loadHeroBadgeSummaryData).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: STUDENT_ID,
        includeInactive: false,
      }),
    );
    expect(result.badges[0]).toMatchObject({
      badgeId: BADGE_ID,
      earnedCount: 1,
      studentEarned: true,
      studentBadgeId: 'student-badge-1',
    });
  });

  it('rejects invalid date ranges before loading read data', async () => {
    const repository = baseRepository();
    await expect(
      withScope(() =>
        new GetHeroOverviewUseCase(repository as any).execute({
          academicYearId: YEAR_ID,
          termId: TERM_ID,
          dateFrom: '2026-04-03',
          dateTo: '2026-04-01',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
    });
    expect(repository.loadHeroOverviewData).not.toHaveBeenCalled();
  });

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const repository = {
      findAcademicYear: jest.fn().mockResolvedValue({
        id: YEAR_ID,
        nameAr: 'Year',
        nameEn: 'Year',
        startDate: NOW,
        endDate: NOW,
        isActive: true,
      }),
      findActiveAcademicYear: jest.fn(),
      findTerm: jest.fn().mockResolvedValue({
        id: TERM_ID,
        academicYearId: YEAR_ID,
        nameAr: 'Term',
        nameEn: 'Term',
        startDate: NOW,
        endDate: NOW,
        isActive: true,
      }),
      findActiveTerm: jest.fn(),
      findStage: jest.fn().mockResolvedValue(stageRecord()),
      findGrade: jest.fn(),
      findSection: jest.fn(),
      findClassroom: jest.fn().mockResolvedValue(classroomRecord()),
      findSubject: jest.fn(),
      findStudent: jest.fn().mockResolvedValue(studentRecord()),
      findActiveEnrollmentForStudent: jest.fn().mockResolvedValue(enrollmentRecord()),
      loadHeroOverviewData: jest.fn().mockResolvedValue(dataset()),
      loadHeroMapData: jest.fn().mockResolvedValue(mapDataset()),
      loadHeroStageSummaryData: jest.fn().mockResolvedValue(dataset()),
      loadHeroClassroomSummaryData: jest.fn().mockResolvedValue(dataset()),
      loadHeroBadgeSummaryData: jest.fn().mockResolvedValue(badgeDataset()),
      ...overrides,
    };
    return repository;
  }

  function dataset() {
    return {
      enrollments: [enrollmentRecord()],
      missions: [missionRecord()],
      progress: [progressRecord()],
      xpLedger: [xpLedgerRecord()],
      studentBadges: [studentBadgeRecord()],
      events: [eventRecord()],
    };
  }

  function mapDataset() {
    return {
      missions: [missionRecord()],
      progress: [progressRecord()],
      xpLedger: [xpLedgerRecord()],
      studentBadges: [studentBadgeRecord()],
    };
  }

  function badgeDataset() {
    return {
      badges: [badgeRecord()],
      missionsUsingBadges: [missionRecord()],
      studentBadges: [studentBadgeRecord()],
    };
  }

  function stageRecord() {
    return { id: STAGE_ID, schoolId: SCHOOL_ID, nameAr: 'Stage', nameEn: 'Stage' };
  }

  function classroomRecord() {
    return {
      id: CLASSROOM_ID,
      schoolId: SCHOOL_ID,
      nameAr: 'Classroom',
      nameEn: 'Classroom',
      sectionId: SECTION_ID,
      section: {
        id: SECTION_ID,
        nameAr: 'Section',
        nameEn: 'Section',
        gradeId: GRADE_ID,
        grade: {
          id: GRADE_ID,
          nameAr: 'Grade',
          nameEn: 'Grade',
          stageId: STAGE_ID,
          stage: stageRecord(),
        },
      },
    };
  }

  function studentRecord() {
    return {
      id: STUDENT_ID,
      schoolId: SCHOOL_ID,
      firstName: 'Hero',
      lastName: 'Student',
      status: StudentStatus.ACTIVE,
    };
  }

  function enrollmentRecord() {
    return {
      id: ENROLLMENT_ID,
      schoolId: SCHOOL_ID,
      studentId: STUDENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      classroomId: CLASSROOM_ID,
      status: StudentEnrollmentStatus.ACTIVE,
      student: studentRecord(),
      classroom: classroomRecord(),
    };
  }

  function badgeRecord() {
    return {
      id: BADGE_ID,
      schoolId: SCHOOL_ID,
      slug: 'hero',
      nameEn: 'Hero',
      nameAr: 'Hero',
      descriptionEn: null,
      descriptionAr: null,
      assetPath: null,
      fileId: null,
      sortOrder: 1,
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };
  }

  function missionRecord() {
    return {
      id: MISSION_ID,
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      stageId: STAGE_ID,
      subjectId: null,
      titleEn: 'Mission',
      titleAr: null,
      briefEn: null,
      briefAr: null,
      requiredLevel: 1,
      rewardXp: 10,
      badgeRewardId: BADGE_ID,
      status: HeroMissionStatus.PUBLISHED,
      positionX: 1,
      positionY: 2,
      sortOrder: 1,
      publishedAt: NOW,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      badgeReward: badgeRecord(),
      objectives: [
        {
          id: 'objective-1',
          schoolId: SCHOOL_ID,
          missionId: MISSION_ID,
          type: 'MANUAL',
          titleEn: 'Objective',
          titleAr: null,
          subtitleEn: null,
          subtitleAr: null,
          sortOrder: 1,
          isRequired: true,
          deletedAt: null,
        },
      ],
    };
  }

  function progressRecord() {
    return {
      id: PROGRESS_ID,
      schoolId: SCHOOL_ID,
      missionId: MISSION_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      status: HeroMissionProgressStatus.COMPLETED,
      progressPercent: 100,
      startedAt: NOW,
      completedAt: NOW,
      lastActivityAt: NOW,
      xpLedgerId: 'ledger-1',
      createdAt: NOW,
      updatedAt: NOW,
      student: studentRecord(),
      enrollment: enrollmentRecord(),
      objectiveProgress: [
        {
          id: 'objective-progress-1',
          schoolId: SCHOOL_ID,
          missionProgressId: PROGRESS_ID,
          objectiveId: 'objective-1',
          completedAt: NOW,
          objective: {
            id: 'objective-1',
            missionId: MISSION_ID,
            isRequired: true,
            deletedAt: null,
          },
        },
      ],
    };
  }

  function xpLedgerRecord() {
    return {
      id: 'ledger-1',
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      sourceType: XpSourceType.HERO_MISSION,
      sourceId: PROGRESS_ID,
      amount: 10,
      reason: null,
      reasonAr: null,
      actorUserId: ACTOR_ID,
      occurredAt: NOW,
      createdAt: NOW,
      student: studentRecord(),
    };
  }

  function studentBadgeRecord() {
    return {
      id: 'student-badge-1',
      schoolId: SCHOOL_ID,
      studentId: STUDENT_ID,
      badgeId: BADGE_ID,
      missionId: MISSION_ID,
      missionProgressId: PROGRESS_ID,
      earnedAt: NOW,
      createdAt: NOW,
      student: studentRecord(),
      badge: badgeRecord(),
      mission: {
        id: MISSION_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        stageId: STAGE_ID,
        subjectId: null,
        deletedAt: null,
      },
    };
  }

  function eventRecord() {
    return {
      id: 'event-1',
      schoolId: SCHOOL_ID,
      missionId: MISSION_ID,
      missionProgressId: PROGRESS_ID,
      objectiveId: null,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      xpLedgerId: 'ledger-1',
      badgeId: BADGE_ID,
      type: HeroJourneyEventType.MISSION_COMPLETED,
      sourceId: PROGRESS_ID,
      actorUserId: ACTOR_ID,
      occurredAt: NOW,
      createdAt: NOW,
    };
  }
});
