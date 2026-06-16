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
  TimetableScopeType,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint22DTimetableSecurity123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type AcademicFixture = {
  academicYearId: string;
  termId: string;
  closedTermId: string;
  gradeId: string;
  classroomId: string;
  subjectId: string;
  missingMatrixSubjectId: string;
  deletedSubjectId: string;
  allocationId: string;
  missingMatrixAllocationId: string;
  deletedSubjectAllocationId: string;
  roomId: string;
  deletedRoomId: string;
  configId: string;
  periodId: string;
  entryId: string;
  closedConfigId: string;
  closedPeriodId: string;
  closedAllocationId: string;
  closedEntryId: string;
};

type ActorAuth = {
  label: string;
  auth: AuthTokens;
};

jest.setTimeout(180000);

describe('Academics timetable dashboard tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId = '';
  let organizationBId = '';
  let schoolAId = '';
  let schoolBId = '';
  let teacherAUserId = '';
  let teacherBUserId = '';
  let adminAEmail = '';
  let adminBEmail = '';
  let noPermissionEmail = '';
  let viewOnlyEmail = '';
  let manageOnlyEmail = '';
  let teacherEmail = '';
  let studentEmail = '';
  let parentEmail = '';
  let fixtureA: AcademicFixture;
  let fixtureB: AcademicFixture;
  let adminAAuth: AuthTokens;
  let adminBAuth: AuthTokens;
  let noPermissionAuth: AuthTokens;
  let viewOnlyAuth: AuthTokens;
  let manageOnlyAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let parentAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22d-sec-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [
      teacherRole,
      studentRole,
      parentRole,
      viewPermission,
      managePermission,
    ] = await Promise.all([
      findSystemRole('teacher'),
      findSystemRole('student'),
      findSystemRole('parent'),
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
    ]);

    organizationAId = await createOrganization('a');
    organizationBId = await createOrganization('b');
    schoolAId = await createSchool(organizationAId, 'a');
    schoolBId = await createSchool(organizationBId, 'b');

    const adminARoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-admin-a`,
      name: `Sprint 22D Timetable Admin A ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    const adminBRoleId = await createCustomRole({
      schoolId: schoolBId,
      key: `${marker}-admin-b`,
      name: `Sprint 22D Timetable Admin B ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    const noPermissionRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-none`,
      name: `Sprint 22D Timetable No Permission ${suffix}`,
      permissionIds: [],
    });
    const viewOnlyRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-view`,
      name: `Sprint 22D Timetable Viewer ${suffix}`,
      permissionIds: [viewPermission.id],
    });
    const manageOnlyRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-manage`,
      name: `Sprint 22D Timetable Manager ${suffix}`,
      permissionIds: [managePermission.id],
    });

    adminAEmail = `${marker}-admin-a@example.test`;
    adminBEmail = `${marker}-admin-b@example.test`;
    noPermissionEmail = `${marker}-none@example.test`;
    viewOnlyEmail = `${marker}-viewer@example.test`;
    manageOnlyEmail = `${marker}-manager@example.test`;
    teacherEmail = `${marker}-teacher@example.test`;
    studentEmail = `${marker}-student@example.test`;
    parentEmail = `${marker}-parent@example.test`;

    await createUserWithMembership({
      email: adminAEmail,
      firstName: 'Timetable',
      lastName: 'AdminA',
      userType: UserType.SCHOOL_USER,
      roleId: adminARoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: adminBEmail,
      firstName: 'Timetable',
      lastName: 'AdminB',
      userType: UserType.SCHOOL_USER,
      roleId: adminBRoleId,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    await createUserWithMembership({
      email: noPermissionEmail,
      firstName: 'No',
      lastName: 'Permission',
      userType: UserType.SCHOOL_USER,
      roleId: noPermissionRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: viewOnlyEmail,
      firstName: 'View',
      lastName: 'Only',
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: manageOnlyEmail,
      firstName: 'Manage',
      lastName: 'Only',
      userType: UserType.SCHOOL_USER,
      roleId: manageOnlyRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherAUserId = await createUserWithMembership({
      email: teacherEmail,
      firstName: 'Teacher',
      lastName: 'A',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherBUserId = await createUserWithMembership({
      email: `${marker}-teacher-b@example.test`,
      firstName: 'Teacher',
      lastName: 'B',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    await createUserWithMembership({
      email: studentEmail,
      firstName: 'Timetable',
      lastName: 'Student',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: parentEmail,
      firstName: 'Timetable',
      lastName: 'Parent',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    fixtureA = await createAcademicFixture({
      schoolId: schoolAId,
      teacherUserId: teacherAUserId,
      label: 'a',
    });
    fixtureB = await createAcademicFixture({
      schoolId: schoolBId,
      teacherUserId: teacherBUserId,
      label: 'b',
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

    adminAAuth = await login(adminAEmail);
    adminBAuth = await login(adminBEmail);
    noPermissionAuth = await login(noPermissionEmail);
    viewOnlyAuth = await login(viewOnlyEmail);
    manageOnlyAuth = await login(manageOnlyEmail);
    teacherAuth = await login(teacherEmail);
    studentAuth = await login(studentEmail);
    parentAuth = await login(parentEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupSecurityData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('enforces structure view and manage permissions independently', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/all`)
      .query({ termId: fixtureA.termId })
      .set('Authorization', bearer(noPermissionAuth))
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/validate`)
      .query({ termId: fixtureA.termId })
      .set('Authorization', bearer(manageOnlyAuth))
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/conflicts/check`)
      .set('Authorization', bearer(manageOnlyAuth))
      .send(validBulkPayload())
      .expect(403);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(viewOnlyAuth))
      .send(validBulkPayload())
      .expect(403);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/timetable/entries/${fixtureA.entryId}`)
      .set('Authorization', bearer(viewOnlyAuth))
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/publish`)
      .set('Authorization', bearer(viewOnlyAuth))
      .send({ timetableConfigId: fixtureA.configId })
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/unpublish`)
      .set('Authorization', bearer(viewOnlyAuth))
      .send({ termId: fixtureA.termId })
      .expect(403);
  });

  it('rejects cross-school term, classroom, period, teacher allocation, and room ids', async () => {
    await expectNonSuccess(
      request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/timetable/all`)
        .query({ termId: fixtureB.termId })
        .set('Authorization', bearer(adminAAuth)),
    );

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        ...validBulkPayload(),
        items: [
          {
            ...validBulkPayload().items[0],
            periodId: fixtureB.periodId,
          },
        ],
      })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.period_not_found',
        );
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        ...validBulkPayload(),
        items: [
          {
            ...validBulkPayload().items[0],
            classroomId: fixtureB.classroomId,
          },
        ],
      })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.classroom_not_found',
        );
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        ...validBulkPayload(),
        items: [
          {
            ...validBulkPayload().items[0],
            teacherSubjectAllocationId: fixtureB.allocationId,
          },
        ],
      })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.allocation_not_found',
        );
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        ...validBulkPayload(),
        items: [
          {
            ...validBulkPayload().items[0],
            roomId: fixtureB.roomId,
          },
        ],
      })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.room_not_found',
        );
      });
  });

  it('does not allow another school matrix row to satisfy local timetable writes', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: fixtureA.termId,
        items: [
          {
            classroomId: fixtureA.classroomId,
            dayOfWeek: 1,
            periodId: fixtureA.periodId,
            teacherSubjectAllocationId: fixtureA.missingMatrixAllocationId,
          },
        ],
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.missing_subject_allocation',
        );
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/conflicts/check`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: fixtureA.termId,
        items: [
          {
            classroomId: fixtureA.classroomId,
            dayOfWeek: 1,
            periodId: fixtureA.periodId,
            teacherSubjectAllocationId: fixtureA.missingMatrixAllocationId,
          },
        ],
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.hasConflicts).toBe(true);
        expect(response.body.conflicts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'missing_subject_allocation',
            }),
          ]),
        );
      });
  });

  it('returns safe tenant-scoped dashboard payloads without leaking school internals', async () => {
    const schoolAResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/all`)
      .query({ termId: fixtureA.termId })
      .set('Authorization', bearer(adminAAuth))
      .expect(200);

    expect(JSON.stringify(schoolAResponse.body)).toContain(fixtureA.entryId);
    expect(JSON.stringify(schoolAResponse.body)).not.toContain(fixtureB.entryId);
    expect(JSON.stringify(schoolAResponse.body)).not.toContain(teacherEmail);
    expectSafeTimetablePayload(schoolAResponse.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/all`)
      .query({ termId: fixtureB.termId })
      .set('Authorization', bearer(adminBAuth))
      .expect(200)
      .expect((response) => {
        expect(JSON.stringify(response.body)).toContain(fixtureB.entryId);
        expect(JSON.stringify(response.body)).not.toContain(fixtureA.entryId);
        expectSafeTimetablePayload(response.body);
      });
  });

  it('rejects closed-term and soft-deleted reference mutations', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: fixtureA.closedTermId,
        items: [
          {
            classroomId: fixtureA.classroomId,
            dayOfWeek: 0,
            periodId: fixtureA.closedPeriodId,
            teacherSubjectAllocationId: fixtureA.closedAllocationId,
          },
        ],
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('academics.timetable.closed_term');
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/timetable/entries/${fixtureA.closedEntryId}`)
      .set('Authorization', bearer(adminAAuth))
      .expect(409);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/unpublish`)
      .set('Authorization', bearer(adminAAuth))
      .send({ termId: fixtureA.closedTermId })
      .expect(409);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: fixtureA.termId,
        items: [
          {
            classroomId: fixtureA.classroomId,
            dayOfWeek: 1,
            periodId: fixtureA.periodId,
            teacherSubjectAllocationId: fixtureA.deletedSubjectAllocationId,
          },
        ],
      })
      .expect(422);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: fixtureA.termId,
        items: [
          {
            classroomId: fixtureA.classroomId,
            dayOfWeek: 1,
            periodId: fixtureA.periodId,
            teacherSubjectAllocationId: fixtureA.allocationId,
            roomId: fixtureA.deletedRoomId,
          },
        ],
      })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.timetable.room_not_found',
        );
      });
  });

  it('denies teacher, student, and parent system roles by default', async () => {
    for (const actor of [
      { label: 'teacher', auth: teacherAuth },
      { label: 'student', auth: studentAuth },
      { label: 'parent', auth: parentAuth },
    ]) {
      await expectTimetableWorkflowRoutesForbidden(actor);
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

  async function createOrganization(label: string): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org-${label}`,
        name: `Sprint 22D Timetable Security Org ${label} ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization.id;
  }

  async function createSchool(
    inputOrganizationId: string,
    label: string,
  ): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: inputOrganizationId,
        slug: `${marker}-school-${label}`,
        name: `Sprint 22D Timetable Security School ${label} ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school.id;
  }

  async function createCustomRole(params: {
    schoolId: string;
    key: string;
    name: string;
    permissionIds: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: params.schoolId,
        key: params.key,
        name: params.name,
        description: 'Timetable dashboard workflow security test role',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    if (params.permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: params.permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }

    return role.id;
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

  async function createAcademicFixture(params: {
    schoolId: string;
    teacherUserId: string;
    label: string;
  }): Promise<AcademicFixture> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.label}-year-ar`,
        nameEn: `${marker}-${params.label}-year`,
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
        nameAr: `${marker}-${params.label}-term-ar`,
        nameEn: `${marker}-${params.label}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const closedTerm = await prisma.term.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${params.label}-closed-term-ar`,
        nameEn: `${marker}-${params.label}-closed-term`,
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: new Date('2027-03-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.label}-stage-ar`,
        nameEn: `${marker}-${params.label}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${marker}-${params.label}-grade-ar`,
        nameEn: `${marker}-${params.label}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${marker}-${params.label}-section-ar`,
        nameEn: `${marker}-${params.label}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        nameAr: `${marker}-${params.label}-classroom-ar`,
        nameEn: `${marker}-${params.label}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const room = await prisma.room.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.label}-room-ar`,
        nameEn: `${marker}-${params.label}-room`,
        isActive: true,
      },
      select: { id: true },
    });
    const deletedRoom = await prisma.room.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.label}-deleted-room-ar`,
        nameEn: `${marker}-${params.label}-deleted-room`,
        isActive: true,
        deletedAt: new Date('2026-06-16T00:00:00.000Z'),
      },
      select: { id: true },
    });
    const subject = await createFixtureSubject(params.schoolId, params.label, 'math');
    const missingMatrixSubject = await createFixtureSubject(
      params.schoolId,
      params.label,
      'missing',
    );
    const deletedSubject = await createFixtureSubject(
      params.schoolId,
      params.label,
      'deleted',
    );

    await prisma.subjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: academicYear.id,
        termId: term.id,
        gradeId: grade.id,
        subjectId: subject.id,
        weeklyHours: 1,
      },
    });
    await prisma.subjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: academicYear.id,
        termId: closedTerm.id,
        gradeId: grade.id,
        subjectId: subject.id,
        weeklyHours: 1,
      },
    });
    await prisma.subjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: academicYear.id,
        termId: term.id,
        gradeId: grade.id,
        subjectId: deletedSubject.id,
        weeklyHours: 1,
      },
    });

    const allocation = await createFixtureTeacherAllocation({
      schoolId: params.schoolId,
      teacherUserId: params.teacherUserId,
      termId: term.id,
      subjectId: subject.id,
      classroomId: classroom.id,
    });
    const missingMatrixAllocation = await createFixtureTeacherAllocation({
      schoolId: params.schoolId,
      teacherUserId: params.teacherUserId,
      termId: term.id,
      subjectId: missingMatrixSubject.id,
      classroomId: classroom.id,
    });
    const deletedSubjectAllocation = await createFixtureTeacherAllocation({
      schoolId: params.schoolId,
      teacherUserId: params.teacherUserId,
      termId: term.id,
      subjectId: deletedSubject.id,
      classroomId: classroom.id,
    });
    const closedAllocation = await createFixtureTeacherAllocation({
      schoolId: params.schoolId,
      teacherUserId: params.teacherUserId,
      termId: closedTerm.id,
      subjectId: subject.id,
      classroomId: classroom.id,
    });

    await prisma.subject.update({
      where: { id: deletedSubject.id },
      data: { deletedAt: new Date('2026-06-16T00:00:00.000Z') },
    });

    const config = await createFixtureConfig({
      schoolId: params.schoolId,
      academicYearId: academicYear.id,
      termId: term.id,
      label: params.label,
      suffix: 'open',
    });
    const period = await createFixturePeriod({
      schoolId: params.schoolId,
      configId: config.id,
      label: 'Period 1',
      index: 1,
    });
    const closedConfig = await createFixtureConfig({
      schoolId: params.schoolId,
      academicYearId: academicYear.id,
      termId: closedTerm.id,
      label: params.label,
      suffix: 'closed',
    });
    const closedPeriod = await createFixturePeriod({
      schoolId: params.schoolId,
      configId: closedConfig.id,
      label: 'Closed Period',
      index: 1,
    });
    const entry = await createFixtureEntry({
      schoolId: params.schoolId,
      academicYearId: academicYear.id,
      termId: term.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      teacherUserId: params.teacherUserId,
      allocationId: allocation.id,
      configId: config.id,
      periodId: period.id,
      roomId: room.id,
      status: TimetableEntryStatus.DRAFT,
    });
    const closedEntry = await createFixtureEntry({
      schoolId: params.schoolId,
      academicYearId: academicYear.id,
      termId: closedTerm.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      teacherUserId: params.teacherUserId,
      allocationId: closedAllocation.id,
      configId: closedConfig.id,
      periodId: closedPeriod.id,
      roomId: null,
      status: TimetableEntryStatus.DRAFT,
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      closedTermId: closedTerm.id,
      gradeId: grade.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      missingMatrixSubjectId: missingMatrixSubject.id,
      deletedSubjectId: deletedSubject.id,
      allocationId: allocation.id,
      missingMatrixAllocationId: missingMatrixAllocation.id,
      deletedSubjectAllocationId: deletedSubjectAllocation.id,
      roomId: room.id,
      deletedRoomId: deletedRoom.id,
      configId: config.id,
      periodId: period.id,
      entryId: entry.id,
      closedConfigId: closedConfig.id,
      closedPeriodId: closedPeriod.id,
      closedAllocationId: closedAllocation.id,
      closedEntryId: closedEntry.id,
    };
  }

  async function createFixtureSubject(
    schoolId: string,
    label: string,
    subjectLabel: string,
  ): Promise<{ id: string }> {
    return prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${marker}-${label}-${subjectLabel}-ar`,
        nameEn: `${marker}-${label}-${subjectLabel}`,
        code: `${marker}-${label}-${subjectLabel}`.toUpperCase(),
        isActive: true,
      },
      select: { id: true },
    });
  }

  async function createFixtureTeacherAllocation(params: {
    schoolId: string;
    teacherUserId: string;
    termId: string;
    subjectId: string;
    classroomId: string;
  }): Promise<{ id: string }> {
    return prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        termId: params.termId,
        subjectId: params.subjectId,
        classroomId: params.classroomId,
      },
      select: { id: true },
    });
  }

  async function createFixtureConfig(params: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    label: string;
    suffix: string;
  }): Promise<{ id: string }> {
    return prisma.timetableConfig.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        name: `${marker}-${params.label}-${params.suffix}-config`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.TERM,
        scopeKey: `term:${params.termId}`,
        status: TimetableConfigStatus.DRAFT,
      },
      select: { id: true },
    });
  }

  async function createFixturePeriod(params: {
    schoolId: string;
    configId: string;
    label: string;
    index: number;
  }): Promise<{ id: string }> {
    return prisma.timetablePeriod.create({
      data: {
        schoolId: params.schoolId,
        timetableConfigId: params.configId,
        periodIndex: params.index,
        label: params.label,
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
  }

  async function createFixtureEntry(params: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
    subjectId: string;
    teacherUserId: string;
    allocationId: string;
    configId: string;
    periodId: string;
    roomId: string | null;
    status: TimetableEntryStatus;
  }): Promise<{ id: string }> {
    return prisma.timetableEntry.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        timetableConfigId: params.configId,
        periodId: params.periodId,
        dayOfWeek: 0,
        gradeId: params.gradeId,
        sectionId: params.sectionId,
        classroomId: params.classroomId,
        subjectId: params.subjectId,
        teacherUserId: params.teacherUserId,
        teacherSubjectAllocationId: params.allocationId,
        roomId: params.roomId,
        status: params.status,
      },
      select: { id: true },
    });
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

  function validBulkPayload(): {
    termId: string;
    items: Array<{
      classroomId: string;
      dayOfWeek: number;
      periodId: string;
      teacherSubjectAllocationId: string;
      roomId?: string | null;
    }>;
  } {
    return {
      termId: fixtureA.termId,
      items: [
        {
          classroomId: fixtureA.classroomId,
          dayOfWeek: 1,
          periodId: fixtureA.periodId,
          teacherSubjectAllocationId: fixtureA.allocationId,
          roomId: null,
        },
      ],
    };
  }

  async function expectNonSuccess(
    pendingRequest: request.Test,
  ): Promise<void> {
    const response = await pendingRequest;
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expectSafeTimetablePayload(response.body);
  }

  async function expectTimetableWorkflowRoutesForbidden(
    actor: ActorAuth,
  ): Promise<void> {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/timetable/all`)
      .query({ termId: fixtureA.termId })
      .set('Authorization', bearer(actor.auth))
      .expect(403);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/timetable/entries/bulk`)
      .set('Authorization', bearer(actor.auth))
      .send(validBulkPayload())
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/timetable/unpublish`)
      .set('Authorization', bearer(actor.auth))
      .send({ termId: fixtureA.termId })
      .expect(403);
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

  async function cleanupSecurityData(): Promise<void> {
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
