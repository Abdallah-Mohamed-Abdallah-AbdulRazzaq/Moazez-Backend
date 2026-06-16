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
      (item: { classroomId: string }) => item.classroomId === academic.classroomAId,
    );
    const classroomB = all.body.items.find(
      (item: { classroomId: string }) => item.classroomId === academic.classroomBId,
    );
    expect(classroomA).toMatchObject({
      classroomId: academic.classroomAId,
      gradeId: academic.gradeId,
      configs: [{ id: configId, status: 'draft' }],
    });
    expect(classroomB).toMatchObject({
      classroomId: academic.classroomBId,
      gradeId: academic.gradeId,
      entries: [],
    });
    expect(classroomA.periods.map((period: { id: string }) => period.id)).toEqual(
      expect.arrayContaining([periodOneId, periodTwoId]),
    );
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

  it('publishes, unpublishes, and deletes one draft slot without deleting others', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/publish`)
      .set('Authorization', bearer(adminAuth))
      .send({ timetableConfigId: configId })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('published');
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
          entriesReturnedToDraft: 2,
        });
      });

    const [config, activeEntries, latestPublication] = await Promise.all([
      prisma.timetableConfig.findUnique({ where: { id: configId } }),
      prisma.timetableEntry.findMany({
        where: { id: { in: [firstEntryId, secondEntryId] } },
        select: { id: true, status: true },
      }),
      prisma.timetablePublication.findFirst({
        where: { timetableConfigId: configId },
        orderBy: { revision: 'desc' },
      }),
    ]);
    expect(config?.status).toBe(TimetableConfigStatus.DRAFT);
    expect(activeEntries.map((entry) => entry.status)).toEqual([
      TimetableEntryStatus.DRAFT,
      TimetableEntryStatus.DRAFT,
    ]);
    expect(latestPublication?.status).toBe(TimetablePublicationStatus.SUPERSEDED);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/timetable/entries/${firstEntryId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ ok: true });
      });

    await expect(
      prisma.timetableEntry.findMany({
        where: { timetableConfigId: configId },
        select: { id: true },
      }),
    ).resolves.toEqual([{ id: secondEntryId }]);
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
        expect(response.body?.error?.code).toBe('academics.timetable.closed_term');
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

    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
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
    await prisma.subject.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.classroom.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.room.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.section.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.grade.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.stage.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.term.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
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
