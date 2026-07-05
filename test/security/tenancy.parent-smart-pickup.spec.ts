import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DismissalGateOperationalStatus,
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
import 'reflect-metadata';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../src/common/guards/scope-resolver.guard';
import { ParentSmartPickupController } from '../../src/modules/parent-app/smart-pickup/controller/parent-smart-pickup.controller';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'ParentSmartPickupSecurity123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90_000);

describe('PARENT-DISMISSAL-1A route metadata and seed boundaries', () => {
  it('declares exact RequiredPermissions metadata for the Parent Smart Pickup route', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        ParentSmartPickupController.prototype.getReadiness,
      ),
    ).toEqual(['parent.smart_pickup.view']);
  });

  it('declares the required JwtAuth, ScopeResolver, Permissions guard chain', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ParentSmartPickupController)).toEqual([
      JwtAuthGuard,
      ScopeResolverGuard,
      PermissionsGuard,
    ]);
  });

  it('keeps Parent Smart Pickup permissions isolated from dismissal and cancel permissions', () => {
    const permissionsSeed = readFileSync(
      `${process.cwd()}/prisma/seeds/01-permissions.seed.ts`,
      'utf8',
    );
    const rolesSeed = readFileSync(
      `${process.cwd()}/prisma/seeds/02-system-roles.seed.ts`,
      'utf8',
    );
    const parentPermissions = extractConstStringArray(
      rolesSeed,
      'PARENT_PERMISSIONS',
    );
    const teacherPermissions = extractConstStringArray(
      rolesSeed,
      'TEACHER_PERMISSIONS',
    );
    const studentPermissions = extractConstStringArray(
      rolesSeed,
      'STUDENT_PERMISSIONS',
    );
    const dismissalStaffPermissions = extractConstStringArray(
      rolesSeed,
      'DISMISSAL_STAFF_PERMISSIONS',
    );

    expect(permissionsSeed).toContain("code: 'parent.smart_pickup.view'");
    expect(permissionsSeed).toContain("module: 'parent'");
    expect(permissionsSeed).toContain("resource: 'smart_pickup'");
    expect(parentPermissions).toContain('parent.smart_pickup.view');
    expect(parentPermissions).toContain('parent.smart_pickup.request');
    expect(parentPermissions).toContain('parent.smart_pickup.cancel');
    expect(parentPermissions.some((code) => code.startsWith('dismissal.'))).toBe(
      false,
    );

    for (const permissions of [
      teacherPermissions,
      studentPermissions,
      dismissalStaffPermissions,
    ]) {
      expect(permissions).not.toContain('parent.smart_pickup.view');
      expect(permissions).not.toContain('parent.smart_pickup.request');
      expect(permissions).not.toContain('parent.smart_pickup.cancel');
    }
  });

  it('does not add deferred cancel/device-token schema for the readiness surface', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schemaSource).not.toMatch(/model\s+DismissalShift\b/);

    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).not.toContain('DISMISSAL_STAFF');
  });
});

