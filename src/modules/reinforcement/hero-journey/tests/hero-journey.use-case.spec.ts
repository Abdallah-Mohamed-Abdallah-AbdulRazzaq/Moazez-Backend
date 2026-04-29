import {
  AuditOutcome,
  HeroMissionObjectiveType,
  HeroMissionStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { FilesNotFoundException } from '../../../files/uploads/domain/file-upload.exceptions';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import {
  CreateHeroBadgeUseCase,
  DeleteHeroBadgeUseCase,
  GetHeroBadgeUseCase,
  ListHeroBadgesUseCase,
  UpdateHeroBadgeUseCase,
} from '../application/badge-catalog.use-cases';
import {
  ArchiveHeroMissionUseCase,
  CreateHeroMissionUseCase,
  DeleteHeroMissionUseCase,
  GetHeroMissionUseCase,
  ListHeroMissionsUseCase,
  PublishHeroMissionUseCase,
  UpdateHeroMissionUseCase,
} from '../application/hero-mission.use-cases';
import { HeroBadgeDuplicateSlugException } from '../domain/hero-journey-domain';
import { HeroJourneyRepository } from '../infrastructure/hero-journey.repository';

const SCHOOL_ID = 'school-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STAGE_ID = 'stage-1';
const SUBJECT_ID = 'subject-1';
const ASSESSMENT_ID = 'assessment-1';
const BADGE_ID = 'badge-1';
const MISSION_ID = 'mission-1';
const ACTOR_ID = 'user-1';
const NOW = new Date('2026-04-29T12:00:00.000Z');

describe('Hero Journey use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ACTOR_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [
          'reinforcement.hero.view',
          'reinforcement.hero.manage',
          'reinforcement.hero.badges.view',
          'reinforcement.hero.badges.manage',
        ],
      });

      return fn();
    });
  }

  it('creates a badge, normalizes its slug, and audits the mutation', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new CreateHeroBadgeUseCase(repository, auth);

    const result = await withScope(() =>
      useCase.execute({
        slug: ' Speed-Runner ',
        nameEn: 'Speed Runner',
      }),
    );

    expect(repository.createBadge).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        slug: 'speed-runner',
        isActive: true,
      }),
    );
    expect(result).toMatchObject({ slug: 'speed-runner', nameEn: 'Speed Runner' });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.hero.badge.create',
        resourceType: 'hero_badge',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
  });

  it('rejects badge creation without a name and duplicate slugs', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new CreateHeroBadgeUseCase(repository, auth);

    await expect(
      withScope(() => useCase.execute({ slug: 'nameless' })),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    repository.createBadge.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      withScope(() =>
        useCase.execute({
          slug: 'speed-runner',
          nameEn: 'Duplicate',
        }),
      ),
    ).rejects.toBeInstanceOf(HeroBadgeDuplicateSlugException);
  });

  it('validates badge update file ownership and delete mission usage', async () => {
    const repository = baseRepository({
      findFile: jest.fn().mockResolvedValue(null),
      countActiveMissionsUsingBadge: jest.fn().mockResolvedValue(1),
    });
    const auth = authRepository();

    await expect(
      withScope(() =>
        new UpdateHeroBadgeUseCase(repository, auth).execute(BADGE_ID, {
          fileId: 'bad-file-id',
        }),
      ),
    ).rejects.toBeInstanceOf(FilesNotFoundException);
    expect(repository.updateBadge).not.toHaveBeenCalled();

    await expect(
      withScope(() =>
        new DeleteHeroBadgeUseCase(repository, auth).execute(BADGE_ID),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      httpStatus: 409,
    });
    expect(repository.softDeleteBadge).not.toHaveBeenCalled();
  });

  it('does not audit badge or mission reads', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    await withScope(() => new ListHeroBadgesUseCase(repository).execute({}));
    await withScope(() => new GetHeroBadgeUseCase(repository).execute(BADGE_ID));
    await withScope(() => new ListHeroMissionsUseCase(repository).execute({}));
    await withScope(() =>
      new GetHeroMissionUseCase(repository).execute(MISSION_ID),
    );

    expect(auth.createAuditLog).not.toHaveBeenCalled();
  });

  it('requires mission title and non-empty objectives on create', async () => {
    const repository = baseRepository();
    const useCase = new CreateHeroMissionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withScope(() =>
        useCase.execute({
          yearId: YEAR_ID,
          termId: TERM_ID,
          stageId: STAGE_ID,
          objectives: [{ titleEn: 'Objective' }],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    await expect(
      withScope(() =>
        useCase.execute({
          yearId: YEAR_ID,
          termId: TERM_ID,
          stageId: STAGE_ID,
          titleEn: 'Mission',
          objectives: [],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
  });

  it('normalizes mission objective ordering and rejects duplicates', async () => {
    const repository = baseRepository();
    const useCase = new CreateHeroMissionUseCase(
      repository,
      authRepository(),
    );

    await withScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        stageId: STAGE_ID,
        titleEn: 'Mission',
        objectives: [
          { titleEn: 'Second', sortOrder: 20 },
          { titleEn: 'First', sortOrder: 10 },
        ],
      }),
    );

    expect(repository.createMissionWithObjectives).toHaveBeenCalledWith(
      expect.objectContaining({
        objectives: [
          expect.objectContaining({ titleEn: 'First', sortOrder: 1 }),
          expect.objectContaining({ titleEn: 'Second', sortOrder: 2 }),
        ],
      }),
    );

    await expect(
      withScope(() =>
        useCase.execute({
          yearId: YEAR_ID,
          termId: TERM_ID,
          stageId: STAGE_ID,
          titleEn: 'Mission',
          objectives: [
            { titleEn: 'One', sortOrder: 1 },
            { titleEn: 'Two', sortOrder: 1 },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.hero.objective.invalid_order',
    });
  });

  it('validates mission references through repository ownership lookups', async () => {
    const baseCommand = {
      yearId: YEAR_ID,
      termId: TERM_ID,
      stageId: STAGE_ID,
      subjectId: SUBJECT_ID,
      linkedAssessmentId: ASSESSMENT_ID,
      badgeRewardId: BADGE_ID,
      titleEn: 'Mission',
      objectives: [{ titleEn: 'Objective', linkedAssessmentId: ASSESSMENT_ID }],
    };

    const cases: Array<[string, Partial<Record<string, jest.Mock>>]> = [
      ['academic year', { findAcademicYear: jest.fn().mockResolvedValue(null) }],
      [
        'term',
        {
          findTerm: jest.fn().mockResolvedValue({
            id: TERM_ID,
            academicYearId: 'other-year',
          }),
        },
      ],
      ['stage', { findStage: jest.fn().mockResolvedValue(null) }],
      ['subject', { findSubject: jest.fn().mockResolvedValue(null) }],
      ['assessment', { findAssessment: jest.fn().mockResolvedValue(null) }],
      [
        'badge',
        { findBadgeById: jest.fn().mockResolvedValue(null) },
      ],
    ];

    for (const [, overrides] of cases) {
      const repository = baseRepository(overrides);
      await expect(
        withScope(() =>
          new CreateHeroMissionUseCase(repository, authRepository()).execute(
            baseCommand,
          ),
        ),
      ).rejects.toBeInstanceOf(NotFoundDomainException);
      expect(repository.createMissionWithObjectives).not.toHaveBeenCalled();
    }
  });

  it('creates a draft mission without progress, XP, or badge-award writes', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const result = await withScope(() =>
      new CreateHeroMissionUseCase(repository, auth).execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        stageId: STAGE_ID,
        titleEn: 'Mission',
        rewardXp: 25,
        badgeRewardId: BADGE_ID,
        objectives: [{ titleEn: 'Objective' }],
      }),
    );

    expect(result.status).toBe('draft');
    expect(repository.createMissionProgress).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
    expect(repository.createHeroStudentBadge).not.toHaveBeenCalled();
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.hero.mission.create',
        after: expect.objectContaining({
          objectiveCount: 1,
          rewardXp: 25,
          badgeRewardId: BADGE_ID,
        }),
      }),
    );
  });

  it('rejects archived mission updates and protected published mission changes', async () => {
    const auth = authRepository();

    await expect(
      withScope(() =>
        new UpdateHeroMissionUseCase(
          baseRepository({
            findMissionById: jest
              .fn()
              .mockResolvedValue(missionRecord({ status: HeroMissionStatus.ARCHIVED })),
          }),
          auth,
        ).execute(MISSION_ID, { titleEn: 'Nope' }),
      ),
    ).rejects.toMatchObject({ code: 'reinforcement.hero.mission.archived' });

    for (const command of [
      { rewardXp: 50 },
      { stageId: 'other-stage' },
      { objectives: [{ titleEn: 'New objective' }] },
    ]) {
      await expect(
        withScope(() =>
          new UpdateHeroMissionUseCase(
            baseRepository({
              findMissionById: jest
                .fn()
                .mockResolvedValue(
                  missionRecord({ status: HeroMissionStatus.PUBLISHED }),
                ),
            }),
            auth,
          ).execute(MISSION_ID, command),
        ),
      ).rejects.toMatchObject({
        code: 'reinforcement.hero.mission.invalid_status_transition',
      });
    }
  });

  it('allows draft objective replacement and audits mission update', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    await withScope(() =>
      new UpdateHeroMissionUseCase(repository, auth).execute(MISSION_ID, {
        objectives: [
          { type: 'quiz', titleEn: 'Replacement', isRequired: true },
        ],
      }),
    );

    expect(repository.updateMissionWithObjectives).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: MISSION_ID,
        objectives: [
          expect.objectContaining({
            type: HeroMissionObjectiveType.QUIZ,
            titleEn: 'Replacement',
            sortOrder: 1,
          }),
        ],
      }),
    );
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.hero.mission.update',
      }),
    );
  });

  it('publishes draft missions only and sets publish actor fields', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    const result = await withScope(() =>
      new PublishHeroMissionUseCase(repository, auth).execute(MISSION_ID),
    );

    expect(repository.publishMission).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      missionId: MISSION_ID,
      actorId: ACTOR_ID,
    });
    expect(result).toMatchObject({
      status: 'published',
      publishedById: ACTOR_ID,
      publishedAt: NOW.toISOString(),
    });
    expect(repository.createMissionProgress).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.hero.mission.publish',
        after: expect.objectContaining({
          beforeStatus: HeroMissionStatus.DRAFT,
          afterStatus: HeroMissionStatus.PUBLISHED,
        }),
      }),
    );

    await expect(
      withScope(() =>
        new PublishHeroMissionUseCase(
          baseRepository({
            findMissionById: jest
              .fn()
              .mockResolvedValue(
                missionRecord({ status: HeroMissionStatus.PUBLISHED }),
              ),
          }),
          authRepository(),
        ).execute(MISSION_ID),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.hero.mission.invalid_status_transition',
    });
  });

  it('requires at least one active required objective before publish', async () => {
    await expect(
      withScope(() =>
        new PublishHeroMissionUseCase(
          baseRepository({
            findMissionById: jest.fn().mockResolvedValue(
              missionRecord({
                objectives: [
                  objectiveRecord({
                    id: 'objective-optional',
                    isRequired: false,
                  }),
                ],
              }),
            ),
          }),
          authRepository(),
        ).execute(MISSION_ID),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.hero.objective.invalid_order',
    });
  });

  it('archives missions once and rejects already archived missions', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    const result = await withScope(() =>
      new ArchiveHeroMissionUseCase(repository, auth).execute(MISSION_ID, {
        reason: 'Semester ended',
      }),
    );

    expect(result.status).toBe('archived');
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.hero.mission.archive',
        after: expect.objectContaining({ reason: 'Semester ended' }),
      }),
    );

    await expect(
      withScope(() =>
        new ArchiveHeroMissionUseCase(
          baseRepository({
            findMissionById: jest
              .fn()
              .mockResolvedValue(missionRecord({ status: HeroMissionStatus.ARCHIVED })),
          }),
          authRepository(),
        ).execute(MISSION_ID, {}),
      ),
    ).rejects.toMatchObject({ code: 'reinforcement.hero.mission.archived' });
  });

  it('deletes drafts and archived missions without progress only', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    await withScope(() =>
      new DeleteHeroMissionUseCase(repository, auth).execute(MISSION_ID),
    );
    expect(repository.softDeleteMissionAndObjectives).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      missionId: MISSION_ID,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reinforcement.hero.mission.delete' }),
    );

    await expect(
      withScope(() =>
        new DeleteHeroMissionUseCase(
          baseRepository({
            findMissionById: jest
              .fn()
              .mockResolvedValue(
                missionRecord({ status: HeroMissionStatus.PUBLISHED }),
              ),
          }),
          authRepository(),
        ).execute(MISSION_ID),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.hero.mission.invalid_status_transition',
    });

    await expect(
      withScope(() =>
        new DeleteHeroMissionUseCase(
          baseRepository({
            findMissionById: jest
              .fn()
              .mockResolvedValue(missionRecord({ status: HeroMissionStatus.ARCHIVED })),
            countMissionProgress: jest.fn().mockResolvedValue(1),
          }),
          authRepository(),
        ).execute(MISSION_ID),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.hero.mission.invalid_status_transition',
    });
  });

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const repository = {
      listBadges: jest.fn().mockResolvedValue([badgeRecord()]),
      findBadgeById: jest.fn().mockResolvedValue(badgeRecord()),
      createBadge: jest.fn().mockImplementation((data) =>
        Promise.resolve(
          badgeRecord({
            slug: data.slug,
            nameEn: data.nameEn,
            nameAr: data.nameAr,
            isActive: data.isActive,
          }),
        ),
      ),
      updateBadge: jest.fn().mockImplementation((_id, data) =>
        Promise.resolve(
          badgeRecord({
            slug: String(data.slug ?? 'speed-runner'),
            nameEn: (data.nameEn as string | null | undefined) ?? 'Speed Runner',
          }),
        ),
      ),
      softDeleteBadge: jest.fn().mockResolvedValue(
        badgeRecord({
          deletedAt: NOW,
        }),
      ),
      countActiveMissionsUsingBadge: jest.fn().mockResolvedValue(0),
      listMissions: jest.fn().mockResolvedValue({
        items: [missionRecord()],
        total: 1,
      }),
      findMissionById: jest.fn().mockResolvedValue(missionRecord()),
      createMissionWithObjectives: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          missionRecord({
            status: input.mission.status,
            rewardXp: input.mission.rewardXp,
            badgeRewardId: input.mission.badgeRewardId,
            objectives: input.objectives.map(
              (objective: {
                type: HeroMissionObjectiveType;
                titleEn: string | null;
                sortOrder: number;
                isRequired: boolean;
              }) =>
                objectiveRecord({
                  type: objective.type,
                  titleEn: objective.titleEn,
                  sortOrder: objective.sortOrder,
                  isRequired: objective.isRequired,
                }),
            ),
          }),
        ),
      ),
      updateMissionWithObjectives: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          missionRecord({
            objectives: input.objectives
              ? input.objectives.map(
                  (objective: {
                    type: HeroMissionObjectiveType;
                    titleEn: string | null;
                    sortOrder: number;
                    isRequired: boolean;
                  }) =>
                    objectiveRecord({
                      type: objective.type,
                      titleEn: objective.titleEn,
                      sortOrder: objective.sortOrder,
                      isRequired: objective.isRequired,
                    }),
                )
              : undefined,
          }),
        ),
      ),
      publishMission: jest.fn().mockImplementation((params) =>
        Promise.resolve(
          missionRecord({
            status: HeroMissionStatus.PUBLISHED,
            publishedAt: NOW,
            publishedById: params.actorId,
          }),
        ),
      ),
      archiveMission: jest.fn().mockImplementation((params) =>
        Promise.resolve(
          missionRecord({
            status: HeroMissionStatus.ARCHIVED,
            archivedAt: NOW,
            archivedById: params.actorId,
          }),
        ),
      ),
      softDeleteMissionAndObjectives: jest.fn().mockResolvedValue(
        missionRecord({
          deletedAt: NOW,
        }),
      ),
      countMissionProgress: jest.fn().mockResolvedValue(0),
      findAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_ID }),
      findTerm: jest.fn().mockResolvedValue({
        id: TERM_ID,
        academicYearId: YEAR_ID,
      }),
      findStage: jest.fn().mockResolvedValue({ id: STAGE_ID }),
      findSubject: jest.fn().mockResolvedValue({ id: SUBJECT_ID }),
      findAssessment: jest.fn().mockResolvedValue({ id: ASSESSMENT_ID }),
      findFile: jest.fn().mockResolvedValue({ id: 'file-1', schoolId: SCHOOL_ID }),
      createMissionProgress: jest.fn(),
      createXpLedger: jest.fn(),
      createHeroStudentBadge: jest.fn(),
      ...overrides,
    };

    return repository as unknown as jest.Mocked<HeroJourneyRepository> & {
      createMissionProgress: jest.Mock;
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

  function badgeRecord(overrides?: any) {
    return {
      id: overrides?.id ?? BADGE_ID,
      schoolId: SCHOOL_ID,
      slug: overrides?.slug ?? 'speed-runner',
      nameEn: overrides?.nameEn ?? 'Speed Runner',
      nameAr: overrides?.nameAr ?? null,
      descriptionEn: overrides?.descriptionEn ?? null,
      descriptionAr: overrides?.descriptionAr ?? null,
      assetPath: overrides?.assetPath ?? null,
      fileId: overrides?.fileId ?? null,
      sortOrder: overrides?.sortOrder ?? 0,
      isActive: overrides?.isActive ?? true,
      metadata: overrides?.metadata ?? null,
      createdAt: overrides?.createdAt ?? NOW,
      updatedAt: overrides?.updatedAt ?? NOW,
      deletedAt: overrides?.deletedAt ?? null,
    };
  }

  function missionRecord(overrides?: any) {
    return {
      id: overrides?.id ?? MISSION_ID,
      schoolId: SCHOOL_ID,
      academicYearId: overrides?.academicYearId ?? YEAR_ID,
      termId: overrides?.termId ?? TERM_ID,
      stageId: overrides?.stageId ?? STAGE_ID,
      subjectId: overrides?.subjectId ?? SUBJECT_ID,
      linkedAssessmentId: overrides?.linkedAssessmentId ?? null,
      linkedLessonRef: overrides?.linkedLessonRef ?? null,
      titleEn: overrides?.titleEn ?? 'Hero Mission',
      titleAr: overrides?.titleAr ?? null,
      briefEn: overrides?.briefEn ?? null,
      briefAr: overrides?.briefAr ?? null,
      requiredLevel: overrides?.requiredLevel ?? 1,
      rewardXp: overrides?.rewardXp ?? 10,
      badgeRewardId: overrides?.badgeRewardId ?? BADGE_ID,
      status: overrides?.status ?? HeroMissionStatus.DRAFT,
      positionX: overrides?.positionX ?? null,
      positionY: overrides?.positionY ?? null,
      sortOrder: overrides?.sortOrder ?? 0,
      publishedAt: overrides?.publishedAt ?? null,
      publishedById: overrides?.publishedById ?? null,
      archivedAt: overrides?.archivedAt ?? null,
      archivedById: overrides?.archivedById ?? null,
      createdById: overrides?.createdById ?? ACTOR_ID,
      metadata: overrides?.metadata ?? null,
      createdAt: overrides?.createdAt ?? NOW,
      updatedAt: overrides?.updatedAt ?? NOW,
      deletedAt: overrides?.deletedAt ?? null,
      badgeReward: overrides?.badgeReward ?? {
        id: BADGE_ID,
        slug: 'speed-runner',
        nameEn: 'Speed Runner',
        nameAr: null,
        assetPath: null,
        fileId: null,
        isActive: true,
      },
      objectives: overrides?.objectives ?? [objectiveRecord()],
    };
  }

  function objectiveRecord(overrides?: any) {
    return {
      id: overrides?.id ?? 'objective-1',
      schoolId: SCHOOL_ID,
      missionId: MISSION_ID,
      type: overrides?.type ?? HeroMissionObjectiveType.MANUAL,
      titleEn: overrides?.titleEn ?? 'Objective',
      titleAr: overrides?.titleAr ?? null,
      subtitleEn: overrides?.subtitleEn ?? null,
      subtitleAr: overrides?.subtitleAr ?? null,
      linkedAssessmentId: overrides?.linkedAssessmentId ?? null,
      linkedLessonRef: overrides?.linkedLessonRef ?? null,
      sortOrder: overrides?.sortOrder ?? 1,
      isRequired: overrides?.isRequired ?? true,
      metadata: overrides?.metadata ?? null,
      createdAt: overrides?.createdAt ?? NOW,
      updatedAt: overrides?.updatedAt ?? NOW,
      deletedAt: overrides?.deletedAt ?? null,
    };
  }
});
