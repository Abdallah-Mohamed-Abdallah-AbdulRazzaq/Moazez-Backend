import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint22CTeacherAllocationSecurity123!';
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

type AcademicBase = {
  academicYearId: string;
  termId: string;
  closedTermId: string;
  stageId: string;
  gradeId: string;
  sectionId: string;
  classroomId: string;
  deletedGradeId: string;
  deletedClassroomId: string;
};

type ActorAuth = {
  label: string;
  auth: AuthTokens;
};

jest.setTimeout(180000);

describe('Academics teacher allocation workflow tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId = '';
  let organizationBId = '';
  let schoolAId = '';
  let schoolBId = '';
  let adminAEmail = '';
  let adminBEmail = '';
  let noPermissionEmail = '';
  let viewOnlyEmail = '';
  let manageOnlyEmail = '';
  let teacherAEmail = '';
  let teacherBEmail = '';
  let studentEmail = '';
  let parentEmail = '';
  let academicA: AcademicBase;
  let academicB: AcademicBase;
  let teacherAUserId = '';
  let teacherBUserId = '';
  let subjectAId = '';
  let subjectBId = '';
  let subjectMissingMatrixAId = '';
  let deletedSubjectAId = '';
  let allocationAId = '';
  let adminAAuth: AuthTokens;
  let adminBAuth: AuthTokens;
  let noPermissionAuth: AuthTokens;
  let viewOnlyAuth: AuthTokens;
  let manageOnlyAuth: AuthTokens;
  let teacherAAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let parentAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22c-sec-${suffix}`;
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
    academicA = await createAcademicBase(schoolAId, 'a');
    academicB = await createAcademicBase(schoolBId, 'b');
    subjectAId = await createSubject({
      schoolId: schoolAId,
      label: 'a',
      deletedAt: null,
    });
    subjectBId = await createSubject({
      schoolId: schoolBId,
      label: 'b',
      deletedAt: null,
    });
    subjectMissingMatrixAId = await createSubject({
      schoolId: schoolAId,
      label: 'missing-matrix',
      deletedAt: null,
    });
    deletedSubjectAId = await createSubject({
      schoolId: schoolAId,
      label: 'deleted',
      deletedAt: new Date('2026-06-16T00:00:00.000Z'),
    });
    await createSubjectAllocation({
      schoolId: schoolAId,
      academic: academicA,
      subjectId: subjectAId,
      weeklyHours: 5,
    });
    await createSubjectAllocation({
      schoolId: schoolBId,
      academic: academicB,
      subjectId: subjectBId,
      weeklyHours: 4,
    });

    const adminARoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-admin-a`,
      name: `Sprint 22C Allocation Admin A ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    const adminBRoleId = await createCustomRole({
      schoolId: schoolBId,
      key: `${marker}-admin-b`,
      name: `Sprint 22C Allocation Admin B ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    const noPermissionRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-none`,
      name: `Sprint 22C Allocation No Permission ${suffix}`,
      permissionIds: [],
    });
    const viewOnlyRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-view`,
      name: `Sprint 22C Allocation Viewer ${suffix}`,
      permissionIds: [viewPermission.id],
    });
    const manageOnlyRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-manage`,
      name: `Sprint 22C Allocation Manager ${suffix}`,
      permissionIds: [managePermission.id],
    });

    adminAEmail = `${marker}-admin-a@example.test`;
    adminBEmail = `${marker}-admin-b@example.test`;
    noPermissionEmail = `${marker}-none@example.test`;
    viewOnlyEmail = `${marker}-viewer@example.test`;
    manageOnlyEmail = `${marker}-manager@example.test`;
    teacherAEmail = `${marker}-teacher-a@example.test`;
    teacherBEmail = `${marker}-teacher-b@example.test`;
    studentEmail = `${marker}-student@example.test`;
    parentEmail = `${marker}-parent@example.test`;

    await createUserWithMembership({
      email: adminAEmail,
      firstName: 'Allocation',
      lastName: 'AdminA',
      userType: UserType.SCHOOL_USER,
      roleId: adminARoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: adminBEmail,
      firstName: 'Allocation',
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
      email: teacherAEmail,
      firstName: 'Teacher',
      lastName: 'A',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherBUserId = await createUserWithMembership({
      email: teacherBEmail,
      firstName: 'Teacher',
      lastName: 'B',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    await createUserWithMembership({
      email: studentEmail,
      firstName: 'Allocation',
      lastName: 'Student',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: parentEmail,
      firstName: 'Allocation',
      lastName: 'Parent',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    allocationAId = await createTeacherAllocationDirect({
      schoolId: schoolAId,
      teacherUserId: teacherAUserId,
      termId: academicA.termId,
      subjectId: subjectAId,
      classroomId: academicA.classroomId,
    });
    await createTeacherAllocationDirect({
      schoolId: schoolBId,
      teacherUserId: teacherBUserId,
      termId: academicB.termId,
      subjectId: subjectBId,
      classroomId: academicB.classroomId,
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
    teacherAAuth = await login(teacherAEmail);
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
      .get(`${GLOBAL_PREFIX}/academics/allocations/validation`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(noPermissionAuth))
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/teacher-loads`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(manageOnlyAuth))
      .expect(403);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(viewOnlyAuth))
      .send(validBulkPayload())
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/apply-to-grade`)
      .set('Authorization', bearer(viewOnlyAuth))
      .send(validApplyPayload())
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/clear-subject`)
      .set('Authorization', bearer(viewOnlyAuth))
      .send(validClearPayload())
      .expect(403);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/allocations/${allocationAId}`)
      .set('Authorization', bearer(viewOnlyAuth))
      .expect(403);
  });

  it('rejects cross-school term, teacher, subject, classroom, and grade ids', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/validation`)
      .query({ termId: academicB.termId })
      .set('Authorization', bearer(adminAAuth))
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('academics.allocation.invalid_scope');
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        items: [
          {
            teacherUserId: teacherBUserId,
            subjectId: subjectAId,
            classroomId: academicA.classroomId,
          },
        ],
      })
      .expect(422);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        items: [
          {
            teacherUserId: teacherAUserId,
            subjectId: subjectBId,
            classroomId: academicA.classroomId,
          },
        ],
      })
      .expect(422);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        items: [
          {
            teacherUserId: teacherAUserId,
            subjectId: subjectAId,
            classroomId: academicB.classroomId,
          },
        ],
      })
      .expect(422);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/apply-to-grade`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        gradeId: academicB.gradeId,
        subjectId: subjectAId,
        teacherUserId: teacherAUserId,
      })
      .expect(422);
  });

  it('does not allow another school matrix row to satisfy local write validation', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        items: [
          {
            teacherUserId: teacherAUserId,
            subjectId: subjectMissingMatrixAId,
            classroomId: academicA.classroomId,
          },
        ],
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.allocation.missing_subject_allocation',
        );
      });
  });

  it('returns safe school-scoped validation and load payloads', async () => {
    const validation = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/validation`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(adminAAuth))
      .expect(200);
    expect(validation.body.items).toHaveLength(1);
    expect(validation.body.items[0].subjectId).toBe(subjectAId);
    expectSafeAllocationPayload(validation.body);

    const loads = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/teacher-loads`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(adminAAuth))
      .expect(200);
    expect(loads.body.items).toHaveLength(1);
    expect(loads.body.items[0]).toMatchObject({
      teacherUserId: teacherAUserId,
      totalWeeklyHours: 5,
    });
    expect(JSON.stringify(loads.body)).not.toContain(teacherAEmail);
    expect(JSON.stringify(loads.body)).not.toContain(teacherBUserId);
    expectSafeAllocationPayload(loads.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/teacher-loads`)
      .query({ termId: academicB.termId })
      .set('Authorization', bearer(adminBAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.items[0].teacherUserId).toBe(teacherBUserId);
        expect(JSON.stringify(response.body)).not.toContain(teacherAUserId);
      });
  });

  it('rejects closed-term and soft-deleted reference mutations', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.closedTermId,
        items: [
          {
            teacherUserId: teacherAUserId,
            subjectId: subjectAId,
            classroomId: academicA.classroomId,
          },
        ],
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('academics.allocation.closed_term');
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        items: [
          {
            teacherUserId: teacherAUserId,
            subjectId: deletedSubjectAId,
            classroomId: academicA.classroomId,
          },
        ],
      })
      .expect(422);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        items: [
          {
            teacherUserId: teacherAUserId,
            subjectId: subjectAId,
            classroomId: academicA.deletedClassroomId,
          },
        ],
      })
      .expect(422);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/apply-to-grade`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        gradeId: academicA.deletedGradeId,
        subjectId: subjectAId,
        teacherUserId: teacherAUserId,
      })
      .expect(422);
  });

  it('denies teacher, student, and parent system roles by default', async () => {
    const rolePermissions = await listAppRoleStructurePermissions();
    expect(rolePermissions).toEqual({
      parent: [],
      student: [],
      teacher: [],
    });

    for (const actor of [
      { label: 'teacher', auth: teacherAAuth },
      { label: 'student', auth: studentAuth },
      { label: 'parent', auth: parentAuth },
    ]) {
      await expectAllocationWorkflowRoutesForbidden(actor);
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
        name: `Sprint 22C Allocation Security Org ${label} ${suffix}`,
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
        name: `Sprint 22C Allocation Security School ${label} ${suffix}`,
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
        description: 'Teacher allocation workflow security test role',
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

  async function createAcademicBase(
    inputSchoolId: string,
    label: string,
  ): Promise<AcademicBase> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-${label}-year-ar`,
        nameEn: `${marker}-${label}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: inputSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${label}-term-ar`,
        nameEn: `${marker}-${label}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const closedTerm = await prisma.term.create({
      data: {
        schoolId: inputSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${label}-closed-term-ar`,
        nameEn: `${marker}-${label}-closed-term`,
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: new Date('2027-03-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-${label}-stage-ar`,
        nameEn: `${marker}-${label}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: inputSchoolId,
        stageId: stage.id,
        nameAr: `${marker}-${label}-grade-ar`,
        nameEn: `${marker}-${label}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const deletedGrade = await prisma.grade.create({
      data: {
        schoolId: inputSchoolId,
        stageId: stage.id,
        nameAr: `${marker}-${label}-deleted-grade-ar`,
        nameEn: `${marker}-${label}-deleted-grade`,
        sortOrder: 2,
        deletedAt: new Date('2026-06-16T00:00:00.000Z'),
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: inputSchoolId,
        gradeId: grade.id,
        nameAr: `${marker}-${label}-section-ar`,
        nameEn: `${marker}-${label}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: inputSchoolId,
        sectionId: section.id,
        nameAr: `${marker}-${label}-classroom-ar`,
        nameEn: `${marker}-${label}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const deletedClassroom = await prisma.classroom.create({
      data: {
        schoolId: inputSchoolId,
        sectionId: section.id,
        nameAr: `${marker}-${label}-deleted-classroom-ar`,
        nameEn: `${marker}-${label}-deleted-classroom`,
        sortOrder: 2,
        deletedAt: new Date('2026-06-16T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      closedTermId: closedTerm.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      deletedGradeId: deletedGrade.id,
      deletedClassroomId: deletedClassroom.id,
    };
  }

  async function createSubject(params: {
    schoolId: string;
    label: string;
    deletedAt: Date | null;
  }): Promise<string> {
    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.label}-subject-ar`,
        nameEn: `${marker}-${params.label}-subject`,
        code: `${marker}-${params.label.toUpperCase()}`,
        color: '#2563eb',
        isActive: true,
        deletedAt: params.deletedAt,
      },
      select: { id: true },
    });

    return subject.id;
  }

  async function createSubjectAllocation(params: {
    schoolId: string;
    academic: AcademicBase;
    subjectId: string;
    weeklyHours: number;
  }): Promise<string> {
    const allocation = await prisma.subjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        gradeId: params.academic.gradeId,
        subjectId: params.subjectId,
        weeklyHours: params.weeklyHours,
      },
      select: { id: true },
    });

    return allocation.id;
  }

  async function createTeacherAllocationDirect(params: {
    schoolId: string;
    teacherUserId: string;
    termId: string;
    subjectId: string;
    classroomId: string;
  }): Promise<string> {
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: params.subjectId,
        classroomId: params.classroomId,
        termId: params.termId,
      },
      select: { id: true },
    });

    return allocation.id;
  }

  function validBulkPayload() {
    return {
      termId: academicA.termId,
      items: [
        {
          teacherUserId: teacherAUserId,
          subjectId: subjectAId,
          classroomId: academicA.classroomId,
        },
      ],
    };
  }

  function validApplyPayload() {
    return {
      termId: academicA.termId,
      gradeId: academicA.gradeId,
      subjectId: subjectAId,
      teacherUserId: teacherAUserId,
    };
  }

  function validClearPayload() {
    return {
      termId: academicA.termId,
      gradeId: academicA.gradeId,
      subjectId: subjectAId,
    };
  }

  async function listAppRoleStructurePermissions(): Promise<
    Record<'parent' | 'student' | 'teacher', string[]>
  > {
    const roles = await prisma.role.findMany({
      where: {
        key: { in: ['teacher', 'student', 'parent'] },
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: {
        key: true,
        rolePermissions: {
          select: {
            permission: { select: { code: true } },
          },
        },
      },
    });

    const result = {
      parent: [] as string[],
      student: [] as string[],
      teacher: [] as string[],
    };
    for (const role of roles) {
      if (
        role.key === 'parent' ||
        role.key === 'student' ||
        role.key === 'teacher'
      ) {
        result[role.key] = role.rolePermissions
          .map((rolePermission) => rolePermission.permission.code)
          .filter((code) => code.startsWith('academics.structure.'))
          .sort();
      }
    }

    return result;
  }

  async function expectAllocationWorkflowRoutesForbidden(
    actor: ActorAuth,
  ): Promise<void> {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/validation`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(actor.auth))
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/teacher-loads`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(actor.auth))
      .expect(403);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(actor.auth))
      .send(validBulkPayload())
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/apply-to-grade`)
      .set('Authorization', bearer(actor.auth))
      .send(validApplyPayload())
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/clear-subject`)
      .set('Authorization', bearer(actor.auth))
      .send(validClearPayload())
      .expect(403);
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

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectSafeAllocationPayload(value: unknown): void {
    for (const forbiddenKey of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'passwordHash',
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
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: createdRoleIds } },
    });
    await prisma.permission.deleteMany({
      where: { id: { in: createdPermissionIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
