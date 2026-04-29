import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HeroJourneyEventType,
  PrismaClient,
  ReinforcementTargetScope,
  StudentEnrollmentStatus,
  StudentStatus,
  XpSourceType,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';

jest.setTimeout(45000);

describe('Hero Journey Foundation closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;

  const cleanupState = {
    badgeIds: new Set<string>(),
    missionIds: new Set<string>(),
    objectiveIds: new Set<string>(),
    progressIds: new Set<string>(),
    objectiveProgressIds: new Set<string>(),
    studentBadgeIds: new Set<string>(),
    xpLedgerIds: new Set<string>(),
    xpPolicyIds: new Set<string>(),
    enrollmentIds: new Set<string>(),
    studentIds: new Set<string>(),
    subjectIds: new Set<string>(),
    classroomIds: new Set<string>(),
    sectionIds: new Set<string>(),
    gradeIds: new Set<string>(),
    stageIds: new Set<string>(),
    termIds: new Set<string>(),
    academicYearIds: new Set<string>(),
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true, organizationId: true },
    });

    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }

    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (prisma) {
      await rememberPersistedObjectiveProgressIds();

      const badgeIds = [...cleanupState.badgeIds];
      const missionIds = [...cleanupState.missionIds];
      const objectiveIds = [...cleanupState.objectiveIds];
      const progressIds = [...cleanupState.progressIds];
      const objectiveProgressIds = [...cleanupState.objectiveProgressIds];
      const studentBadgeIds = [...cleanupState.studentBadgeIds];
      const xpLedgerIds = [...cleanupState.xpLedgerIds];
      const studentIds = [...cleanupState.studentIds];

      const expectedAuditActions = [
        'reinforcement.hero.badge.create',
        'reinforcement.hero.badge.update',
        'reinforcement.hero.mission.create',
        'reinforcement.hero.mission.update',
        'reinforcement.hero.mission.publish',
        'reinforcement.hero.progress.start',
        'reinforcement.hero.objective.complete',
        'reinforcement.hero.mission.complete',
        'reinforcement.hero.xp.grant',
        'reinforcement.hero.badge.award',
        'reinforcement.hero.mission.archive',
      ];
      const auditResourceIds = [
        ...badgeIds,
        ...missionIds,
        ...progressIds,
        ...objectiveProgressIds,
        ...studentBadgeIds,
        ...xpLedgerIds,
      ];

      if (auditResourceIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            resourceId: { in: auditResourceIds },
            action: { in: expectedAuditActions },
          },
        });
      }

      await prisma.heroJourneyEvent.deleteMany({
        where: {
          OR: [
            ...(missionIds.length > 0
              ? [{ missionId: { in: missionIds } }]
              : []),
            ...(progressIds.length > 0
              ? [{ missionProgressId: { in: progressIds } }]
              : []),
            ...(studentIds.length > 0
              ? [{ studentId: { in: studentIds } }]
              : []),
            ...(badgeIds.length > 0 ? [{ badgeId: { in: badgeIds } }] : []),
            ...(xpLedgerIds.length > 0
              ? [{ xpLedgerId: { in: xpLedgerIds } }]
              : []),
          ],
        },
      });

      await prisma.heroStudentBadge.deleteMany({
        where: {
          OR: [
            ...(studentBadgeIds.length > 0
              ? [{ id: { in: studentBadgeIds } }]
              : []),
            ...(missionIds.length > 0
              ? [{ missionId: { in: missionIds } }]
              : []),
            ...(progressIds.length > 0
              ? [{ missionProgressId: { in: progressIds } }]
              : []),
            ...(studentIds.length > 0
              ? [{ studentId: { in: studentIds } }]
              : []),
            ...(badgeIds.length > 0 ? [{ badgeId: { in: badgeIds } }] : []),
          ],
        },
      });

      await prisma.heroMissionObjectiveProgress.deleteMany({
        where: {
          OR: [
            ...(objectiveProgressIds.length > 0
              ? [{ id: { in: objectiveProgressIds } }]
              : []),
            ...(progressIds.length > 0
              ? [{ missionProgressId: { in: progressIds } }]
              : []),
            ...(objectiveIds.length > 0
              ? [{ objectiveId: { in: objectiveIds } }]
              : []),
          ],
        },
      });

      await prisma.heroMissionProgress.deleteMany({
        where: {
          OR: [
            ...(progressIds.length > 0 ? [{ id: { in: progressIds } }] : []),
            ...(missionIds.length > 0
              ? [{ missionId: { in: missionIds } }]
              : []),
            ...(studentIds.length > 0
              ? [{ studentId: { in: studentIds } }]
              : []),
          ],
        },
      });

      await prisma.xpLedger.deleteMany({
        where: {
          OR: [
            ...(xpLedgerIds.length > 0 ? [{ id: { in: xpLedgerIds } }] : []),
            ...(studentIds.length > 0
              ? [
                  {
                    studentId: { in: studentIds },
                    sourceType: XpSourceType.HERO_MISSION,
                  },
                ]
              : []),
          ],
        },
      });

      await prisma.heroMissionObjective.deleteMany({
        where: {
          OR: [
            ...(missionIds.length > 0
              ? [{ missionId: { in: missionIds } }]
              : []),
            ...(objectiveIds.length > 0 ? [{ id: { in: objectiveIds } }] : []),
          ],
        },
      });

      await prisma.heroMission.deleteMany({
        where: { id: { in: missionIds } },
      });

      await prisma.heroBadge.deleteMany({
        where: { id: { in: badgeIds } },
      });

      await prisma.xpPolicy.deleteMany({
        where: { id: { in: [...cleanupState.xpPolicyIds] } },
      });

      await prisma.enrollment.deleteMany({
        where: { id: { in: [...cleanupState.enrollmentIds] } },
      });

      await prisma.student.deleteMany({
        where: { id: { in: studentIds } },
      });

      await prisma.subject.deleteMany({
        where: { id: { in: [...cleanupState.subjectIds] } },
      });

      await prisma.classroom.deleteMany({
        where: { id: { in: [...cleanupState.classroomIds] } },
      });

      await prisma.section.deleteMany({
        where: { id: { in: [...cleanupState.sectionIds] } },
      });

      await prisma.grade.deleteMany({
        where: { id: { in: [...cleanupState.gradeIds] } },
      });

      await prisma.stage.deleteMany({
        where: { id: { in: [...cleanupState.stageIds] } },
      });

      await prisma.term.deleteMany({
        where: { id: { in: [...cleanupState.termIds] } },
      });

      await prisma.academicYear.deleteMany({
        where: { id: { in: [...cleanupState.academicYearIds] } },
      });

      await prisma.$disconnect();
    }
  });

  async function login(): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function createHeroPrerequisites(): Promise<{
    academicYearId: string;
    termId: string;
    stageId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
    subjectId: string;
    studentId: string;
    enrollmentId: string;
    xpPolicyId: string;
  }> {
    const suffix = randomUUID().split('-')[0];
    let academicYear = await prisma.academicYear.findFirst({
      where: {
        schoolId: demoSchoolId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        terms: {
          where: {
            isActive: true,
            deletedAt: null,
          },
          orderBy: { startDate: 'asc' },
          select: {
            id: true,
            startDate: true,
            endDate: true,
          },
          take: 1,
        },
      },
    });

    if (!academicYear) {
      academicYear = await prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: `Sprint 5B Year ${suffix} AR`,
          nameEn: `Sprint 5B Year ${suffix}`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: true,
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          terms: {
            where: {
              isActive: true,
              deletedAt: null,
            },
            orderBy: { startDate: 'asc' },
            select: {
              id: true,
              startDate: true,
              endDate: true,
            },
            take: 1,
          },
        },
      });
      cleanupState.academicYearIds.add(academicYear.id);
    }

    let term = academicYear.terms[0];
    if (!term) {
      term = await prisma.term.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId: academicYear.id,
          nameAr: `Sprint 5B Term ${suffix} AR`,
          nameEn: `Sprint 5B Term ${suffix}`,
          startDate: academicYear.startDate,
          endDate: academicYear.endDate,
          isActive: true,
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      });
      cleanupState.termIds.add(term.id);
    }

    const stage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `Sprint 5B Stage ${suffix} AR`,
        nameEn: `Sprint 5B Stage ${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: stage.id,
        nameAr: `Sprint 5B Grade ${suffix} AR`,
        nameEn: `Sprint 5B Grade ${suffix}`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.gradeIds.add(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: demoSchoolId,
        gradeId: grade.id,
        nameAr: `Sprint 5B Section ${suffix} AR`,
        nameEn: `Sprint 5B Section ${suffix}`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.sectionIds.add(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: demoSchoolId,
        sectionId: section.id,
        nameAr: `Sprint 5B Classroom ${suffix} AR`,
        nameEn: `Sprint 5B Classroom ${suffix}`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `Sprint 5B Hero Subject ${suffix} AR`,
        nameEn: `Sprint 5B Hero Subject ${suffix}`,
        code: `S5B-${suffix}`,
        color: '#0f766e',
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.subjectIds.add(subject.id);

    const student = await prisma.student.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        firstName: `Sprint 5B Hero ${suffix}`,
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanupState.studentIds.add(student.id);

    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: demoSchoolId,
        studentId: student.id,
        academicYearId: academicYear.id,
        termId: term.id,
        classroomId: classroom.id,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: term.startDate,
      },
      select: { id: true },
    });
    cleanupState.enrollmentIds.add(enrollment.id);

    const xpPolicy = await prisma.xpPolicy.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: academicYear.id,
        termId: term.id,
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: student.id,
        dailyCap: 1000,
        weeklyCap: 5000,
        cooldownMinutes: 0,
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.xpPolicyIds.add(xpPolicy.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      studentId: student.id,
      enrollmentId: enrollment.id,
      xpPolicyId: xpPolicy.id,
    };
  }

  async function rememberPersistedObjectiveProgressIds(): Promise<void> {
    if (cleanupState.progressIds.size === 0) return;

    const objectiveProgressRows =
      await prisma.heroMissionObjectiveProgress.findMany({
        where: {
          missionProgressId: { in: [...cleanupState.progressIds] },
        },
        select: { id: true },
      });

    for (const row of objectiveProgressRows) {
      cleanupState.objectiveProgressIds.add(row.id);
    }
  }

  function rememberMissionObjectiveIds(mission: {
    objectives?: Array<{ id: string }>;
  }): void {
    for (const objective of mission.objectives ?? []) {
      cleanupState.objectiveIds.add(objective.id);
    }
  }

  async function countHeroEvents(params: {
    progressId: string;
    type: HeroJourneyEventType;
  }): Promise<number> {
    return prisma.heroJourneyEvent.count({
      where: {
        schoolId: demoSchoolId,
        missionProgressId: params.progressId,
        type: params.type,
      },
    });
  }

  it('covers badge catalog, mission workflow, progress, rewards, read models, archive, and audit', async () => {
    const { accessToken } = await login();

    const meResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meResponse.body.activeMembership).toEqual(
      expect.objectContaining({
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
      }),
    );

    const fixture = await createHeroPrerequisites();
    const suffix = randomUUID().split('-')[0];
    const badgeSlug = `sprint-5b-badge-${suffix}`;
    const missionTitle = `Sprint 5B Hero Mission ${suffix}`;
    const rewardXp = 42;

    const createBadgeResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/badges`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        slug: badgeSlug,
        nameEn: `Sprint 5B Badge ${suffix}`,
        nameAr: `Sprint 5B Badge ${suffix} AR`,
        descriptionEn: 'Awarded by the Sprint 5B Hero Journey closeout flow.',
        assetPath: `/assets/hero/badges/${badgeSlug}.svg`,
        sortOrder: 10,
      })
      .expect(201);

    const badgeId = createBadgeResponse.body.id as string;
    cleanupState.badgeIds.add(badgeId);

    expect(createBadgeResponse.body).toMatchObject({
      id: badgeId,
      slug: badgeSlug,
      nameEn: `Sprint 5B Badge ${suffix}`,
      isActive: true,
    });

    const badgesListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/badges`)
      .query({ search: badgeSlug })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(badgesListResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: badgeId, slug: badgeSlug }),
      ]),
    );

    const badgeDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/badges/${badgeId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(badgeDetailResponse.body).toMatchObject({
      id: badgeId,
      slug: badgeSlug,
      isActive: true,
    });

    const updateBadgeResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/hero/badges/${badgeId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nameEn: `Sprint 5B Badge ${suffix} Updated`,
        descriptionEn: 'Updated by the Sprint 5B closeout flow.',
        sortOrder: 11,
      })
      .expect(200);

    expect(updateBadgeResponse.body).toMatchObject({
      id: badgeId,
      slug: badgeSlug,
      nameEn: `Sprint 5B Badge ${suffix} Updated`,
      sortOrder: 11,
    });

    const createMissionResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        stageId: fixture.stageId,
        subjectId: fixture.subjectId,
        titleEn: missionTitle,
        titleAr: `${missionTitle} AR`,
        briefEn: 'Complete the first Hero Journey verification mission.',
        requiredLevel: 1,
        rewardXp,
        badgeRewardId: badgeId,
        positionX: 10,
        positionY: 20,
        sortOrder: 1,
        objectives: [
          {
            type: 'manual',
            titleEn: 'Read the mission brief',
            titleAr: 'Read the mission brief AR',
            sortOrder: 1,
            isRequired: true,
          },
          {
            type: 'custom',
            titleEn: 'Add an optional reflection',
            titleAr: 'Add an optional reflection AR',
            sortOrder: 2,
            isRequired: false,
          },
        ],
      })
      .expect(201);

    const missionId = createMissionResponse.body.id as string;
    cleanupState.missionIds.add(missionId);
    rememberMissionObjectiveIds(createMissionResponse.body);

    expect(createMissionResponse.body).toMatchObject({
      id: missionId,
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      stageId: fixture.stageId,
      subjectId: fixture.subjectId,
      titleEn: missionTitle,
      rewardXp,
      status: 'draft',
      badgeReward: expect.objectContaining({ id: badgeId, slug: badgeSlug }),
    });
    expect(
      createMissionResponse.body.objectives.map(
        (objective: { sortOrder: number }) => objective.sortOrder,
      ),
    ).toEqual([1, 2]);
    await expect(
      prisma.heroMissionProgress.count({ where: { missionId } }),
    ).resolves.toBe(0);

    const missionsListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        stageId: fixture.stageId,
        search: missionTitle,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(missionsListResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: missionId, status: 'draft' }),
      ]),
    );

    const missionDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${missionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(missionDetailResponse.body).toMatchObject({
      id: missionId,
      badgeReward: expect.objectContaining({ id: badgeId }),
      objectives: expect.arrayContaining([
        expect.objectContaining({ titleEn: 'Read the mission brief' }),
      ]),
    });

    const updateMissionResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${missionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        briefEn: 'Updated closeout mission brief.',
        objectives: [
          {
            type: 'manual',
            titleEn: 'Complete the required checkpoint',
            titleAr: 'Complete the required checkpoint AR',
            sortOrder: 5,
            isRequired: true,
            metadata: { checkpoint: 'required' },
          },
          {
            type: 'custom',
            titleEn: 'Capture an optional reflection',
            titleAr: 'Capture an optional reflection AR',
            sortOrder: 10,
            isRequired: false,
            metadata: { checkpoint: 'optional' },
          },
        ],
      })
      .expect(200);

    rememberMissionObjectiveIds(updateMissionResponse.body);
    const requiredObjective = updateMissionResponse.body.objectives.find(
      (objective: { isRequired: boolean }) => objective.isRequired,
    ) as { id: string; titleEn: string; sortOrder: number };
    expect(updateMissionResponse.body).toMatchObject({
      id: missionId,
      briefEn: 'Updated closeout mission brief.',
      objectives: [
        expect.objectContaining({
          titleEn: 'Complete the required checkpoint',
          sortOrder: 1,
          isRequired: true,
        }),
        expect.objectContaining({
          titleEn: 'Capture an optional reflection',
          sortOrder: 2,
          isRequired: false,
        }),
      ],
    });

    const publishMissionResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${missionId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(publishMissionResponse.body).toMatchObject({
      id: missionId,
      status: 'published',
      publishedAt: expect.any(String),
      publishedById: expect.any(String),
    });

    const protectedMutationResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${missionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ rewardXp: rewardXp + 1 })
      .expect(409);

    expect(protectedMutationResponse.body?.error?.code).toBe(
      'reinforcement.hero.mission.invalid_status_transition',
    );

    const progressBeforeStartResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/hero/students/${fixture.studentId}/progress`,
      )
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(progressBeforeStartResponse.body).toMatchObject({
      student: expect.objectContaining({ id: fixture.studentId }),
      enrollment: expect.objectContaining({
        enrollmentId: fixture.enrollmentId,
        classroomId: fixture.classroomId,
      }),
    });
    expect(progressBeforeStartResponse.body.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          missionId,
          progressId: null,
          status: 'not_started',
        }),
      ]),
    );

    const startMissionResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/hero/students/${fixture.studentId}/missions/${missionId}/start`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enrollmentId: fixture.enrollmentId })
      .expect(201);

    const progressId = startMissionResponse.body.id as string;
    cleanupState.progressIds.add(progressId);

    expect(startMissionResponse.body).toMatchObject({
      id: progressId,
      missionId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      status: 'in_progress',
      progressPercent: 0,
      startedAt: expect.any(String),
    });
    expect(startMissionResponse.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'mission_started', missionId }),
      ]),
    );

    const progressDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/progress/${progressId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(progressDetailResponse.body).toMatchObject({
      id: progressId,
      mission: expect.objectContaining({ id: missionId }),
      student: expect.objectContaining({ id: fixture.studentId }),
      enrollment: expect.objectContaining({ id: fixture.enrollmentId }),
      objectives: expect.arrayContaining([
        expect.objectContaining({
          id: requiredObjective.id,
          completedAt: null,
        }),
      ]),
      events: expect.arrayContaining([
        expect.objectContaining({ type: 'mission_started' }),
      ]),
    });
    await expect(
      prisma.xpLedger.count({
        where: {
          sourceType: XpSourceType.HERO_MISSION,
          sourceId: progressId,
          studentId: fixture.studentId,
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.heroStudentBadge.count({
        where: {
          missionProgressId: progressId,
          studentId: fixture.studentId,
        },
      }),
    ).resolves.toBe(0);

    const incompleteMissionResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/hero/progress/${progressId}/complete`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(409);

    expect(incompleteMissionResponse.body?.error?.code).toBe(
      'reinforcement.hero.progress.objective_not_completed',
    );

    const completeObjectiveResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/hero/progress/${progressId}/objectives/${requiredObjective.id}/complete`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ metadata: { closeout: 'required-objective' } })
      .expect(201);

    const completedRequiredObjective =
      completeObjectiveResponse.body.objectives.find(
        (objective: { id: string }) => objective.id === requiredObjective.id,
      );
    expect(completeObjectiveResponse.body).toMatchObject({
      id: progressId,
      status: 'in_progress',
      progressPercent: 100,
    });
    expect(completedRequiredObjective).toEqual(
      expect.objectContaining({
        id: requiredObjective.id,
        completedAt: expect.any(String),
      }),
    );
    expect(completeObjectiveResponse.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'objective_completed' }),
      ]),
    );

    await rememberPersistedObjectiveProgressIds();

    const completeMissionResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/hero/progress/${progressId}/complete`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ metadata: { closeout: 'mission-complete' } })
      .expect(201);

    expect(completeMissionResponse.body).toMatchObject({
      id: progressId,
      status: 'completed',
      progressPercent: 100,
      completedAt: expect.any(String),
    });
    expect(completeMissionResponse.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'mission_completed' }),
      ]),
    );

    const grantXpResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/hero/progress/${progressId}/grant-xp`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'hero_mission' })
      .expect(201);

    const xpLedgerId = grantXpResponse.body.id as string;
    cleanupState.xpLedgerIds.add(xpLedgerId);

    expect(grantXpResponse.body).toMatchObject({
      id: xpLedgerId,
      progressId,
      missionId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      sourceType: 'hero_mission',
      sourceId: progressId,
      amount: rewardXp,
      policyId: fixture.xpPolicyId,
      idempotent: false,
    });
    await expect(
      prisma.heroMissionProgress.findUnique({
        where: { id: progressId },
        select: { xpLedgerId: true },
      }),
    ).resolves.toEqual({ xpLedgerId });

    const duplicateXpResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/hero/progress/${progressId}/grant-xp`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'hero_mission' })
      .expect(201);

    expect(duplicateXpResponse.body).toMatchObject({
      id: xpLedgerId,
      idempotent: true,
    });
    await expect(
      prisma.xpLedger.count({
        where: {
          sourceType: XpSourceType.HERO_MISSION,
          sourceId: progressId,
          studentId: fixture.studentId,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      countHeroEvents({
        progressId,
        type: HeroJourneyEventType.XP_GRANTED,
      }),
    ).resolves.toBe(1);

    const awardBadgeResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/hero/progress/${progressId}/award-badge`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ metadata: { closeout: 'badge-award' } })
      .expect(201);

    const studentBadgeId = awardBadgeResponse.body.studentBadgeId as string;
    cleanupState.studentBadgeIds.add(studentBadgeId);

    expect(awardBadgeResponse.body).toMatchObject({
      id: studentBadgeId,
      progressId,
      missionId,
      studentId: fixture.studentId,
      badgeId,
      badge: expect.objectContaining({ id: badgeId, slug: badgeSlug }),
      earnedAt: expect.any(String),
      idempotent: false,
    });

    const duplicateBadgeResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/hero/progress/${progressId}/award-badge`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(duplicateBadgeResponse.body).toMatchObject({
      id: studentBadgeId,
      studentBadgeId,
      idempotent: true,
    });
    await expect(
      prisma.heroStudentBadge.count({
        where: {
          studentId: fixture.studentId,
          badgeId,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      countHeroEvents({
        progressId,
        type: HeroJourneyEventType.BADGE_AWARDED,
      }),
    ).resolves.toBe(1);

    const rewardsResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/hero/students/${fixture.studentId}/rewards`,
      )
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        includeEvents: true,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(rewardsResponse.body.summary).toMatchObject({
      totalHeroXp: rewardXp,
      badgesCount: 1,
      completedMissions: 1,
      xpGrantedMissions: 1,
      badgeAwardedMissions: 1,
    });
    expect(rewardsResponse.body.xpLedger).toEqual([
      expect.objectContaining({
        id: xpLedgerId,
        progressId,
        missionId,
        sourceType: 'hero_mission',
        sourceId: progressId,
        amount: rewardXp,
      }),
    ]);
    expect(rewardsResponse.body.badges).toEqual([
      expect.objectContaining({
        id: studentBadgeId,
        badgeId,
        progressId,
      }),
    ]);
    expect(rewardsResponse.body.missions).toEqual([
      expect.objectContaining({
        progressId,
        missionId,
        xpGranted: true,
        xpLedgerId,
        badgeRewardId: badgeId,
        badgeAwarded: true,
        studentBadgeId,
      }),
    ]);
    expect(rewardsResponse.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'xp_granted', xpLedgerId }),
        expect.objectContaining({ type: 'badge_awarded', badgeId }),
      ]),
    );

    const overviewResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/overview`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        classroomId: fixture.classroomId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(overviewResponse.body.scope).toMatchObject({
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      stageId: fixture.stageId,
      gradeId: fixture.gradeId,
      sectionId: fixture.sectionId,
      classroomId: fixture.classroomId,
    });
    expect(overviewResponse.body.missions).toMatchObject({
      total: 1,
      published: 1,
      withBadgeReward: 1,
      withXpReward: 1,
    });
    expect(overviewResponse.body.progress.completed).toBe(1);
    expect(overviewResponse.body.rewards).toMatchObject({
      totalHeroXp: rewardXp,
      xpGrantedMissions: 1,
      badgesAwarded: 1,
    });
    expect(overviewResponse.body.events).toMatchObject({
      missionStarted: 1,
      objectiveCompleted: 1,
      missionCompleted: 1,
      xpGranted: 1,
      badgeAwarded: 1,
    });

    const aggregateMapResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/map`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        stageId: fixture.stageId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(aggregateMapResponse.body).toMatchObject({
      mode: 'aggregate',
      scope: expect.objectContaining({ stageId: fixture.stageId }),
      missions: [
        expect.objectContaining({
          missionId,
          status: 'published',
          completedCount: 1,
          startedCount: 1,
        }),
      ],
    });

    const studentMapResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/map`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        stageId: fixture.stageId,
        studentId: fixture.studentId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(studentMapResponse.body).toMatchObject({
      mode: 'student',
      missions: [
        expect.objectContaining({
          missionId,
          studentProgress: expect.objectContaining({
            progressId,
            status: 'completed',
            progressPercent: 100,
            xpGranted: true,
            xpLedgerId,
            badgeAwarded: true,
            studentBadgeId,
          }),
        }),
      ],
    });

    const stageSummaryResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/hero/stages/${fixture.stageId}/summary`,
      )
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(stageSummaryResponse.body).toMatchObject({
      stage: expect.objectContaining({ stageId: fixture.stageId }),
      studentsCount: 1,
      missions: expect.objectContaining({ total: 1, published: 1 }),
      progress: expect.objectContaining({ completed: 1 }),
      rewards: expect.objectContaining({ totalHeroXp: rewardXp }),
    });

    const classroomSummaryResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/hero/classrooms/${fixture.classroomId}/summary`,
      )
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(classroomSummaryResponse.body).toMatchObject({
      classroom: expect.objectContaining({
        classroomId: fixture.classroomId,
        sectionId: fixture.sectionId,
        gradeId: fixture.gradeId,
        stageId: fixture.stageId,
      }),
      studentsCount: 1,
      rewards: expect.objectContaining({
        totalHeroXp: rewardXp,
        badgesAwarded: 1,
      }),
    });
    expect(classroomSummaryResponse.body.students).toEqual([
      expect.objectContaining({
        studentId: fixture.studentId,
        totalMissions: 1,
        completedMissions: 1,
        totalHeroXp: rewardXp,
        badgesCount: 1,
      }),
    ]);

    const badgeSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/badge-summary`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        stageId: fixture.stageId,
        studentId: fixture.studentId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(badgeSummaryResponse.body.summary).toMatchObject({
      earnedTotal: 1,
      studentsWithBadges: 1,
    });
    expect(badgeSummaryResponse.body.badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          badgeId,
          slug: badgeSlug,
          earnedCount: 1,
          studentEarned: true,
          studentBadgeId,
          earnedAt: expect.any(String),
        }),
      ]),
    );

    const archiveMissionResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${missionId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Sprint 5B closeout archive check' })
      .expect(201);

    expect(archiveMissionResponse.body).toMatchObject({
      id: missionId,
      status: 'archived',
      archivedAt: expect.any(String),
      archivedById: expect.any(String),
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/progress/${progressId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: progressId,
          status: 'completed',
          mission: expect.objectContaining({ id: missionId }),
        });
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/hero/students/${fixture.studentId}/rewards`,
      )
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.summary).toMatchObject({
          totalHeroXp: rewardXp,
          badgesCount: 1,
        });
      });

    const defaultAfterArchiveResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        stageId: fixture.stageId,
        search: missionTitle,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      defaultAfterArchiveResponse.body.items.some(
        (item: { id: string }) => item.id === missionId,
      ),
    ).toBe(false);

    const includeArchivedResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        stageId: fixture.stageId,
        search: missionTitle,
        includeArchived: true,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(includeArchivedResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: missionId, status: 'archived' }),
      ]),
    );

    const expectedAuditActions = [
      'reinforcement.hero.badge.create',
      'reinforcement.hero.badge.update',
      'reinforcement.hero.mission.create',
      'reinforcement.hero.mission.update',
      'reinforcement.hero.mission.publish',
      'reinforcement.hero.progress.start',
      'reinforcement.hero.objective.complete',
      'reinforcement.hero.mission.complete',
      'reinforcement.hero.xp.grant',
      'reinforcement.hero.badge.award',
      'reinforcement.hero.mission.archive',
    ];
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: demoSchoolId,
        action: { in: expectedAuditActions },
        resourceId: {
          in: [
            badgeId,
            missionId,
            progressId,
            ...cleanupState.objectiveProgressIds,
            xpLedgerId,
            studentBadgeId,
          ],
        },
      },
      select: { action: true, outcome: true },
    });
    const auditActions = auditLogs.map((log) => log.action);

    expect(auditActions).toEqual(expect.arrayContaining(expectedAuditActions));
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'reinforcement.hero.xp.grant',
          outcome: 'SUCCESS',
        }),
        expect.objectContaining({
          action: 'reinforcement.hero.badge.award',
          outcome: 'SUCCESS',
        }),
      ]),
    );
  });
});
