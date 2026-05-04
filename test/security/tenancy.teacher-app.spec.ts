import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'TeacherApp123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(45000);

describe('Teacher App tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let teacherAEmail: string;
  let teacherBEmail: string;
  let teacherCrossSchoolEmail: string;
  let adminEmail: string;
  let parentEmail: string;
  let studentEmail: string;
  let teacherAId: string;
  let teacherBId: string;
  let teacherCrossSchoolId: string;
  let ownAllocationId: string;
  let otherTeacherAllocationId: string;
  let crossSchoolAllocationId: string;
  let ownStudentIds: string[] = [];
  let otherTeacherStudentIds: string[] = [];

  const testSuffix = `teacher-app-security-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdStudentGuardianIds: string[] = [];
  const createdMedicalProfileStudentIds: string[] = [];
  const createdEnrollmentIds: string[] = [];
  const createdAllocationIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdClassroomIds: string[] = [];
  const createdSectionIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdYearIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [teacherRole, schoolAdminRole, parentRole, studentRole] =
      await Promise.all([
        findSystemRole('teacher'),
        findSystemRole('school_admin'),
        findSystemRole('parent'),
        findSystemRole('student'),
      ]);

    const orgA = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org-a`,
        name: `${testSuffix} Org A`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org-b`,
        name: `${testSuffix} Org B`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationBId = orgB.id;

    const schoolA = await prisma.school.create({
      data: {
        organizationId: organizationAId,
        slug: `${testSuffix}-school-a`,
        name: `${testSuffix} School A`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolAId = schoolA.id;

    const schoolB = await prisma.school.create({
      data: {
        organizationId: organizationBId,
        slug: `${testSuffix}-school-b`,
        name: `${testSuffix} School B`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolBId = schoolB.id;

    await prisma.schoolProfile.create({
      data: {
        schoolId: schoolAId,
        schoolName: `${testSuffix} Academy`,
        logoUrl: 'raw-storage-logo-should-not-be-returned',
      },
    });

    teacherAEmail = `${testSuffix}-teacher-a@security.moazez.local`;
    teacherBEmail = `${testSuffix}-teacher-b@security.moazez.local`;
    teacherCrossSchoolEmail = `${testSuffix}-teacher-cross@security.moazez.local`;
    adminEmail = `${testSuffix}-admin@security.moazez.local`;
    parentEmail = `${testSuffix}-parent@security.moazez.local`;
    studentEmail = `${testSuffix}-student@security.moazez.local`;

    teacherAId = await createUserWithMembership({
      email: teacherAEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherBId = await createUserWithMembership({
      email: teacherBEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherCrossSchoolId = await createUserWithMembership({
      email: teacherCrossSchoolEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    await createUserWithMembership({
      email: adminEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: parentEmail,
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: studentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    const ownFixture = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      teacherUserId: teacherAId,
      marker: 'own',
      studentCount: 2,
    });
    ownAllocationId = ownFixture.allocationId;
    ownStudentIds = ownFixture.studentIds;

    const otherTeacherFixture = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      teacherUserId: teacherBId,
      marker: 'other-teacher',
      studentCount: 1,
    });
    otherTeacherAllocationId = otherTeacherFixture.allocationId;
    otherTeacherStudentIds = otherTeacherFixture.studentIds;

    const crossSchoolFixture = await createAcademicFixture({
      organizationId: organizationBId,
      schoolId: schoolBId,
      teacherUserId: teacherCrossSchoolId,
      marker: 'cross-school',
      studentCount: 1,
    });
    crossSchoolAllocationId = crossSchoolFixture.allocationId;

    await createPrivateStudentData({
      organizationId: organizationAId,
      schoolId: schoolAId,
      studentId: ownStudentIds[0],
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
  });

  afterAll(async () => {
    try {
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.studentGuardian.deleteMany({
        where: { id: { in: createdStudentGuardianIds } },
      });
      await prisma.studentMedicalProfile.deleteMany({
        where: { studentId: { in: createdMedicalProfileStudentIds } },
      });
      await prisma.attendanceEntry.deleteMany({
        where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
      });
      await prisma.attendanceSession.deleteMany({
        where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
      });
      await prisma.guardian.deleteMany({
        where: { id: { in: createdGuardianIds } },
      });
      await prisma.enrollment.deleteMany({
        where: { id: { in: createdEnrollmentIds } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: createdStudentIds } },
      });
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { id: { in: createdAllocationIds } },
      });
      await prisma.subject.deleteMany({
        where: { id: { in: createdSubjectIds } },
      });
      await prisma.classroom.deleteMany({
        where: { id: { in: createdClassroomIds } },
      });
      await prisma.section.deleteMany({
        where: { id: { in: createdSectionIds } },
      });
      await prisma.grade.deleteMany({
        where: { id: { in: createdGradeIds } },
      });
      await prisma.stage.deleteMany({
        where: { id: { in: createdStageIds } },
      });
      await prisma.term.deleteMany({
        where: { id: { in: createdTermIds } },
      });
      await prisma.academicYear.deleteMany({
        where: { id: { in: createdYearIds } },
      });
      await prisma.schoolProfile.deleteMany({
        where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.school.deleteMany({
        where: { id: { in: [schoolAId, schoolBId].filter(Boolean) } },
      });
      await prisma.organization.deleteMany({
        where: {
          id: { in: [organizationAId, organizationBId].filter(Boolean) },
        },
      });
    } finally {
      if (app) await app.close();
      if (prisma) await prisma.$disconnect();
    }
  });

  it('teacher can access own Teacher Home without schoolId or raw logo exposure', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/home`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(response.body.teacher).toMatchObject({
      id: teacherAId,
      userType: 'teacher',
    });
    expect(response.body.summary.classesCount).toBe(1);
    expect(response.body.summary.studentsCount).toBe(2);
    expect(response.body.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
      items: [],
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('raw-storage-logo-should-not-be-returned');
  });

  it('teacher can list only own allocation-backed classes', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/my-classes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(json).toContain(ownAllocationId);
    expect(json).not.toContain(otherTeacherAllocationId);
    expect(json).not.toContain(crossSchoolAllocationId);
    expect(response.body.classes[0]).toMatchObject({
      id: ownAllocationId,
      classId: ownAllocationId,
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('teacher can access own class detail', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/my-classes/${ownAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(response.body.class).toMatchObject({
      id: ownAllocationId,
      classId: ownAllocationId,
      studentsCount: 2,
    });
    expect(response.body.rosterPreview).toEqual([]);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('guardian');
    expect(json).not.toContain('medical');
    expect(json).not.toContain('scheduleId');
  });

  it('teacher can access owned classroom detail without schoolId or scheduleId', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(response.body).toMatchObject({
      classId: ownAllocationId,
      classroom: {
        code: null,
      },
      summary: {
        studentsCount: 2,
        presentTodayCount: null,
        absentTodayCount: null,
        pendingAssignmentsCount: null,
        averageGrade: null,
        behaviorAlertsCount: null,
      },
      schedule: {
        available: false,
        reason: 'timetable_not_available',
      },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('teacher can access owned classroom roster only', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/roster`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(response.body.classId).toBe(ownAllocationId);
    expect(response.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 2,
    });
    expect(response.body.students.map((student: { id: string }) => student.id))
      .toEqual(ownStudentIds);
    expect(json).not.toContain(otherTeacherAllocationId);
    expect(json).not.toContain(crossSchoolAllocationId);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('classroom roster does not expose guardian, medical, document, or private data', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/roster`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(json).not.toContain('guardian');
    expect(json).not.toContain('medical');
    expect(json).not.toContain('document');
    expect(json).not.toContain('private-phone-sentinel');
    expect(json).not.toContain('private-guardian-sentinel');
    expect(json).not.toContain('private-allergy-sentinel');
    expect(json).not.toContain('private-condition-sentinel');
  });

  it('teacher can get attendance roster for owned class without creating a session', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/roster`,
      )
      .query({ date: '2026-09-10' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(response.body).toMatchObject({
      classId: ownAllocationId,
      date: '2026-09-10',
      session: null,
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
      },
    });
    expect(response.body.students.map((student: { id: string }) => student.id))
      .toEqual(ownStudentIds);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('period');
    expect(json).not.toContain('timetable');
  });

  it('teacher can resolve, update, and submit owned classroom attendance', async () => {
    const { accessToken } = await login(teacherAEmail);

    const resolved = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/session/resolve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ date: '2026-09-10' })
      .expect(201);
    const sessionId = resolved.body.session.id;

    expect(resolved.body).toMatchObject({
      classId: ownAllocationId,
      date: '2026-09-10',
      session: {
        id: sessionId,
        status: 'draft',
        submittedAt: null,
      },
      entries: [],
    });
    expect(JSON.stringify(resolved.body)).not.toContain('schoolId');
    expect(JSON.stringify(resolved.body)).not.toContain('scheduleId');

    const updated = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${sessionId}/entries`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        entries: [
          { studentId: ownStudentIds[0], status: 'present', note: 'Arrived' },
          { studentId: ownStudentIds[1], status: 'absent' },
        ],
      })
      .expect(200);

    expect(updated.body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: ownStudentIds[0],
          attendanceStatus: 'present',
          note: 'Arrived',
        }),
        expect.objectContaining({
          studentId: ownStudentIds[1],
          attendanceStatus: 'absent',
          note: null,
        }),
      ]),
    );
    expect(JSON.stringify(updated.body)).not.toContain('schoolId');
    expect(JSON.stringify(updated.body)).not.toContain('scheduleId');

    const detail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${sessionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detail.body.entries).toHaveLength(2);

    const submitted = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${sessionId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(submitted.body.session).toMatchObject({
      id: sessionId,
      status: 'submitted',
    });
    expect(submitted.body.session.submittedAt).toEqual(expect.any(String));
    expect(JSON.stringify(submitted.body)).not.toContain('schoolId');
    expect(JSON.stringify(submitted.body)).not.toContain('scheduleId');
  });

  it('teacher cannot update attendance for students outside the owned classroom', async () => {
    const { accessToken } = await login(teacherAEmail);

    const resolved = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/session/resolve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ date: '2026-09-11' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${resolved.body.session.id}/entries`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        entries: [
          { studentId: otherTeacherStudentIds[0], status: 'present' },
        ],
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('teacher cannot access another teacher class in the same school', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/my-classes/${otherTeacherAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );

    const classroomDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${otherTeacherAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    const classroomRosterResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${otherTeacherAllocationId}/roster`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(classroomDetailResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );
    expect(classroomRosterResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );

    const attendanceRosterResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${otherTeacherAllocationId}/attendance/roster`,
      )
      .query({ date: '2026-09-10' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    const attendanceResolveResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${otherTeacherAllocationId}/attendance/session/resolve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ date: '2026-09-10' })
      .expect(404);
    expect(attendanceRosterResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );
    expect(attendanceResolveResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );
  });

  it('teacher cannot access a cross-school class id', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/my-classes/${crossSchoolAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );

    const classroomDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${crossSchoolAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    const classroomRosterResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${crossSchoolAllocationId}/roster`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(classroomDetailResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );
    expect(classroomRosterResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );

    const attendanceRosterResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${crossSchoolAllocationId}/attendance/roster`,
      )
      .query({ date: '2026-09-10' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(attendanceRosterResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );
  });

  it('teacher cannot read a cross-school guessed attendance session', async () => {
    const crossSchoolTeacher = await login(teacherCrossSchoolEmail);
    const crossSchoolResolved = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${crossSchoolAllocationId}/attendance/session/resolve`,
      )
      .set('Authorization', `Bearer ${crossSchoolTeacher.accessToken}`)
      .send({ date: '2026-09-10' })
      .expect(201);

    const teacherA = await login(teacherAEmail);
    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${crossSchoolResolved.body.session.id}`,
      )
      .set('Authorization', `Bearer ${teacherA.accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school admin, parent, and student actors are denied Teacher App routes', async () => {
    const teacherA = await login(teacherAEmail);
    const deniedSession = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/session/resolve`,
      )
      .set('Authorization', `Bearer ${teacherA.accessToken}`)
      .send({ date: '2026-09-12' })
      .expect(201);

    for (const email of [adminEmail, parentEmail, studentEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/home`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/my-classes`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/my-classes/${ownAllocationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/roster`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/roster`,
        )
        .query({ date: '2026-09-10' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/session/resolve`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ date: '2026-09-10' })
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${deniedSession.body.session.id}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .put(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${deniedSession.body.session.id}/entries`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          entries: [{ studentId: ownStudentIds[0], status: 'present' }],
        })
        .expect(403);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${deniedSession.body.session.id}/submit`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    }
  });

  it('does not register deferred Teacher App routes', async () => {
    const { accessToken } = await login(teacherAEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/schedule`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classrooms/${ownAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${key} system role not found - run seed.`);
    return role;
  }

  async function createUserWithMembership(params: {
    email: string;
    userType: UserType;
    roleId: string;
    organizationId: string;
    schoolId: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'TeacherApp',
        lastName: params.userType.toLowerCase(),
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

  async function createAcademicFixture(params: {
    organizationId: string;
    schoolId: string;
    teacherUserId: string;
    marker: string;
    studentCount: number;
  }): Promise<{ allocationId: string; studentIds: string[] }> {
    const isAttendanceWritable = params.marker !== 'other-teacher';
    const year = await prisma.academicYear.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${testSuffix}-${params.marker}-year-ar`,
        nameEn: `${testSuffix}-${params.marker}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: isAttendanceWritable,
      },
      select: { id: true },
    });
    createdYearIds.push(year.id);

    const term = await prisma.term.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: year.id,
        nameAr: `${testSuffix}-${params.marker}-term-ar`,
        nameEn: `${testSuffix}-${params.marker}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: isAttendanceWritable,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${testSuffix}-${params.marker}-stage-ar`,
        nameEn: `${testSuffix}-${params.marker}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${testSuffix}-${params.marker}-grade-ar`,
        nameEn: `${testSuffix}-${params.marker}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${testSuffix}-${params.marker}-section-ar`,
        nameEn: `${testSuffix}-${params.marker}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        nameAr: `${testSuffix}-${params.marker}-classroom-ar`,
        nameEn: `${testSuffix}-${params.marker}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${testSuffix}-${params.marker}-subject-ar`,
        nameEn: `${testSuffix}-${params.marker}-subject`,
        code: `${params.marker.toUpperCase()}-SUBJECT`,
        isActive: true,
      },
      select: { id: true },
    });
    createdSubjectIds.push(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: term.id,
      },
      select: { id: true },
    });
    createdAllocationIds.push(allocation.id);

    const studentIds: string[] = [];
    for (let index = 0; index < params.studentCount; index += 1) {
      const student = await prisma.student.create({
        data: {
          schoolId: params.schoolId,
          organizationId: params.organizationId,
          firstName: `${params.marker} Student`,
          lastName: `${index + 1}`,
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      });
      createdStudentIds.push(student.id);
      studentIds.push(student.id);

      const enrollment = await prisma.enrollment.create({
        data: {
          schoolId: params.schoolId,
          studentId: student.id,
          academicYearId: year.id,
          termId: term.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        select: { id: true },
      });
      createdEnrollmentIds.push(enrollment.id);
    }

    return { allocationId: allocation.id, studentIds };
  }

  async function createPrivateStudentData(params: {
    organizationId: string;
    schoolId: string;
    studentId: string;
  }): Promise<void> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        firstName: 'Private',
        lastName: 'Guardian',
        phone: 'private-phone-sentinel',
        email: 'private-guardian-sentinel@security.moazez.local',
        relation: 'guardian',
        isPrimary: true,
      },
      select: { id: true },
    });
    createdGuardianIds.push(guardian.id);

    const link = await prisma.studentGuardian.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        guardianId: guardian.id,
        isPrimary: true,
      },
      select: { id: true },
    });
    createdStudentGuardianIds.push(link.id);

    await prisma.studentMedicalProfile.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        allergies: 'private-allergy-sentinel',
        conditions: ['private-condition-sentinel'],
        medications: ['private-medication-sentinel'],
        emergencyNotes: 'private-emergency-note-sentinel',
      },
    });
    createdMedicalProfileStudentIds.push(params.studentId);
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }
});
