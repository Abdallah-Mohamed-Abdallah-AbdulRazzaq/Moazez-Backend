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
const PASSWORD = 'Sprint22BSubjectAllocSecurity123!';
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
  stageId: string;
  gradeId: string;
};

type ActorAuth = {
  label: string;
  auth: AuthTokens;
};

jest.setTimeout(180000);

describe('Academics subject allocation tenancy isolation (security)', () => {
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
  let teacherEmail = '';
  let studentEmail = '';
  let parentEmail = '';
  let academicA: AcademicBase;
  let academicB: AcademicBase;
  let subjectAId = '';
  let subjectBId = '';
  let deletedSubjectAId = '';
  let softDeletedAllocationSubjectAId = '';
  let allocationAId = '';
  let allocationBId = '';
  let softDeletedAllocationAId = '';
  let adminAAuth: AuthTokens;
  let adminBAuth: AuthTokens;
  let noPermissionAuth: AuthTokens;
  let viewOnlyAuth: AuthTokens;
  let manageOnlyAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let parentAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22b-sec-${suffix}`;
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
        code: 'academics.subjects.view',
        resource: 'subjects',
        action: 'view',
        description: 'View academics subjects.',
      }),
      findOrCreatePermission({
        code: 'academics.subjects.manage',
        resource: 'subjects',
        action: 'manage',
        description: 'Manage academics subjects.',
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
    deletedSubjectAId = await createSubject({
      schoolId: schoolAId,
      label: 'deleted',
      deletedAt: new Date('2026-06-16T00:00:00.000Z'),
    });
    softDeletedAllocationSubjectAId = await createSubject({
      schoolId: schoolAId,
      label: 'soft-allocation',
      deletedAt: null,
    });
    allocationAId = await createAllocation({
      schoolId: schoolAId,
      academic: academicA,
      subjectId: subjectAId,
      weeklyHours: 5,
      deletedAt: null,
    });
    softDeletedAllocationAId = await createAllocation({
      schoolId: schoolAId,
      academic: academicA,
      subjectId: softDeletedAllocationSubjectAId,
      weeklyHours: 9,
      deletedAt: new Date('2026-06-16T00:00:00.000Z'),
      gradeId: academicA.gradeId,
    });
    allocationBId = await createAllocation({
      schoolId: schoolBId,
      academic: academicB,
      subjectId: subjectBId,
      weeklyHours: 4,
      deletedAt: null,
    });

    const adminARoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-admin-a`,
      name: `Sprint 22B Subject Allocation Admin A ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    const adminBRoleId = await createCustomRole({
      schoolId: schoolBId,
      key: `${marker}-admin-b`,
      name: `Sprint 22B Subject Allocation Admin B ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    const noPermissionRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-none`,
      name: `Sprint 22B Subject Allocation No Permission ${suffix}`,
      permissionIds: [],
    });
    const viewOnlyRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-view`,
      name: `Sprint 22B Subject Allocation Viewer ${suffix}`,
      permissionIds: [viewPermission.id],
    });
    const manageOnlyRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-manage`,
      name: `Sprint 22B Subject Allocation Manager Only ${suffix}`,
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
      firstName: 'SubjectAllocation',
      lastName: 'AdminA',
      userType: UserType.SCHOOL_USER,
      roleId: adminARoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: adminBEmail,
      firstName: 'SubjectAllocation',
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
    await createUserWithMembership({
      email: teacherEmail,
      firstName: 'SubjectAllocation',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: studentEmail,
      firstName: 'SubjectAllocation',
      lastName: 'Student',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: parentEmail,
      firstName: 'SubjectAllocation',
      lastName: 'Parent',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
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

  it('enforces subject view and manage permissions independently', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(noPermissionAuth))
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(manageOnlyAuth))
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(viewOnlyAuth))
      .expect(200);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(noPermissionAuth))
      .send(validBulkPayload())
      .expect(403);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(viewOnlyAuth))
      .send(validBulkPayload())
      .expect(403);
  });

  it('rejects cross-school term, grade, and subject ids without creating rows', async () => {
    const countBefore = await prisma.subjectAllocation.count({
      where: { schoolId: schoolAId },
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: academicB.termId })
      .set('Authorization', bearer(adminAAuth))
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.subject_allocation.invalid_scope',
        );
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicB.termId,
        items: [
          {
            gradeId: academicA.gradeId,
            subjectId: subjectAId,
            weeklyHours: 5,
          },
        ],
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.subject_allocation.invalid_scope',
        );
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        items: [
          {
            gradeId: academicB.gradeId,
            subjectId: subjectAId,
            weeklyHours: 5,
          },
        ],
      })
      .expect(422);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        items: [
          {
            gradeId: academicA.gradeId,
            subjectId: subjectBId,
            weeklyHours: 5,
          },
        ],
      })
      .expect(422);

    const countAfter = await prisma.subjectAllocation.count({
      where: { schoolId: schoolAId },
    });
    expect(countAfter).toBe(countBefore);
  });

  it('returns school-scoped safe payloads and excludes soft-deleted allocations', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(adminAAuth))
      .expect(200);

    expect(response.body.items.map((item: { id: string }) => item.id)).toContain(
      allocationAId,
    );
    expect(response.body.items.map((item: { id: string }) => item.id)).not.toContain(
      allocationBId,
    );
    expect(response.body.items.map((item: { id: string }) => item.id)).not.toContain(
      softDeletedAllocationAId,
    );
    expectSafeAllocationPayload(response.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: academicB.termId })
      .set('Authorization', bearer(adminBAuth))
      .expect(200)
      .expect((schoolBResponse) => {
        expect(
          schoolBResponse.body.items.map((item: { id: string }) => item.id),
        ).toContain(allocationBId);
        expect(
          schoolBResponse.body.items.map((item: { id: string }) => item.id),
        ).not.toContain(allocationAId);
        expectSafeAllocationPayload(schoolBResponse.body);
      });
  });

  it('rejects soft-deleted subjects for new allocations', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        items: [
          {
            gradeId: academicA.gradeId,
            subjectId: deletedSubjectAId,
            weeklyHours: 2,
          },
        ],
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.subject_allocation.invalid_scope',
        );
      });
  });

  it('denies teacher, student, and parent system roles by default', async () => {
    const rolePermissions = await listAppRoleSubjectPermissions();
    expect(rolePermissions).toEqual({
      parent: [],
      student: [],
      teacher: [],
    });

    for (const actor of [
      { label: 'teacher', auth: teacherAuth },
      { label: 'student', auth: studentAuth },
      { label: 'parent', auth: parentAuth },
    ]) {
      await expectSubjectAllocationRoutesForbidden(actor);
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
        name: `Sprint 22B Subject Allocation Security Org ${label} ${suffix}`,
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
        name: `Sprint 22B Subject Allocation Security School ${label} ${suffix}`,
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
        description: 'Subject allocation security test role',
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

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      stageId: stage.id,
      gradeId: grade.id,
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

  async function createAllocation(params: {
    schoolId: string;
    academic: AcademicBase;
    subjectId: string;
    weeklyHours: number;
    deletedAt: Date | null;
    gradeId?: string;
  }): Promise<string> {
    const allocation = await prisma.subjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        gradeId: params.gradeId ?? params.academic.gradeId,
        subjectId: params.subjectId,
        weeklyHours: params.weeklyHours,
        deletedAt: params.deletedAt,
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
          gradeId: academicA.gradeId,
          subjectId: subjectAId,
          weeklyHours: 5,
        },
      ],
    };
  }

  async function listAppRoleSubjectPermissions(): Promise<
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
          .filter((code) => code.startsWith('academics.subjects.'))
          .sort();
      }
    }

    return result;
  }

  async function expectSubjectAllocationRoutesForbidden(
    actor: ActorAuth,
  ): Promise<void> {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(actor.auth))
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(actor.auth))
      .send(validBulkPayload())
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
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

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectSafeAllocationPayload(value: unknown): void {
    for (const forbiddenKey of ['schoolId', 'organizationId', 'deletedAt']) {
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
    await prisma.subjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subject.deleteMany({
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
