import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
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
  ParentScheduleClock,
  parseParentScheduleDate,
} from '../../src/modules/parent-app/schedule/application/parent-schedule-date';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint12F123!';
const TODAY = '2026-09-14';
const WEEK_QUERY_DATE = '2026-09-16';
const OUTSIDE_TERM_DATE = '2026-09-21';
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
  stageId: string;
  gradeId: string;
  sectionId: string;
};

type ClassroomPlacement = {
  classroomId: string;
  subjectId: string;
  allocationId: string;
};

type SideEffectCounts = {
  attendanceSessions: number;
  communicationNotifications: number;
  xpLedgerEntries: number;
  rewardRedemptions: number;
};

jest.setTimeout(180000);

describe('Sprint 12F Schedule/Timetable final closeout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId = '';
  let organizationBId = '';
  let schoolAId = '';
  let schoolBId = '';
  let adminEmail = '';
  let teacherEmail = '';
  let teacherBEmail = '';
  let studentEmail = '';
  let parentEmail = '';
  let adminUserId = '';
  let teacherUserId = '';
  let teacherBUserId = '';
  let teacherCrossUserId = '';
  let studentUserId = '';
  let parentUserId = '';
  let academicA: AcademicBase;
  let academicB: AcademicBase;
  let ownedPlacement: ClassroomPlacement;
  let secondPlacement: ClassroomPlacement;
  let unlinkedPlacement: ClassroomPlacement;
  let crossPlacement: ClassroomPlacement;
  let roomAId = '';
  let ownedStudentId = '';
  let ownedEnrollmentId = '';
  let secondChildStudentId = '';
  let sameSchoolUnlinkedStudentId = '';
  let crossSchoolStudentId = '';
  let guardianAId = '';
  let guardianBId = '';
  let timetableConfigId = '';
  let timetablePeriodId = '';
  let ownedScheduleEntryId = '';
  let draftConfigEntryId = '';
  let draftEntryId = '';
  let cancelledEntryId = '';
  let unpublishedEntryId = '';
  let termBoundarySuppressedEntryId = '';
  let secondChildScheduleEntryId = '';
  let crossSchoolScheduleEntryId = '';
  let sideEffectsBeforeScheduleFlow: SideEffectCounts | null = null;
  let adminAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let parentAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s12f-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, teacherRole, studentRole, parentRole] =
      await Promise.all([
        findSystemRole('school_admin'),
        findSystemRole('teacher'),
        findSystemRole('student'),
        findSystemRole('parent'),
      ]);

    organizationAId = await createOrganization('a');
    organizationBId = await createOrganization('b');
    schoolAId = await createSchool(organizationAId, 'a');
    schoolBId = await createSchool(organizationBId, 'b');

    await prisma.schoolProfile.createMany({
      data: [
        {
          schoolId: schoolAId,
          schoolName: `Sprint 12F School A ${suffix}`,
        },
        {
          schoolId: schoolBId,
          schoolName: `Sprint 12F School B ${suffix}`,
        },
      ],
    });

    adminEmail = `${marker}-admin@example.test`;
    teacherEmail = `${marker}-teacher@example.test`;
    teacherBEmail = `${marker}-teacher-b@example.test`;
    studentEmail = `${marker}-student@example.test`;
    parentEmail = `${marker}-parent@example.test`;

    adminUserId = await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint12F',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherUserId = await createUserWithMembership({
      email: teacherEmail,
      firstName: 'Timetable',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherBUserId = await createUserWithMembership({
      email: teacherBEmail,
      firstName: 'Second',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherCrossUserId = await createUserWithMembership({
      email: `${marker}-teacher-cross@example.test`,
      firstName: 'Cross',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    studentUserId = await createUserWithMembership({
      email: studentEmail,
      firstName: 'Linked',
      lastName: 'StudentUser',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    parentUserId = await createUserWithMembership({
      email: parentEmail,
      firstName: 'Linked',
      lastName: 'Parent',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    academicA = await createAcademicBase({
      schoolId: schoolAId,
      marker: 'a',
    });
    academicB = await createAcademicBase({
      schoolId: schoolBId,
      marker: 'b',
    });

    roomAId = await createRoom(schoolAId, 'a');
    ownedPlacement = await createClassroomPlacement({
      schoolId: schoolAId,
      academic: academicA,
      marker: 'owned',
      teacherUserId,
    });
    secondPlacement = await createClassroomPlacement({
      schoolId: schoolAId,
      academic: academicA,
      marker: 'second-child',
      teacherUserId: teacherBUserId,
    });
    unlinkedPlacement = await createClassroomPlacement({
      schoolId: schoolAId,
      academic: academicA,
      marker: 'unlinked',
      teacherUserId: teacherBUserId,
    });
    crossPlacement = await createClassroomPlacement({
      schoolId: schoolBId,
      academic: academicB,
      marker: 'cross',
      teacherUserId: teacherCrossUserId,
    });

    const ownedStudent = await createStudentWithEnrollment({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academic: academicA,
      classroomId: ownedPlacement.classroomId,
      marker: 'owned-child',
      firstName: 'Sara',
      lastName: 'Child',
      userId: studentUserId,
    });
    ownedStudentId = ownedStudent.studentId;
    ownedEnrollmentId = ownedStudent.enrollmentId;

    secondChildStudentId = (
      await createStudentWithEnrollment({
        schoolId: schoolAId,
        organizationId: organizationAId,
        academic: academicA,
        classroomId: secondPlacement.classroomId,
        marker: 'second-child',
        firstName: 'Omar',
        lastName: 'Child',
      })
    ).studentId;

    sameSchoolUnlinkedStudentId = (
      await createStudentWithEnrollment({
        schoolId: schoolAId,
        organizationId: organizationAId,
        academic: academicA,
        classroomId: unlinkedPlacement.classroomId,
        marker: 'unlinked-child',
        firstName: 'Hidden',
        lastName: 'Child',
      })
    ).studentId;

    crossSchoolStudentId = (
      await createStudentWithEnrollment({
        schoolId: schoolBId,
        organizationId: organizationBId,
        academic: academicB,
        classroomId: crossPlacement.classroomId,
        marker: 'cross-child',
        firstName: 'Cross',
        lastName: 'Child',
      })
    ).studentId;

    guardianAId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: parentUserId,
      marker: 'a',
    });
    guardianBId = await createGuardian({
      schoolId: schoolBId,
      organizationId: organizationBId,
      userId: parentUserId,
      marker: 'b',
    });
    await linkGuardian(guardianAId, ownedStudentId, schoolAId);
    await linkGuardian(guardianAId, secondChildStudentId, schoolAId);
    await linkGuardian(guardianBId, crossSchoolStudentId, schoolBId);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ParentScheduleClock)
      .useValue({
        currentDate: () => parseParentScheduleDate(TODAY),
      })
      .compile();

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
    teacherAuth = await login(teacherEmail);
    studentAuth = await login(studentEmail);
    parentAuth = await login(parentEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupCloseoutData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers the completed timetable and app schedule read routes while deferred routes remain absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/timetable/config',
        'PUT /api/v1/academics/timetable/config',
        'GET /api/v1/academics/timetable/periods',
        'POST /api/v1/academics/timetable/periods',
        'PATCH /api/v1/academics/timetable/periods/:periodId',
        'DELETE /api/v1/academics/timetable/periods/:periodId',
        'GET /api/v1/academics/timetable/preview',
        'GET /api/v1/academics/timetable/conflicts',
        'GET /api/v1/academics/timetable/entries',
        'GET /api/v1/academics/timetable/entries/:entryId',
        'POST /api/v1/academics/timetable/entries',
        'PATCH /api/v1/academics/timetable/entries/:entryId',
        'DELETE /api/v1/academics/timetable/entries/:entryId',
        'GET /api/v1/academics/timetable/publication',
        'POST /api/v1/academics/timetable/publish',
        'GET /api/v1/teacher/schedule',
        'GET /api/v1/teacher/schedule/week',
        'GET /api/v1/student/schedule',
        'GET /api/v1/student/schedule/week',
        'GET /api/v1/parent/children/:studentId/schedule/today',
        'GET /api/v1/parent/children/:studentId/schedule/weekly',
      ]),
    );

    for (const absentRoute of [
      'GET /api/v1/schedule-occurrences',
      'GET /api/v1/academics/schedule-occurrences',
      'POST /api/v1/teacher/schedule',
      'PATCH /api/v1/teacher/schedule/:scheduleId',
      'DELETE /api/v1/teacher/schedule/:scheduleId',
      'POST /api/v1/student/schedule',
      'PATCH /api/v1/student/schedule/:scheduleId',
      'DELETE /api/v1/student/schedule/:scheduleId',
      'GET /api/v1/parent/schedule',
      'GET /api/v1/parent/children/:studentId/schedule',
      'POST /api/v1/parent/children/:studentId/schedule',
      'PATCH /api/v1/parent/children/:studentId/schedule/:scheduleId',
      'DELETE /api/v1/parent/children/:studentId/schedule/:scheduleId',
      'GET /api/v1/parent/homeworks',
      'GET /api/v1/student/pickup',
      'GET /api/v1/parent/pickup',
      'GET /api/v1/parent/smart-pickup',
      'GET /api/v1/teacher/notifications',
      'GET /api/v1/student/notifications',
      'GET /api/v1/parent/notifications',
      'POST /api/v1/parent/children/add',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('exercises the dashboard timetable lifecycle and locks published state', async () => {
    sideEffectsBeforeScheduleFlow = await countSideEffects();

    const configResponse = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/config`)
      .set('Authorization', bearer(adminAuth))
      .send({
        academicYearId: academicA.academicYearId,
        termId: academicA.termId,
        scopeType: TimetableScopeType.CLASSROOM,
        classroomId: ownedPlacement.classroomId,
        name: `${marker} Published Classroom Timetable`,
        weekStartDay: 1,
        activeDays: [1, 2, 3, 4, 5],
      })
      .expect(200);

    timetableConfigId = configResponse.body.data.id;
    expect(configResponse.body.data).toMatchObject({
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      classroomId: ownedPlacement.classroomId,
      weekStartDay: 1,
      activeDays: [1, 2, 3, 4, 5],
      status: 'draft',
    });
    expectNoTenantIds(configResponse.body);

    const periodResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/periods`)
      .set('Authorization', bearer(adminAuth))
      .send({
        timetableConfigId,
        index: 1,
        label: 'Period 1',
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      })
      .expect(201);

    timetablePeriodId = periodResponse.body.id;
    expect(periodResponse.body).toMatchObject({
      timetableConfigId,
      index: 1,
      timeRange: '08:00 - 08:45',
      isInstructional: true,
    });
    expectNoTenantIds(periodResponse.body);

    const entryResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/entries`)
      .set('Authorization', bearer(adminAuth))
      .send({
        timetableConfigId,
        periodId: timetablePeriodId,
        dayOfWeek: 1,
        classroomId: ownedPlacement.classroomId,
        teacherSubjectAllocationId: ownedPlacement.allocationId,
        roomId: roomAId,
        notes: `${marker} visible published entry`,
      })
      .expect(201);

    ownedScheduleEntryId = entryResponse.body.id;
    expect(entryResponse.body).toMatchObject({
      id: ownedScheduleEntryId,
      dayOfWeek: 1,
      status: 'draft',
      teacherSubjectAllocationId: ownedPlacement.allocationId,
      period: { id: timetablePeriodId, index: 1 },
      classroom: { id: ownedPlacement.classroomId },
      subject: { id: ownedPlacement.subjectId },
      teacher: { userId: teacherUserId },
      room: { id: roomAId },
    });
    expectNoTenantIds(entryResponse.body);

    const previewResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/preview`)
      .query({ timetableConfigId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(previewResponse.body.publishReadiness).toMatchObject({
      canPublish: true,
      blockingReasons: [],
    });
    expect(previewResponse.body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ownedScheduleEntryId, dayOfWeek: 1 }),
      ]),
    );
    expectNoTenantIds(previewResponse.body);

    const conflictsResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/conflicts`)
      .query({ timetableConfigId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(conflictsResponse.body.items).toEqual([]);
    expectNoTenantIds(conflictsResponse.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/publication`)
      .query({ timetableConfigId })
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          timetableConfigId,
          status: 'draft',
          revision: 0,
          canPublish: true,
        });
        expectNoTenantIds(response.body);
      });

    const publishResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/publish`)
      .set('Authorization', bearer(adminAuth))
      .send({ timetableConfigId })
      .expect(200);

    expect(publishResponse.body).toMatchObject({
      timetableConfigId,
      status: 'published',
      revision: 1,
      publishedByUserId: adminUserId,
      summary: {
        periodsCount: 1,
        instructionalPeriodsCount: 1,
        entriesCount: 1,
        conflictsCount: 0,
      },
    });
    expectNoTenantIds(publishResponse.body);

    const [config, entry, publication, afterPublishSideEffects] =
      await Promise.all([
        prisma.timetableConfig.findUnique({
          where: { id: timetableConfigId },
          select: { status: true },
        }),
        prisma.timetableEntry.findUnique({
          where: { id: ownedScheduleEntryId },
          select: { status: true },
        }),
        prisma.timetablePublication.findFirst({
          where: { timetableConfigId },
          select: { status: true, revision: true, publishedByUserId: true },
        }),
        countSideEffects(),
      ]);

    expect(config?.status).toBe(TimetableConfigStatus.ACTIVE);
    expect(entry?.status).toBe(TimetableEntryStatus.ACTIVE);
    expect(publication).toMatchObject({
      status: TimetablePublicationStatus.PUBLISHED,
      revision: 1,
      publishedByUserId: adminUserId,
    });
    expect(afterPublishSideEffects).toEqual(sideEffectsBeforeScheduleFlow);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/publication`)
      .query({ timetableConfigId })
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('published');
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/config`)
      .set('Authorization', bearer(adminAuth))
      .send({
        academicYearId: academicA.academicYearId,
        termId: academicA.termId,
        scopeType: TimetableScopeType.CLASSROOM,
        classroomId: ownedPlacement.classroomId,
        name: `${marker} should stay locked`,
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.published_locked',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/periods`)
      .set('Authorization', bearer(adminAuth))
      .send({
        timetableConfigId,
        index: 2,
        label: 'Locked Period',
        startTime: '09:00',
        endTime: '09:45',
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.published_locked',
        );
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/academics/timetable/entries/${ownedScheduleEntryId}`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({ notes: `${marker} should not update active entry` })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.published_locked',
        );
        expectNoTenantIds(response.body);
      });

    await createCloseoutHiddenTimetableRows();
  });

  it('teacher schedule reads published own entries only with computed V1 schedule ids', async () => {
    ensurePublishedFixture();

    const daily = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/schedule`)
      .query({ date: TODAY })
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(daily.body).toMatchObject({
      date: TODAY,
      dayOfWeek: 1,
      items: [
        expect.objectContaining({
          scheduleId: `timetable-entry:${ownedScheduleEntryId}:${TODAY}`,
          timetableEntryId: ownedScheduleEntryId,
          teacherSubjectAllocationId: ownedPlacement.allocationId,
          classId: ownedPlacement.allocationId,
          status: 'scheduled',
          needsAttendance: true,
          isPrepared: null,
          hasHomework: null,
        }),
      ],
    });
    expect(
      daily.body.items.map(
        (item: { timetableEntryId: string }) => item.timetableEntryId,
      ),
    ).toEqual([ownedScheduleEntryId]);
    expectSafeTeacherSchedulePayload(daily.body);
    expectNoHiddenScheduleEntries(daily.body);

    const weekly = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/schedule/week`)
      .query({ date: WEEK_QUERY_DATE })
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(weekly.body.weekStartDate).toBe('2026-09-14');
    expect(weekly.body.weekEndDate).toBe('2026-09-20');
    expect(weekly.body.days).toHaveLength(7);
    expect(
      dayItems(weekly.body, TODAY).map((item) => item.timetableEntryId),
    ).toEqual([ownedScheduleEntryId]);
    expect(dayItems(weekly.body, '2026-09-18')).toEqual([]);
    expectSafeTeacherSchedulePayload(weekly.body);
    expectNoHiddenScheduleEntries(weekly.body);
  });

  it('student schedule reads the active-enrollment classroom only and keeps deferred markers stable', async () => {
    ensurePublishedFixture();

    const daily = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule`)
      .query({ date: TODAY })
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(daily.body).toMatchObject({
      date: TODAY,
      dayOfWeek: 1,
      items: [
        expect.objectContaining({
          scheduleId: `timetable-entry:${ownedScheduleEntryId}:${TODAY}`,
          timetableEntryId: ownedScheduleEntryId,
          status: 'scheduled',
          needsAttendance: true,
          hasHomework: null,
          isExam: null,
          isBreak: false,
        }),
      ],
    });
    expect(
      daily.body.items.map(
        (item: { timetableEntryId: string }) => item.timetableEntryId,
      ),
    ).toEqual([ownedScheduleEntryId]);
    expectSafeStudentSchedulePayload(daily.body);
    expectNoHiddenScheduleEntries(daily.body);

    const weekly = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule/week`)
      .query({ date: WEEK_QUERY_DATE })
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(weekly.body.weekStartDate).toBe('2026-09-14');
    expect(weekly.body.weekEndDate).toBe('2026-09-20');
    expect(weekly.body.days).toHaveLength(7);
    expect(
      dayItems(weekly.body, TODAY).map((item) => item.timetableEntryId),
    ).toEqual([ownedScheduleEntryId]);
    expect(dayItems(weekly.body, '2026-09-18')).toEqual([]);
    expectSafeStudentSchedulePayload(weekly.body);
    expectNoHiddenScheduleEntries(weekly.body);

    const outsideTerm = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule`)
      .query({ date: OUTSIDE_TERM_DATE })
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(outsideTerm.body).toEqual({
      date: OUTSIDE_TERM_DATE,
      dayOfWeek: 1,
      items: [],
    });
    expect('scheduleOccurrence' in prisma).toBe(false);
  });

  it('parent child schedule reads enforce ownership, current school, and requested child boundaries', async () => {
    ensurePublishedFixture();

    const today = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentId}/schedule/today`)
      .set('Authorization', bearer(parentAuth))
      .expect(200);

    expect(today.body).toMatchObject({
      date: TODAY,
      dayOfWeek: 1,
      child: {
        id: ownedStudentId,
        displayName: 'Sara Child',
      },
      items: [
        expect.objectContaining({
          scheduleId: `timetable-entry:${ownedScheduleEntryId}:${TODAY}`,
          timetableEntryId: ownedScheduleEntryId,
          status: 'scheduled',
          needsAttendance: true,
          hasHomework: null,
          isExam: null,
          isBreak: false,
        }),
      ],
    });
    expect(
      today.body.items.map(
        (item: { timetableEntryId: string }) => item.timetableEntryId,
      ),
    ).toEqual([ownedScheduleEntryId]);
    expectSafeParentSchedulePayload(today.body);
    expectNoHiddenScheduleEntries(today.body);

    const weekly = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentId}/schedule/weekly`)
      .set('Authorization', bearer(parentAuth))
      .expect(200);

    expect(weekly.body.weekStartDate).toBe('2026-09-14');
    expect(weekly.body.weekEndDate).toBe('2026-09-20');
    expect(weekly.body.child).toEqual({
      id: ownedStudentId,
      displayName: 'Sara Child',
    });
    expect(weekly.body.days).toHaveLength(7);
    expect(
      dayItems(weekly.body, TODAY).map((item) => item.timetableEntryId),
    ).toEqual([ownedScheduleEntryId]);
    expect(dayItems(weekly.body, '2026-09-18')).toEqual([]);
    expectSafeParentSchedulePayload(weekly.body);
    expectNoHiddenScheduleEntries(weekly.body);

    const secondChild = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${secondChildStudentId}/schedule/today`,
      )
      .set('Authorization', bearer(parentAuth))
      .expect(200);
    expect(
      secondChild.body.items.map(
        (item: { timetableEntryId: string }) => item.timetableEntryId,
      ),
    ).toEqual([secondChildScheduleEntryId]);
    expect(JSON.stringify(secondChild.body)).not.toContain(
      ownedScheduleEntryId,
    );
    expectSafeParentSchedulePayload(secondChild.body);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${sameSchoolUnlinkedStudentId}/schedule/today`,
      )
      .set('Authorization', bearer(parentAuth))
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${crossSchoolStudentId}/schedule/weekly`,
      )
      .set('Authorization', bearer(parentAuth))
      .expect(404);

    for (const auth of [adminAuth, teacherAuth, studentAuth]) {
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/children/${ownedStudentId}/schedule/today`,
        )
        .set('Authorization', bearer(auth))
        .expect(403);
    }

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/schedule`)
      .query({ date: TODAY })
      .set('Authorization', bearer(parentAuth))
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule`)
      .query({ date: TODAY })
      .set('Authorization', bearer(parentAuth))
      .expect(403);
  });

  it('keeps deferred app routes and side-effect surfaces closed', async () => {
    ensurePublishedFixture();

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/teacher/schedule`)
      .set('Authorization', bearer(teacherAuth))
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/schedule`)
      .set('Authorization', bearer(studentAuth))
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/children/${ownedStudentId}/schedule/today`)
      .set('Authorization', bearer(parentAuth))
      .send({})
      .expect(404);

    for (const route of [
      `${GLOBAL_PREFIX}/parent/homeworks`,
      `${GLOBAL_PREFIX}/student/pickup`,
      `${GLOBAL_PREFIX}/parent/pickup`,
      `${GLOBAL_PREFIX}/parent/smart-pickup`,
      `${GLOBAL_PREFIX}/teacher/notifications`,
      `${GLOBAL_PREFIX}/student/notifications`,
      `${GLOBAL_PREFIX}/parent/notifications`,
      `${GLOBAL_PREFIX}/parent/schedule`,
    ]) {
      await request(app.getHttpServer())
        .get(route)
        .set('Authorization', bearer(parentAuth))
        .expect(404);
    }

    expect(sideEffectsBeforeScheduleFlow).not.toBeNull();
    expect(await countSideEffects()).toEqual(sideEffectsBeforeScheduleFlow);
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
  }

  async function createOrganization(label: string): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org-${label}`,
        name: `Sprint 12F Org ${label.toUpperCase()} ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization.id;
  }

  async function createSchool(
    organizationId: string,
    label: string,
  ): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: `${marker}-school-${label}`,
        name: `Sprint 12F School ${label.toUpperCase()} ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    firstName: string;
    lastName: string;
    userType: UserType;
    roleId: string;
    organizationId: string;
    schoolId: string;
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
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function createAcademicBase(params: {
    schoolId: string;
    marker: string;
  }): Promise<AcademicBase> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-year-ar`,
        nameEn: `${marker}-${params.marker}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${params.marker}-term-ar`,
        nameEn: `${marker}-${params.marker}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-17T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-stage-ar`,
        nameEn: `${marker}-${params.marker}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${marker}-${params.marker}-grade-ar`,
        nameEn: `${marker}-${params.marker}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${marker}-${params.marker}-section-ar`,
        nameEn: `${marker}-${params.marker}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
    };
  }

  async function createRoom(schoolId: string, label: string): Promise<string> {
    const room = await prisma.room.create({
      data: {
        schoolId,
        nameAr: `${marker}-${label}-room-ar`,
        nameEn: `${marker}-${label}-room`,
        isActive: true,
      },
      select: { id: true },
    });
    return room.id;
  }

  async function createClassroomPlacement(params: {
    schoolId: string;
    academic: AcademicBase;
    marker: string;
    teacherUserId: string;
  }): Promise<ClassroomPlacement> {
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: params.academic.sectionId,
        nameAr: `${marker}-${params.marker}-classroom-ar`,
        nameEn: `${marker}-${params.marker}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-subject-ar`,
        nameEn: `${marker}-${params.marker}-subject`,
        code: `${params.marker.toUpperCase()}-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: params.academic.termId,
      },
      select: { id: true },
    });

    return {
      classroomId: classroom.id,
      subjectId: subject.id,
      allocationId: allocation.id,
    };
  }

  async function createStudentWithEnrollment(params: {
    schoolId: string;
    organizationId: string;
    academic: AcademicBase;
    classroomId: string;
    marker: string;
    firstName: string;
    lastName: string;
    userId?: string;
  }): Promise<{ studentId: string; enrollmentId: string }> {
    const student = await prisma.student.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: params.userId,
        firstName: params.firstName,
        lastName: params.lastName,
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: params.schoolId,
        studentId: student.id,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        classroomId: params.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return {
      studentId: student.id,
      enrollmentId: enrollment.id,
    };
  }

  async function createGuardian(params: {
    schoolId: string;
    organizationId: string;
    userId: string;
    marker: string;
  }): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: params.userId,
        firstName: 'Linked',
        lastName: `Guardian ${params.marker}`,
        phone: `${marker}-${params.marker}-guardian-phone`,
        email: `${marker}-${params.marker}-guardian@example.test`,
        relation: 'mother',
        isPrimary: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function linkGuardian(
    guardianId: string,
    studentId: string,
    schoolId: string,
  ): Promise<void> {
    await prisma.studentGuardian.create({
      data: {
        schoolId,
        guardianId,
        studentId,
        isPrimary: true,
      },
    });
  }

  async function createCloseoutHiddenTimetableRows(): Promise<void> {
    draftConfigEntryId = await createConfigPeriodAndEntry({
      schoolId: schoolAId,
      academic: academicA,
      placement: ownedPlacement,
      teacherUserId,
      marker: 'draft-config-hidden',
      dayOfWeek: 1,
      scopeType: TimetableScopeType.SECTION,
      scopeKey: `section:${academicA.sectionId}`,
      sectionId: academicA.sectionId,
      gradeId: academicA.gradeId,
      configStatus: TimetableConfigStatus.DRAFT,
      entryStatus: TimetableEntryStatus.ACTIVE,
      publish: false,
    });
    unpublishedEntryId = await createConfigPeriodAndEntry({
      schoolId: schoolAId,
      academic: academicA,
      placement: ownedPlacement,
      teacherUserId,
      marker: 'unpublished-hidden',
      dayOfWeek: 1,
      scopeType: TimetableScopeType.GRADE,
      scopeKey: `grade:${academicA.gradeId}`,
      gradeId: academicA.gradeId,
      configStatus: TimetableConfigStatus.ACTIVE,
      entryStatus: TimetableEntryStatus.ACTIVE,
      publish: false,
    });
    draftEntryId = await createEntryInExistingConfig({
      dayOfWeek: 1,
      status: TimetableEntryStatus.DRAFT,
      marker: 'draft-entry-hidden',
    });
    cancelledEntryId = await createEntryInExistingConfig({
      dayOfWeek: 1,
      status: TimetableEntryStatus.CANCELLED,
      marker: 'cancelled-entry-hidden',
    });
    termBoundarySuppressedEntryId = await createEntryInExistingConfig({
      dayOfWeek: 5,
      status: TimetableEntryStatus.ACTIVE,
      marker: 'outside-term-weekly-hidden',
    });
    secondChildScheduleEntryId = await createConfigPeriodAndEntry({
      schoolId: schoolAId,
      academic: academicA,
      placement: secondPlacement,
      teacherUserId: teacherBUserId,
      marker: 'second-child',
      dayOfWeek: 1,
      scopeType: TimetableScopeType.CLASSROOM,
      scopeKey: `classroom:${secondPlacement.classroomId}`,
      classroomId: secondPlacement.classroomId,
      sectionId: academicA.sectionId,
      gradeId: academicA.gradeId,
      configStatus: TimetableConfigStatus.ACTIVE,
      entryStatus: TimetableEntryStatus.ACTIVE,
      publish: true,
    });
    crossSchoolScheduleEntryId = await createConfigPeriodAndEntry({
      schoolId: schoolBId,
      academic: academicB,
      placement: crossPlacement,
      teacherUserId: teacherCrossUserId,
      marker: 'cross-school',
      dayOfWeek: 1,
      scopeType: TimetableScopeType.CLASSROOM,
      scopeKey: `classroom:${crossPlacement.classroomId}`,
      classroomId: crossPlacement.classroomId,
      sectionId: academicB.sectionId,
      gradeId: academicB.gradeId,
      configStatus: TimetableConfigStatus.ACTIVE,
      entryStatus: TimetableEntryStatus.ACTIVE,
      publish: true,
    });
  }

  async function createEntryInExistingConfig(params: {
    dayOfWeek: number;
    status: TimetableEntryStatus;
    marker: string;
  }): Promise<string> {
    const entry = await prisma.timetableEntry.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicA.academicYearId,
        termId: academicA.termId,
        timetableConfigId,
        periodId: timetablePeriodId,
        dayOfWeek: params.dayOfWeek,
        gradeId: academicA.gradeId,
        sectionId: academicA.sectionId,
        classroomId: ownedPlacement.classroomId,
        subjectId: ownedPlacement.subjectId,
        teacherUserId,
        teacherSubjectAllocationId: ownedPlacement.allocationId,
        roomId: roomAId,
        notes: `${marker}-${params.marker}`,
        status: params.status,
      },
      select: { id: true },
    });
    return entry.id;
  }

  async function createConfigPeriodAndEntry(params: {
    schoolId: string;
    academic: AcademicBase;
    placement: ClassroomPlacement;
    teacherUserId: string;
    marker: string;
    dayOfWeek: number;
    scopeType: TimetableScopeType;
    scopeKey: string;
    gradeId?: string;
    sectionId?: string;
    classroomId?: string;
    configStatus: TimetableConfigStatus;
    entryStatus: TimetableEntryStatus;
    publish: boolean;
  }): Promise<string> {
    const config = await prisma.timetableConfig.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        name: `${marker}-${params.marker}-config`,
        weekStartDay: 1,
        activeDays: [1, 2, 3, 4, 5],
        scopeType: params.scopeType,
        scopeKey: params.scopeKey,
        gradeId: params.gradeId ?? null,
        sectionId: params.sectionId ?? null,
        classroomId: params.classroomId ?? null,
        status: params.configStatus,
      },
      select: { id: true },
    });
    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId: params.schoolId,
        timetableConfigId: config.id,
        periodIndex: 1,
        label: `${marker}-${params.marker}-period`,
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    if (params.publish) {
      await prisma.timetablePublication.create({
        data: {
          schoolId: params.schoolId,
          academicYearId: params.academic.academicYearId,
          termId: params.academic.termId,
          timetableConfigId: config.id,
          status: TimetablePublicationStatus.PUBLISHED,
          publishedAt: new Date('2026-09-10T08:00:00.000Z'),
          publishedByUserId: params.teacherUserId,
          revision: 1,
        },
      });
    }
    const entry = await prisma.timetableEntry.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        timetableConfigId: config.id,
        periodId: period.id,
        dayOfWeek: params.dayOfWeek,
        gradeId: params.academic.gradeId,
        sectionId: params.academic.sectionId,
        classroomId: params.placement.classroomId,
        subjectId: params.placement.subjectId,
        teacherUserId: params.teacherUserId,
        teacherSubjectAllocationId: params.placement.allocationId,
        notes: `${marker}-${params.marker}-entry`,
        status: params.entryStatus,
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

  async function countSideEffects(): Promise<SideEffectCounts> {
    const [
      attendanceSessions,
      communicationNotifications,
      xpLedgerEntries,
      rewardRedemptions,
    ] = await Promise.all([
      prisma.attendanceSession.count({ where: { schoolId: schoolAId } }),
      prisma.communicationNotification.count({
        where: { schoolId: schoolAId },
      }),
      prisma.xpLedger.count({ where: { schoolId: schoolAId } }),
      prisma.rewardRedemption.count({ where: { schoolId: schoolAId } }),
    ]);

    return {
      attendanceSessions,
      communicationNotifications,
      xpLedgerEntries,
      rewardRedemptions,
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

  function ensurePublishedFixture(): void {
    if (!ownedScheduleEntryId || !secondChildScheduleEntryId) {
      throw new Error('Sprint 12F timetable fixture was not published.');
    }
  }

  function dayItems(
    weeklyBody: { days: Array<{ date: string; items: ScheduleItem[] }> },
    date: string,
  ): ScheduleItem[] {
    return weeklyBody.days.find((day) => day.date === date)?.items ?? [];
  }

  type ScheduleItem = {
    timetableEntryId: string;
  };

  function expectNoTenantIds(value: unknown): void {
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
  }

  function expectSafeTeacherSchedulePayload(value: unknown): void {
    expectNoTenantIds(value);
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain('academicYearId');
    expect(serialized).not.toContain('termId');
  }

  function expectSafeStudentSchedulePayload(value: unknown): void {
    expectNoTenantIds(value);
    const serialized = JSON.stringify(value);
    for (const forbidden of [
      'academicYearId',
      'termId',
      'teacherSubjectAllocationId',
      'password',
      'passwordHash',
      'session',
      'refreshToken',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function expectSafeParentSchedulePayload(value: unknown): void {
    expectSafeStudentSchedulePayload(value);
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain('guardianId');
    expect(serialized).not.toContain(crossSchoolScheduleEntryId);
  }

  function expectNoHiddenScheduleEntries(value: unknown): void {
    const serialized = JSON.stringify(value);
    for (const hiddenEntryId of [
      draftConfigEntryId,
      draftEntryId,
      cancelledEntryId,
      unpublishedEntryId,
      termBoundarySuppressedEntryId,
      secondChildScheduleEntryId,
      crossSchoolScheduleEntryId,
    ]) {
      if (hiddenEntryId) {
        expect(serialized).not.toContain(hiddenEntryId);
      }
    }
    expect(serialized).not.toContain('hidden');
  }

  async function cleanupCloseoutData(): Promise<void> {
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
    await prisma.attendanceEntry.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.studentGuardian.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.enrollment.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.guardian.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.student.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subject.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.room.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.classroom.deleteMany({
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
    await prisma.schoolProfile.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
