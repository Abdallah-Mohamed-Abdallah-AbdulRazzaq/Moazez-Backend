import {
  AuditOutcome,
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  ReinforcementTargetScope,
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
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import {
  AwardHeroMissionBadgeUseCase,
  GetStudentHeroRewardsUseCase,
  GrantHeroMissionXpUseCase,
} from '../application/hero-journey-rewards.use-cases';
import { HeroJourneyRewardsRepository } from '../infrastructure/hero-journey-rewards.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const MISSION_ID = 'mission-1';
const PROGRESS_ID = 'progress-1';
const BADGE_ID = 'badge-1';
const NOW = new Date('2026-04-29T12:00:00.000Z');

describe('Hero Journey rewards use cases', () => {
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

  it('grants HERO_MISSION XP from mission reward XP and audits the mutation', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const result = await withScope(() =>
      new GrantHeroMissionXpUseCase(repository, auth).execute(PROGRESS_ID, {}),
    );

    expect(repository.createHeroXpLedgerAndEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        progressId: PROGRESS_ID,
        ledger: expect.objectContaining({
          sourceType: XpSourceType.HERO_MISSION,
          sourceId: PROGRESS_ID,
          studentId: STUDENT_ID,
          enrollmentId: ENROLLMENT_ID,
          assignmentId: null,
          amount: 10,
        }),
        event: expect.objectContaining({
          type: HeroJourneyEventType.XP_GRANTED,
          missionId: MISSION_ID,
          missionProgressId: PROGRESS_ID,
        }),
      }),
    );
    expect(result).toMatchObject({
      progressId: PROGRESS_ID,
      sourceType: 'hero_mission',
      amount: 10,
      idempotent: false,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.hero.xp.grant',
        resourceType: 'xp_ledger',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
  });

  it('uses an explicit XP amount when provided', async () => {
    const repository = baseRepository();
    await withScope(() =>
      new GrantHeroMissionXpUseCase(repository, authRepository()).execute(
        PROGRESS_ID,
        { amount: 25 },
      ),
    );

    expect(repository.createHeroXpLedgerAndEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ledger: expect.objectContaining({ amount: 25 }),
      }),
    );
  });

  it('rejects XP grants for incomplete progress or missing XP amount', async () => {
    await expect(
      withScope(() =>
        new GrantHeroMissionXpUseCase(
          baseRepository({
            findProgressForReward: jest.fn().mockResolvedValue(
              progressRecord({ status: HeroMissionProgressStatus.IN_PROGRESS }),
            ),
          }),
          authRepository(),
        ).execute(PROGRESS_ID, {}),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });

    await expect(
      withScope(() =>
        new GrantHeroMissionXpUseCase(
          baseRepository({
            findProgressForReward: jest.fn().mockResolvedValue(
              progressRecord({
                mission: missionRecord({ rewardXp: 0 }),
              }),
            ),
          }),
          authRepository(),
        ).execute(PROGRESS_ID, {}),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('returns existing hero XP ledger idempotently without duplicate events or audit', async () => {
    const repository = baseRepository({
      findExistingHeroXpLedger: jest.fn().mockResolvedValue(ledgerRecord()),
      createHeroXpLedgerAndEvent: jest.fn(),
    });
    const auth = authRepository();
    const result = await withScope(() =>
      new GrantHeroMissionXpUseCase(repository, auth).execute(PROGRESS_ID, {}),
    );

    expect(result).toMatchObject({ id: 'ledger-1', idempotent: true });
    expect(repository.createHeroXpLedgerAndEvent).not.toHaveBeenCalled();
    expect(auth.createAuditLog).not.toHaveBeenCalled();
  });

  it('enforces daily cap, weekly cap, and cooldown for hero XP grants', async () => {
    const daily = baseRepository({
      findEffectiveXpPolicyCandidates: jest
        .fn()
        .mockResolvedValue([policyRecord({ dailyCap: 10, weeklyCap: 100 })]),
      sumXpForPeriod: jest.fn().mockResolvedValueOnce(8).mockResolvedValueOnce(8),
      createHeroXpLedgerAndEvent: jest.fn(),
    });
    await expect(
      withScope(() =>
        new GrantHeroMissionXpUseCase(daily, authRepository()).execute(
          PROGRESS_ID,
          { amount: 5 },
        ),
      ),
    ).rejects.toMatchObject({ code: 'reinforcement.xp.daily_cap_reached' });
    expect(daily.createHeroXpLedgerAndEvent).not.toHaveBeenCalled();

    const weekly = baseRepository({
      findEffectiveXpPolicyCandidates: jest
        .fn()
        .mockResolvedValue([policyRecord({ dailyCap: 100, weeklyCap: 10 })]),
      sumXpForPeriod: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(8),
      createHeroXpLedgerAndEvent: jest.fn(),
    });
    await expect(
      withScope(() =>
        new GrantHeroMissionXpUseCase(weekly, authRepository()).execute(
          PROGRESS_ID,
          { amount: 5 },
        ),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(weekly.createHeroXpLedgerAndEvent).not.toHaveBeenCalled();

    const cooldown = baseRepository({
      findEffectiveXpPolicyCandidates: jest
        .fn()
        .mockResolvedValue([policyRecord({ cooldownMinutes: 30 })]),
      findLatestXpForCooldown: jest
        .fn()
        .mockResolvedValue({ occurredAt: new Date() }),
      createHeroXpLedgerAndEvent: jest.fn(),
    });
    await expect(
      withScope(() =>
        new GrantHeroMissionXpUseCase(cooldown, authRepository()).execute(
          PROGRESS_ID,
          { amount: 5 },
        ),
      ),
    ).rejects.toMatchObject({ code: 'reinforcement.xp.cooldown' });
    expect(cooldown.createHeroXpLedgerAndEvent).not.toHaveBeenCalled();
  });

  it('awards mission badges and audits without writing XP ledger rows', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const result = await withScope(() =>
      new AwardHeroMissionBadgeUseCase(repository, auth).execute(PROGRESS_ID, {
        metadata: { source: 'unit' },
      }),
    );

    expect(repository.createHeroStudentBadgeAndEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        studentBadge: expect.objectContaining({
          studentId: STUDENT_ID,
          badgeId: BADGE_ID,
          missionId: MISSION_ID,
          missionProgressId: PROGRESS_ID,
        }),
        event: expect.objectContaining({
          type: HeroJourneyEventType.BADGE_AWARDED,
          badgeId: BADGE_ID,
        }),
      }),
    );
    expect(repository.createHeroXpLedgerAndEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      progressId: PROGRESS_ID,
      badgeId: BADGE_ID,
      studentBadgeId: 'student-badge-1',
      idempotent: false,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.hero.badge.award',
        resourceType: 'hero_student_badge',
      }),
    );
  });

  it('rejects badge awards for incomplete progress, missing badges, and inactive badges', async () => {
    await expect(
      withScope(() =>
        new AwardHeroMissionBadgeUseCase(
          baseRepository({
            findProgressForReward: jest.fn().mockResolvedValue(
              progressRecord({ status: HeroMissionProgressStatus.IN_PROGRESS }),
            ),
          }),
          authRepository(),
        ).execute(PROGRESS_ID, {}),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });

    await expect(
      withScope(() =>
        new AwardHeroMissionBadgeUseCase(
          baseRepository({
            findProgressForReward: jest.fn().mockResolvedValue(
              progressRecord({
                mission: missionRecord({
                  badgeRewardId: null,
                  badgeReward: null,
                }),
              }),
            ),
          }),
          authRepository(),
        ).execute(PROGRESS_ID, {}),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });

    await expect(
      withScope(() =>
        new AwardHeroMissionBadgeUseCase(
          baseRepository({
            findProgressForReward: jest.fn().mockResolvedValue(
              progressRecord({
                mission: missionRecord({
                  badgeReward: badgeRecord({ isActive: false }),
                }),
              }),
            ),
          }),
          authRepository(),
        ).execute(PROGRESS_ID, {}),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('returns existing badges idempotently without duplicate events or audit', async () => {
    const repository = baseRepository({
      findExistingStudentBadge: jest.fn().mockResolvedValue(studentBadgeRecord()),
      createHeroStudentBadgeAndEvent: jest.fn(),
    });
    const auth = authRepository();
    const result = await withScope(() =>
      new AwardHeroMissionBadgeUseCase(repository, auth).execute(PROGRESS_ID, {}),
    );

    expect(result).toMatchObject({
      studentBadgeId: 'student-badge-1',
      idempotent: true,
    });
    expect(repository.createHeroStudentBadgeAndEvent).not.toHaveBeenCalled();
    expect(auth.createAuditLog).not.toHaveBeenCalled();
  });

  it('reads student rewards summary without auditing or redemption side effects', async () => {
    const repository = baseRepository();
    const result = await withScope(() =>
      new GetStudentHeroRewardsUseCase(repository).execute(STUDENT_ID, {
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        includeEvents: true,
      }),
    );

    expect(repository.getStudentHeroRewards).toHaveBeenCalledWith({
      studentId: STUDENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      includeEvents: true,
    });
    expect(result.summary).toMatchObject({
      totalHeroXp: 10,
      badgesCount: 1,
      completedMissions: 1,
      xpGrantedMissions: 1,
      badgeAwardedMissions: 1,
    });
    expect(result.xpLedger[0].sourceType).toBe('hero_mission');
    expect(result.events?.[0]?.type).toBe('xp_granted');
    expect((repository as any).createRewardRedemption).toBeUndefined();
  });

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const repository = {
      findStudent: jest.fn().mockResolvedValue(studentRecord()),
      findProgressForReward: jest.fn().mockResolvedValue(progressRecord()),
      findExistingHeroXpLedger: jest.fn().mockResolvedValue(null),
      findEffectiveXpPolicyCandidates: jest
        .fn()
        .mockResolvedValue([policyRecord()]),
      sumXpForPeriod: jest.fn().mockResolvedValue(0),
      findLatestXpForCooldown: jest.fn().mockResolvedValue(null),
      createHeroXpLedgerAndEvent: jest
        .fn()
        .mockResolvedValue(ledgerRecord()),
      findExistingStudentBadge: jest.fn().mockResolvedValue(null),
      createHeroStudentBadgeAndEvent: jest
        .fn()
        .mockResolvedValue(studentBadgeRecord()),
      getStudentHeroRewards: jest.fn().mockResolvedValue({
        xpLedger: [ledgerRecord()],
        badges: [studentBadgeRecord()],
        allStudentBadges: [studentBadgeRecord()],
        completedProgress: [progressRecord({ xpLedgerId: 'ledger-1' })],
        events: [eventRecord()],
      }),
      ...overrides,
    };

    return repository as unknown as jest.Mocked<HeroJourneyRewardsRepository>;
  }

  function authRepository() {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuthRepository>;
  }

  function policyRecord(overrides?: any) {
    return {
      id: 'policy-1',
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      scopeType: ReinforcementTargetScope.SCHOOL,
      scopeKey: SCHOOL_ID,
      dailyCap: null,
      weeklyCap: null,
      cooldownMinutes: null,
      allowedReasons: null,
      startsAt: null,
      endsAt: null,
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      ...(overrides ?? {}),
    } as never;
  }

  function ledgerRecord(overrides?: any) {
    return {
      id: overrides?.id ?? 'ledger-1',
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      assignmentId: null,
      policyId: 'policy-1',
      sourceType: XpSourceType.HERO_MISSION,
      sourceId: PROGRESS_ID,
      amount: overrides?.amount ?? 10,
      reason: null,
      reasonAr: null,
      actorUserId: ACTOR_ID,
      occurredAt: NOW,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...(overrides ?? {}),
    } as never;
  }

  function studentBadgeRecord(overrides?: any) {
    return {
      id: overrides?.id ?? 'student-badge-1',
      schoolId: SCHOOL_ID,
      studentId: STUDENT_ID,
      badgeId: BADGE_ID,
      missionId: MISSION_ID,
      missionProgressId: PROGRESS_ID,
      earnedAt: NOW,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
      badge: badgeRecord(),
      ...(overrides ?? {}),
    } as never;
  }

  function progressRecord(overrides?: any) {
    return {
      id: PROGRESS_ID,
      schoolId: SCHOOL_ID,
      missionId: MISSION_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      status: overrides?.status ?? HeroMissionProgressStatus.COMPLETED,
      progressPercent: 100,
      startedAt: NOW,
      completedAt: NOW,
      lastActivityAt: NOW,
      xpLedgerId: overrides?.xpLedgerId ?? null,
      createdAt: NOW,
      updatedAt: NOW,
      mission: overrides?.mission ?? missionRecord(),
      student: studentRecord(),
      enrollment: enrollmentRecord(),
      ...(overrides ?? {}),
    } as never;
  }

  function missionRecord(overrides?: any) {
    return {
      id: MISSION_ID,
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      stageId: 'stage-1',
      titleEn: 'Mission',
      titleAr: null,
      rewardXp: overrides?.rewardXp ?? 10,
      badgeRewardId:
        overrides?.badgeRewardId === undefined ? BADGE_ID : overrides.badgeRewardId,
      status: overrides?.status ?? HeroMissionStatus.PUBLISHED,
      archivedAt: null,
      deletedAt: null,
      badgeReward:
        overrides?.badgeReward === undefined
          ? badgeRecord()
          : overrides.badgeReward,
      ...(overrides ?? {}),
    } as never;
  }

  function badgeRecord(overrides?: any) {
    return {
      id: BADGE_ID,
      schoolId: SCHOOL_ID,
      slug: 'quest-master',
      nameEn: 'Quest Master',
      nameAr: null,
      descriptionEn: 'Completed a quest',
      descriptionAr: null,
      assetPath: null,
      fileId: null,
      isActive: overrides?.isActive ?? true,
      deletedAt: overrides?.deletedAt ?? null,
      ...(overrides ?? {}),
    };
  }

  function studentRecord() {
    return {
      id: STUDENT_ID,
      schoolId: SCHOOL_ID,
      firstName: 'Hero',
      lastName: 'Student',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
    };
  }

  function enrollmentRecord() {
    return {
      id: ENROLLMENT_ID,
      schoolId: SCHOOL_ID,
      studentId: STUDENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      classroomId: 'classroom-1',
      status: 'ACTIVE',
      deletedAt: null,
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
      badgeId: null,
      type: HeroJourneyEventType.XP_GRANTED,
      sourceId: PROGRESS_ID,
      actorUserId: ACTOR_ID,
      occurredAt: NOW,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
    } as never;
  }
});
