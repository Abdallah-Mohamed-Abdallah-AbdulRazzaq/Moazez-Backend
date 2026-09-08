import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetablePublicationStatus,
  TimetableScopeType,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { TimetableRepository } from '../../src/modules/academics/timetable/infrastructure/timetable.repository';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint22DTimetable123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type GeneratorResponseBody = {
  timetableConfigId: string;
  createdCount: number;
  remainingDemandCount: number;
  complete: boolean;
  unresolved: unknown[];
  searchBudgetExhausted: boolean;
  publishReadiness: { canPublish: boolean };
};

type AcademicBase = {
  academicYearId: string;
  termId: string;
  closedTermId: string;
  stageId: string;
  gradeId: string;
  sectionAId: string;
  sectionBId: string;
  classroomAId: string;
  classroomBId: string;
};

jest.setTimeout(180000);

describe('Academics timetable dashboard workflows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let adminEmail = '';
  let teacherUserId = '';
  let academic: AcademicBase;
  let mathSubjectId = '';
  let scienceSubjectId = '';
  let mathAllocationAId = '';
  let mathAllocationBId = '';
  let closedAllocationId = '';
  let roomAId = '';
  let roomBId = '';
  let configId = '';
  let periodOneId = '';
  let periodTwoId = '';
  let closedConfigId = '';
  let closedPeriodId = '';
  let firstEntryId = '';
  let secondEntryId = '';
  let closedEntryId = '';
  let adminAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22d-e2e-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [viewPermission, managePermission, teacherRole] = await Promise.all([
      findOrCreatePermission({
        code: 'academics.structure.view',
        resource: 'structure',
        action: 'view',
        description: 'View academic structure.',
      }),
      findOrCreatePermission({
        code: 'academics.structure.manage',
        resource: 'structure',
        action: 'manage',
        description: 'Manage academic structure.',
      }),
      findSystemRole('teacher'),
    ]);

    organizationId = await createOrganization();
    schoolId = await createSchool(organizationId);
    academic = await createAcademicBase();
    mathSubjectId = await createSubject('math', 'Mathematics', '#2563eb');
    scienceSubjectId = await createSubject('science', 'Science', '#16a34a');
    await createSubjectAllocation({
      termId: academic.termId,
      subjectId: mathSubjectId,
      weeklyHours: 2,
    });
    await createSubjectAllocation({
      termId: academic.termId,
      subjectId: scienceSubjectId,
      weeklyHours: 1,
    });
    await createSubjectAllocation({
      termId: academic.closedTermId,
      subjectId: mathSubjectId,
      weeklyHours: 1,
    });

    roomAId = await createRoom('a');
    roomBId = await createRoom('b');

    const adminRoleId = await createCustomRole({
      key: `${marker}-timetable-admin`,
      name: `Sprint 22D Timetable Admin ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    adminEmail = `${marker}-admin@example.test`;
    await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint22D',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: adminRoleId,
    });
    teacherUserId = await createUserWithMembership({
      email: `${marker}-teacher@example.test`,
      firstName: 'Nour',
      lastName: 'Hassan',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
    });

    mathAllocationAId = await createTeacherAllocation({
      termId: academic.termId,
      subjectId: mathSubjectId,
      classroomId: academic.classroomAId,
    });
    mathAllocationBId = await createTeacherAllocation({
      termId: academic.termId,
      subjectId: mathSubjectId,
      classroomId: academic.classroomBId,
    });
    closedAllocationId = await createTeacherAllocation({
      termId: academic.closedTermId,
      subjectId: mathSubjectId,
      classroomId: academic.classroomAId,
    });

    configId = await createTimetableConfig({
      termId: academic.termId,
      name: `${marker}-config`,
      status: TimetableConfigStatus.DRAFT,
    });
    periodOneId = await createTimetablePeriod({
      configId,
      index: 1,
      label: 'Period 1',
      startTime: '08:00',
      endTime: '08:45',
    });
    periodTwoId = await createTimetablePeriod({
      configId,
      index: 2,
      label: 'Period 2',
      startTime: '09:00',
      endTime: '09:45',
    });
    closedConfigId = await createTimetableConfig({
      termId: academic.closedTermId,
      name: `${marker}-closed-config`,
      status: TimetableConfigStatus.DRAFT,
    });
    closedPeriodId = await createTimetablePeriod({
      configId: closedConfigId,
      index: 1,
      label: 'Closed Period',
      startTime: '10:00',
      endTime: '10:45',
    });
    closedEntryId = await createTimetableEntryDirect({
      termId: academic.closedTermId,
      configId: closedConfigId,
      periodId: closedPeriodId,
      dayOfWeek: 0,
      classroomId: academic.classroomAId,
      allocationId: closedAllocationId,
      status: TimetableEntryStatus.DRAFT,
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    adminAuth = await login(adminEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupE2eData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers existing and new timetable routes without changing app schedule routes', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/timetable/all',
        'GET /api/v1/academics/timetable/config',
        'PUT /api/v1/academics/timetable/config',
        'GET /api/v1/academics/timetable/periods',
        'POST /api/v1/academics/timetable/periods',
        'GET /api/v1/academics/timetable/entries',
        'POST /api/v1/academics/timetable/entries',
        'PUT /api/v1/academics/timetable/entries/bulk',
        'DELETE /api/v1/academics/timetable/entries/:entryId',
        'POST /api/v1/academics/timetable/generate',
        'GET /api/v1/academics/timetable/preview',
        'GET /api/v1/academics/timetable/conflicts',
        'GET /api/v1/academics/timetable/publication',
        'POST /api/v1/academics/timetable/publish',
        'POST /api/v1/academics/timetable/unpublish',
        'GET /api/v1/academics/timetable/validate',
        'POST /api/v1/academics/timetable/conflicts/check',
        'GET /api/v1/teacher/schedule',
        'GET /api/v1/student/schedule',
        'GET /api/v1/parent/children/:studentId/schedule/today',
      ]),
    );
  });

  it('bulk saves grid entries and returns a safe dashboard all read model', async () => {
    const bulk = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            classroomId: academic.classroomAId,
            dayOfWeek: 0,
            periodId: periodOneId,
            teacherSubjectAllocationId: mathAllocationAId,
            roomId: roomAId,
          },
          {
            classroomId: academic.classroomAId,
            dayOfWeek: 0,
            periodId: periodTwoId,
            teacherSubjectAllocationId: mathAllocationAId,
            roomId: roomBId,
          },
        ],
      })
      .expect(200);

    expect(bulk.body.summary).toEqual({
      requestedCount: 2,
      createdCount: 2,
      updatedCount: 0,
    });
    expect(bulk.body.items).toHaveLength(2);
    firstEntryId = bulk.body.items[0].id;
    secondEntryId = bulk.body.items[1].id;
    expectSafeTimetablePayload(bulk.body);

    const all = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/all`)
      .query({ termId: academic.termId, gradeId: academic.gradeId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(all.body).toMatchObject({
      termId: academic.termId,
      academicYearId: academic.academicYearId,
      isPublished: false,
    });
    const classroomA = all.body.items.find(
      (item: { classroomId: string }) =>
        item.classroomId === academic.classroomAId,
    );
    const classroomB = all.body.items.find(
      (item: { classroomId: string }) =>
        item.classroomId === academic.classroomBId,
    );
    expect(classroomA).toMatchObject({
      classroomId: academic.classroomAId,
      gradeId: academic.gradeId,
      effectiveConfig: null,
      configs: [{ id: configId, status: 'draft' }],
    });
    expect(classroomB).toMatchObject({
      classroomId: academic.classroomBId,
      gradeId: academic.gradeId,
      entries: [],
    });
    expect(
      classroomA.periods.map((period: { id: string }) => period.id),
    ).toEqual(expect.arrayContaining([periodOneId, periodTwoId]));
    expect(classroomA.entries.map((entry: { id: string }) => entry.id)).toEqual(
      expect.arrayContaining([firstEntryId, secondEntryId]),
    );
    expectSafeTimetablePayload(all.body);
  });

  it('validates scheduled periods against SubjectAllocation weekly hours', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/validate`)
      .query({ termId: academic.termId, classroomId: academic.classroomAId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(response.body.summary).toMatchObject({
      classroomsChecked: 1,
      expectedWeeklySlots: 3,
      actualScheduledSlots: 2,
      missingTeacherAllocations: 1,
      underScheduledSubjects: 1,
      teacherConflicts: 0,
      roomConflicts: 0,
    });
    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId: mathSubjectId,
          expectedWeeklyHours: 2,
          scheduledWeeklyHours: 2,
          status: 'complete',
        }),
        expect.objectContaining({
          subjectId: scienceSubjectId,
          expectedWeeklyHours: 1,
          scheduledWeeklyHours: 0,
          status: 'missing_teacher_allocation',
        }),
      ]),
    );
    expectSafeTimetablePayload(response.body);
  });

  it('keeps preview, publication, and blocked publish in parity without database mutations', async () => {
    const before = await Promise.all([
      prisma.timetableConfig.findUniqueOrThrow({
        where: { id: configId },
        select: { status: true, updatedAt: true },
      }),
      prisma.timetableEntry.findMany({
        where: { timetableConfigId: configId },
        orderBy: { id: 'asc' },
        select: { id: true, status: true, updatedAt: true },
      }),
      prisma.timetablePublication.findMany({
        where: { timetableConfigId: configId },
        orderBy: { revision: 'asc' },
        select: {
          id: true,
          revision: true,
          status: true,
          publishedAt: true,
          publishedByUserId: true,
        },
      }),
    ]);

    const preview = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/preview`)
      .query({ timetableConfigId: configId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    const publication = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/publication`)
      .query({ timetableConfigId: configId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    const publish = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/publish`)
      .send({ timetableConfigId: configId })
      .set('Authorization', bearer(adminAuth))
      .expect(409);

    const previewBody = preview.body as {
      publishReadiness: {
        canPublish: boolean;
        blockingReasons: Array<{ code: string }>;
      };
    };
    const publicationBody = publication.body as {
      canPublish: boolean;
      blockingReasons: Array<{ code: string }>;
    };
    const publishBody = publish.body as {
      error: {
        code: string;
        details: { blockingReasons: Array<{ code: string }> };
      };
    };
    expect(previewBody.publishReadiness.canPublish).toBe(false);
    expect(publicationBody.canPublish).toBe(false);
    expect(publishBody.error.code).toBe('academics.timetable.publish_blocked');
    expect(publicationBody.blockingReasons).toEqual(
      previewBody.publishReadiness.blockingReasons,
    );
    expect(publishBody.error.details.blockingReasons).toEqual(
      previewBody.publishReadiness.blockingReasons,
    );
    expect(previewBody.publishReadiness.blockingReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing_teacher_allocation' }),
        expect.objectContaining({ code: 'under_scheduled_subject' }),
      ]),
    );

    const after = await Promise.all([
      prisma.timetableConfig.findUniqueOrThrow({
        where: { id: configId },
        select: { status: true, updatedAt: true },
      }),
      prisma.timetableEntry.findMany({
        where: { timetableConfigId: configId },
        orderBy: { id: 'asc' },
        select: { id: true, status: true, updatedAt: true },
      }),
      prisma.timetablePublication.findMany({
        where: { timetableConfigId: configId },
        orderBy: { revision: 'asc' },
        select: {
          id: true,
          revision: true,
          status: true,
          publishedAt: true,
          publishedByUserId: true,
        },
      }),
    ]);
    expect(after).toEqual(before);
  });

  it('enforces room eligibility, validation, and lifecycle integrity', async () => {
    const inactiveRoom = await prisma.room.create({
      data: {
        schoolId,
        nameAr: `${marker}-inactive-room-ar`,
        nameEn: `${marker}-inactive-room`,
        capacity: 40,
        isActive: false,
      },
      select: { id: true },
    });
    const undersizedRoom = await prisma.room.create({
      data: {
        schoolId,
        nameAr: `${marker}-undersized-room-ar`,
        nameEn: `${marker}-undersized-room`,
        capacity: 29,
        isActive: true,
      },
      select: { id: true },
    });
    const freeRoom = await createRoom('free');
    const historicalRoom = await createRoom('historical');
    const defaultRoom = await createRoom('default');
    const item = {
      classroomId: academic.classroomAId,
      dayOfWeek: 0,
      periodId: periodOneId,
      teacherSubjectAllocationId: mathAllocationAId,
    };
    const expectValidationRoomIssue = async (code: string): Promise<void> => {
      const validation = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/timetable/validate`)
        .query({ termId: academic.termId, classroomId: academic.classroomAId })
        .set('Authorization', bearer(adminAuth))
        .expect(200);
      expect(validation.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            issues: expect.arrayContaining([expect.objectContaining({ code })]),
          }),
        ]),
      );
    };

    try {
      for (const [roomId, checkCode, writeCode] of [
        [inactiveRoom.id, 'room_inactive', 'academics.timetable.room_inactive'],
        [
          undersizedRoom.id,
          'room_capacity_insufficient',
          'academics.timetable.room_capacity_insufficient',
        ],
      ]) {
        const checked = await request(app.getHttpServer())
          .post(`${GLOBAL_PREFIX}/academics/timetable/conflicts/check`)
          .set('Authorization', bearer(adminAuth))
          .send({
            termId: academic.termId,
            items: [{ ...item, roomId }],
          })
          .expect(200);
        expect(checked.body).toMatchObject({
          hasConflicts: true,
          conflicts: [expect.objectContaining({ code: checkCode })],
        });

        await request(app.getHttpServer())
          .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
          .set('Authorization', bearer(adminAuth))
          .send({
            termId: academic.termId,
            items: [{ ...item, roomId }],
          })
          .expect(422)
          .expect((response) => {
            expect(response.body.error.code).toBe(writeCode);
          });
      }
      await expect(
        prisma.timetableEntry.findUniqueOrThrow({
          where: { id: firstEntryId },
          select: { roomId: true },
        }),
      ).resolves.toEqual({ roomId: roomAId });

      const lifecycleMutations = [
        { method: 'patch' as const, body: { isActive: false } },
        { method: 'patch' as const, body: { capacity: 29 } },
        { method: 'delete' as const },
      ];
      for (const mutation of lifecycleMutations) {
        const pending = request(app.getHttpServer())
          [mutation.method](`${GLOBAL_PREFIX}/academics/rooms/${roomAId}`)
          .set('Authorization', bearer(adminAuth));
        if ('body' in mutation) pending.send(mutation.body);
        await pending.expect(409).expect((response) => {
          expect(response.body.error.code).toBe(
            'academics.rooms.scheduling_dependency',
          );
          expect(response.body.error.details).toEqual(
            expect.objectContaining({ activeTimetableEntryCount: 1 }),
          );
        });
      }

      await prisma.room.update({
        where: { id: roomAId },
        data: { isActive: false },
      });
      await expectValidationRoomIssue('room_inactive');
      await prisma.room.update({
        where: { id: roomAId },
        data: { isActive: true, capacity: 29 },
      });
      await expectValidationRoomIssue('room_capacity_insufficient');
      await prisma.room.update({
        where: { id: roomAId },
        data: { capacity: 40, deletedAt: new Date() },
      });
      await expectValidationRoomIssue('room_not_found');
      await prisma.room.update({
        where: { id: roomAId },
        data: { deletedAt: null },
      });

      await request(app.getHttpServer())
        .patch(`${GLOBAL_PREFIX}/academics/rooms/${freeRoom}`)
        .set('Authorization', bearer(adminAuth))
        .send({ isActive: false })
        .expect(200);
      const rooms = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/rooms`)
        .set('Authorization', bearer(adminAuth))
        .expect(200);
      expect(rooms.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: freeRoom, isActive: false }),
        ]),
      );
      await request(app.getHttpServer())
        .delete(`${GLOBAL_PREFIX}/academics/rooms/${freeRoom}`)
        .set('Authorization', bearer(adminAuth))
        .expect(200);

      await prisma.timetableEntry.update({
        where: { id: closedEntryId },
        data: { roomId: historicalRoom },
      });
      await request(app.getHttpServer())
        .delete(`${GLOBAL_PREFIX}/academics/rooms/${historicalRoom}`)
        .set('Authorization', bearer(adminAuth))
        .expect(200);
      await expect(
        prisma.timetableEntry.findUniqueOrThrow({
          where: { id: closedEntryId },
          select: { roomId: true },
        }),
      ).resolves.toEqual({ roomId: historicalRoom });

      await prisma.classroom.update({
        where: { id: academic.classroomBId },
        data: { roomId: defaultRoom },
      });
      await request(app.getHttpServer())
        .delete(`${GLOBAL_PREFIX}/academics/rooms/${defaultRoom}`)
        .set('Authorization', bearer(adminAuth))
        .expect(409)
        .expect((response) => {
          expect(response.body.error).toMatchObject({
            code: 'academics.rooms.scheduling_dependency',
            details: { classroomDefaultRoomCount: 1 },
          });
        });
    } finally {
      await prisma.room.updateMany({
        where: { id: roomAId },
        data: { isActive: true, capacity: 40, deletedAt: null },
      });
      await prisma.classroom.updateMany({
        where: { id: academic.classroomBId },
        data: { roomId: null },
      });
      await prisma.timetableEntry.updateMany({
        where: { id: closedEntryId },
        data: { roomId: null },
      });
    }
  });

  it('reports proposed conflicts without persisting them', async () => {
    const beforeCount = await prisma.timetableEntry.count({
      where: { timetableConfigId: configId },
    });

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/conflicts/check`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            classroomId: academic.classroomBId,
            dayOfWeek: 0,
            periodId: periodOneId,
            teacherSubjectAllocationId: mathAllocationBId,
            roomId: roomAId,
          },
        ],
      })
      .expect(200);

    expect(response.body.hasConflicts).toBe(true);
    expect(response.body.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'teacher_conflict',
          teacherUserId,
          entryIds: [firstEntryId],
          proposedIndexes: [0],
        }),
        expect.objectContaining({
          code: 'room_conflict',
          roomId: roomAId,
          entryIds: [firstEntryId],
          proposedIndexes: [0],
        }),
      ]),
    );
    expectSafeTimetablePayload(response.body);
    await expect(
      prisma.timetableEntry.count({ where: { timetableConfigId: configId } }),
    ).resolves.toBe(beforeCount);
  });

  it('enforces partial interval conflicts across configs with check and write parity', async () => {
    const classroomConfig = await prisma.timetableConfig.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        name: `${marker}-interval-config`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: `classroom:${academic.classroomBId}`,
        classroomId: academic.classroomBId,
        status: TimetableConfigStatus.DRAFT,
      },
      select: { id: true },
    });
    const overlappingPeriod = await prisma.timetablePeriod.create({
      data: {
        schoolId,
        timetableConfigId: classroomConfig.id,
        periodIndex: 1,
        label: 'Overlapping period',
        startTime: '08:30',
        endTime: '09:15',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    const classroomConflictConfig = await prisma.timetableConfig.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        name: `${marker}-classroom-conflict-config`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: `classroom:${academic.classroomAId}`,
        classroomId: academic.classroomAId,
        status: TimetableConfigStatus.DRAFT,
      },
      select: { id: true },
    });
    const classroomOverlappingPeriod = await prisma.timetablePeriod.create({
      data: {
        schoolId,
        timetableConfigId: classroomConflictConfig.id,
        periodIndex: 1,
        label: 'Classroom overlapping period',
        startTime: '08:30',
        endTime: '09:15',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });

    try {
      const candidate = {
        classroomId: academic.classroomBId,
        dayOfWeek: 0,
        periodId: overlappingPeriod.id,
        teacherSubjectAllocationId: mathAllocationBId,
        roomId: roomAId,
      };
      const before = await prisma.timetableEntry.count({
        where: { schoolId, termId: academic.termId },
      });
      const checked = await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/timetable/conflicts/check`)
        .set('Authorization', bearer(adminAuth))
        .send({ termId: academic.termId, items: [candidate] })
        .expect(200);
      expect(checked.body.conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'teacher_conflict',
            entryIds: [firstEntryId],
            proposedIndexes: [0],
          }),
          expect.objectContaining({
            code: 'room_conflict',
            roomId: roomAId,
            entryIds: [firstEntryId],
            proposedIndexes: [0],
          }),
        ]),
      );

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
        .set('Authorization', bearer(adminAuth))
        .send({ timetableConfigId: classroomConfig.id, ...candidate })
        .expect(409)
        .expect((response) => {
          expect(response.body.error.code).toBe(
            'academics.timetable.teacher_conflict',
          );
        });
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
        .set('Authorization', bearer(adminAuth))
        .send({
          timetableConfigId: classroomConflictConfig.id,
          classroomId: academic.classroomAId,
          dayOfWeek: 0,
          periodId: classroomOverlappingPeriod.id,
          teacherSubjectAllocationId: mathAllocationAId,
        })
        .expect(409)
        .expect((response) => {
          expect(response.body.error.code).toBe(
            'academics.timetable.entry_conflict',
          );
        });
      await request(app.getHttpServer())
        .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
        .set('Authorization', bearer(adminAuth))
        .send({ termId: academic.termId, items: [candidate] })
        .expect(409)
        .expect((response) => {
          expect(response.body.error.code).toBe(
            'academics.timetable.teacher_conflict',
          );
        });
      await expect(
        prisma.timetableEntry.count({
          where: { schoolId, termId: academic.termId },
        }),
      ).resolves.toBe(before);

      const crossConfigEntryId = await createTimetableEntryDirect({
        termId: academic.termId,
        configId: classroomConfig.id,
        periodId: overlappingPeriod.id,
        dayOfWeek: 0,
        classroomId: academic.classroomBId,
        allocationId: mathAllocationBId,
        status: TimetableEntryStatus.DRAFT,
      });
      const listed = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/timetable/conflicts`)
        .query({ timetableConfigId: classroomConfig.id })
        .set('Authorization', bearer(adminAuth))
        .expect(200);
      expect(listed.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'TEACHER',
            entryIds: expect.arrayContaining([
              firstEntryId,
              crossConfigEntryId,
            ]),
          }),
        ]),
      );

      await request(app.getHttpServer())
        .patch(`${GLOBAL_PREFIX}/academics/timetable/entries/${firstEntryId}`)
        .set('Authorization', bearer(adminAuth))
        .send({ notes: 'self exclusion still checks other configs' })
        .expect(409)
        .expect((response) => {
          expect(response.body.error.code).toBe(
            'academics.timetable.teacher_conflict',
          );
        });
      const validation = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/timetable/validate`)
        .query({ termId: academic.termId, classroomId: academic.classroomAId })
        .set('Authorization', bearer(adminAuth))
        .expect(200);
      expect(validation.body.summary.teacherConflicts).toBe(2);

      await prisma.timetableEntry.delete({ where: { id: crossConfigEntryId } });
    } finally {
      await prisma.timetableEntry.deleteMany({
        where: { timetableConfigId: classroomConfig.id },
      });
      await prisma.timetablePeriod.deleteMany({
        where: {
          timetableConfigId: {
            in: [classroomConfig.id, classroomConflictConfig.id],
          },
        },
      });
      await prisma.timetableConfig.deleteMany({
        where: { id: { in: [classroomConfig.id, classroomConflictConfig.id] } },
      });
    }
  });

  it.each(['zero', 'missing'] as const)(
    'rejects every teaching entry write and publication with %s curriculum',
    async (state) => {
      const where = {
        schoolId,
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
      };
      await prisma.subjectAllocation.updateMany({
        where,
        data: state === 'zero' ? { weeklyHours: 0 } : { deletedAt: new Date() },
      });
      const before = await prisma.timetableEntry.findMany({
        where: { schoolId },
        orderBy: { id: 'asc' },
      });
      try {
        const item = {
          classroomId: academic.classroomAId,
          teacherSubjectAllocationId: mathAllocationAId,
          periodId: periodOneId,
          dayOfWeek: 2,
        };
        const writes = [
          () =>
            request(app.getHttpServer())
              .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
              .send({ timetableConfigId: configId, ...item }),
          () =>
            request(app.getHttpServer())
              .patch(
                `${GLOBAL_PREFIX}/academics/timetable/entries/${firstEntryId}`,
              )
              .send({ notes: 'Stale update' }),
          () =>
            request(app.getHttpServer())
              .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
              .send({ termId: academic.termId, items: [item] }),
          () =>
            request(app.getHttpServer())
              .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
              .send({
                termId: academic.termId,
                items: [{ ...item, dayOfWeek: 0 }],
              }),
        ];
        for (const write of writes) {
          const response = await write()
            .set('Authorization', bearer(adminAuth))
            .expect(422);
          expect(response.body.error.code).toBe(
            state === 'zero'
              ? 'academics.subject_allocation.subject_not_taught'
              : 'academics.timetable.missing_subject_allocation',
          );
        }
        const publish = await request(app.getHttpServer())
          .post(`${GLOBAL_PREFIX}/academics/timetable/publish`)
          .send({ timetableConfigId: configId })
          .set('Authorization', bearer(adminAuth))
          .expect(409);
        expect(publish.body.error.code).toBe(
          'academics.timetable.publish_blocked',
        );
        expect(publish.body.error.details.blockingReasons).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                state === 'zero'
                  ? 'subject_not_taught'
                  : 'missing_subject_allocation',
            }),
          ]),
        );
        expect(
          await prisma.timetableEntry.findMany({
            where: { schoolId },
            orderBy: { id: 'asc' },
          }),
        ).toEqual(before);
      } finally {
        await prisma.subjectAllocation.updateMany({
          where,
          data: { weeklyHours: 2, deletedAt: null },
        });
      }
    },
  );

  it('publishes, unpublishes, and deletes one draft slot without deleting others', async () => {
    const scienceAllocationAId = await createTeacherAllocation({
      termId: academic.termId,
      subjectId: scienceSubjectId,
      classroomId: academic.classroomAId,
    });
    const scienceAllocationBId = await createTeacherAllocation({
      termId: academic.termId,
      subjectId: scienceSubjectId,
      classroomId: academic.classroomBId,
    });
    const additionalEntryIds = [
      await createTimetableEntryDirect({
        termId: academic.termId,
        configId,
        periodId: periodOneId,
        dayOfWeek: 1,
        classroomId: academic.classroomBId,
        allocationId: mathAllocationBId,
        status: TimetableEntryStatus.DRAFT,
      }),
      await createTimetableEntryDirect({
        termId: academic.termId,
        configId,
        periodId: periodTwoId,
        dayOfWeek: 1,
        classroomId: academic.classroomBId,
        allocationId: mathAllocationBId,
        status: TimetableEntryStatus.DRAFT,
      }),
      await createTimetableEntryDirect({
        termId: academic.termId,
        configId,
        periodId: periodOneId,
        dayOfWeek: 2,
        classroomId: academic.classroomAId,
        allocationId: scienceAllocationAId,
        status: TimetableEntryStatus.DRAFT,
      }),
      await createTimetableEntryDirect({
        termId: academic.termId,
        configId,
        periodId: periodOneId,
        dayOfWeek: 3,
        classroomId: academic.classroomBId,
        allocationId: scienceAllocationBId,
        status: TimetableEntryStatus.DRAFT,
      }),
    ];
    const otherConfigEntriesBefore = await prisma.timetableEntry.findMany({
      where: { timetableConfigId: { not: configId } },
      orderBy: { id: 'asc' },
      select: { id: true, status: true, updatedAt: true },
    });
    const [readyPreview, readyPublication] = await Promise.all([
      request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/timetable/preview`)
        .query({ timetableConfigId: configId })
        .set('Authorization', bearer(adminAuth))
        .expect(200),
      request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/timetable/publication`)
        .query({ timetableConfigId: configId })
        .set('Authorization', bearer(adminAuth))
        .expect(200),
    ]);
    expect(
      (
        readyPreview.body as {
          publishReadiness: {
            canPublish: boolean;
            blockingReasons: Array<{ code: string }>;
          };
        }
      ).publishReadiness,
    ).toMatchObject({
      canPublish: true,
      blockingReasons: [],
    });
    expect(readyPublication.body).toMatchObject({
      canPublish: true,
      blockingReasons: [],
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/publish`)
      .set('Authorization', bearer(adminAuth))
      .send({ timetableConfigId: configId })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('published');
      });

    const [publishedCandidateEntries, otherConfigEntriesAfterPublish] =
      await Promise.all([
        prisma.timetableEntry.findMany({
          where: { timetableConfigId: configId },
          select: { status: true },
        }),
        prisma.timetableEntry.findMany({
          where: { timetableConfigId: { not: configId } },
          orderBy: { id: 'asc' },
          select: { id: true, status: true, updatedAt: true },
        }),
      ]);
    expect(publishedCandidateEntries).toHaveLength(6);
    expect(
      publishedCandidateEntries.every(
        (entry) => entry.status === TimetableEntryStatus.ACTIVE,
      ),
    ).toBe(true);
    expect(otherConfigEntriesAfterPublish).toEqual(otherConfigEntriesBefore);

    const publishedDashboard = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/all`)
      .query({ termId: academic.termId, classroomId: academic.classroomAId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(publishedDashboard.body.items[0]).toMatchObject({
      effectiveConfig: {
        id: configId,
        scopeType: 'term',
        status: 'active',
      },
      configs: [expect.objectContaining({ id: configId })],
      periods: expect.arrayContaining([
        expect.objectContaining({ id: periodOneId }),
        expect.objectContaining({ id: periodTwoId }),
      ]),
      entries: expect.arrayContaining([
        expect.objectContaining({ id: firstEntryId }),
        expect.objectContaining({ id: secondEntryId }),
      ]),
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/unpublish`)
      .set('Authorization', bearer(adminAuth))
      .send({ termId: academic.termId })
      .expect(200)
      .expect((response) => {
        expect(response.body.summary).toEqual({
          configsChecked: 1,
          unpublishedCount: 1,
          entriesReturnedToDraft: 6,
        });
      });

    const unpublishedDashboard = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/all`)
      .query({ termId: academic.termId, classroomId: academic.classroomAId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(unpublishedDashboard.body.items[0]).toMatchObject({
      effectiveConfig: null,
      configs: [expect.objectContaining({ id: configId })],
      periods: expect.arrayContaining([
        expect.objectContaining({ id: periodOneId }),
        expect.objectContaining({ id: periodTwoId }),
      ]),
      entries: expect.arrayContaining([
        expect.objectContaining({ id: firstEntryId }),
        expect.objectContaining({ id: secondEntryId }),
      ]),
    });

    const [config, activeEntries, latestPublication] = await Promise.all([
      prisma.timetableConfig.findUnique({ where: { id: configId } }),
      prisma.timetableEntry.findMany({
        where: {
          id: {
            in: [firstEntryId, secondEntryId, ...additionalEntryIds],
          },
        },
        select: { id: true, status: true },
      }),
      prisma.timetablePublication.findFirst({
        where: { timetableConfigId: configId },
        orderBy: { revision: 'desc' },
      }),
    ]);
    expect(config?.status).toBe(TimetableConfigStatus.DRAFT);
    expect(activeEntries).toHaveLength(6);
    expect(
      activeEntries.every(
        (entry) => entry.status === TimetableEntryStatus.DRAFT,
      ),
    ).toBe(true);
    expect(latestPublication?.status).toBe(
      TimetablePublicationStatus.SUPERSEDED,
    );
    await expect(
      prisma.timetableEntry.findMany({
        where: { timetableConfigId: { not: configId } },
        orderBy: { id: 'asc' },
        select: { id: true, status: true, updatedAt: true },
      }),
    ).resolves.toEqual(otherConfigEntriesBefore);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/timetable/entries/${firstEntryId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ ok: true });
      });

    const remainingEntries = await prisma.timetableEntry.findMany({
      where: { timetableConfigId: configId },
      select: { id: true },
    });
    expect(remainingEntries).toHaveLength(5);
    expect(remainingEntries.map((entry) => entry.id)).not.toContain(
      firstEntryId,
    );
    expect(remainingEntries.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([secondEntryId, ...additionalEntryIds]),
    );
  });

  it('denies closed-term bulk, delete, publish, and unpublish mutations', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.closedTermId,
        items: [
          {
            classroomId: academic.classroomAId,
            dayOfWeek: 0,
            periodId: closedPeriodId,
            teacherSubjectAllocationId: closedAllocationId,
          },
        ],
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.closed_term',
        );
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/timetable/entries/${closedEntryId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(409);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/publish`)
      .set('Authorization', bearer(adminAuth))
      .send({ timetableConfigId: closedConfigId })
      .expect(409);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/unpublish`)
      .set('Authorization', bearer(adminAuth))
      .send({ termId: academic.closedTermId })
      .expect(409);
  });

  it('upserts and reads hierarchical scopes with canonical stage ancestry', async () => {
    const createdConfigIds: string[] = [];
    const otherStage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${marker}-other-stage-ar`,
        nameEn: `${marker}-other-stage`,
        sortOrder: 2,
      },
      select: { id: true },
    });

    try {
      const cases = [
        {
          scopeType: TimetableScopeType.STAGE,
          scope: { stageId: academic.stageId },
          expected: {
            stageId: academic.stageId,
            gradeId: null,
            sectionId: null,
            classroomId: null,
          },
        },
        {
          scopeType: TimetableScopeType.GRADE,
          scope: { gradeId: academic.gradeId },
          expected: {
            stageId: academic.stageId,
            gradeId: academic.gradeId,
            sectionId: null,
            classroomId: null,
          },
        },
        {
          scopeType: TimetableScopeType.SECTION,
          scope: { sectionId: academic.sectionAId },
          expected: {
            stageId: academic.stageId,
            gradeId: academic.gradeId,
            sectionId: academic.sectionAId,
            classroomId: null,
          },
        },
        {
          scopeType: TimetableScopeType.CLASSROOM,
          scope: { classroomId: academic.classroomAId },
          expected: {
            stageId: academic.stageId,
            gradeId: academic.gradeId,
            sectionId: academic.sectionAId,
            classroomId: academic.classroomAId,
          },
        },
      ];

      const idsByScope = new Map<TimetableScopeType, string>();
      for (const item of cases) {
        const created = await request(app.getHttpServer())
          .put(`${GLOBAL_PREFIX}/academics/timetable/config`)
          .set('Authorization', bearer(adminAuth))
          .send({
            academicYearId: academic.academicYearId,
            termId: academic.termId,
            scopeType: item.scopeType,
            ...item.scope,
            name: `${marker}-${item.scopeType.toLowerCase()}-config`,
          })
          .expect(200);

        expect(created.body.data).toMatchObject({
          scopeType: item.scopeType.toLowerCase(),
          scopeKey: `${item.scopeType.toLowerCase()}:${Object.values(item.scope)[0]}`,
          ...item.expected,
        });
        createdConfigIds.push(created.body.data.id);
        idsByScope.set(item.scopeType, created.body.data.id);

        const read = await request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}/academics/timetable/config`)
          .query({
            academicYearId: academic.academicYearId,
            termId: academic.termId,
            scopeType: item.scopeType,
            ...item.scope,
          })
          .set('Authorization', bearer(adminAuth))
          .expect(200);
        expect(read.body.data).toMatchObject({
          id: created.body.data.id,
          ...item.expected,
        });
      }

      const updatedStage = await request(app.getHttpServer())
        .put(`${GLOBAL_PREFIX}/academics/timetable/config`)
        .set('Authorization', bearer(adminAuth))
        .send({
          academicYearId: academic.academicYearId,
          termId: academic.termId,
          scopeType: TimetableScopeType.STAGE,
          stageId: academic.stageId,
          name: `${marker}-stage-config-updated`,
        })
        .expect(200);
      expect(updatedStage.body.data).toMatchObject({
        id: idsByScope.get(TimetableScopeType.STAGE),
        name: `${marker}-stage-config-updated`,
        stageId: academic.stageId,
      });

      const otherStageConfig = await request(app.getHttpServer())
        .put(`${GLOBAL_PREFIX}/academics/timetable/config`)
        .set('Authorization', bearer(adminAuth))
        .send({
          academicYearId: academic.academicYearId,
          termId: academic.termId,
          scopeType: TimetableScopeType.STAGE,
          stageId: otherStage.id,
          name: `${marker}-other-stage-config`,
        })
        .expect(200);
      createdConfigIds.push(otherStageConfig.body.data.id);

      const dashboard = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/timetable/all`)
        .query({ termId: academic.termId, gradeId: academic.gradeId })
        .set('Authorization', bearer(adminAuth))
        .expect(200);
      const classroomA = dashboard.body.items.find(
        (item: { classroomId: string }) =>
          item.classroomId === academic.classroomAId,
      );
      const classroomB = dashboard.body.items.find(
        (item: { classroomId: string }) =>
          item.classroomId === academic.classroomBId,
      );
      expect(
        classroomA.configs.map((config: { id: string }) => config.id),
      ).toEqual(
        expect.arrayContaining([
          configId,
          idsByScope.get(TimetableScopeType.STAGE),
          idsByScope.get(TimetableScopeType.GRADE),
          idsByScope.get(TimetableScopeType.SECTION),
          idsByScope.get(TimetableScopeType.CLASSROOM),
        ]),
      );
      expect(
        classroomB.configs.map((config: { id: string }) => config.id),
      ).toEqual(
        expect.arrayContaining([
          configId,
          idsByScope.get(TimetableScopeType.STAGE),
          idsByScope.get(TimetableScopeType.GRADE),
        ]),
      );
      expect(JSON.stringify(dashboard.body)).not.toContain(
        otherStageConfig.body.data.id,
      );
      expect(
        classroomA.configs.find(
          (config: { id: string }) =>
            config.id === idsByScope.get(TimetableScopeType.STAGE),
        ),
      ).toMatchObject({ stageId: academic.stageId });
    } finally {
      await prisma.timetableConfig.deleteMany({
        where: { id: { in: createdConfigIds } },
      });
      await prisma.stage.delete({ where: { id: otherStage.id } });
    }
  });

  it('generates a complete draft atomically, serializes concurrent runs, and remains publish-compatible', async () => {
    await prisma.teacherSubjectAllocation.findFirstOrThrow({
      where: {
        schoolId,
        teacherUserId,
        termId: academic.termId,
        subjectId: scienceSubjectId,
        classroomId: academic.classroomAId,
      },
      select: { id: true },
    });
    const generatorConfig = await prisma.timetableConfig.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        name: `${marker}-generator-config`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: `classroom:${academic.classroomAId}`,
        stageId: academic.stageId,
        gradeId: academic.gradeId,
        sectionId: academic.sectionAId,
        classroomId: academic.classroomAId,
        status: TimetableConfigStatus.DRAFT,
      },
      select: { id: true },
    });

    try {
      await Promise.all([
        createTimetablePeriod({
          configId: generatorConfig.id,
          index: 1,
          label: 'Generator 1',
          startTime: '18:00',
          endTime: '18:45',
        }),
        createTimetablePeriod({
          configId: generatorConfig.id,
          index: 2,
          label: 'Generator 2',
          startTime: '19:00',
          endTime: '19:45',
        }),
        createTimetablePeriod({
          configId: generatorConfig.id,
          index: 3,
          label: 'Generator 3',
          startTime: '20:00',
          endTime: '20:45',
        }),
      ]);
      const publicationsBefore = await prisma.timetablePublication.findMany({
        where: { schoolId },
        select: {
          id: true,
          timetableConfigId: true,
          status: true,
          revision: true,
        },
        orderBy: { id: 'asc' },
      });

      const [firstRun, secondRun] = await Promise.all([
        request(app.getHttpServer())
          .post(`${GLOBAL_PREFIX}/academics/timetable/generate`)
          .set('Authorization', bearer(adminAuth))
          .send({ timetableConfigId: generatorConfig.id }),
        request(app.getHttpServer())
          .post(`${GLOBAL_PREFIX}/academics/timetable/generate`)
          .set('Authorization', bearer(adminAuth))
          .send({ timetableConfigId: generatorConfig.id }),
      ]);

      expect([firstRun.status, secondRun.status]).toEqual([200, 200]);
      const firstBody = firstRun.body as unknown as GeneratorResponseBody;
      const secondBody = secondRun.body as unknown as GeneratorResponseBody;
      expect(
        [firstBody.createdCount, secondBody.createdCount].sort(
          (left, right) => left - right,
        ),
      ).toEqual([0, 3]);
      for (const body of [firstBody, secondBody]) {
        expectSafeTimetablePayload(body);
        expect(body.timetableConfigId).toBe(generatorConfig.id);
        expect(body.searchBudgetExhausted).toBe(false);
      }

      const generatedEntries = await prisma.timetableEntry.findMany({
        where: { timetableConfigId: generatorConfig.id },
        select: {
          id: true,
          subjectId: true,
          status: true,
          roomId: true,
          timetableConfigId: true,
        },
        orderBy: { id: 'asc' },
      });
      expect(generatedEntries).toHaveLength(3);
      expect(
        generatedEntries.filter((entry) => entry.subjectId === mathSubjectId),
      ).toHaveLength(2);
      expect(
        generatedEntries.filter(
          (entry) => entry.subjectId === scienceSubjectId,
        ),
      ).toHaveLength(1);
      expect(
        generatedEntries.every(
          (entry) =>
            entry.status === TimetableEntryStatus.DRAFT &&
            entry.roomId === null &&
            entry.timetableConfigId === generatorConfig.id,
        ),
      ).toBe(true);
      await expect(
        prisma.timetableConfig.findUniqueOrThrow({
          where: { id: generatorConfig.id },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: TimetableConfigStatus.DRAFT });
      await expect(
        prisma.timetablePublication.findMany({
          where: { schoolId },
          select: {
            id: true,
            timetableConfigId: true,
            status: true,
            revision: true,
          },
          orderBy: { id: 'asc' },
        }),
      ).resolves.toEqual(publicationsBefore);

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/timetable/generate`)
        .set('Authorization', bearer(adminAuth))
        .send({ timetableConfigId: generatorConfig.id })
        .expect(200)
        .expect((response) => {
          const body = response.body as unknown as GeneratorResponseBody;
          expect(body.createdCount).toBe(0);
          expect(body.remainingDemandCount).toBe(0);
          expect(body.complete).toBe(true);
          expect(body.unresolved).toEqual([]);
          expect(body.publishReadiness.canPublish).toBe(true);
        });

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/timetable/preview`)
        .query({ timetableConfigId: generatorConfig.id })
        .set('Authorization', bearer(adminAuth))
        .expect(200)
        .expect((response) => {
          const body = response.body as unknown as {
            conflicts: unknown[];
            publishReadiness: { canPublish: boolean };
          };
          expect(body.conflicts).toEqual([]);
          expect(body.publishReadiness.canPublish).toBe(true);
        });

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/timetable/publish`)
        .set('Authorization', bearer(adminAuth))
        .send({ timetableConfigId: generatorConfig.id })
        .expect(200)
        .expect((response) => {
          const body = response.body as unknown as {
            status: string;
            canPublish: boolean;
          };
          expect(body.status).toBe('published');
          expect(body.canPublish).toBe(false);
        });
    } finally {
      await prisma.timetablePublication.deleteMany({
        where: { timetableConfigId: generatorConfig.id },
      });
      await prisma.timetableEntry.deleteMany({
        where: { timetableConfigId: generatorConfig.id },
      });
      await prisma.timetablePeriod.deleteMany({
        where: { timetableConfigId: generatorConfig.id },
      });
      await prisma.timetableConfig.delete({
        where: { id: generatorConfig.id },
      });
    }
  });

  it('rolls back every generated row when one row in the bulk insert is invalid', async () => {
    const atomicConfig = await prisma.timetableConfig.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        name: `${marker}-atomic-config`,
        weekStartDay: 0,
        activeDays: [0, 1],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: `atomic:${academic.classroomAId}`,
        stageId: academic.stageId,
        gradeId: academic.gradeId,
        sectionId: academic.sectionAId,
        classroomId: academic.classroomAId,
        status: TimetableConfigStatus.DRAFT,
      },
      select: { id: true },
    });
    const atomicPeriodId = await createTimetablePeriod({
      configId: atomicConfig.id,
      index: 1,
      label: 'Atomic Period',
      startTime: '21:00',
      endTime: '21:45',
    });

    try {
      const repository = app.get(TimetableRepository);
      await expect(
        runWithRequestContext(createRequestContext(), async () => {
          setActor({ id: teacherUserId, userType: UserType.SCHOOL_USER });
          setActiveMembership({
            membershipId: randomUUID(),
            organizationId,
            schoolId,
            roleId: randomUUID(),
            permissions: ['academics.structure.manage'],
          });
          return repository.generateEntriesAtomically(
            atomicConfig.id,
            (snapshot) => {
              const base = {
                schoolId,
                academicYearId: academic.academicYearId,
                termId: academic.termId,
                timetableConfigId: atomicConfig.id,
                gradeId: academic.gradeId,
                sectionId: academic.sectionAId,
                classroomId: academic.classroomAId,
                subjectId: mathSubjectId,
                teacherUserId,
                teacherSubjectAllocationId: mathAllocationAId,
                roomId: null,
              };
              expect(snapshot.candidateEntries).toEqual([]);
              return {
                entries: [
                  { ...base, periodId: atomicPeriodId, dayOfWeek: 0 },
                  { ...base, periodId: randomUUID(), dayOfWeek: 1 },
                ],
                value: null,
              };
            },
          );
        }),
      ).rejects.toThrow();

      await expect(
        prisma.timetableEntry.count({
          where: { timetableConfigId: atomicConfig.id },
        }),
      ).resolves.toBe(0);
    } finally {
      await prisma.timetableEntry.deleteMany({
        where: { timetableConfigId: atomicConfig.id },
      });
      await prisma.timetablePeriod.deleteMany({
        where: { timetableConfigId: atomicConfig.id },
      });
      await prisma.timetableConfig.delete({ where: { id: atomicConfig.id } });
    }
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
  }

  async function findOrCreatePermission(params: {
    code: string;
    resource: string;
    action: string;
    description: string;
  }): Promise<{ id: string }> {
    const permission = await prisma.permission.findUnique({
      where: { code: params.code },
      select: { id: true },
    });
    if (permission) return permission;

    const created = await prisma.permission.create({
      data: {
        code: params.code,
        module: 'academics',
        resource: params.resource,
        action: params.action,
        description: params.description,
      },
      select: { id: true },
    });
    createdPermissionIds.push(created.id);
    return created;
  }

  async function createOrganization(): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Sprint 22D Timetable Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization.id;
  }

  async function createSchool(inputOrganizationId: string): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: inputOrganizationId,
        slug: `${marker}-school`,
        name: `Sprint 22D Timetable School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school.id;
  }

  async function createCustomRole(params: {
    key: string;
    name: string;
    permissionIds: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId,
        key: params.key,
        name: params.name,
        description: 'Timetable dashboard workflow e2e test role',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    await prisma.rolePermission.createMany({
      data: params.permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
    });

    return role.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    firstName: string;
    lastName: string;
    userType: UserType;
    roleId: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function createAcademicBase(): Promise<AcademicBase> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `${marker}-year-ar`,
        nameEn: `${marker}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-term-ar`,
        nameEn: `${marker}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const closedTerm = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-closed-term-ar`,
        nameEn: `${marker}-closed-term`,
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: new Date('2027-03-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${marker}-stage-ar`,
        nameEn: `${marker}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `${marker}-grade-ar`,
        nameEn: `${marker}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const sectionA = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `${marker}-section-a-ar`,
        nameEn: `${marker}-section-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const sectionB = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `${marker}-section-b-ar`,
        nameEn: `${marker}-section-b`,
        sortOrder: 2,
      },
      select: { id: true },
    });
    const classroomA = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: sectionA.id,
        nameAr: `${marker}-classroom-a-ar`,
        nameEn: `${marker}-classroom-a`,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    const classroomB = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: sectionB.id,
        nameAr: `${marker}-classroom-b-ar`,
        nameEn: `${marker}-classroom-b`,
        sortOrder: 2,
        capacity: 30,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      closedTermId: closedTerm.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionAId: sectionA.id,
      sectionBId: sectionB.id,
      classroomAId: classroomA.id,
      classroomBId: classroomB.id,
    };
  }

  async function createSubject(
    label: string,
    nameEn: string,
    color: string,
  ): Promise<string> {
    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${marker}-${label}-ar`,
        nameEn,
        code: `${marker}-${label.toUpperCase()}`,
        color,
        isActive: true,
      },
      select: { id: true },
    });
    return subject.id;
  }

  async function createSubjectAllocation(params: {
    termId: string;
    subjectId: string;
    weeklyHours: number;
  }): Promise<string> {
    const allocation = await prisma.subjectAllocation.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: params.termId,
        gradeId: academic.gradeId,
        subjectId: params.subjectId,
        weeklyHours: params.weeklyHours,
      },
      select: { id: true },
    });
    return allocation.id;
  }

  async function createRoom(label: string): Promise<string> {
    const room = await prisma.room.create({
      data: {
        schoolId,
        nameAr: `${marker}-room-${label}-ar`,
        nameEn: `${marker}-room-${label}`,
        capacity: 40,
        isActive: true,
      },
      select: { id: true },
    });
    return room.id;
  }

  async function createTeacherAllocation(params: {
    termId: string;
    subjectId: string;
    classroomId: string;
  }): Promise<string> {
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId: params.subjectId,
        classroomId: params.classroomId,
        termId: params.termId,
      },
      select: { id: true },
    });
    return allocation.id;
  }

  async function createTimetableConfig(params: {
    termId: string;
    name: string;
    status: TimetableConfigStatus;
  }): Promise<string> {
    const config = await prisma.timetableConfig.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: params.termId,
        name: params.name,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.TERM,
        scopeKey: `term:${params.termId}`,
        status: params.status,
      },
      select: { id: true },
    });
    return config.id;
  }

  async function createTimetablePeriod(params: {
    configId: string;
    index: number;
    label: string;
    startTime: string;
    endTime: string;
  }): Promise<string> {
    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId,
        timetableConfigId: params.configId,
        periodIndex: params.index,
        label: params.label,
        startTime: params.startTime,
        endTime: params.endTime,
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    return period.id;
  }

  async function createTimetableEntryDirect(params: {
    termId: string;
    configId: string;
    periodId: string;
    dayOfWeek: number;
    classroomId: string;
    allocationId: string;
    status: TimetableEntryStatus;
  }): Promise<string> {
    const classroom = await prisma.classroom.findUniqueOrThrow({
      where: { id: params.classroomId },
      select: { sectionId: true, section: { select: { gradeId: true } } },
    });
    const allocation = await prisma.teacherSubjectAllocation.findUniqueOrThrow({
      where: { id: params.allocationId },
      select: { subjectId: true, teacherUserId: true },
    });
    const entry = await prisma.timetableEntry.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: params.termId,
        timetableConfigId: params.configId,
        periodId: params.periodId,
        dayOfWeek: params.dayOfWeek,
        gradeId: classroom.section.gradeId,
        sectionId: classroom.sectionId,
        classroomId: params.classroomId,
        subjectId: allocation.subjectId,
        teacherUserId: allocation.teacherUserId,
        teacherSubjectAllocationId: params.allocationId,
        status: params.status,
      },
      select: { id: true },
    });
    return entry.id;
  }

  async function login(email: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return {
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
    };
  }

  function listRegisteredRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);
    return routes.sort();
  }

  function collectRoutes(layers: ExpressLayer[], routes: string[]): void {
    for (const layer of layers) {
      if (layer.route?.path && layer.route.methods) {
        const paths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        const methods = Object.entries(layer.route.methods)
          .filter(([, enabled]) => enabled)
          .map(([method]) => method.toUpperCase());

        for (const path of paths) {
          for (const method of methods) {
            routes.push(`${method} ${normalizeRoutePath(path)}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }

  function normalizeRoutePath(path: string): string {
    return `/${path}`.replace(/\/{2,}/g, '/');
  }

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectSafeTimetablePayload(value: unknown): void {
    for (const forbiddenKey of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'passwordHash',
      'deletedAt',
      'email',
    ]) {
      expectNoObjectKey(value, forbiddenKey);
    }
  }

  function expectNoObjectKey(value: unknown, forbiddenKey: string): void {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (const item of value) expectNoObjectKey(item, forbiddenKey);
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      expect(key).not.toBe(forbiddenKey);
      expectNoObjectKey(nested, forbiddenKey);
    }
  }

  async function cleanupE2eData(): Promise<void> {
    if (!prisma) return;

    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.timetableConflict.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetablePublication.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetableEntry.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetablePeriod.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetableConfig.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subject.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.classroom.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.room.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.section.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.grade.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.stage.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.term.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.academicYear.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.permission.deleteMany({
      where: { id: { in: createdPermissionIds } },
    });
    await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
