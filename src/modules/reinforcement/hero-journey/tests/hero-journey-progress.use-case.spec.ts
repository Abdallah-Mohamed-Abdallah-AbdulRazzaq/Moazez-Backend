import {
  AuditOutcome,
  HeroJourneyEventType,
  HeroMissionObjectiveType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
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
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import {
  CompleteHeroMissionUseCase,
  CompleteHeroObjectiveUseCase,
  GetHeroProgressDetailUseCase,
  GetStudentHeroProgressUseCase,
  StartHeroMissionUseCase,
} from '../application/hero-journey-progress.use-cases';
import {
  HeroMissionNotPublishedException,
  HeroProgressAlreadyCompletedException,
  HeroProgressObjectiveNotCompletedException,
} from '../domain/hero-journey-progress-domain';
import { HeroJourneyProgressRepository } from '../infrastructure/hero-journey-progress.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STAGE_ID = 'stage-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const MISSION_ID = 'mission-1';
const PROGRESS_ID = 'progress-1';
const OBJECTIVE_ID = 'objective-1';
const NOW = new Date('2026-04-29T12:00:00.000Z');

describe('Hero Journey progress use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ACTOR_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: ORGANIZATION_ID,
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [
          'reinforcement.hero.progress.view',
          'reinforcement.hero.progress.manage',
        ],
      });

      return fn();
    });
  }

  it('reads student and progress detail without auditing', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    await withScope(() =>
      new GetStudentHeroProgressUseCase(repository).execute(STUDENT_ID, {
        academicYearId: YEAR_ID,
        termId: TERM_ID,
      }),
    );
    await withScope(() =>
      new GetHeroProgressDetailUseCase(repository).execute(PROGRESS_ID),
    );

    expect(
      repository.listAvailablePublishedMissionsForStudent,
    ).toHaveBeenCalled();
    expect(auth.createAuditLog).not.toHaveBeenCalled();
  });

  it('starts a published mission and audits the mutation', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    const result = await withScope(() =>
      new StartHeroMissionUseCase(repository, auth).execute(
        STUDENT_ID,
        MISSION_ID,
        { metadata: { source: 'manual' } },
      ),
    );

    expect(repository.startMissionProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        missionId: MISSION_ID,
        studentId: STUDENT_ID,
        enrollmentId: ENROLLMENT_ID,
        actorId: ACTOR_ID,
      }),
    );
    expect(result).toMatchObject({
      id: PROGRESS_ID,
      status: 'in_progress',
      progressPercent: 0,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.hero.progress.start',
        resourceType: 'hero_mission_progress',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
  });

  it('requires a published, non-archived mission before start', async () => {
    await expect(
      withScope(() =>
        new StartHeroMissionUseCase(
          baseRepository({
            findMissionForProgressStart: jest
              .fn()
              .mockResolvedValue(
                missionRecord({ status: HeroMissionStatus.DRAFT }),
              ),
          }),
          authRepository(),
        ).execute(STUDENT_ID, MISSION_ID, {}),
      ),
    ).rejects.toBeInstanceOf(HeroMissionNotPublishedException);

    await expect(
      withScope(() =>
        new StartHeroMissionUseCase(
          baseRepository({
            findMissionForProgressStart: jest.fn().mockResolvedValue(
              missionRecord({
                status: HeroMissionStatus.ARCHIVED,
                archivedAt: NOW,
              }),
            ),
          }),
          authRepository(),
        ).execute(STUDENT_ID, MISSION_ID, {}),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.hero.mission.archived',
    });
  });

  it('validates student enrollment stage, year, and term for mission start', async () => {
    const repository = baseRepository({
      findActiveEnrollmentForStudent: jest.fn().mockResolvedValue(
        enrollmentRecord({
          academicYearId: 'other-year',
          termId: TERM_ID,
          stageId: STAGE_ID,
        }),
      ),
    });

    await expect(
      withScope(() =>
        new StartHeroMissionUseCase(repository, authRepository()).execute(
          STUDENT_ID,
          MISSION_ID,
          {},
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.startMissionProgress).not.toHaveBeenCalled();
  });

  it('returns existing in-progress progress idempotently and rejects completed progress', async () => {
    const repository = baseRepository({
      findProgressByStudentMission: jest
        .fn()
        .mockResolvedValue(progressRecord({ progressPercent: 25 })),
    });
    const auth = authRepository();

    const result = await withScope(() =>
      new StartHeroMissionUseCase(repository, auth).execute(
        STUDENT_ID,
        MISSION_ID,
        {},
      ),
    );

    expect(result).toMatchObject({ id: PROGRESS_ID, progressPercent: 25 });
    expect(repository.startMissionProgress).not.toHaveBeenCalled();
    expect(auth.createAuditLog).not.toHaveBeenCalled();

    await expect(
      withScope(() =>
        new StartHeroMissionUseCase(
          baseRepository({
            findProgressByStudentMission: jest
              .fn()
              .mockResolvedValue(
                progressRecord({ status: HeroMissionProgressStatus.COMPLETED }),
              ),
          }),
          authRepository(),
        ).execute(STUDENT_ID, MISSION_ID, {}),
      ),
    ).rejects.toBeInstanceOf(HeroProgressAlreadyCompletedException);
  });

  it('requires objective ownership and rejects deleted objectives', async () => {
    await expect(
      withScope(() =>
        new CompleteHeroObjectiveUseCase(
          baseRepository({
            findObjectiveById: jest
              .fn()
              .mockResolvedValue(
                objectiveRecord({ missionId: 'other-mission' }),
              ),
          }),
          authRepository(),
        ).execute(PROGRESS_ID, OBJECTIVE_ID, {}),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);

    await expect(
      withScope(() =>
        new CompleteHeroObjectiveUseCase(
          baseRepository({
            findObjectiveById: jest
              .fn()
              .mockResolvedValue(objectiveRecord({ deletedAt: NOW })),
          }),
          authRepository(),
        ).execute(PROGRESS_ID, OBJECTIVE_ID, {}),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('returns an already completed objective idempotently', async () => {
    const repository = baseRepository({
      findProgressById: jest.fn().mockResolvedValue(
        progressRecord({
          objectiveProgress: [
            objectiveProgressRecord({
              objectiveId: OBJECTIVE_ID,
              completedAt: NOW,
            }),
          ],
        }),
      ),
    });
    const auth = authRepository();

    const result = await withScope(() =>
      new CompleteHeroObjectiveUseCase(repository, auth).execute(
        PROGRESS_ID,
        OBJECTIVE_ID,
        {},
      ),
    );

    expect(result.objectives[0]).toMatchObject({
      id: OBJECTIVE_ID,
      completedAt: NOW.toISOString(),
    });
    expect(repository.completeObjectiveProgress).not.toHaveBeenCalled();
    expect(auth.createAuditLog).not.toHaveBeenCalled();
  });

  it('completes an objective, updates percent, and does not auto-complete mission', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    const result = await withScope(() =>
      new CompleteHeroObjectiveUseCase(repository, auth).execute(
        PROGRESS_ID,
        OBJECTIVE_ID,
        { metadata: { checkedBy: 'coach' } },
      ),
    );

    expect(repository.completeObjectiveProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        progressId: PROGRESS_ID,
        objectiveId: OBJECTIVE_ID,
        progressPercent: 50,
      }),
    );
    expect(result).toMatchObject({
      status: 'in_progress',
      progressPercent: 50,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.hero.objective.complete',
        resourceType: 'hero_mission_objective_progress',
      }),
    );
  });

  it('requires all required objectives before completing a mission', async () => {
    await expect(
      withScope(() =>
        new CompleteHeroMissionUseCase(
          baseRepository({
            findProgressById: jest.fn().mockResolvedValue(
              progressRecord({
                objectiveProgress: [
                  objectiveProgressRecord({
                    objectiveId: OBJECTIVE_ID,
                    completedAt: NOW,
                  }),
                ],
              }),
            ),
          }),
          authRepository(),
        ).execute(PROGRESS_ID, {}),
      ),
    ).rejects.toBeInstanceOf(HeroProgressObjectiveNotCompletedException);
  });

  it('completes a mission, creates a mission-completed event, and audits', async () => {
    const repository = baseRepository({
      findProgressById: jest.fn().mockResolvedValue(
        progressRecord({
          objectiveProgress: [
            objectiveProgressRecord({
              objectiveId: OBJECTIVE_ID,
              completedAt: NOW,
            }),
            objectiveProgressRecord({
              objectiveId: 'objective-2',
              completedAt: NOW,
            }),
          ],
        }),
      ),
    });
    const auth = authRepository();

    const result = await withScope(() =>
      new CompleteHeroMissionUseCase(repository, auth).execute(PROGRESS_ID, {
        metadata: { source: 'coach' },
      }),
    );

    expect(repository.completeMissionProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        progressId: PROGRESS_ID,
        missionId: MISSION_ID,
        actorId: ACTOR_ID,
      }),
    );
    expect(result).toMatchObject({
      status: 'completed',
      progressPercent: 100,
      events: [
        expect.objectContaining({
          type: 'mission_completed',
        }),
      ],
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.hero.mission.complete',
        resourceType: 'hero_mission_progress',
      }),
    );
  });

  it('does not write XP ledger, student badges, XP_GRANTED, or BADGE_AWARDED events', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    await withScope(() =>
      new StartHeroMissionUseCase(repository, auth).execute(
        STUDENT_ID,
        MISSION_ID,
        {},
      ),
    );
    await withScope(() =>
      new CompleteHeroObjectiveUseCase(repository, auth).execute(
        PROGRESS_ID,
        OBJECTIVE_ID,
        {},
      ),
    );

    expect(repository.createXpLedger).not.toHaveBeenCalled();
    expect(repository.createHeroStudentBadge).not.toHaveBeenCalled();
    expect(repository.createHeroJourneyEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: HeroJourneyEventType.XP_GRANTED }),
    );
    expect(repository.createHeroJourneyEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: HeroJourneyEventType.BADGE_AWARDED }),
    );
  });

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const repository = {
      findAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_ID }),
      findActiveAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_ID }),
      findTerm: jest
        .fn()
        .mockResolvedValue({ id: TERM_ID, academicYearId: YEAR_ID }),
      findActiveTerm: jest
        .fn()
        .mockResolvedValue({ id: TERM_ID, academicYearId: YEAR_ID }),
      findStudent: jest.fn().mockResolvedValue(studentRecord()),
      findEnrollmentForStudent: jest.fn().mockResolvedValue(enrollmentRecord()),
      findActiveEnrollmentForStudent: jest
        .fn()
        .mockResolvedValue(enrollmentRecord()),
      findMissionForProgressStart: jest.fn().mockResolvedValue(missionRecord()),
      findProgressById: jest.fn().mockResolvedValue(progressRecord()),
      findProgressByStudentMission: jest.fn().mockResolvedValue(null),
      listStudentProgress: jest.fn().mockResolvedValue([progressRecord()]),
      listAvailablePublishedMissionsForStudent: jest
        .fn()
        .mockResolvedValue([missionRecord({ id: 'mission-available' })]),
      findObjectiveById: jest.fn().mockResolvedValue(objectiveRecord()),
      listCompletedObjectiveProgress: jest
        .fn()
        .mockResolvedValue([objectiveProgressRecord()]),
      listRecentEventsForStudent: jest.fn().mockResolvedValue([eventRecord()]),
      startMissionProgress: jest.fn().mockResolvedValue(
        progressRecord({
          status: HeroMissionProgressStatus.IN_PROGRESS,
          progressPercent: 0,
          events: [
            eventRecord({
              id: 'event-start',
              type: HeroJourneyEventType.MISSION_STARTED,
              objectiveId: null,
            }),
          ],
        }),
      ),
      completeObjectiveProgress: jest.fn().mockResolvedValue({
        objectiveProgressId: 'objective-progress-1',
        progress: progressRecord({
          progressPercent: 50,
          events: [
            eventRecord({
              id: 'event-objective',
              type: HeroJourneyEventType.OBJECTIVE_COMPLETED,
            }),
          ],
          objectiveProgress: [
            objectiveProgressRecord({
              objectiveId: OBJECTIVE_ID,
              completedAt: NOW,
            }),
          ],
        }),
      }),
      completeMissionProgress: jest.fn().mockResolvedValue(
        progressRecord({
          status: HeroMissionProgressStatus.COMPLETED,
          progressPercent: 100,
          completedAt: NOW,
          events: [
            eventRecord({
              id: 'event-complete',
              type: HeroJourneyEventType.MISSION_COMPLETED,
              objectiveId: null,
            }),
          ],
        }),
      ),
      createHeroJourneyEvent: jest.fn(),
      createXpLedger: jest.fn(),
      createHeroStudentBadge: jest.fn(),
      ...overrides,
    };

    return repository as unknown as jest.Mocked<HeroJourneyProgressRepository> & {
      createXpLedger: jest.Mock;
      createHeroStudentBadge: jest.Mock;
    };
  }

  function authRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as jest.Mocked<AuthRepository>;
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

  function enrollmentRecord(overrides?: any) {
    return {
      id: overrides?.id ?? ENROLLMENT_ID,
      schoolId: SCHOOL_ID,
      studentId: STUDENT_ID,
      academicYearId: overrides?.academicYearId ?? YEAR_ID,
      termId: overrides?.termId ?? TERM_ID,
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      classroom: {
        id: 'classroom-1',
        sectionId: 'section-1',
        section: {
          id: 'section-1',
          gradeId: 'grade-1',
          grade: {
            id: 'grade-1',
            stageId: overrides?.stageId ?? STAGE_ID,
            stage: {
              id: overrides?.stageId ?? STAGE_ID,
              nameEn: 'Primary',
              nameAr: null,
            },
          },
        },
      },
    };
  }

  function missionRecord(overrides?: any) {
    return {
      id: overrides?.id ?? MISSION_ID,
      schoolId: SCHOOL_ID,
      academicYearId: overrides?.academicYearId ?? YEAR_ID,
      termId: overrides?.termId ?? TERM_ID,
      stageId: overrides?.stageId ?? STAGE_ID,
      subjectId: null,
      linkedAssessmentId: null,
      linkedLessonRef: null,
      titleEn: 'Mission',
      titleAr: null,
      briefEn: null,
      briefAr: null,
      requiredLevel: 1,
      rewardXp: 10,
      badgeRewardId: null,
      status: overrides?.status ?? HeroMissionStatus.PUBLISHED,
      positionX: null,
      positionY: null,
      sortOrder: 1,
      publishedAt: NOW,
      publishedById: null,
      archivedAt: overrides?.archivedAt ?? null,
      archivedById: null,
      createdById: null,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: overrides?.deletedAt ?? null,
      badgeReward: null,
      objectives: overrides?.objectives ?? [
        objectiveRecord({ id: OBJECTIVE_ID }),
        objectiveRecord({ id: 'objective-2' }),
        objectiveRecord({ id: 'optional-objective', isRequired: false }),
      ],
    };
  }

  function objectiveRecord(overrides?: any) {
    return {
      id: overrides?.id ?? OBJECTIVE_ID,
      schoolId: SCHOOL_ID,
      missionId: overrides?.missionId ?? MISSION_ID,
      type: overrides?.type ?? HeroMissionObjectiveType.MANUAL,
      titleEn: 'Objective',
      titleAr: null,
      subtitleEn: null,
      subtitleAr: null,
      linkedAssessmentId: null,
      linkedLessonRef: null,
      sortOrder: overrides?.sortOrder ?? 1,
      isRequired: overrides?.isRequired ?? true,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: overrides?.deletedAt ?? null,
    };
  }

  function objectiveProgressRecord(overrides?: any) {
    return {
      id: overrides?.id ?? 'objective-progress-1',
      schoolId: SCHOOL_ID,
      missionProgressId: PROGRESS_ID,
      objectiveId: overrides?.objectiveId ?? OBJECTIVE_ID,
      completedAt: overrides?.completedAt ?? NOW,
      completedById: ACTOR_ID,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  function progressRecord(overrides?: any) {
    return {
      id: overrides?.id ?? PROGRESS_ID,
      schoolId: SCHOOL_ID,
      missionId: overrides?.missionId ?? MISSION_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      status: overrides?.status ?? HeroMissionProgressStatus.IN_PROGRESS,
      progressPercent: overrides?.progressPercent ?? 0,
      startedAt: overrides?.startedAt ?? NOW,
      completedAt: overrides?.completedAt ?? null,
      lastActivityAt: NOW,
      xpLedgerId: null,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
      mission: overrides?.mission ?? missionRecord(),
      student: studentRecord(),
      enrollment: enrollmentRecord(),
      objectiveProgress: overrides?.objectiveProgress ?? [],
      events: overrides?.events ?? [eventRecord()],
    } as never;
  }

  function eventRecord(overrides?: any) {
    return {
      id: overrides?.id ?? 'event-1',
      schoolId: SCHOOL_ID,
      missionId: MISSION_ID,
      missionProgressId: PROGRESS_ID,
      objectiveId:
        overrides?.objectiveId === undefined
          ? OBJECTIVE_ID
          : overrides.objectiveId,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      xpLedgerId: null,
      badgeId: null,
      type: overrides?.type ?? HeroJourneyEventType.OBJECTIVE_COMPLETED,
      sourceId: null,
      actorUserId: ACTOR_ID,
      occurredAt: NOW,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }
});