describe('PARENT-DISMISSAL-1A tenancy and RBAC (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let parentAId: string;
  let parentAToken: string;
  let noPermissionToken: string;
  let nonParentWithPermissionToken: string;
  let ownedChildId: string;
  let crossSchoolChildId: string;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [parentRole, smartPickupPermission] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'parent', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'parent.smart_pickup.view' },
        select: { id: true },
      }),
    ]);
    if (!parentRole || !smartPickupPermission) {
      throw new Error(
        'Parent Smart Pickup permission/role not found - run `npm run seed`.',
      );
    }

    const fixtureA = await createSchoolFixture('a');
    const fixtureB = await createSchoolFixture('b');
    organizationAId = fixtureA.organizationId;
    organizationBId = fixtureB.organizationId;
    schoolAId = fixtureA.schoolId;
    schoolBId = fixtureB.schoolId;

    const noPermissionRole = await prisma.role.create({
      data: {
        schoolId: schoolAId,
        key: `parent-smart-pickup-empty-${TEST_RUN_ID}`,
        name: 'Parent Smart Pickup Empty Role',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(noPermissionRole.id);

    const smartPickupOnlyRole = await prisma.role.create({
      data: {
        schoolId: schoolAId,
        key: `parent-smart-pickup-only-${TEST_RUN_ID}`,
        name: 'Parent Smart Pickup Only Role',
        isSystem: false,
        rolePermissions: {
          create: {
            permissionId: smartPickupPermission.id,
          },
        },
      },
      select: { id: true },
    });
    createdRoleIds.push(smartPickupOnlyRole.id);

    const academicA = await createAcademicFixture('a', schoolAId);
    const academicB = await createAcademicFixture('b', schoolBId);
    await prisma.schoolProfile.create({
      data: {
        schoolId: schoolAId,
        timezone: 'Africa/Cairo',
        latitude: 30.1,
        longitude: 31.2,
        mapPlaceLabel: 'Security Pickup Gate',
      },
    });
    await prisma.dismissalGate.create({
      data: {
        schoolId: schoolAId,
        code: `SEC-OPEN-${TEST_RUN_ID}`,
        name: 'Security Open Gate',
        status: DismissalGateOperationalStatus.OPEN,
        isActive: true,
      },
    });
    await prisma.dismissalSettings.create({
      data: {
        schoolId: schoolAId,
        enabled: true,
        timezone: 'Africa/Cairo',
        schoolLatitude: 30.1,
        schoolLongitude: 31.2,
        requestWindowStartLocal: '00:00',
        requestWindowEndLocal: '23:59',
      },
    });

    const parent = await createUserWithMembership({
      email: `parent-smart-pickup-sec-${TEST_RUN_ID}@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
    });
    parentAId = parent.userId;
    const noPermissionParent = await createUserWithMembership({
      email: `parent-smart-pickup-sec-${TEST_RUN_ID}-noperm@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: noPermissionRole.id,
      userType: UserType.PARENT,
    });
    const nonParentWithPermission = await createUserWithMembership({
      email: `parent-smart-pickup-sec-${TEST_RUN_ID}-school-user@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: smartPickupOnlyRole.id,
      userType: UserType.SCHOOL_USER,
    });

    const guardianAId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: parentAId,
      marker: 'a',
    });
    const child = await createStudentWithEnrollment({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      classroomId: academicA.classroomId,
      firstName: 'Safe',
      lastName: 'Child',
    });
    ownedChildId = child.studentId;
    await linkGuardianToStudent({
      schoolId: schoolAId,
      studentId: ownedChildId,
      guardianId: guardianAId,
    });

    const crossGuardianId = await createGuardian({
      schoolId: schoolBId,
      organizationId: organizationBId,
      userId: parentAId,
      marker: 'cross',
    });
    const crossChild = await createStudentWithEnrollment({
      schoolId: schoolBId,
      organizationId: organizationBId,
      academicYearId: academicB.academicYearId,
      termId: academicB.termId,
      classroomId: academicB.classroomId,
      firstName: 'Cross',
      lastName: 'Hidden',
    });
    crossSchoolChildId = crossChild.studentId;
    await linkGuardianToStudent({
      schoolId: schoolBId,
      studentId: crossSchoolChildId,
      guardianId: crossGuardianId,
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

    parentAToken = await login(parent.email);
    noPermissionToken = await login(noPermissionParent.email);
    nonParentWithPermissionToken = await login(nonParentWithPermission.email);
  });

  afterAll(async () => {
    if (prisma) {
      const schoolIds = [schoolAId, schoolBId].filter(Boolean);
      await prisma.dismissalSettings.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.dismissalGate.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.studentGuardian.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.enrollment.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.guardian.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.student.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.classroom.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.section.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.grade.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.stage.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.term.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.academicYear.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.schoolProfile.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
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
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .expect(401);
  });

  it('forbids authenticated users without parent.smart_pickup.view', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .expect(403);
  });

  it('rejects non-parent actors even when they carry the route permission', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${nonParentWithPermissionToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe(
      'parent.smart_pickup.invalid_actor_type',
    );
  });

  it('returns only current-school linked children for the parent', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${parentAToken}`)
      .expect(200);
    const serialized = JSON.stringify(response.body);

    expect(serialized).toContain(ownedChildId);
    expect(serialized).not.toContain(crossSchoolChildId);
    assertNoSmartPickupLeak(response.body);
  });

  it('does not expose deferred root routes', async () => {
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/pickup`).expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/waiting-students`)
      .expect(404);
  });

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `parent-smart-pickup-sec-${TEST_RUN_ID}-org-${label}`,
        name: `Parent Smart Pickup Security Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `parent-smart-pickup-sec-${TEST_RUN_ID}-school-${label}`,
        name: `Parent Smart Pickup Security School ${label}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(
    label: string,
    schoolId: string,
  ): Promise<{
    academicYearId: string;
    termId: string;
    classroomId: string;
  }> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `pickup-sec-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Pickup Security Year ${TEST_RUN_ID} ${label}`,
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
        nameAr: `pickup-sec-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Pickup Security Term ${TEST_RUN_ID} ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `pickup-sec-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Pickup Security Stage ${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `pickup-sec-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Pickup Security Grade ${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `pickup-sec-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Pickup Security Section ${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `pickup-sec-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Pickup Security Classroom ${label}`,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      classroomId: classroom.id,
    };
  }

  async function createUserWithMembership(params: {
    email: string;
    schoolId: string;
    organizationId: string;
    roleId: string;
    userType: UserType;
  }): Promise<{ userId: string; email: string }> {
    const passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Smart',
        lastName: 'Pickup',
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash,
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

    return { userId: user.id, email: params.email };
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
        firstName: 'Security',
        lastName: `Guardian ${params.marker}`,
        phone: `${TEST_RUN_ID}-${params.marker}`,
        relation: 'parent',
        isPrimary: true,
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });

    return guardian.id;
  }

  async function createStudentWithEnrollment(params: {
    schoolId: string;
    organizationId: string;
    academicYearId: string;
    termId: string;
    classroomId: string;
    firstName: string;
    lastName: string;
  }): Promise<{ studentId: string; enrollmentId: string }> {
    const student = await prisma.student.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
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
        academicYearId: params.academicYearId,
        termId: params.termId,
        classroomId: params.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function linkGuardianToStudent(params: {
    schoolId: string;
    studentId: string;
    guardianId: string;
  }): Promise<void> {
    await prisma.studentGuardian.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        guardianId: params.guardianId,
        isPrimary: true,
      },
    });
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }
});

function extractConstStringArray(source: string, constName: string): string[] {
  const match = source.match(
    new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`),
  );
  expect(match).not.toBeNull();

  return [...match![1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function assertNoSmartPickupLeak(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'guardianId',
    'userId',
    'applicationId',
    'enrollmentId',
    'updatedById',
    'deletedAt',
    'actorId',
    'school_id',
    'organization_id',
    'membership_id',
    'role_id',
    'guardian_id',
    'user_id',
    'application_id',
    'enrollment_id',
    'updated_by_id',
    'deleted_at',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
