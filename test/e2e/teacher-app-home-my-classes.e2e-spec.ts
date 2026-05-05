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

type AcademicContext = {
  academicYearId: string;
  termId: string;
  termName: string;
};

type AcademicFixture = {
  allocationId: string;
  classroomId: string;
  classroomName: string;
  subjectId: string;
  subjectName: string;
  termId: string;
  termName: string;
  gradeId: string;
  gradeName: string;
  sectionId: string;
  sectionName: string;
  stageId: string;
  stageName: string;
  roomName: string;
  studentsCount: number;
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

jest.setTimeout(60000);

describe('Sprint 7B Teacher Home + My Classes closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId = '';
  let organizationBId = '';
  let schoolAId = '';
  let schoolBId = '';
  let teacherAId = '';
  let teacherAEmail = '';
  let teacherBEmail = '';
  let teacherCrossSchoolEmail = '';
  let adminEmail = '';
  let parentEmail = '';
  let studentEmail = '';
  let ownFixture: AcademicFixture;
  let otherTeacherFixture: AcademicFixture;
  let crossSchoolFixture: AcademicFixture;

  const suffix = randomUUID().split('-')[0];
  const privateMarkers = new Set<string>();
  const cleanupState = {
    organizationIds: new Set<string>(),
    schoolIds: new Set<string>(),
    userIds: new Set<string>(),
    academicYearIds: new Set<string>(),
    termIds: new Set<string>(),
    stageIds: new Set<string>(),
    gradeIds: new Set<string>(),
    sectionIds: new Set<string>(),
    roomIds: new Set<string>(),
    classroomIds: new Set<string>(),
    subjectIds: new Set<string>(),
    allocationIds: new Set<string>(),
    studentIds: new Set<string>(),
    enrollmentIds: new Set<string>(),
    guardianIds: new Set<string>(),
    studentGuardianIds: new Set<string>(),
    medicalProfileIds: new Set<string>(),
  };

  let phoneSequence = 70_000_000;

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
        slug: `s7b-${suffix}-org-a`,
        name: `Sprint 7B Org A ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationAId = orgA.id;
    cleanupState.organizationIds.add(orgA.id);

    const orgB = await prisma.organization.create({
      data: {
        slug: `s7b-${suffix}-org-b`,
        name: `Sprint 7B Org B ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationBId = orgB.id;
    cleanupState.organizationIds.add(orgB.id);

    const schoolA = await prisma.school.create({
      data: {
        organizationId: organizationAId,
        slug: `s7b-${suffix}-school-a`,
        name: `Sprint 7B School A ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolAId = schoolA.id;
    cleanupState.schoolIds.add(schoolA.id);

    const schoolB = await prisma.school.create({
      data: {
        organizationId: organizationBId,
        slug: `s7b-${suffix}-school-b`,
        name: `Sprint 7B School B ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolBId = schoolB.id;
    cleanupState.schoolIds.add(schoolB.id);

    privateMarkers.add(`raw-storage-logo-${suffix}`);
    await prisma.schoolProfile.create({
      data: {
        schoolId: schoolAId,
        schoolName: `Sprint 7B Academy ${suffix}`,
        logoUrl: `raw-storage-logo-${suffix}`,
      },
    });

    teacherAEmail = `s7b-${suffix}-teacher-a@e2e.moazez.local`;
    teacherBEmail = `s7b-${suffix}-teacher-b@e2e.moazez.local`;
    teacherCrossSchoolEmail = `s7b-${suffix}-teacher-cross@e2e.moazez.local`;
    adminEmail = `s7b-${suffix}-admin@e2e.moazez.local`;
    parentEmail = `s7b-${suffix}-parent@e2e.moazez.local`;
    studentEmail = `s7b-${suffix}-student@e2e.moazez.local`;

    teacherAId = await createUserWithMembership({
      email: teacherAEmail,
      firstName: 'Sprint7B',
      lastName: 'TeacherA',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    const teacherBId = await createUserWithMembership({
      email: teacherBEmail,
      firstName: 'Sprint7B',
      lastName: 'TeacherB',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    const teacherCrossSchoolId = await createUserWithMembership({
      email: teacherCrossSchoolEmail,
      firstName: 'Sprint7B',
      lastName: 'TeacherCross',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });

    await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint7B',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: parentEmail,
      firstName: 'Sprint7B',
      lastName: 'Parent',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: studentEmail,
      firstName: 'Sprint7B',
      lastName: 'StudentUser',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    const schoolAContext = await createActiveAcademicContext({
      schoolId: schoolAId,
      marker: 'school-a',
    });
    const schoolBContext = await createActiveAcademicContext({
      schoolId: schoolBId,
      marker: 'school-b',
    });

    ownFixture = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      context: schoolAContext,
      teacherUserId: teacherAId,
      marker: 'own',
      studentCount: 2,
      includePrivateStudentData: true,
    });
    otherTeacherFixture = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      context: schoolAContext,
      teacherUserId: teacherBId,
      marker: 'other',
      studentCount: 1,
      includePrivateStudentData: false,
    });
    crossSchoolFixture = await createAcademicFixture({
      organizationId: organizationBId,
      schoolId: schoolBId,
      context: schoolBContext,
      teacherUserId: teacherCrossSchoolId,
      marker: 'cross',
      studentCount: 1,
      includePrivateStudentData: false,
    });

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
      await cleanupCloseoutData();
      await prisma.$disconnect();
    }
  });

  it('registers only the current Teacher App read routes', () => {
    expect(listRegisteredTeacherRoutes()).toEqual([
      'GET /api/v1/teacher/classroom/:classId',
      'GET /api/v1/teacher/classroom/:classId/assignments',
      'GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId',
      'GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions',
      'GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId',
      'GET /api/v1/teacher/classroom/:classId/attendance/roster',
      'GET /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId',
      'GET /api/v1/teacher/classroom/:classId/grades/assessments',
      'GET /api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId',
      'GET /api/v1/teacher/classroom/:classId/grades/gradebook',
      'GET /api/v1/teacher/classroom/:classId/roster',
      'GET /api/v1/teacher/home',
      'GET /api/v1/teacher/my-classes',
      'GET /api/v1/teacher/my-classes/:classId',
      'GET /api/v1/teacher/tasks',
      'GET /api/v1/teacher/tasks/:taskId',
      'GET /api/v1/teacher/tasks/dashboard',
      'GET /api/v1/teacher/tasks/selectors',
      'PATCH /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/answers/:answerId/review',
      'POST /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/review/finalize',
      'POST /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/sync-grade-item',
      'POST /api/v1/teacher/classroom/:classId/attendance/session/resolve',
      'POST /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/submit',
      'POST /api/v1/teacher/tasks',
      'PUT /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/answers/review',
      'PUT /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/entries',
    ]);
  });

  it('covers Teacher Home, My Classes, ownership, tenancy, and non-teacher denial', async () => {
    const teacherA = await login(teacherAEmail);

    const home = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/home`)
      .set('Authorization', `Bearer ${teacherA.accessToken}`)
      .expect(200);

    expect(home.body.teacher).toMatchObject({
      id: teacherAId,
      email: teacherAEmail,
      userType: 'teacher',
    });
    expect(home.body.school).toEqual({
      name: `Sprint 7B Academy ${suffix}`,
      logoUrl: null,
    });
    expect(home.body.summary).toMatchObject({
      classesCount: 1,
      studentsCount: 2,
    });
    expect(home.body.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
      items: [],
    });
    expectNoObjectKey(home.body, 'schoolId');
    expectNoObjectKey(home.body, 'scheduleId');
    expectNoPrivateStudentData(home.body);

    const classes = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/my-classes`)
      .set('Authorization', `Bearer ${teacherA.accessToken}`)
      .expect(200);

    expect(classes.body.classes).toHaveLength(1);
    expect(classes.body.classes[0]).toMatchObject({
      id: ownFixture.allocationId,
      classId: ownFixture.allocationId,
      classroomId: ownFixture.classroomId,
      classroomName: ownFixture.classroomName,
      className: ownFixture.classroomName,
      subjectId: ownFixture.subjectId,
      subjectName: ownFixture.subjectName,
      termId: ownFixture.termId,
      termName: ownFixture.termName,
      gradeId: ownFixture.gradeId,
      gradeName: ownFixture.gradeName,
      sectionId: ownFixture.sectionId,
      sectionName: ownFixture.sectionName,
      stageId: ownFixture.stageId,
      stageName: ownFixture.stageName,
      cycleId: ownFixture.stageId,
      cycleName: ownFixture.stageName,
      roomName: ownFixture.roomName,
      studentsCount: ownFixture.studentsCount,
    });
    expect(classes.body.pagination).toMatchObject({
      page: 1,
      total: 1,
    });
    expect(JSON.stringify(classes.body)).not.toContain(
      otherTeacherFixture.allocationId,
    );
    expect(JSON.stringify(classes.body)).not.toContain(
      crossSchoolFixture.allocationId,
    );
    expectNoObjectKey(classes.body, 'schoolId');
    expectNoObjectKey(classes.body, 'scheduleId');
    expectNoPrivateStudentData(classes.body);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/my-classes/${ownFixture.allocationId}`)
      .set('Authorization', `Bearer ${teacherA.accessToken}`)
      .expect(200);

    expect(detail.body.class).toMatchObject({
      id: ownFixture.allocationId,
      classId: ownFixture.allocationId,
      classroomId: ownFixture.classroomId,
      classroomName: ownFixture.classroomName,
      subjectId: ownFixture.subjectId,
      subjectName: ownFixture.subjectName,
      termId: ownFixture.termId,
      termName: ownFixture.termName,
      gradeId: ownFixture.gradeId,
      gradeName: ownFixture.gradeName,
      sectionId: ownFixture.sectionId,
      sectionName: ownFixture.sectionName,
      stageId: ownFixture.stageId,
      stageName: ownFixture.stageName,
      studentsCount: ownFixture.studentsCount,
    });
    expect(detail.body.metrics).toMatchObject({
      studentsCount: ownFixture.studentsCount,
    });
    expect(Array.isArray(detail.body.rosterPreview)).toBe(true);
    expectNoObjectKey(detail.body, 'schoolId');
    expectNoObjectKey(detail.body, 'scheduleId');
    expectNoPrivateStudentData(detail.body);

    const sameSchoolForbidden = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/my-classes/${otherTeacherFixture.allocationId}`,
      )
      .set('Authorization', `Bearer ${teacherA.accessToken}`)
      .expect(404);
    expect(sameSchoolForbidden.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );

    const crossSchoolForbidden = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/my-classes/${crossSchoolFixture.allocationId}`,
      )
      .set('Authorization', `Bearer ${teacherA.accessToken}`)
      .expect(404);
    expect(crossSchoolForbidden.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );

    for (const email of [adminEmail, parentEmail, studentEmail]) {
      const actor = await login(email);
      for (const route of [
        '/teacher/home',
        '/teacher/my-classes',
        `/teacher/my-classes/${ownFixture.allocationId}`,
      ]) {
        const response = await request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}${route}`)
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .expect(403);
        expect(response.body?.error?.code).toBe(
          'teacher_app.actor.required_teacher',
        );
      }
    }

    for (const deferredRoute of [
      '/teacher/schedule',
      '/teacher/schedule/week',
      '/teacher/classes',
      '/teacher/classroom',
      `/teacher/classroom/${ownFixture.allocationId}/attendance`,
      '/teacher/homeworks',
      '/teacher/messages',
      '/teacher/profile',
      '/teacher/settings',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${deferredRoute}`)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .expect(404);
    }
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
    cleanupState.userIds.add(user.id);

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

  async function createActiveAcademicContext(params: {
    schoolId: string;
    marker: string;
  }): Promise<AcademicContext> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `S7B ${suffix} ${params.marker} Year AR`,
        nameEn: `S7B ${suffix} ${params.marker} Year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.academicYearIds.add(academicYear.id);

    const termName = `S7B ${suffix} ${params.marker} Term`;
    const term = await prisma.term.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: academicYear.id,
        nameAr: `${termName} AR`,
        nameEn: termName,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.termIds.add(term.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      termName,
    };
  }

  async function createAcademicFixture(params: {
    organizationId: string;
    schoolId: string;
    context: AcademicContext;
    teacherUserId: string;
    marker: string;
    studentCount: number;
    includePrivateStudentData: boolean;
  }): Promise<AcademicFixture> {
    const stageName = `S7B ${suffix} ${params.marker} Stage`;
    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${stageName} AR`,
        nameEn: stageName,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const gradeName = `S7B ${suffix} ${params.marker} Grade`;
    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${gradeName} AR`,
        nameEn: gradeName,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    cleanupState.gradeIds.add(grade.id);

    const sectionName = `S7B ${suffix} ${params.marker} Section`;
    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${sectionName} AR`,
        nameEn: sectionName,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    cleanupState.sectionIds.add(section.id);

    const roomName = `S7B ${suffix} ${params.marker} Room`;
    const room = await prisma.room.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${roomName} AR`,
        nameEn: roomName,
        building: 'Main',
        floor: '1',
        capacity: 30,
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.roomIds.add(room.id);

    const classroomName = `S7B ${suffix} ${params.marker} Classroom`;
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        roomId: room.id,
        nameAr: `${classroomName} AR`,
        nameEn: classroomName,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    const subjectName = `S7B ${suffix} ${params.marker} Subject`;
    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${subjectName} AR`,
        nameEn: subjectName,
        code: `S7B-${suffix}-${params.marker}`.toUpperCase(),
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.subjectIds.add(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: params.context.termId,
      },
      select: { id: true },
    });
    cleanupState.allocationIds.add(allocation.id);

    for (let index = 0; index < params.studentCount; index += 1) {
      const student = await prisma.student.create({
        data: {
          schoolId: params.schoolId,
          organizationId: params.organizationId,
          firstName: `S7B ${params.marker} Student`,
          lastName: String(index + 1),
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      });
      cleanupState.studentIds.add(student.id);

      const enrollment = await prisma.enrollment.create({
        data: {
          schoolId: params.schoolId,
          studentId: student.id,
          academicYearId: params.context.academicYearId,
          termId: params.context.termId,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        select: { id: true },
      });
      cleanupState.enrollmentIds.add(enrollment.id);

      if (index === 0 && params.includePrivateStudentData) {
        await createPrivateStudentData({
          organizationId: params.organizationId,
          schoolId: params.schoolId,
          studentId: student.id,
        });
      }
    }

    return {
      allocationId: allocation.id,
      classroomId: classroom.id,
      classroomName,
      subjectId: subject.id,
      subjectName,
      termId: params.context.termId,
      termName: params.context.termName,
      gradeId: grade.id,
      gradeName,
      sectionId: section.id,
      sectionName,
      stageId: stage.id,
      stageName,
      roomName,
      studentsCount: params.studentCount,
    };
  }

  async function createPrivateStudentData(params: {
    organizationId: string;
    schoolId: string;
    studentId: string;
  }): Promise<void> {
    const guardianEmail = `private-guardian-${suffix}@e2e.moazez.local`;
    const guardianPhone = nextPhone();
    const allergy = `private-allergy-${suffix}`;
    const condition = `private-condition-${suffix}`;
    const medication = `private-medication-${suffix}`;
    const emergencyNote = `private-emergency-note-${suffix}`;
    privateMarkers.add(guardianEmail);
    privateMarkers.add(guardianPhone);
    privateMarkers.add(allergy);
    privateMarkers.add(condition);
    privateMarkers.add(medication);
    privateMarkers.add(emergencyNote);

    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        firstName: 'Private',
        lastName: 'Guardian',
        phone: guardianPhone,
        email: guardianEmail,
        relation: 'guardian',
        isPrimary: true,
      },
      select: { id: true },
    });
    cleanupState.guardianIds.add(guardian.id);

    const link = await prisma.studentGuardian.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        guardianId: guardian.id,
        isPrimary: true,
      },
      select: { id: true },
    });
    cleanupState.studentGuardianIds.add(link.id);

    const medical = await prisma.studentMedicalProfile.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        bloodType: 'O+',
        allergies: allergy,
        conditions: [condition],
        medications: [medication],
        emergencyNotes: emergencyNote,
      },
      select: { id: true },
    });
    cleanupState.medicalProfileIds.add(medical.id);
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function listRegisteredTeacherRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes.filter((route) => route.includes('/api/v1/teacher')).sort();
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

  function expectNoPrivateStudentData(value: unknown): void {
    const json = JSON.stringify(value);

    for (const marker of privateMarkers) {
      expect(json).not.toContain(marker);
    }

    for (const key of [
      'guardian',
      'guardianId',
      'medical',
      'medicalProfile',
      'bloodType',
      'allergies',
      'conditions',
      'medications',
      'emergencyNotes',
    ]) {
      expectNoObjectKey(value, key);
    }
  }

  function nextPhone(): string {
    phoneSequence += 1;
    return `+2010${String(phoneSequence).padStart(8, '0')}`;
  }

  async function cleanupCloseoutData(): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId: { in: [...cleanupState.userIds] } },
    });
    await prisma.studentMedicalProfile.deleteMany({
      where: { id: { in: [...cleanupState.medicalProfileIds] } },
    });
    await prisma.studentGuardian.deleteMany({
      where: { id: { in: [...cleanupState.studentGuardianIds] } },
    });
    await prisma.enrollment.deleteMany({
      where: { id: { in: [...cleanupState.enrollmentIds] } },
    });
    await prisma.guardian.deleteMany({
      where: { id: { in: [...cleanupState.guardianIds] } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: [...cleanupState.studentIds] } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { id: { in: [...cleanupState.allocationIds] } },
    });
    await prisma.subject.deleteMany({
      where: { id: { in: [...cleanupState.subjectIds] } },
    });
    await prisma.classroom.deleteMany({
      where: { id: { in: [...cleanupState.classroomIds] } },
    });
    await prisma.room.deleteMany({
      where: { id: { in: [...cleanupState.roomIds] } },
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
    await prisma.schoolProfile.deleteMany({
      where: { schoolId: { in: [...cleanupState.schoolIds] } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: [...cleanupState.userIds] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [...cleanupState.userIds] } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [...cleanupState.schoolIds] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [...cleanupState.organizationIds] } },
    });
  }
});
